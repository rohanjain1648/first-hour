import { describe, expect, test, vi } from 'vitest';
import { Orchestrator, type TurnSource } from '../../src/agents/orchestrator';
import { newAgentState } from '../../src/agents/trust';
import type { TurnOutput, TurnRequest } from '../../src/agents/types';
import { Session } from '../../src/game/session';
import { applyAction } from '../../src/sim/actions';
import { createSim } from '../../src/sim/engine';
import { createRng } from '../../src/sim/rng';
import type { AgentId } from '../../src/sim/types';

const calm: TurnOutput = { say: 'All quiet.', mood: 'calm', proposals: [], messages: [] };

function setup(reply: (req: TurnRequest) => Promise<TurnOutput | null> = async () => calm) {
  const sim = createSim(1, 'heavy');
  const session = new Session(() => 0);
  session.start(); session.tableFound(); session.unfolded(); session.onboardingDone();
  let t = 0;
  const ai: TurnSource & { turn: ReturnType<typeof vi.fn> } = { turn: vi.fn(reply) };
  const agents = Object.fromEntries((['fire', 'hospital', 'utilities', 'press'] as AgentId[]).map((id) => [id, newAgentState(id)])) as Record<AgentId, ReturnType<typeof newAgentState>>;
  const orch = new Orchestrator({ sim, session, ai, agents, rng: createRng(5), now: () => t, act: (a, actor, o) => applyAction(sim, a, actor, o), sessionId: 'test' });
  const advance = async (secs: number, step = 1) => {
    for (let i = 0; i < secs; i += step) {
      t += step;
      orch.update(step);
      await Promise.resolve();
      await Promise.resolve();
    }
  };
  return { sim, session, ai, agents, orch, advance, setT: (v: number) => (t = v) };
}

const deferred = () => {
  let resolve!: (v: TurnOutput | null) => void;
  const p = new Promise<TurnOutput | null>((r) => (resolve = r));
  return { p, resolve };
};

