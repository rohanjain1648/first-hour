import { describe, expect, test } from 'vitest';
import { stepPower } from '../../src/sim/power';
import { buildHarrowBend } from '../../src/sim/map';
import { makeState } from './helpers';

const find = (s: ReturnType<typeof makeState>, type: string) => s.cells.flat().find((c) => c.type === type)!;

describe('stepPower', () => {
  test('substation floods when water > 0.5', () => {
    const s = makeState(buildHarrowBend());
    find(s, 'substation').water = 0.6;
    stepPower(s, 1);
    expect(s.substationFlooded).toBe(true);
    expect(s.cells.flat().filter((c) => c.type === 'residential').every((c) => !c.powered)).toBe(true);
    expect(s.log.some((e) => e.type === 'power.outage')).toBe(true);
  });
  test('generator drains only during outage', () => {
    const s = makeState(buildHarrowBend());
    stepPower(s, 120);
    expect(s.generatorFuel).toBe(60);
    find(s, 'substation').water = 0.6;
    stepPower(s, 1);
    const before = s.generatorFuel;
    stepPower(s, 120);
    expect(before - s.generatorFuel).toBeCloseTo(2, 5);
    expect(find(s, 'hospital').powered).toBe(true);
  });
  test('hospital goes dark when fuel runs out and dark time accrues', () => {
    const s = makeState(buildHarrowBend(), { substationFlooded: true, generatorFuel: 0 });
    stepPower(s, 30);
    expect(find(s, 'hospital').powered).toBe(false);
    expect(s.hospitalDarkS).toBe(30);
  });
  test('fuel token resets generatorFuel to 60', () => {
    const s = makeState(buildHarrowBend(), { generatorFuel: 5 });
    const h = find(s, 'hospital');
    s.tokens.push({ id: 'fuel1', type: 'fuel', cell: { x: h.x, y: h.y }, busyUntil: 0 });
    stepPower(s, 1);
    expect(s.generatorFuel).toBe(60);
  });
  test('cut district unpowers its cells and prevents live-water event', () => {
    const s = makeState(buildHarrowBend());
    const a = s.cells[7][0]; // riverside
    const b = s.cells[7][9]; // market
    a.water = 0.5;
    b.water = 0.5;
    s.cutDistricts.push('riverside');
    stepPower(s, 1);
    expect(a.powered).toBe(false);
    const live = s.log.filter((e) => e.type === 'hazard.livewater').map((e) => e.data.cell);
    expect(live).toContain('9,7');
    expect(live).not.toContain('0,7');
  });
});
