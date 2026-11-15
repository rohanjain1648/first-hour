import { describe, expect, test } from 'vitest';
import { FALLBACK_SCHEDULE, applyDeckEvent, directorStep } from '../../src/agents/director';
import { createSim } from '../../src/sim/engine';

const ai = (event: string | null) => ({ raw: async () => (event === null ? null : { event, reason: 'test' }) });

describe('director', () => {
  test('none before 90 s', async () => {
    const s = createSim(1, 'heavy');
    expect(await directorStep(s, ai('bridge_collapse'), 60)).toBeNull();
  });
  test('accepts a valid AI choice after 90 s', async () => {
    const s = createSim(1, 'heavy');
    expect(await directorStep(s, ai('rain_surge'), 100)).toBe('rain_surge');
  });
  test('rejects event outside deck (falls back to schedule, which has nothing due yet)', async () => {
    const s = createSim(1, 'heavy');
    expect(await directorStep(s, ai('meteor_strike'), 100)).toBeNull();
  });
  test('at most one per 60 s', async () => {
    const s = createSim(1, 'heavy');
    const e = await directorStep(s, ai('rain_surge'), 100);
    applyDeckEvent(s, e!, 100);
    expect(await directorStep(s, ai('substation_alarm'), 130)).toBeNull();
    expect(await directorStep(s, ai('substation_alarm'), 161)).toBe('substation_alarm');
  });
  test('never repeats an event', async () => {
    const s = createSim(1, 'heavy');
    applyDeckEvent(s, 'rain_surge', 100);
    expect(await directorStep(s, ai('rain_surge'), 200)).not.toBe('rain_surge');
  });
  test('fallback schedule fires bridge_collapse at 180 s', async () => {
    expect(FALLBACK_SCHEDULE[180]).toBe('bridge_collapse');
    const s = createSim(1, 'heavy');
    expect(await directorStep(s, ai(null), 180)).toBe('bridge_collapse');
  });
  test('bridge_collapse sets bridgeIntact=false and logs deck event', () => {
    const s = createSim(1, 'heavy');
    applyDeckEvent(s, 'bridge_collapse', 180);
    expect(s.bridgeIntact).toBe(false);
    expect(s.log.some((e) => e.type === 'deck.bridge_collapse')).toBe(true);
  });
  test('rumour_dam adds a severe rumour; generator_fault drains fuel', () => {
    const s = createSim(1, 'heavy');
    applyDeckEvent(s, 'rumour_dam', 200);
    expect(s.rumours.some((r) => r.severity === 3)).toBe(true);
    applyDeckEvent(s, 'generator_fault', 260);
    expect(s.generatorFuel).toBeLessThanOrEqual(8);
  });
});
