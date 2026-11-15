import { describe, expect, test } from 'vitest';
import { CRISIS_REAL_S, ONBOARDING_MAX_S, Session } from '../../src/game/session';

const make = () => new Session(() => 0);
const run = (s: Session, secs: number) => { for (let i = 0; i < secs * 10; i++) s.update(0.1); };

describe('Session', () => {
  test('phases advance in order', () => {
    const s = make();
    const seen: string[] = [];
    s.onPhase((p) => seen.push(p));
    expect(s.phase).toBe('landing');
    s.start();
    s.tableFound();
    s.unfolded();
    s.onboardingDone();
    run(s, CRISIS_REAL_S + 1);
    s.showDebrief();
    expect(seen).toEqual(['finding', 'unfolding', 'onboarding', 'crisis', 'outcome', 'debrief']);
  });
  test('onboarding auto-ends at 90 s', () => {
    const s = make();
    s.start(); s.tableFound(); s.unfolded();
    run(s, ONBOARDING_MAX_S - 1);
    expect(s.phase).toBe('onboarding');
    run(s, 2);
    expect(s.phase).toBe('crisis');
  });
  test('crisis ends after 480 real s', () => {
    expect(CRISIS_REAL_S).toBe(480);
    const s = make();
    s.start(); s.tableFound(); s.unfolded(); s.onboardingDone();
    run(s, 479);
    expect(s.phase).toBe('crisis');
    run(s, 2);
    expect(s.phase).toBe('outcome');
  });
  test('crisisElapsed reports real seconds of crisis play', () => {
    const s = make();
    s.start(); s.tableFound(); s.unfolded(); s.onboardingDone();
    run(s, 30);
    expect(s.crisisElapsed).toBeCloseTo(30, 5);
  });
  test('pause stops update from advancing and bumps epoch', () => {
    const s = make();
    s.start(); s.tableFound(); s.unfolded(); s.onboardingDone();
    const e = s.epoch;
    s.pause();
    expect(s.epoch).toBe(e + 1);
    run(s, 600);
    expect(s.phase).toBe('crisis');
    expect(s.crisisElapsed).toBe(0);
    s.resume();
    expect(s.paused).toBe(false);
    run(s, 1);
    expect(s.crisisElapsed).toBeGreaterThan(0);
  });
  test('out-of-order calls are ignored', () => {
    const s = make();
    s.onboardingDone();
    s.unfolded();
    expect(s.phase).toBe('landing');
  });
});
