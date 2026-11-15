import { afterEach, describe, expect, test } from 'vitest';
import { addMemory, defaultSave, loadSave, writeSave } from '../../src/game/persist';

const g = globalThis as { localStorage?: unknown };
afterEach(() => { delete g.localStorage; });

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe('persist', () => {
  test('loadSave returns default when localStorage.getItem throws', () => {
    g.localStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => {} };
    expect(loadSave()).toEqual(defaultSave());
  });
  test('loadSave returns default when localStorage is missing or data is corrupt', () => {
    expect(loadSave()).toEqual(defaultSave());
    const st = memStore();
    st.setItem('fh.save', '{not json');
    g.localStorage = st;
    expect(loadSave()).toEqual(defaultSave());
  });
  test('writeSave does not throw when setItem throws', () => {
    g.localStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => writeSave(defaultSave())).not.toThrow();
  });
  test('round-trips a save', () => {
    g.localStorage = memStore();
    const s = { ...defaultSave(), sessions: 2, bestRating: 'B', upgrades: ['levee' as const] };
    writeSave(s);
    expect(loadSave()).toEqual(s);
  });
  test('memories capped at 3, newest kept', () => {
    const s = defaultSave();
    for (const m of ['a', 'b', 'c', 'd']) addMemory(s, 'fire', m);
    expect(s.memories.fire).toEqual(['b', 'c', 'd']);
  });
});
