import { describe, expect, test } from 'vitest';
import { createSim, replay, tick } from '../../src/sim/engine';
import { score } from '../../src/sim/score';
import type { Action, Actor } from '../../src/sim/types';

describe('engine', () => {
  test('createSim has the starting tokens', () => {
    const s = createSim(1, 'heavy');
    const n = (t: string) => s.tokens.filter((k) => k.type === t).length;
    expect([n('crew'), n('bus'), n('sandbags'), n('pump'), n('fuel')]).toEqual([3, 2, 6, 1, 1]);
  });
  test('tick(600 real s) ends at t=3600', () => {
    const s = createSim(1, 'heavy');
    for (let i = 0; i < 600; i++) tick(s, 1);
    expect(s.t).toBe(3600);
  });
  test('odd frame times accumulate exactly', () => {
    const s = createSim(1, 'heavy');
    for (let i = 0; i < 1000; i++) tick(s, 0.016);
    expect(s.t).toBe(Math.floor(16 / 0.5) * 3);
  });
  test('replay is deterministic', () => {
    const inputs: { tReal: number; action: Action; actor: Actor }[] = [
      { tReal: 20, action: { kind: 'deploy', token: 'sand1', cell: { x: 0, y: 5 } }, actor: 'player' },
      { tReal: 95, action: { kind: 'deploy', token: 'bus1', cell: { x: 2, y: 6 } }, actor: 'player' },
      { tReal: 200, action: { kind: 'deploy', token: 'crew1', cell: { x: 0, y: 7 } }, actor: 'fire' },
    ];
    const a = replay(3, 'heavy', inputs, 400);
    const b = replay(3, 'heavy', inputs, 400);
    expect(a.cells).toEqual(b.cells);
    expect([a.saved, a.harmed]).toEqual([b.saved, b.harmed]);
    expect(a.saved).toBeGreaterThan(0);
  });
  test('score returns A when everyone is safe and the hospital never lost power', () => {
    const s = createSim(1, 'heavy');
    s.t = 3600;
    expect(score(s).rating).toBe('A');
    expect(score(s).safePct).toBe(100);
    expect(score(s).hospitalUptimePct).toBe(100);
  });
  test('score drops with harm and hospital downtime', () => {
    const s = createSim(1, 'heavy');
    s.t = 3600;
    s.harmed = 500;
    s.hospitalDarkS = 1800;
    const r = score(s);
    expect(r.safePct).toBeLessThan(70);
    expect(r.hospitalUptimePct).toBe(50);
    expect(['C', 'D', 'E']).toContain(r.rating);
  });
});
