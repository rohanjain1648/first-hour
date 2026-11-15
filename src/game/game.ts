import { Vector3, VisibilityState, type World } from '@iwsdk/core';
import { applyAction, type ActionResult } from '../sim/actions';
import { createSim, tick, type ReplayInput } from '../sim/engine';
import type { Action, Actor, Modifier, SimState } from '../sim/types';
import { BoardView, buildFallbackDesk } from '../xr/board';
import type { PlaneReaderSystem } from '../xr/planes';
import { boardCenterOn, chooseTable, fallbackDesk, type PlaneInfo } from '../xr/table';
import { readPref } from './persist';
import { Session } from './session';

export const TABLE_SEARCH_S = 3;

export type GameEvent = 'reject' | 'place' | 'pickup' | 'pause' | 'resume';

/** the one live game, for systems registered before it exists */
export let currentGame: Game | null = null;

/**
 * Owns one play-through: session flow, the simulation, and the board.
 * Later tasks attach the orchestrator, tray, agents, audio and HUD here.
 */
export class Game {
  readonly session: Session;
  sim: SimState | null = null;
  board: BoardView | null = null;
  plane: PlaneInfo | null = null;
  usedFallback = false;
  aiEnabled: boolean;
  private searchT = 0;
  private headPos = new Vector3();
  private headDir = new Vector3();
  private simDirty = false;
  private readonly listeners: ((g: Game) => void)[] = [];
  private readonly evts = new Map<GameEvent, ((data?: unknown) => void)[]>();
  /** every applied action with its crisis time, for the debrief replay */
  readonly inputs: ReplayInput[] = [];

  constructor(
    readonly world: World,
    private readonly planes: PlaneReaderSystem,
  ) {
    this.session = new Session(() => performance.now() / 1000);
    this.aiEnabled = readPref('fh.ai') !== '0';
    currentGame = this;
    world.visibilityState.subscribe((v) => {
      if (this.session.phase === 'landing') return;
      if (v === VisibilityState.Visible) this.session.resume();
      else this.session.pause();
    });
  }

  /** called once the board and sim exist (later tasks hook in here) */
  onReady(cb: (g: Game) => void): void {
    this.listeners.push(cb);
  }

  on(e: GameEvent, cb: (data?: unknown) => void): void {
    const list = this.evts.get(e) ?? [];
    list.push(cb);
    this.evts.set(e, list);
  }

  emit(e: GameEvent, data?: unknown): void {
    for (const cb of this.evts.get(e) ?? []) cb(data);
  }

  /** apply an action to the sim, record it for replay, and refresh the board */
  act(action: Action, actor: Actor, opts: { delegated?: boolean } = {}): ActionResult {
    if (!this.sim) return { ok: false, reason: 'no game running' };
    const r = applyAction(this.sim, action, actor, opts);
    console.info('[FH] act', actor, JSON.stringify(action), JSON.stringify(r), this.session.phase);
    if (r.ok) {
      this.inputs.push({ tReal: this.session.crisisElapsed, action, actor });
      this.simDirty = true;
      const tok = action.kind === 'deploy' ? this.sim.tokens.find((t) => t.id === action.token) : undefined;
      if (tok?.type === 'sandbags' && actor === 'player') this.session.onboardingDone();
    }
    return r;
  }

  togglePause(): void {
    console.info('[FH] togglePause', !this.session.paused);
    if (this.session.paused) {
      this.session.resume();
      this.emit('resume');
    } else {
      this.session.pause();
      this.emit('pause');
    }
  }

  start(): void {
    if (this.session.phase !== 'landing') return;
    this.searchT = 0;
    this.session.start();
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) this.world.launchXR();
  }

  head(): { pos: Vector3; dir: Vector3 } {
    const h = this.world.player.head;
    h.getWorldPosition(this.headPos);
    h.getWorldDirection(this.headDir).negate(); // Object3D faces -z
    return { pos: this.headPos, dir: this.headDir };
  }

  markSimDirty(): void {
    this.simDirty = true;
  }

  update(dt: number): void {
    const s = this.session;
    s.update(dt);
    if (s.paused) return;

    if (s.phase === 'finding' && this.world.visibilityState.peek() !== VisibilityState.NonImmersive) {
      this.searchT += dt;
      const { pos } = this.head();
      const found = chooseTable(this.planes.collect(), pos, this.planes.floorY());
      if (found || this.searchT >= TABLE_SEARCH_S) this.place(found);
    }

    this.board?.update(dt);
    if (this.sim && s.phase === 'crisis') {
      const before = this.sim.t;
      tick(this.sim, dt);
      if (this.sim.t !== before) this.simDirty = true;
    }
    if (this.sim && this.board && this.simDirty) {
      this.board.syncFrom(this.sim);
      this.simDirty = false;
    }
  }

  private place(found: PlaneInfo | null): void {
    const { pos, dir } = this.head();
    const floorY = this.planes.floorY();
    const plane = found ? { ...found, center: boardCenterOn(found, pos) } : fallbackDesk(pos, { x: dir.x, z: dir.z }, floorY);
    this.usedFallback = !found;
    if (!found) buildFallbackDesk(this.world, plane, this.world.session?.environmentBlendMode === 'opaque');
    this.plane = plane;
    this.sim = createSim(Math.floor(Math.random() * 2 ** 31), this.pickModifier());
    this.board = new BoardView(this.world, plane, pos);
    this.board.syncFrom(this.sim);
    this.session.tableFound();
    console.info('[FH] board placed', JSON.stringify({ label: plane.label, fallback: this.usedFallback, center: plane.center, size: [this.board.width, this.board.depth] }));
    for (const l of this.listeners) l(this);
    void this.board.unfold(2).then(() => this.session.unfolded());
  }

  private pickModifier(): Modifier {
    return 'heavy';
  }
}
