import { describe, expect, test } from 'vitest';
import { defaultSave } from '../../src/game/persist';
import { LEVEE_CELLS, ONBOARDING_SCRIPT, modifierFor, recordOutcome, simOptionsFor } from '../../src/game/progress';
import { createSim } from '../../src/sim/engine';

describe('progress', () => {
  test('upgrades apply to createSim', () => {
    const s = createSim(1, 'heavy', simOptionsFor(['levee', 'generator', 'bus2']));
    for (const c of LEVEE_CELLS) expect(s.cells[c.y][c.x].sandbags).toBe(1);
    expect(s.generatorFuel).toBe(90);
    expect(s.tokens.filter((t) => t.type === 'bus').length).toBe(3);
  });
  test('no upgrades = defaults', () => {
    const s = createSim(1, 'heavy', simOptionsFor([]));
    expect(s.generatorFuel).toBe(60);
    expect(s.tokens.filter((t) => t.type === 'bus').length).toBe(2);
  });
  test('recordOutcome counts the session, keeps the best rating, unlocks one upgrade on A/B', () => {
    const save = defaultSave();
    recordOutcome(save, 'B', { fire: 'You let me lead.' });
    expect(save.sessions).toBe(1);
    expect(save.bestRating).toBe('B');
    expect(save.upgrades).toEqual(['levee']);
    expect(save.memories.fire).toEqual(['You let me lead.']);
    recordOutcome(save, 'D', {});
    expect(save.bestRating).toBe('B');
    expect(save.upgrades).toEqual(['levee']);
    recordOutcome(save, 'A', {});
    expect(save.bestRating).toBe('A');
    expect(save.upgrades).toEqual(['levee', 'generator']);
  });
  test('modifier rotates heavy → night → light', () => {
    expect([0, 1, 2, 3].map(modifierFor)).toEqual(['heavy', 'night', 'light', 'heavy']);
  });
  test('onboarding script teaches badge, sandbag, whisper in order, each line ≤ 25 words', () => {
    const kinds = ONBOARDING_SCRIPT.map((s) => s.teach).filter(Boolean);
    expect(kinds).toEqual(['badge', 'sandbag', 'whisper']);
    for (const s of ONBOARDING_SCRIPT) expect(s.text.split(/\s+/).length).toBeLessThanOrEqual(25);
    const times = ONBOARDING_SCRIPT.map((s) => s.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(ONBOARDING_SCRIPT[0].text).toContain('Pinch my badge');
  });
});
