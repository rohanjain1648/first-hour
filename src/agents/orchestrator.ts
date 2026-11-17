import { validateAction, type ActionResult } from '../sim/actions.js';
import { logEvent } from '../sim/log.js';
import type { Action, Actor, AgentId, SimState } from '../sim/types.js';
import type { Session } from '../game/session.js';
import { fallbackTurn } from './fallback.js';
import { observe } from './observe.js';
import { AGENT_IDS, ROLES } from './roles.js';
import { TRUST, applyTrust, remember } from './trust.js';
import type { AgentState, TurnOutput, TurnRequest } from './types.js';

export interface TurnSource {
  turn(req: TurnRequest): Promise<TurnOutput | null>;
}

export interface Proposal {
  id: string;
  agent: AgentId;
  action: Action;
  rationale: string;
  createdT: number;
  expiresT: number;
}

export interface Thread {
  id: string;
  from: AgentId;
  to: AgentId;
  text: string;
  createdT: number;
  expiresT: number;
  heard: boolean;
}

export type OrchEvent = 'say' | 'proposal' | 'proposalResolved' | 'whisper' | 'whisperHeard' | 'trust' | 'drafts' | 'freelance';

export const HEARTBEAT_S = 20;
/** minimum gap between turns woken by sim events (keeps AI calls bounded) */
export const MIN_EVENT_GAP_S = 6;
export const PROPOSAL_TTL_S = 15;
export const THREAD_TTL_S = 8;
export const FREELANCE_AFTER_S = 45;
export const IGNORE_GRACE_S = 60;
export const IGNORE_STEP_S = 30;
/** an agent left unattended this long is logged for the debrief */
export const IGNORED_LOG_S = 90;
const INBOX_SENT = 6;

export interface OrchestratorDeps {
  sim: SimState;
  session: Session;
  ai: TurnSource;
  agents: Record<AgentId, AgentState>;
  rng: () => number;
  /** real seconds on the crisis clock */
  now: () => number;
  act: (a: Action, actor: Actor, opts?: { delegated?: boolean }) => ActionResult;
  sessionId: string;
}

/**
 * Schedules agent turns (one in flight per agent), turns replies into proposals and whispers,
 * and applies delegation, freelancing and trust rules. Pure TS: no rendering.
 */
export class Orchestrator {
  proposals: Proposal[] = [];
  threads: Thread[] = [];
  drafts: string[] = [];
  focus: AgentId | null = null;
  private seq = 0;
  private logIdx = 0;
  private lastTurnT: Record<AgentId, number>;
  private wantTurn = new Set<AgentId>();
  private eventWake = new Set<AgentId>();
  private lastFreelanceT: Record<AgentId, number>;
  private lastIgnorePenaltyT: Record<AgentId, number>;
  private ignoredLogged = new Set<AgentId>();
  private talk = new Map<string, number>();
  private listeners = new Map<OrchEvent, ((data: unknown) => void)[]>();

  constructor(private d: OrchestratorDeps) {
    this.lastTurnT = Object.fromEntries(AGENT_IDS.map((id, i) => [id, -HEARTBEAT_S + i * 3])) as Record<AgentId, number>;
    this.lastFreelanceT = Object.fromEntries(AGENT_IDS.map((id) => [id, 0])) as Record<AgentId, number>;
    this.lastIgnorePenaltyT = Object.fromEntries(AGENT_IDS.map((id) => [id, 0])) as Record<AgentId, number>;
    this.logIdx = d.sim.log.length;
  }

  get agents(): Record<AgentId, AgentState> {
    return this.d.agents;
  }

  on(e: OrchEvent, cb: (data: unknown) => void): void {
    const l = this.listeners.get(e) ?? [];
    l.push(cb);
    this.listeners.set(e, l);
  }

  private emit(e: OrchEvent, data: unknown): void {
    for (const cb of this.listeners.get(e) ?? []) cb(data);
  }

  update(_dtReal: number): void {
    if (this.d.session.paused) return;
    const t = this.d.now();
    const { sim, agents } = this.d;

    // sim events in an agent's domain wake it up
    for (; this.logIdx < sim.log.length; this.logIdx++) {
      const ev = sim.log[this.logIdx];
      for (const id of AGENT_IDS) {
        if (ROLES[id].domain.includes(ev.type)) {
          agents[id].inbox.push({ from: 'sim', text: `${ev.type} ${JSON.stringify(ev.data).slice(0, 80)}`, t });
          agents[id].inbox = agents[id].inbox.slice(-12);
          this.eventWake.add(id);
        }
      }
    }

    for (const id of AGENT_IDS) {
      const a = agents[id];
      if (this.focus === id) a.lastFocusedT = t;
      if (t - this.lastTurnT[id] >= HEARTBEAT_S) this.wantTurn.add(id);
      if (this.eventWake.has(id) && t - this.lastTurnT[id] >= MIN_EVENT_GAP_S) this.wantTurn.add(id);
      if (this.wantTurn.has(id) && !a.inFlight) {
        this.wantTurn.delete(id);
        this.eventWake.delete(id);
        this.startTurn(a, t);
      }
      this.ignoreRules(a, t);
    }

    for (const p of [...this.proposals]) {
      if (p.expiresT > t) continue;
      if (agents[p.agent].holdsChip) this.resolve(p, 'delegated');
      else this.resolve(p, 'expired');
    }

    for (const th of this.threads) {
      if (th.expiresT <= t && !th.heard) logEvent(sim, 'whisper.missed', th.from, { to: th.to, text: th.text });
    }
    this.threads = this.threads.filter((th) => th.expiresT > t);
  }

