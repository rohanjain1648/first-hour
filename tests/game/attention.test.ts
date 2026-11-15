import { describe, expect, test } from 'vitest';
import { focusedAgent } from '../../src/game/attention';

const head = { x: 0, y: 1.2, z: 0 };
const agents = [
  { id: 'fire' as const, pos: { x: 0, y: 1.0, z: -0.6 } },
  { id: 'press' as const, pos: { x: 0.5, y: 1.0, z: -0.3 } },
];

describe('focusedAgent', () => {
  test('picks agent inside 20 degrees', () => {
    const dir = { x: 0, y: -0.2 / 0.6, z: -1 };
    expect(focusedAgent(dir, head, agents)).toBe('fire');
  });
  test('picks the closest angle when two are inside the cone', () => {
    const near = [...agents, { id: 'hospital' as const, pos: { x: 0.05, y: 1.0, z: -0.6 } }];
    const dir = { x: 0.08, y: -0.2 / 0.6, z: -1 };
    expect(focusedAgent(dir, head, near)).toBe('hospital');
  });
  test('null when none inside the cone', () => {
    expect(focusedAgent({ x: -1, y: 0, z: 0 }, head, agents)).toBeNull();
  });
});
