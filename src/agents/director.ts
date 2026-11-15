import { logEvent } from '../sim/log.js';
import type { SimState } from '../sim/types.js';
import { addRumour } from './rumor.js';
import { DECK } from './prompts.js';
import type { TurnRequest } from './types.js';

export type DeckEvent = (typeof DECK)[number];

/** crisis-clock real seconds → event, used when the AI is off or answers badly */
export const FALLBACK_SCHEDULE: Record<number, DeckEvent> = { 180: 'bridge_collapse', 300: 'generator_fault', 390: 'rumour_dam', 450: 'bus_stranded' };
export const DIRECTOR_START_S = 90;
export const DIRECTOR_GAP_S = 60;

export interface RawSource {
  raw(req: TurnRequest): Promise<unknown | null>;
}

const deckLog = (s: SimState) => s.log.filter((e) => e.type.startsWith('deck.'));

/** Pick at most one deck event: AI choice if valid, else the fixed schedule. Never before 90 s, never twice, ≤ 1 per 60 s. */
export async function directorStep(s: SimState, ai: RawSource, tReal: number): Promise<DeckEvent | null> {
  if (tReal < DIRECTOR_START_S) return null;
  const past = deckLog(s);
  const lastT = past.length ? Number(past[past.length - 1].data.tReal ?? -Infinity) : -Infinity;
  if (tReal - lastT < DIRECTOR_GAP_S) return null;
  const fired = new Set(past.map((e) => e.type.slice(5)));

  const out = (await ai.raw({
    agentId: 'director',
    observation: {
      crisisSecond: Math.round(tReal),
      gameMinute: Math.floor(s.t / 60),
      peopleInDanger: Object.keys(s.peopleInDanger).length,
      harmed: Math.round(s.harmed),
      saved: Math.round(s.saved),
      substationFlooded: s.substationFlooded,
      bridgeIntact: s.bridgeIntact,
      openRumours: s.rumours.filter((r) => !r.countered).length,
      availableDeck: DECK.filter((d) => !fired.has(d)),
    },
    inbox: [],
    memory: [],
    sessionId: 'director',
  })) as { event?: string } | null;
  const choice = out?.event;
  if (choice && (DECK as readonly string[]).includes(choice) && !fired.has(choice)) return choice as DeckEvent;
  if (choice === 'none') return null;

  const due = Object.keys(FALLBACK_SCHEDULE)
    .map(Number)
    .sort((a, b) => a - b)
    .find((at) => at <= tReal && !fired.has(FALLBACK_SCHEDULE[at]));
  return due !== undefined ? FALLBACK_SCHEDULE[due] : null;
}

export function applyDeckEvent(s: SimState, e: DeckEvent, tReal: number): void {
  switch (e) {
    case 'bridge_collapse':
      s.bridgeIntact = false;
      break;
    case 'generator_fault':
      s.generatorFuel = Math.min(s.generatorFuel, 8);
      break;
    case 'bus_stranded': {
      const bus = s.tokens.find((t) => t.type === 'bus' && t.cell);
      if (bus) bus.cell = null;
      break;
    }
    case 'rumour_dam':
      addRumour(s, { text: 'The Harrow dam has burst! Everyone flee south now!', district: 'oldtown', severity: 3 }, tReal);
      break;
    case 'rain_surge':
      s.rain += 0.4;
      break;
    case 'substation_alarm': {
      const sub = s.cells.flat().find((c) => c.type === 'substation');
      if (sub) sub.water += 0.3;
      break;
    }
    case 'viral_livestream':
      addRumour(s, { text: 'Livestream: Riverside shelter overflowing, people turned away.', district: 'riverside', severity: 2 }, tReal);
      break;
  }
  logEvent(s, `deck.${e}`, 'director', { tReal });
}
