import { describe, expect, test } from 'vitest';
import { debrief, debriefFallback } from '../../src/agents/debrief';
import { addRumour } from '../../src/agents/rumor';
import { createSim } from '../../src/sim/engine';
import { logEvent } from '../../src/sim/log';

const PRINCIPLES = ['objectives', 'span_of_control', 'delegation', 'verification', 'one_message'];

describe('debriefFallback', () => {
  test('finds ignored-agent moment', () => {
    const s = createSim(1, 'heavy');
    s.t = 900;
    logEvent(s, 'agent.ignored', 'hospital', { seconds: 95 });
    const d = debriefFallback(s);
    expect(d.moments.some((m) => m.principle === 'span_of_control' && m.what.toLowerCase().includes('hospital'))).toBe(true);
  });
  test('finds uncountered rumour', () => {
    const s = createSim(1, 'heavy');
    addRumour(s, { text: 'The dam burst.', district: 'oldtown', severity: 3 }, 100);
    s.t += 400;
    expect(debriefFallback(s).moments.some((m) => m.principle === 'verification')).toBe(true);
  });
  test('finds a chip given to a low-trust agent and a freelance action', () => {
    const s = createSim(1, 'heavy');
    logEvent(s, 'chip.given', 'player', { agent: 'fire', trust: 20 });
    logEvent(s, 'agent.freelance', 'utilities', { action: { kind: 'deploy', token: 'pump1', cell: { x: 1, y: 7 } } });
    const p = debriefFallback(s).moments.map((m) => m.principle);
    expect(p).toContain('delegation');
  });
  test('returns exactly 3 moments, padding with best-available', () => {
    const s = createSim(1, 'heavy');
    const d = debriefFallback(s);
    expect(d.moments.length).toBe(3);
    d.moments.forEach((m) => expect(PRINCIPLES).toContain(m.principle));
  });
  test('missed whispers come from whisper.missed log events', () => {
    const s = createSim(1, 'heavy');
    logEvent(s, 'whisper.missed', 'fire', { to: 'utilities', text: 'Cut Riverside quietly.' });
    const d = debriefFallback(s);
    expect(d.missedWhispers).toEqual([{ t: 0, from: 'fire', to: 'utilities', text: 'Cut Riverside quietly.' }]);
  });
});

describe('debrief (AI)', () => {
  test('uses valid AI moments and keeps log-based missed whispers', async () => {
    const s = createSim(1, 'heavy');
    logEvent(s, 'whisper.missed', 'fire', { to: 'press', text: 'Keep it quiet.' });
    const moments = [0, 1, 2].map((i) => ({ t: i * 60, what: `Moment ${i}`, principle: 'objectives', feedback: 'Set a clear goal early.' }));
    const d = await debrief(s, { raw: async () => ({ moments }) });
    expect(d.moments.map((m) => m.what)).toEqual(['Moment 0', 'Moment 1', 'Moment 2']);
    expect(d.missedWhispers.length).toBe(1);
  });
  test('falls back on bad AI output', async () => {
    const s = createSim(1, 'heavy');
    const d = await debrief(s, { raw: async () => ({ moments: [{ t: 1 }] }) });
    expect(d.moments.length).toBe(3);
  });
});

describe('variety', () => {
  test('prefers three different principles when available', () => {
    const s = createSim(1, 'heavy');
    addRumour(s, { text: 'The dam burst.', district: 'oldtown', severity: 3 }, 100);
    s.t = 3000;
    for (const a of ['fire', 'hospital', 'utilities', 'press']) logEvent(s, 'agent.ignored', a, { seconds: 120 });
    logEvent(s, 'chip.given', 'player', { agent: 'fire', trust: 10 });
    const p = debriefFallback(s).moments.map((m) => m.principle);
    expect(new Set(p).size).toBe(3);
  });
});
