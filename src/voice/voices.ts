import type { AgentId } from '../sim/types';

export interface VoiceLike {
  name: string;
  lang: string;
}

export interface VoiceSetting<V extends VoiceLike = VoiceLike> {
  voice: V | null;
  pitch: number;
  rate: number;
}

const ORDER: AgentId[] = ['fire', 'hospital', 'utilities', 'press'];
/** fire low and quick to anger, hospital measured, utilities flat, press quick and bright */
const TONE: Record<AgentId, { pitch: number; rate: number }> = {
  fire: { pitch: 0.75, rate: 1.08 },
  hospital: { pitch: 1.0, rate: 0.95 },
  utilities: { pitch: 0.9, rate: 1.0 },
  press: { pitch: 1.25, rate: 1.12 },
};

/** Pure: give every agent a distinct English voice when possible, and a distinct pitch always. */
export function pickVoices<V extends VoiceLike>(voices: V[]): Record<AgentId, VoiceSetting<V>> {
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  const pool = english.length ? english : voices;
  const out = {} as Record<AgentId, VoiceSetting<V>>;
  ORDER.forEach((id, i) => {
    out[id] = { voice: pool.length ? pool[i % pool.length] : null, ...TONE[id] };
  });
  return out;
}
