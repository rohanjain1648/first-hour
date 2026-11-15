import { Vector3, VisibilityState, type World } from '@iwsdk/core';
import { createSim, tick } from '../sim/engine';
import type { Modifier, SimState } from '../sim/types';
import { BoardView, buildFallbackDesk } from '../xr/board';
import type { PlaneReaderSystem } from '../xr/planes';
import { boardCenterOn, chooseTable, fallbackDesk, type PlaneInfo } from '../xr/table';
import { readPref } from './persist';
import { Session } from './session';

export const TABLE_SEARCH_S = 3;

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

  constructor(
    readonly world: World,
    private readonly planes: PlaneReaderSystem,
  ) {
    this.session = new Session(() => performance.now() / 1000);
    this.aiEnabled = readPref('fh.ai') !== '0';
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
