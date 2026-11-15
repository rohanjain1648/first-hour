import type { AgentId } from '../sim/types';
import type { AgentState } from './types';

export const TRUST = {
  approve: 5,
  deny: -3,
  /** per 30 s ignored, after the first 60 s */
  ignoredPer30s: -2,
  eavesdropped: -5,
  chipGiven: 10,
  chipTaken: -8,
} as const;

export const START_TRUST = 60;
export const WITHHOLD_BELOW = 30;

export function newAgentState(id: AgentId, pastMemory: string[] = []): AgentState {
  return { id, trust: START_TRUST, mood: 'calm', memory: [], pastMemory: pastMemory.slice(-3), inbox: [], holdsChip: false, lastFocusedT: 0, inFlight: false };
}

export function applyTrust(a: AgentState, delta: number): void {
  a.trust = Math.max(0, Math.min(100, a.trust + delta));
}

export function remember(a: AgentState, note: string | undefined): void {
  if (!note) return;
  a.memory = [...a.memory, note].slice(-5);
}