  /** active (not expired) threads for rendering */
  activeThreads(): Thread[] {
    return this.threads;
  }

  private ignoreRules(a: AgentState, t: number): void {
    if (this.focus === a.id) {
      this.ignoredLogged.delete(a.id);
      return;
    }
    const ignored = t - a.lastFocusedT;
    if (ignored > IGNORED_LOG_S && !this.ignoredLogged.has(a.id)) {
      this.ignoredLogged.add(a.id);
      logEvent(this.d.sim, 'agent.ignored', a.id, { seconds: Math.round(ignored) });
    }
    if (ignored > IGNORE_GRACE_S && t - this.lastIgnorePenaltyT[a.id] >= IGNORE_STEP_S) {
      this.lastIgnorePenaltyT[a.id] = t;
      applyTrust(a, TRUST.ignoredPer30s);
      this.emit('trust', { agent: a.id, trust: a.trust });
    }
    if (!a.holdsChip && ignored > FREELANCE_AFTER_S && t - this.lastFreelanceT[a.id] >= FREELANCE_AFTER_S) {
      const plan = fallbackTurn(this.d.sim, a, this.d.rng);
      const deploy = plan.proposals.find((p) => p.action.kind === 'deploy');
      if (deploy && !validateAction(this.d.sim, deploy.action, a.id)) {
        this.lastFreelanceT[a.id] = t;
        const r = this.d.act(deploy.action, a.id);
        if (r.ok) {
          logEvent(this.d.sim, 'agent.freelance', a.id, { action: deploy.action });
          this.emit('freelance', { agent: a.id, action: deploy.action });
        }
      }
    }
  }

  private startTurn(a: AgentState, t: number): void {
    a.inFlight = true;
    this.lastTurnT[a.id] = t;
    const epoch = this.d.session.epoch;
    const req: TurnRequest = {
      agentId: a.id,
      observation: observe(this.d.sim, a.id),
      inbox: a.inbox.slice(-INBOX_SENT),
      memory: [...a.pastMemory, ...a.memory],
      trust: Math.round(a.trust),
      sessionId: this.d.sessionId,
    };
    a.inbox = [];
    this.d.ai
      .turn(req)
      .catch(() => null)
      .then((out) => this.arrive(a, out ?? fallbackTurn(this.d.sim, a, this.d.rng), epoch));
  }

  private arrive(a: AgentState, out: TurnOutput, epoch: number): void {
    a.inFlight = false;
    if (epoch !== this.d.session.epoch) return;
    const t = this.d.now();
    a.mood = out.mood;
    remember(a, out.memoryNote);
    this.emit('say', { agent: a.id, text: out.say, mood: out.mood, withhold: !!out.withhold });
    if (out.drafts?.length && a.id === 'press') {
      this.drafts = out.drafts.slice(0, 3);
      this.emit('drafts', this.drafts);
    }
    for (const p of out.proposals) {
      const reason = validateAction(this.d.sim, p.action, a.id);
      if (reason) {
        logEvent(this.d.sim, 'agent.stale', a.id, { action: p.action, reason });
        a.inbox.push({ from: 'sim', text: `Your proposal was rejected: ${reason}`, t });
        continue;
      }
      // one live proposal per agent per action kind: newest wins
      this.proposals = this.proposals.filter((q) => !(q.agent === a.id && q.action.kind === p.action.kind));
      const prop: Proposal = { id: `p${++this.seq}`, agent: a.id, action: p.action as Action, rationale: p.rationale, createdT: t, expiresT: t + PROPOSAL_TTL_S };
      this.proposals.push(prop);
      this.emit('proposal', prop);
    }
    for (const m of out.messages) {
      if (m.to === a.id) continue;
      const to = this.d.agents[m.to];
      to.inbox.push({ from: a.id, text: m.text, t });
      const key = [a.id, m.to].sort().join('|');
      this.talk.set(key, (this.talk.get(key) ?? 0) + 1);
      this.eventWake.add(m.to);
      if (m.private) {
        const th: Thread = { id: `w${++this.seq}`, from: a.id, to: m.to, text: m.text, createdT: t, expiresT: t + THREAD_TTL_S, heard: false };
        this.threads.push(th);
        this.emit('whisper', th);
      } else {
        this.emit('say', { agent: a.id, text: `${ROLES[m.to].title}: ${m.text}`, mood: out.mood, withhold: false });
      }
    }
  }

