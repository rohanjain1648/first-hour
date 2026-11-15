import { describe, expect, test } from 'vitest';
import { observe } from '../../src/agents/observe';
import { addRumour, defaultDrafts, rumorStep } from '../../src/agents/rumor';
import { applyAction } from '../../src/sim/actions';
import { createSim } from '../../src/sim/engine';

const ai = (out: unknown) => ({ raw: async () => out });

describe('rumor', () => {
  test('lowers compliance and only press observes it', () => {
    const s = createSim(1, 'heavy');
    const before = s.compliance.riverside;
    addRumour(s, { text: 'The school shelter is full.', district: 'riverside', severity: 2 }, 100);
    expect(s.compliance.riverside).toBeCloseTo(before - 0.2, 5);
    expect(JSON.stringify(observe(s, 'press'))).toContain('school shelter is full');
    for (const id of ['fire', 'hospital', 'utilities'] as const) expect(JSON.stringify(observe(s, id))).not.toContain('school shelter');
  });
  test('rumorStep uses valid AI output, at most one per 45 s', async () => {
    const s = createSim(1, 'heavy');
    const r = await rumorStep(s, ai({ text: 'Bridge is safe to drive.', district: 'oldtown', severity: 1 }), 100);
    expect(r?.district).toBe('oldtown');
    addRumour(s, r!, 100);
    expect(await rumorStep(s, ai({ text: 'x y', district: 'market', severity: 1 }), 120)).toBeNull();
    expect(await rumorStep(s, ai({ text: 'Another one here.', district: 'market', severity: 1 }), 146)).not.toBeNull();
  });
  test('invalid AI output falls back to a template', async () => {
    const s = createSim(1, 'heavy');
    const r = await rumorStep(s, ai({ text: 7 }), 100);
    expect(r).not.toBeNull();
    expect(r!.text.length).toBeGreaterThan(5);
  });
  test('defaultDrafts gives three broadcasts, the first countering the top rumour', () => {
    const s = createSim(1, 'heavy');
    addRumour(s, { text: 'The dam burst.', district: 'oldtown', severity: 3 }, 100);
    const d = defaultDrafts(s);
    expect(d.drafts.length).toBe(3);
    expect(d.counters).toBe(s.rumours[0].id);
    expect(applyAction(s, { kind: 'broadcast', text: d.drafts[0], counters: d.counters }, 'player').ok).toBe(true);
    expect(s.rumours[0].countered).toBe(true);
  });
});
