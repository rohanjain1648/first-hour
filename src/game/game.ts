import { Vector3, VisibilityState, type World } from '@iwsdk/core';
import { applyAction, type ActionResult } from '../sim/actions';
import { createSim, tick, type ReplayInput } from '../sim/engine';
import type { Action, Actor, SimState } from '../sim/types';
import { BoardView, buildFallbackDesk } from '../xr/board';
import type { PlaneReaderSystem } from '../xr/planes';
import { boardCenterOn, chooseTable, fallbackDesk, type PlaneInfo } from '../xr/table';
import { AiClient } from '../agents/aiClient';
import { applyDeckEvent, directorStep } from '../agents/director';
import { Orchestrator } from '../agents/orchestrator';
import { addRumour, rumorStep } from '../agents/rumor';
import { AGENT_IDS } from '../agents/roles';
import { newAgentState } from '../agents/trust';
import type { AgentState } from '../agents/types';
import { createRng } from '../sim/rng';
import type { AgentId } from '../sim/types';
import { debrief, type Debrief } from '../agents/debrief';
import { score, type Score } from '../sim/score';
import { loadSave, readPref, writeSave, type Save } from './persist';
import { ONBOARDING_SCRIPT, modifierFor, recordOutcome, simOptionsFor } from './progress';
import { Session } from './session';

export const TABLE_SEARCH_S = 3;

export type GameEvent = 'reject' | 'place' | 'pickup' | 'pause' | 'resume' | 'outcome' | 'debrief';