describe('Orchestrator', () => {
  test('never two in-flight turns for one agent', async () => {
    const d = deferred();
    const { ai, advance } = setup(() => d.p);
    await advance(60);
    const fireCalls = ai.turn.mock.calls.filter((c) => (c[0] as TurnRequest).agentId === 'fire');
    expect(fireCalls.length).toBe(1);
  });

  test('heartbeat triggers turn after 20 s', async () => {
    const { ai, advance } = setup();
    await advance(15);
    const n = ai.turn.mock.calls.filter((c) => (c[0] as TurnRequest).agentId === 'fire').length;
    await advance(21);
    expect(ai.turn.mock.calls.filter((c) => (c[0] as TurnRequest).agentId === 'fire').length).toBeGreaterThan(n);
  });

  test('result from old epoch is discarded', async () => {
    const d = deferred();
    let first = true;
    const { session, orch, advance } = setup(() => {
      if (first) { first = false; return d.p; }
      return Promise.resolve(calm);
    });
    const says: string[] = [];
    orch.on('say', (e) => says.push((e as { text: string }).text));
    await advance(2);
    session.pause();
    session.resume();
    d.resolve({ ...calm, say: 'Stale words.' });
    await advance(1);
    expect(says).not.toContain('Stale words.');
  });

  test('stale action rejected on arrival is logged and fed back to inbox', async () => {
    const { sim, agents, orch, advance } = setup(async (req) =>
      req.agentId === 'fire'
        ? { ...calm, proposals: [{ action: { kind: 'deploy', token: 'crew1', cell: { x: 0, y: 3 } }, rationale: 'Go.' }] }
        : calm,
    );
    await advance(2);
    expect(orch.proposals.length).toBe(0);
    expect(sim.log.some((e) => e.type === 'agent.stale')).toBe(true);
    expect(agents.fire.inbox.some((m) => m.text.includes('rejected'))).toBe(true);
  });

  const proposing = async (req: TurnRequest): Promise<TurnOutput> =>
    req.agentId === 'fire' ? { ...calm, proposals: [{ action: { kind: 'deploy', token: 'sand1', cell: { x: 0, y: 5 } }, rationale: 'Hold the bank.' }] } : calm;

  test('approve applies action and +5 trust; deny gives -3', async () => {
    const a = setup(proposing);
    await a.advance(2);
    const p = a.orch.proposals[0];
    const before = a.agents.fire.trust;
    a.orch.playerApprove(p.id);
    expect(a.sim.cells[5][0].sandbags).toBe(1);
    expect(a.agents.fire.trust).toBe(before + 5);

    const b = setup(proposing);
    await b.advance(2);
    const tb = b.agents.fire.trust;
    b.orch.playerDeny(b.orch.proposals[0].id);
    expect(b.agents.fire.trust).toBe(tb - 3);
    expect(b.sim.cells[5][0].sandbags).toBe(0);
  });

  test('proposal expires after 15 s without chip, auto-applies with chip', async () => {
    const a = setup(proposing);
    await a.advance(2);
    a.orch.setFocus('fire');
    await a.advance(16);
    expect(a.sim.cells[5][0].sandbags).toBe(0);
    expect(a.orch.proposals.find((p) => p.agent === 'fire' && p.action.kind === 'deploy')).toBeUndefined();

    const b = setup(proposing);
    b.orch.giveChip('fire');
    b.orch.setFocus('fire');
    await b.advance(2);
    await b.advance(16);
    expect(b.sim.cells[5][0].sandbags).toBe(1);
  });

  test('freelance after 45 s unfocused, max one deploy per window', async () => {
    const { sim, orch, advance } = setup(async () => null);
    sim.cells[7][0].water = 1;
    sim.peopleInDanger['0,7'] = 60;
    orch.setFocus('hospital');
    await advance(44);
    expect(sim.log.filter((e) => e.type === 'agent.freelance' && e.actor === 'fire').length).toBe(0);
    await advance(10);
    expect(sim.log.filter((e) => e.type === 'agent.freelance' && e.actor === 'fire').length).toBe(1);
  });

  test('private message creates thread; unheard thread logs whisper.missed', async () => {
    const { sim, orch, advance } = setup(async (req) =>
      req.agentId === 'fire' ? { ...calm, messages: [{ to: 'utilities', text: 'Cut Riverside quietly.', private: true }] } : calm,
    );
    await advance(2);
    expect(orch.threads.length).toBe(1);
    await advance(10);
    expect(sim.log.some((e) => e.type === 'whisper.missed' && String(e.data.text).includes('Riverside'))).toBe(true);
  });

  test('eavesdrop marks heard and applies -5 to both', async () => {
    const { agents, orch, advance } = setup(async (req) =>
      req.agentId === 'fire' ? { ...calm, messages: [{ to: 'utilities', text: 'Between us.', private: true }] } : calm,
    );
    await advance(2);
    const [f, u] = [agents.fire.trust, agents.utilities.trust];
    orch.eavesdrop(orch.threads[0].id);
    expect(orch.threads[0].heard).toBe(true);
    expect(agents.fire.trust).toBe(f - 5);
    expect(agents.utilities.trust).toBe(u - 5);
  });

  test('AI null falls back to fallbackTurn', async () => {
    const { orch, advance } = setup(async () => null);
    const says: string[] = [];
    orch.on('say', (e) => says.push((e as { text: string }).text));
    await advance(2);
    expect(says.length).toBeGreaterThan(0);
  });

  test('nothing happens while paused', async () => {
    const { ai, session, advance } = setup();
    session.pause();
    await advance(30);
    expect(ai.turn).not.toHaveBeenCalled();
  });
});

describe('turn throttling', () => {
  test('domain events wake an agent at most once per 6 s', async () => {
    const { sim, ai, advance } = setup();
    await advance(5);
    const before = ai.turn.mock.calls.filter((c) => (c[0] as TurnRequest).agentId === 'utilities').length;
    for (let i = 0; i < 6; i++) {
      sim.log.push({ t: sim.t, type: 'hazard.livewater', actor: 'sim', data: { cell: `${i},7` } });
      await advance(1);
    }
    const after = ai.turn.mock.calls.filter((c) => (c[0] as TurnRequest).agentId === 'utilities').length;
    expect(after - before).toBeLessThanOrEqual(1);
  });
});
