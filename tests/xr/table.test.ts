import { describe, expect, test } from 'vitest';
import { boardCenterOn, boardSize, chooseTable, fallbackDesk, type PlaneInfo } from '../../src/xr/table';

const head = { x: 0, y: 1.2, z: 0 };
const plane = (x: number, y: number, z: number, label?: string, w = 1, d = 0.6): PlaneInfo => ({
  center: { x, y, z }, width: w, depth: d, label, horizontal: true,
});

describe('chooseTable', () => {
  test('picks labelled table over unlabelled closer plane', () => {
    const p = chooseTable([plane(0, 0.7, -0.4), plane(0.2, 0.74, -0.9, 'table')], head, 0);
    expect(p?.label).toBe('table');
  });
  test('accepts desk label', () => {
    expect(chooseTable([plane(0, 0.72, -0.5, 'desk')], head, 0)?.label).toBe('desk');
  });
  test('accepts 0.44 m coffee table', () => {
    expect(chooseTable([plane(0, 0.44, -0.6, 'table')], { x: 0, y: 1.1, z: 0 }, 0)).not.toBeNull();
  });
  test('rejects shelf at 1.3 m', () => {
    expect(chooseTable([plane(0, 1.3, -0.5, 'shelf')], head, 0)).toBeNull();
  });
  test('rejects floor, ceiling labels and vertical planes', () => {
    expect(chooseTable([plane(0, 0, -0.5, 'floor')], head, 0)).toBeNull();
    expect(chooseTable([{ ...plane(0, 0.7, -0.5), horizontal: false }], head, 0)).toBeNull();
  });
  test('rejects a table farther than 1.2 m', () => {
    expect(chooseTable([plane(0, 0.74, -1.6, 'table')], head, 0)).toBeNull();
  });
  test('picks nearest of two tables', () => {
    const p = chooseTable([plane(0, 0.74, -1.0, 'table'), plane(0.3, 0.74, -0.5, 'table')], head, 0);
    expect(p?.center.z).toBe(-0.5);
  });
  test('uses unlabelled horizontal plane when no labels', () => {
    expect(chooseTable([plane(0, 0.7, -0.5)], head, 0)).not.toBeNull();
  });
  test('without a floor, uses height below head', () => {
    expect(chooseTable([plane(0, 0.7, -0.5)], head, null)).not.toBeNull(); // 0.5 below head
    expect(chooseTable([plane(0, 1.15, -0.5)], head, null)).toBeNull(); // only 0.05 below
  });
  test('returns null when nothing qualifies', () => {
    expect(chooseTable([], head, 0)).toBeNull();
  });
});

describe('fallbackDesk', () => {
  test('is 0.45 m ahead at 0.72 m', () => {
    const d = fallbackDesk(head, { x: 0, z: -1 }, 0);
    expect(d.center.y).toBeCloseTo(0.72, 5);
    expect(d.center.z).toBeCloseTo(-0.45, 5);
    expect(d.center.x).toBeCloseTo(0, 5);
  });
  test('without floor sits 0.30 below the head', () => {
    expect(fallbackDesk(head, { x: 1, z: 0 }, null).center.y).toBeCloseTo(0.9, 5);
  });
});

describe('boardSize', () => {
  test('fits within plane, clamped to 0.9 x 0.6 max and 0.5 x 0.35 min, 3:2 aspect', () => {
    expect(boardSize(plane(0, 0, 0, 't', 3, 2))).toEqual({ width: 0.9, depth: 0.6 });
    const small = boardSize(plane(0, 0, 0, 't', 0.3, 0.2));
    expect(small).toEqual({ width: 0.5, depth: 0.35 });
    const mid = boardSize(plane(0, 0, 0, 't', 0.7, 0.6));
    expect(mid.width).toBeCloseTo(0.7, 5);
    expect(mid.depth).toBeCloseTo(0.7 * (8 / 12), 5);
  });
});

describe('long tables', () => {
  test('accepts a long table whose near edge is within reach', () => {
    const conf = plane(0, 0.72, -2.6, 'table', 1.2, 3.2); // near edge at z = -1.0
    expect(chooseTable([conf], { x: 0, y: 1.2, z: -0.4 }, 0)).not.toBeNull();
  });
  test('boardCenterOn puts the board on the near part of the table, inside its edges', () => {
    const conf = plane(0, 0.72, -2.6, 'table', 1.2, 3.2);
    const c = boardCenterOn(conf, { x: 0, y: 1.2, z: -0.4 });
    expect(c.y).toBeCloseTo(0.72, 5);
    expect(c.z).toBeLessThan(-1.0); // on the table
    expect(c.z).toBeGreaterThan(-1.6); // near edge, not the far end
  });
  test('boardCenterOn keeps a small table centered', () => {
    const t = plane(0.1, 0.7, -0.5, 'table', 0.9, 0.6);
    const c = boardCenterOn(t, head);
    expect(c.x).toBeCloseTo(0.1, 5);
    expect(c.z).toBeCloseTo(-0.5, 5);
  });
});
