import type { AgentId } from '../sim/types';

export type Upgrade = 'levee' | 'generator' | 'bus2';

export interface Save {
  version: 1;
  sessions: number;
  bestRating?: string;
  upgrades: Upgrade[];
  memories: Record<AgentId, string[]>;
  lastModifier?: string;
}

const KEY = 'fh.save';
export const MAX_MEMORIES = 3;

export function defaultSave(): Save {
  return { version: 1, sessions: 0, upgrades: [], memories: { fire: [], hospital: [], utilities: [], press: [] } };
}

function storage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSave(): Save {
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<Save>;
    if (parsed?.version !== 1) return defaultSave();
    const d = defaultSave();
    return { ...d, ...parsed, memories: { ...d.memories, ...(parsed.memories ?? {}) } };
  } catch {
    return defaultSave();
  }
}

export function writeSave(s: Save): void {
  try {
    storage()?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode or quota: the game still runs */
  }
}

export function addMemory(s: Save, id: AgentId, line: string): void {
  const list = [...(s.memories[id] ?? []), line];
  s.memories[id] = list.slice(-MAX_MEMORIES);
}

/** read a small boolean/string pref (e.g. fh.ai); never throws */
export function readPref(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    /* ignore */
  }
}
