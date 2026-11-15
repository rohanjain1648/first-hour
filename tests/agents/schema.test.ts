import { describe, expect, test } from 'vitest';
import { TurnOutput, parseTurnOutput } from '../../src/agents/types';

const valid = {
  say: 'Chief here. Riverside banks are going under. I need two crews now.',
  mood: 'tense',
  proposals: [{ action: { kind: 'deploy', token: 'crew1', cell: { x: 1, y: 7 } }, rationale: 'People trapped on the low streets.' }],
  messages: [{ to: 'utilities', text: 'Cut Riverside power before my crews go in.', private: true }],
  memoryNote: 'Commander approved my first rescue.',
};

describe('TurnOutput schema', () => {
  test('accepts valid output', () => {
    expect(TurnOutput.safeParse(valid).success).toBe(true);
  });
  test('rejects say over 25 words', () => {
    const say = Array.from({ length: 26 }, () => 'word').join(' ');
    expect(TurnOutput.safeParse({ ...valid, say }).success).toBe(false);
  });
  test('rejects rationale over 15 words', () => {
    const rationale = Array.from({ length: 16 }, () => 'w').join(' ');
    expect(TurnOutput.safeParse({ ...valid, proposals: [{ ...valid.proposals[0], rationale }] }).success).toBe(false);
  });
  test('rejects 3 proposals', () => {
    const p = valid.proposals[0];
    expect(TurnOutput.safeParse({ ...valid, proposals: [p, p, p] }).success).toBe(false);
  });
  test('rejects 3 messages and message over 20 words', () => {
    const m = valid.messages[0];
    expect(TurnOutput.safeParse({ ...valid, messages: [m, m, m] }).success).toBe(false);
    const text = Array.from({ length: 21 }, () => 'w').join(' ');
    expect(TurnOutput.safeParse({ ...valid, messages: [{ ...m, text }] }).success).toBe(false);
  });
  test('rejects unknown action kind and unknown message recipient', () => {
    expect(TurnOutput.safeParse({ ...valid, proposals: [{ action: { kind: 'nuke' }, rationale: 'x' }] }).success).toBe(false);
    expect(TurnOutput.safeParse({ ...valid, messages: [{ to: 'mayor', text: 'hi', private: false }] }).success).toBe(false);
  });
  test('parseTurnOutput returns null for junk', () => {
    expect(parseTurnOutput('not json')).toBeNull();
    expect(parseTurnOutput({ say: 3 })).toBeNull();
    expect(parseTurnOutput(valid)?.mood).toBe('tense');
  });
});
