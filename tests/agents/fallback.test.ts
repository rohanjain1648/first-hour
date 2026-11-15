import { describe, expect, test } from 'vitest';
import { fallbackTurn } from '../../src/agents/fallback';
import { LINES, SITUATIONS } from '../../src/agents/lines';
import { observe } from '../../src/agents/observe';
import { applyTrust, newAgentState } from '../../src/agents/trust';
import { TurnOutput } from '../../src/agents/types';
import { AGENT_IDS } from '../../src/agents/roles';
import { createSim, tick } from '../../src/sim/engine';
import { createRng } from '../../src/sim/rng';

describe('observe', () => {
  const s = createSim(1, 'heavy');
  test('fire sees rescue calls, not generator fuel', () => {
    const o = observe(s, 'fire') as Record<string, unknown>;
    expect(o).toHaveProperty('rescueCalls');
    expect(o).not.toHaveProperty('generatorFuel');
  });
  test('hospital sees generator fuel, not rumours', () => {
    const o = observe(s, 'hospital') as Record<string, unknown>;
    expect(o).toHaveProperty('generatorFuel');
    expect(o).not.toHaveProperty('rumours');
  });
  test('press sees rumours; utilities sees substation water', () => {
    expect(observe(s, 'press')).toHaveProperty('rumours');
    expect(observe(s, 'utilities')).toHaveProperty('substationWater');
  });
});

describe('trust', () => {
  test('applyTrust clamps to 0..100', () => {
    const a = newAgentState('fire');
    applyTrust(a, 500);
    expect(a.trust).toBe(100);
    applyTrust(a, -500);
    expect(a.trust).toBe(0);
  });
});

describe('lines', () => {
  test('fallback lines exist for every agent x situation (>=12)', () => {
    for (const id of AGENT_IDS) for (const sit of SITUATIONS) expect(LINES[id][sit].length).toBeGreaterThanOrEqual(12);
  });
  test('every line fits the 25-word limit', () => {
    for (const id of AGENT_IDS) for (const sit of SITUATIONS) for (const l of LINES[id][sit]) expect(l.split(/\s+/).length).toBeLessThanOrEqual(25);
  });
});

describe('fallbackTurn', () => {
  test('always returns schema-valid output across 200 random states', () => {
    const rng = createRng(42);
    for (let i = 0; i < 200; i++) {
      const s = createSim(i, 'heavy');
      tick(s, rng() * 600);
      if (rng() < 0.3) s.substationFlooded = true;
      for (const id of AGENT_IDS) {
        const a = newAgentState(id);
        a.trust = Math.floor(rng() * 100);
        const out = fallbackTurn(s, a, rng);
        const r = TurnOutput.safeParse(out);
        if (!r.success) throw new Error(`${id} state ${i}: ${JSON.stringify(r.error.issues)} ${JSON.stringify(out)}`);
      }
    }
  });
  test('withholds only under 30 trust', () => {
    const rng = createRng(1);
    const s = createSim(1, 'heavy');
    for (let i = 0; i < 50; i++) {
      const a = newAgentState('hospital');
      a.trust = 80;
      expect(fallbackTurn(s, a, rng).withhold ?? false).toBe(false);
    }
    const low = newAgentState('hospital');
    low.trust = 10;
    const outs = Array.from({ length: 50 }, () => fallbackTurn(s, low, rng));
    expect(outs.some((o) => o.withhold)).toBe(true);
  });
  test('fire proposes a rescue when a district is in danger', () => {
    const s = createSim(1, 'heavy');
    s.cells[7][0].water = 1;
    s.peopleInDanger['0,7'] = 100;
    const out = fallbackTurn(s, newAgentState('fire'), createRng(3));
    expect(out.proposals.some((p) => p.action.kind === 'deploy' && p.action.token.startsWith('crew'))).toBe(true);
  });
});

describe('utilities power cuts', () => {
  test('does not propose cutting a district just because its riverbank floods', () => {
    const s = createSim(1, 'heavy');
    for (const c of s.cells[2]) c.water = 1; // north banks (hillcrest/eastfield)
    const out = fallbackTurn(s, newAgentState('utilities'), createRng(2));
    expect(out.proposals.some((p) => p.action.kind === 'cut_power')).toBe(false);
  });
  test('proposes cutting a district whose homes are flooded', () => {
    const s = createSim(1, 'heavy');
    s.cells[7][0].water = 1;
    const out = fallbackTurn(s, newAgentState('utilities'), createRng(2));
    expect(out.proposals.some((p) => p.action.kind === 'cut_power' && p.action.district === 'riverside')).toBe(true);
  });
});
