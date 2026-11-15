import { logEvent } from '../sim/log.js';
import type { DistrictId, Rumour, SimState } from '../sim/types.js';
import { DISTRICTS } from '../sim/types.js';
import type { TurnRequest } from './types.js';

export const RUMOR_GAP_S = 45;
export const RUMOR_START_S = 30;

export interface RawSource {
  raw(req: TurnRequest): Promise<unknown | null>;
}

export interface RumourDraft {
  text: string;
  district: DistrictId;
  severity: 1 | 2 | 3;
}

const TEMPLATES: RumourDraft[] = [
  { text: 'Heard the school shelter is already full. Don’t bother going.', district: 'riverside', severity: 2 },
  { text: 'The bridge is totally fine, just drive across it.', district: 'oldtown', severity: 2 },
  { text: 'Power company says the whole town will be dark for a week.', district: 'market', severity: 1 },
  { text: 'Someone said the water is contaminated with chemicals now.', district: 'eastfield', severity: 1 },
  { text: 'They are only rescuing people in rich neighbourhoods.', district: 'riverside', severity: 3 },
  { text: 'Evacuation is optional, my cousin says it’s overblown.', district: 'market', severity: 2 },
];

/** Adds a rumour: lowers the target district's compliance by 0.1 × severity. Only the press agent observes rumours. */
export function addRumour(s: SimState, r: RumourDraft, tReal: number): Rumour {
  const rumour: Rumour = { id: `r${s.rumours.length + 1}`, text: r.text, district: r.district, severity: r.severity, countered: false, t: s.t };
  s.rumours.push(rumour);
  s.compliance[r.district] = Math.max(0, s.compliance[r.district] - 0.1 * r.severity);
  logEvent(s, 'rumour.new', 'rumor', { id: rumour.id, district: r.district, severity: r.severity, tReal });
  return rumour;
}

function valid(o: unknown): o is RumourDraft {
  const r = o as RumourDraft;
  return !!r && typeof r.text === 'string' && r.text.trim().split(/\s+/).length >= 2 && r.text.length <= 160
    && DISTRICTS.includes(r.district) && [1, 2, 3].includes(r.severity);
}

/** At most one rumour per 45 s (not before 30 s): AI text when valid, else a template. Caller applies it with addRumour. */
export async function rumorStep(s: SimState, ai: RawSource, tReal: number): Promise<RumourDraft | null> {
  if (tReal < RUMOR_START_S) return null;
  const last = s.log.filter((e) => e.type === 'rumour.new').pop();
  if (last && tReal - Number(last.data.tReal ?? -Infinity) < RUMOR_GAP_S) return null;
  const out = await ai.raw({
    agentId: 'rumor',
    observation: {
      floodedDistricts: DISTRICTS.filter((d) => s.cells.flat().some((c) => c.district === d && c.type === 'residential' && c.water > 0.3)),
      bridgeIntact: s.bridgeIntact,
      substationFlooded: s.substationFlooded,
      existingRumours: s.rumours.map((r) => r.text),
    },
    inbox: [],
    memory: [],
    sessionId: 'rumor',
  });
  if (valid(out)) return { text: out.text.trim(), district: out.district, severity: out.severity };
  const unused = TEMPLATES.filter((t) => !s.rumours.some((r) => r.text === t.text));
  return unused.length ? unused[s.rumours.length % unused.length] : null;
}

/** Three ready broadcasts the player can pick instantly; AI drafts replace them when they arrive. */
export function defaultDrafts(s: SimState): { drafts: string[]; counters?: string } {
  const top = s.rumours.filter((r) => !r.countered).sort((a, b) => b.severity - a.severity)[0];
  const first = top
    ? `False alarm: ${top.text.replace(/[!?.]+$/, '')} is not true. Follow official updates only.`
    : 'Flooding in low areas. Move to higher ground now.';
  return {
    drafts: [first, 'Hillcrest school is open as a shelter. Buses are running from flooded streets.', 'Stay off flooded roads and away from water near power lines.'],
    counters: top?.id,
  };
}
