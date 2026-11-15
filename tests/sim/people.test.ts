import { describe, expect, test } from 'vitest';
import { DANGER_WATER, HARM_AFTER_GAME_S, RESCUE_GAME_S, findPath, stepPeople } from '../../src/sim/people';
import { buildHarrowBend } from '../../src/sim/map';
import { makeState } from './helpers';

describe('stepPeople', () => {
  test('cell becomes in danger above DANGER_WATER', () => {
    const s = makeState(buildHarrowBend());
    s.cells[7][0].water = DANGER_WATER + 0.1;
    stepPeople(s, 10);
    expect(s.peopleInDanger['0,7']).toBe(10);
    expect(s.log.some((e) => e.type === 'people.danger')).toBe(true);
  });
  test('harmed after HARM_AFTER_GAME_S without rescue', () => {
    const s = makeState(buildHarrowBend());
    s.cells[7][0].water = 1;
    const n = s.cells[7][0].residents;
    for (let t = 0; t < HARM_AFTER_GAME_S; t += 30) stepPeople(s, 30);
    expect(s.harmed).toBe(n);
    expect(s.cells[7][0].residents).toBe(0);
    expect(s.log.some((e) => e.type === 'people.harmed')).toBe(true);
  });
  test('crew on cell for RESCUE_GAME_S moves residents to saved', () => {
    const s = makeState(buildHarrowBend());
    s.cells[7][0].water = 1;
    const n = s.cells[7][0].residents;
    s.tokens.push({ id: 'crew1', type: 'crew', cell: { x: 0, y: 7 }, busyUntil: RESCUE_GAME_S });
    stepPeople(s, 60);
    s.t += 60;
    expect(s.saved).toBe(0);
    stepPeople(s, 61);
    expect(s.saved).toBe(n);
    expect(s.cells[7][0].residents).toBe(0);
  });
  test('bus evacuates district to school scaled by compliance', () => {
    const run = (compliance: number) => {
      const s = makeState(buildHarrowBend());
      s.compliance.riverside = compliance;
      s.tokens.push({ id: 'bus1', type: 'bus', cell: { x: 2, y: 6 }, busyUntil: 0 });
      for (let i = 0; i < 300; i += 3) stepPeople(s, 3);
      return s.saved;
    };
    const hi = run(1);
    expect(hi).toBeGreaterThan(0);
    expect(hi).toBeGreaterThan(run(0.3));
  });
  test('findPath uses the bridge and returns null when it collapses', () => {
    const s = makeState(buildHarrowBend());
    const path = findPath(s, { x: 0, y: 7 }, { x: 2, y: 0 });
    expect(path).not.toBeNull();
    expect(path!.some((c) => s.cells[c.y][c.x].type === 'bridge')).toBe(true);
    s.bridgeIntact = false;
    expect(findPath(s, { x: 0, y: 7 }, { x: 2, y: 0 })).toBeNull();
  });
});
