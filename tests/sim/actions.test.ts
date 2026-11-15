import { describe, expect, test } from 'vitest';
import { applyAction } from '../../src/sim/actions';
import { createSim } from '../../src/sim/engine';

const sim = () => createSim(7, 'heavy');

describe('applyAction', () => {
  test('rejects out-of-bounds cell', () => {
    const r = applyAction(sim(), { kind: 'deploy', token: 'sand1', cell: { x: 12, y: 0 } }, 'player');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('bounds');
  });
  test('rejects token already deployed', () => {
    const s = sim();
    expect(applyAction(s, { kind: 'deploy', token: 'sand1', cell: { x: 0, y: 5 } }, 'player').ok).toBe(true);
    expect(applyAction(s, { kind: 'deploy', token: 'sand1', cell: { x: 1, y: 5 } }, 'player').ok).toBe(false);
  });
  test('rejects wrong role', () => {
    const r = applyAction(sim(), { kind: 'deploy', token: 'crew1', cell: { x: 0, y: 7 } }, 'hospital');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toContain('role');
  });
  test('rejects deploy onto river cell for bus and crew', () => {
    const s = sim();
    expect(applyAction(s, { kind: 'deploy', token: 'bus1', cell: { x: 0, y: 3 } }, 'player').ok).toBe(false);
    expect(applyAction(s, { kind: 'deploy', token: 'crew1', cell: { x: 0, y: 3 } }, 'player').ok).toBe(false);
  });
  test('sandbag deploy raises the cell wall and recall lowers it', () => {
    const s = sim();
    applyAction(s, { kind: 'deploy', token: 'sand1', cell: { x: 0, y: 5 } }, 'player');
    expect(s.cells[5][0].sandbags).toBe(1);
    applyAction(s, { kind: 'recall', token: 'sand1' }, 'player');
    expect(s.cells[5][0].sandbags).toBe(0);
  });
  test('only utilities (or player) may cut power', () => {
    const s = sim();
    expect(applyAction(s, { kind: 'cut_power', district: 'riverside' }, 'fire').ok).toBe(false);
    expect(applyAction(s, { kind: 'cut_power', district: 'riverside' }, 'utilities').ok).toBe(true);
    expect(s.cutDistricts).toContain('riverside');
  });
  test('broadcast raises compliance and marks matching rumour countered', () => {
    const s = sim();
    s.rumours.push({ id: 'r1', text: 'The dam burst', district: 'oldtown', severity: 2, countered: false, t: 0 });
    const before = s.compliance.oldtown;
    expect(applyAction(s, { kind: 'broadcast', text: 'The dam is fine.', counters: 'r1' }, 'press').ok).toBe(true);
    expect(s.compliance.oldtown).toBeGreaterThan(before);
    expect(s.rumours[0].countered).toBe(true);
  });
  test('every applyAction call appends exactly one log event', () => {
    const s = sim();
    const n = s.log.length;
    applyAction(s, { kind: 'deploy', token: 'nope', cell: { x: 0, y: 0 } }, 'player');
    applyAction(s, { kind: 'report', fact: 'river rising' }, 'fire');
    expect(s.log.length).toBe(n + 2);
    expect(s.log.map((e) => e.type).slice(-2)).toEqual(['action.rejected', 'action.ok']);
  });
});
