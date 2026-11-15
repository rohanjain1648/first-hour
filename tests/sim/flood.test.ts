import { describe, expect, test } from 'vitest';
import { stepFlood } from '../../src/sim/flood';
import { buildHarrowBend } from '../../src/sim/map';
import { cell, makeState, strip } from './helpers';

const run = (s: ReturnType<typeof strip>, steps: number, dt = 3) => { for (let i = 0; i < steps; i++) stepFlood(s, dt); };

describe('stepFlood', () => {
  test('water spreads from river to lower neighbour', () => {
    const s = strip();
    run(s, 10);
    expect(s.cells[0][1].water).toBeGreaterThan(0);
    expect(s.cells[0][2].water).toBe(0);
  });
  test('sandbags block inflow', () => {
    const s = strip(2, 3);
    run(s, 10);
    expect(s.cells[0][1].water).toBe(0);
  });
  test('pump drains cell and neighbours', () => {
    const mk = () => makeState([[cell(0, 0, 'park', 1, { water: 1 }), cell(1, 0, 'park', 1, { water: 1 })]]);
    const a = mk();
    const b = mk();
    b.tokens.push({ id: 'pump1', type: 'pump', cell: { x: 0, y: 0 }, busyUntil: 0 });
    run(a, 7);
    run(b, 7);
    expect(b.cells[0][0].water).toBeLessThan(a.cells[0][0].water);
    expect(b.cells[0][1].water).toBeLessThan(a.cells[0][1].water);
  });
  test('rain raises river', () => {
    const s = makeState([[cell(0, 0, 'river', 0, { water: 1 })]], { rain: 1 });
    run(s, 20);
    expect(s.cells[0][0].water).toBeGreaterThan(1);
  });
  test('deterministic', () => {
    const a = makeState(buildHarrowBend(), { rain: 1 });
    const b = makeState(buildHarrowBend(), { rain: 1 });
    run(a, 300);
    run(b, 300);
    expect(a.cells).toEqual(b.cells);
  });
});
