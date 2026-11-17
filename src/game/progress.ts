import type { SimOptions } from '../sim/engine';
import type { AgentId, Modifier, XY } from '../sim/types';
import type { Rating } from '../sim/score';
import { addMemory, type Save, type Upgrade } from './persist';

/** two Riverside bank cells that get a permanent sandbag with the levee upgrade */
export const LEVEE_CELLS: XY[] = [{ x: 1, y: 5 }, { x: 2, y: 5 }];
const UPGRADE_ORDER: Upgrade[] = ['levee', 'generator', 'bus2'];
const RATING_ORDER: Rating[] = ['A', 'B', 'C', 'D', 'E'];

export function simOptionsFor(upgrades: Upgrade[]): SimOptions {
  return {
    levee: upgrades.includes('levee') ? LEVEE_CELLS : [],
    generatorFuel: upgrades.includes('generator') ? 90 : 60,
    extraTokens: upgrades.includes('bus2') ? ['bus'] : [],
  };
}

export function modifierFor(sessionsPlayed: number): Modifier {
  return (['heavy', 'night', 'light'] as const)[sessionsPlayed % 3];
}

/** Update the save at the end of a session: count, best rating, one upgrade on A/B, agent memory lines. */
export function recordOutcome(save: Save, rating: Rating, memories: Partial<Record<AgentId, string>>): void {
  save.sessions += 1;
  if (!save.bestRating || RATING_ORDER.indexOf(rating) < RATING_ORDER.indexOf(save.bestRating as Rating)) save.bestRating = rating;
  if (rating === 'A' || rating === 'B') {
    const next = UPGRADE_ORDER.find((u) => !save.upgrades.includes(u));
    if (next) save.upgrades.push(next);
  }
  for (const [id, line] of Object.entries(memories) as [AgentId, string][]) if (line) addMemory(save, id, line);
}

export interface ScriptStep {
  /** real seconds into onboarding */
  at: number;
  agent: AgentId;
  text: string;
  /** a whisper to this agent instead of speech */
  whisperTo?: AgentId;
  teach?: 'badge' | 'sandbag' | 'whisper';
}

/** First five minutes: the agents teach pinch-to-report, grab-and-drop, and eavesdropping. No text walls. */
export const ONBOARDING_SCRIPT: ScriptStep[] = [
  { at: 1, agent: 'fire', text: "Commander, the river's rising. Pinch my badge for my report.", teach: 'badge' },
  { at: 9, agent: 'utilities', text: 'Grab a sandbag from the tray in front of you and drop it on the Riverside bank.', teach: 'sandbag' },
  { at: 20, agent: 'utilities', whisperTo: 'hospital', text: 'If the substation floods, your generator is all you have.', teach: 'whisper' },
  { at: 22, agent: 'press', text: 'See that glowing thread? Pinch the bead to listen in. They might not like it.' },
  { at: 34, agent: 'hospital', text: 'Gold chips give one of us authority to act without asking. Choose carefully.' },
  { at: 46, agent: 'fire', text: 'The clock starts when that first sandbag lands. Every minute out there counts.' },
  { at: 58, agent: 'press', text: 'Pinch the Minds lens to see what each of us is really thinking. And who we talk to.' },
];
