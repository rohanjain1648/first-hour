import type { SimState } from './types.js';

export function logEvent(s: SimState, type: string, actor: string, data: Record<string, unknown> = {}): void {
  s.log.push({ t: s.t, type, actor, data });
}