  private resolve(p: Proposal, outcome: 'approved' | 'denied' | 'expired' | 'delegated'): void {
    this.proposals = this.proposals.filter((q) => q.id !== p.id);
    const a = this.d.agents[p.agent];
    const t = this.d.now();
    let ok = true;
    if (outcome === 'approved' || outcome === 'delegated') {
      const r = this.d.act(p.action, p.agent, { delegated: outcome === 'delegated' });
      ok = r.ok;
      if (!r.ok) a.inbox.push({ from: 'sim', text: `Your proposal failed: ${r.reason}`, t });
    }
    if (outcome === 'approved') {
      applyTrust(a, TRUST.approve);
      a.inbox.push({ from: 'player', text: `approved: ${p.rationale}`, t });
    } else if (outcome === 'denied') {
      applyTrust(a, TRUST.deny);
      a.inbox.push({ from: 'player', text: `denied: ${p.rationale}`, t });
    }
    this.emit('proposalResolved', { proposal: p, outcome, ok });
    this.emit('trust', { agent: a.id, trust: a.trust });
  }

  playerApprove(id: string): void {
    const p = this.proposals.find((q) => q.id === id);
    if (p) this.resolve(p, 'approved');
  }

  playerDeny(id: string): void {
    const p = this.proposals.find((q) => q.id === id);
    if (p) this.resolve(p, 'denied');
  }

  giveChip(id: AgentId): void {
    const a = this.d.agents[id];
    if (a.holdsChip) return;
    a.holdsChip = true;
    applyTrust(a, TRUST.chipGiven);
    a.inbox.push({ from: 'player', text: 'You now have authority to act in your area without asking.', t: this.d.now() });
    logEvent(this.d.sim, 'chip.given', 'player', { agent: id, trust: a.trust });
    this.emit('trust', { agent: id, trust: a.trust });
  }

  takeChip(id: AgentId): void {
    const a = this.d.agents[id];
    if (!a.holdsChip) return;
    a.holdsChip = false;
    applyTrust(a, TRUST.chipTaken);
    a.inbox.push({ from: 'player', text: 'Your authority has been taken back. Ask before acting.', t: this.d.now() });
    logEvent(this.d.sim, 'chip.taken', 'player', { agent: id });
    this.emit('trust', { agent: id, trust: a.trust });
  }

  eavesdrop(threadId: string): void {
    const th = this.threads.find((x) => x.id === threadId);
    if (!th || th.heard) return;
    th.heard = true;
    applyTrust(this.d.agents[th.from], TRUST.eavesdropped);
    applyTrust(this.d.agents[th.to], TRUST.eavesdropped);
    logEvent(this.d.sim, 'whisper.heard', 'player', { from: th.from, to: th.to, text: th.text });
    this.emit('whisperHeard', th);
  }

  setFocus(id: AgentId | null): void {
    this.focus = id;
    if (id) this.d.agents[id].lastFocusedT = this.d.now();
  }

  /** scripted line (onboarding): spoken without an AI turn */
  scriptSay(agent: AgentId, text: string): void {
    this.emit('say', { agent, text, mood: 'calm', withhold: false });
  }

  /** scripted whisper (onboarding) */
  scriptWhisper(from: AgentId, to: AgentId, text: string): void {
    const t = this.d.now();
    const th: Thread = { id: `w${++this.seq}`, from, to, text, createdT: t, expiresT: t + THREAD_TTL_S * 2, heard: false };
    this.threads.push(th);
    this.emit('whisper', th);
  }

  /** onboarding: expire threads without starting agent turns or logging misses */
  expireOnly(): void {
    const t = this.d.now();
    this.threads = this.threads.filter((th) => th.expiresT > t);
  }

  /** drop onboarding threads/proposals when the crisis clock starts */
  clearTransient(): void {
    this.threads = [];
    this.proposals = [];
    for (const id of AGENT_IDS) this.d.agents[id].lastFocusedT = 0;
  }

  /** messages exchanged between two agents so far (either direction) */
  pairTalk(a: AgentId, b: AgentId): number {
    return this.talk.get([a, b].sort().join('|')) ?? 0;
  }

  proposalFor(id: AgentId): Proposal | undefined {
    return this.proposals.find((p) => p.agent === id);
  }

  /** a spoken (or typed) order from the Commander: goes to the named agent, else the focused one, else Fire */
  commanderOrder(agent: AgentId | undefined, text: string): AgentId {
    const id = agent ?? this.focus ?? 'fire';
    this.d.agents[id].inbox.push({ from: 'player', text: `Commander orders: ${text}`, t: this.d.now() });
    logEvent(this.d.sim, 'commander.order', 'player', { agent: id, text });
    this.wantTurn.add(id);
    return id;
  }

  /** the player pinched an agent's badge */
  requestReport(id: AgentId): void {
    this.d.agents[id].inbox.push({ from: 'player', text: 'Commander asks for your report now.', t: this.d.now() });
    this.wantTurn.add(id);
  }

  /** the player pinched the broadcast card: ask press for three drafts */
  requestDrafts(): void {
    this.d.agents.press.inbox.push({ from: 'player', text: 'Commander wants three broadcast drafts now.', t: this.d.now() });
    this.wantTurn.add('press');
  }
}
