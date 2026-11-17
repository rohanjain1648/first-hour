import { describe, expect, test } from 'vitest';
import { parseCommand } from '../../src/voice/commands';
import { pickVoices, type VoiceLike } from '../../src/voice/voices';
import { dailySeed, dateKey } from '../../src/game/daily';

describe('parseCommand', () => {
  test('approve / deny with and without an agent', () => {
    expect(parseCommand('approve')).toEqual({ kind: 'approve' });
    expect(parseCommand('Yes, do it')).toEqual({ kind: 'approve' });
    expect(parseCommand('approve the fire chief')).toEqual({ kind: 'approve', agent: 'fire' });
    expect(parseCommand('deny hospital')).toEqual({ kind: 'deny', agent: 'hospital' });
    expect(parseCommand('no')).toEqual({ kind: 'deny' });
  });
  test('report names an agent by role, name or nickname', () => {
    expect(parseCommand('Ravi, give me a report')).toEqual({ kind: 'report', agent: 'utilities' });
    expect(parseCommand('status from the press')).toEqual({ kind: 'report', agent: 'press' });
    expect(parseCommand('doctor what is your status')).toEqual({ kind: 'report', agent: 'hospital' });
  });
  test('pause, resume, broadcast', () => {
    expect(parseCommand('pause the game')).toEqual({ kind: 'pause' });
    expect(parseCommand('resume')).toEqual({ kind: 'resume' });
    expect(parseCommand('make a public broadcast')).toEqual({ kind: 'broadcast' });
  });
  test('anything else is an order, addressed to a named agent if any', () => {
    expect(parseCommand('Chief, send crews to Riverside now')).toEqual({ kind: 'order', agent: 'fire', text: 'Chief, send crews to Riverside now' });
    expect(parseCommand('protect the substation')).toEqual({ kind: 'order', text: 'protect the substation' });
  });
  test('empty or noise gives null', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('   ')).toBeNull();
  });
  test('orders are trimmed to 20 words', () => {
    const long = Array.from({ length: 30 }, (_, i) => `w${i}`).join(' ');
    const c = parseCommand(long);
    expect(c?.kind).toBe('order');
    expect(c && 'text' in c ? c.text!.split(' ').length : 0).toBe(20);
  });
});

describe('pickVoices', () => {
  const v = (name: string, lang = 'en-US'): VoiceLike => ({ name, lang });
  test('gives each agent a setting; prefers distinct English voices', () => {
    const r = pickVoices([v('A'), v('B'), v('C'), v('D'), v('X', 'fr-FR')]);
    const names = Object.values(r).map((x) => x.voice?.name);
    expect(new Set(names).size).toBe(4);
    expect(names).not.toContain('X');
  });
  test('reuses voices but varies pitch when few exist; works with none', () => {
    const one = pickVoices([v('Only')]);
    expect(new Set(Object.values(one).map((x) => x.pitch)).size).toBe(4);
    const none = pickVoices([]);
    expect(none.fire.voice).toBeNull();
  });
});

describe('daily', () => {
  test('same date gives the same seed; different dates differ', () => {
    const a = new Date(2026, 10, 17, 9);
    const b = new Date(2026, 10, 17, 23);
    const c = new Date(2026, 10, 18, 1);
    expect(dailySeed(a)).toBe(dailySeed(b));
    expect(dailySeed(a)).not.toBe(dailySeed(c));
    expect(dateKey(a)).toBe('2026-11-17');
  });
});
