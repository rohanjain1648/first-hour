export type Phase = 'landing' | 'finding' | 'unfolding' | 'onboarding' | 'crisis' | 'outcome' | 'debrief';

export const ONBOARDING_MAX_S = 90;
export const CRISIS_REAL_S = 480;

/**
 * Session flow state machine. Pure: driven only by update(dtReal) and method calls.
 * `epoch` increments on every pause; async work tagged with an older epoch must be dropped.
 */
export class Session {
  phase: Phase = 'landing';
  paused = false;
  epoch = 0;
  /** real seconds spent in the current phase (paused time excluded) */
  phaseElapsed = 0;
  private listeners: ((p: Phase) => void)[] = [];

  constructor(private clock: () => number) {}

  get crisisElapsed(): number {
    return this.phase === 'crisis' ? this.phaseElapsed : this.phase === 'outcome' || this.phase === 'debrief' ? CRISIS_REAL_S : 0;
  }

  now(): number {
    return this.clock();
  }

  onPhase(cb: (p: Phase) => void): void {
    this.listeners.push(cb);
  }

  start(): void {
    this.go('landing', 'finding');
  }
  tableFound(): void {
    this.go('finding', 'unfolding');
  }
  unfolded(): void {
    this.go('unfolding', 'onboarding');
  }
  onboardingDone(): void {
    this.go('onboarding', 'crisis');
  }
  showDebrief(): void {
    this.go('outcome', 'debrief');
  }
  /** back to landing for "Play again" */
  reset(): void {
    this.paused = false;
    this.epoch++;
    this.set('landing');
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.epoch++;
  }
  resume(): void {
    this.paused = false;
  }

  update(dtReal: number): void {
    if (this.paused || dtReal <= 0) return;
    this.phaseElapsed += dtReal;
    if (this.phase === 'onboarding' && this.phaseElapsed >= ONBOARDING_MAX_S) this.set('crisis');
    else if (this.phase === 'crisis' && this.phaseElapsed >= CRISIS_REAL_S) this.set('outcome');
  }

  private go(from: Phase, to: Phase): void {
    if (this.phase === from) this.set(to);
  }

  private set(p: Phase): void {
    this.phase = p;
    this.phaseElapsed = 0;
    for (const l of this.listeners) l(p);
  }
}