/** board state at a crisis time, for the debrief scrubber */
export interface Snapshot { tReal: number; state: SimState }
export const SNAPSHOT_EVERY_S = 10;

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
  ai: AiClient | null = null;
  orch: Orchestrator | null = null;
  agents: Record<AgentId, AgentState> | null = null;
  save: Save = loadSave();
  readonly sessionId = Math.random().toString(36).slice(2);
  private nextDirectorT = 90;
  private nextRumorT = 30;
  private directorBusy = false;
  private rumorBusy = false;
  private scriptIdx = 0;
  private nextSnapT = 0;
  readonly snapshots: Snapshot[] = [];
  outcome: (Score & { trust: number }) | null = null;
  review: Debrief | null = null;
  /** when set, the board shows this snapshot instead of the live sim (debrief scrubber) */
  viewing: SimState | null = null;
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
    this.session.onPhase((p) => {
      if (p === 'crisis') this.orch?.clearTransient();
      if (p === 'outcome') this.finish();
    });
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
    if (r.ok) {
      this.inputs.push({ tReal: this.session.crisisElapsed, action, actor });
      this.simDirty = true;
      const tok = action.kind === 'deploy' ? this.sim.tokens.find((t) => t.id === action.token) : undefined;
      if (tok?.type === 'sandbags' && actor === 'player') this.session.onboardingDone();
    }
    return r;
  }

  togglePause(): void {
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
    if (this.orch && s.phase === 'onboarding') this.runOnboarding();
    if (this.sim && s.phase === 'crisis') {
      if (s.crisisElapsed >= this.nextSnapT) {
        this.snapshots.push({ tReal: s.crisisElapsed, state: snapshotOf(this.sim) });
        this.nextSnapT += SNAPSHOT_EVERY_S;
      }
      const before = this.sim.t;
      tick(this.sim, dt);
      if (this.sim.t !== before) this.simDirty = true;
      this.orch?.update(dt);
      this.runSystemAgents();
    }
    if (this.sim && this.board && this.simDirty) {
      this.board.syncFrom(this.viewing ?? this.sim);
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
    this.sim = createSim(Math.floor(Math.random() * 2 ** 31), modifierFor(this.save.sessions), simOptionsFor(this.save.upgrades));
    this.board = new BoardView(this.world, plane, pos);
    this.board.syncFrom(this.sim);
    this.agents = Object.fromEntries(AGENT_IDS.map((id) => [id, newAgentState(id, this.save.memories[id] ?? [])])) as Record<AgentId, AgentState>;
    this.ai = new AiClient({ enabled: this.aiEnabled });
    const sim = this.sim;
    this.orch = new Orchestrator({
      sim,
      session: this.session,
      ai: this.ai,
      agents: this.agents,
      rng: createRng(sim.seed ^ 0x5bd1e995),
      now: () => (this.session.phase === 'onboarding' ? this.session.phaseElapsed : this.session.crisisElapsed),
      act: (a, actor, o) => this.act(a, actor, o),
      sessionId: this.sessionId,
    });
    this.session.tableFound();
    console.info('[FH] board placed', JSON.stringify({ label: plane.label, fallback: this.usedFallback, center: plane.center, size: [this.board.width, this.board.depth] }));
    for (const l of this.listeners) l(this);
    void this.board.unfold(2).then(() => {
      this.session.unfolded();
      if (import.meta.env.DEV) {
        setTimeout(() => {
          const r = this.world.renderer.info.render;
          const byRoot: Record<string, number> = {};
          this.world.scene.traverseVisible((o) => {
            if (!(o as { isMesh?: boolean }).isMesh) return;
            let top = o;
            while (top.parent && top.parent !== this.world.scene && !top.name.startsWith('Agent_') && !top.name.startsWith('Token_') && top.name !== 'TownBoard') top = top.parent;
            const key = top.name.replace(/_.*$/, '') || o.type;
            byRoot[key] = (byRoot[key] ?? 0) + 1;
          });
          console.info('[FH] perf', JSON.stringify({ triangles: r.triangles, calls: r.calls, textures: this.world.renderer.info.memory.textures, byRoot }));
        }, 2000);
      }
    });
  }

  /** Director (pacing) and Rumor agents: async, self-throttled, dropped if a pause intervened */
  private runSystemAgents(): void {
    const sim = this.sim;
    const ai = this.ai;
    if (!sim || !ai) return;
    const t = this.session.crisisElapsed;
    if (!this.directorBusy && t >= this.nextDirectorT) {
      this.directorBusy = true;
      const epoch = this.session.epoch;
      void directorStep(sim, ai, t).then((e) => {
        this.directorBusy = false;
        if (epoch !== this.session.epoch || this.sim !== sim) return;
        const now = this.session.crisisElapsed;
        if (e) {
          applyDeckEvent(sim, e, now);
          this.simDirty = true;
          this.nextDirectorT = now + 60;
        } else this.nextDirectorT = now + 15;
      });
    }
    if (!this.rumorBusy && t >= this.nextRumorT) {
      this.rumorBusy = true;
      const epoch = this.session.epoch;
      void rumorStep(sim, ai, t).then((r) => {
        this.rumorBusy = false;
        if (epoch !== this.session.epoch || this.sim !== sim) return;
        const now = this.session.crisisElapsed;
        if (r) {
          addRumour(sim, r, now);
          this.nextRumorT = now + 45;
        } else this.nextRumorT = now + 10;
      });
    }
  }

  private runOnboarding(): void {
    const t = this.session.phaseElapsed;
    while (this.scriptIdx < ONBOARDING_SCRIPT.length && ONBOARDING_SCRIPT[this.scriptIdx].at <= t) {
      const step = ONBOARDING_SCRIPT[this.scriptIdx++];
      if (step.whisperTo) this.orch!.scriptWhisper(step.agent, step.whisperTo, step.text);
      else this.orch!.scriptSay(step.agent, step.text);
    }
    this.orch!.expireOnly();
  }

  /** show the board as it was at a crisis time (null = live) */
  view(tReal: number | null): void {
    if (tReal === null) this.viewing = null;
    else {
      const snap = [...this.snapshots].reverse().find((x) => x.tReal <= tReal) ?? this.snapshots[0];
      this.viewing = snap?.state ?? null;
    }
    this.simDirty = true;
  }

  private finish(): void {
    const sim = this.sim;
    if (!sim || !this.agents) return;
    this.snapshots.push({ tReal: this.session.crisisElapsed, state: snapshotOf(sim) });
    const trust = Math.round(AGENT_IDS.reduce((a, id) => a + this.agents![id].trust, 0) / AGENT_IDS.length);
    this.outcome = { ...score(sim), trust };
    const memories: Partial<Record<AgentId, string>> = {};
    for (const id of AGENT_IDS) {
      const a = this.agents[id];
      memories[id] = a.memory[a.memory.length - 1]
        ?? (a.trust >= 70 ? 'You backed me when it counted.' : a.trust < 30 ? 'You left me hanging last time.' : a.holdsChip ? 'You trusted me with authority.' : undefined);
    }
    recordOutcome(this.save, this.outcome.rating, memories);
    writeSave(this.save);
    console.info('[FH] outcome', JSON.stringify(this.outcome));
    this.emit('outcome', this.outcome);
    void debrief(sim, this.ai ?? { raw: async () => null }).then((d) => {
      this.review = d;
      this.emit('debrief', d);
    });
  }
}

function snapshotOf(s: SimState): SimState {
  return {
    ...s,
    cells: s.cells.map((r) => r.map((c) => ({ ...c }))),
    tokens: s.tokens.map((t) => ({ ...t, cell: t.cell ? { ...t.cell } : null })),
    rumours: [],
    log: [],
    peopleInDanger: { ...s.peopleInDanger },
    compliance: { ...s.compliance },
    cutDistricts: [...s.cutDistricts],
    liveWater: [],
  };
}
