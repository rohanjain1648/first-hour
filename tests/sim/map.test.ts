import { describe, expect, test } from 'vitest';
import { buildHarrowBend } from '../../src/sim/map';

describe('buildHarrowBend', () => {
  const m = buildHarrowBend();
  const all = m.flat();
  const count = (t: string) => all.filter((c) => c.type === t).length;

  test('is 8 rows x 12 cols with matching coordinates', () => {
    expect(m.length).toBe(8);
    for (const [y, row] of m.entries()) {
      expect(row.length).toBe(12);
      row.forEach((c, x) => expect([c.x, c.y]).toEqual([x, y]));
    }
  });
  test('has exactly one of each facility and a bridge', () => {
    expect(count('hospital')).toBe(1);
    expect(count('school')).toBe(1);
    expect(count('substation')).toBe(1);
    expect(count('firestation')).toBe(1);
    expect(count('bridge')).toBeGreaterThanOrEqual(1);
  });
  test('school is on high ground', () => {
    expect(all.find((c) => c.type === 'school')!.elevation).toBeGreaterThanOrEqual(4);
  });
  test('residential cells have residents, total 800-1500', () => {
    const res = all.filter((c) => c.type === 'residential');
    res.forEach((c) => expect(c.residents).toBeGreaterThan(0));
    const total = res.reduce((a, c) => a + c.residents, 0);
    expect(total).toBeGreaterThanOrEqual(800);
    expect(total).toBeLessThanOrEqual(1500);
  });
  test('river cells have elevation 0', () => {
    all.filter((c) => c.type === 'river').forEach((c) => expect(c.elevation).toBe(0));
  });
});
