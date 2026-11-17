import { readPref, writePref } from './persist';

export interface Options {
  ai: boolean;
  /** spoken = the focused agent speaks aloud with speech synthesis; babble = made-up syllables only */
  voices: 'spoken' | 'babble';
  voiceCommands: boolean;
  highContrast: boolean;
  daily: boolean;
}

const KEYS: Record<keyof Options, string> = {
  ai: 'fh.ai',
  voices: 'fh.voices',
  voiceCommands: 'fh.voicecmd',
  highContrast: 'fh.contrast',
  daily: 'fh.daily',
};

export function loadOptions(): Options {
  return {
    ai: readPref(KEYS.ai) !== '0',
    voices: readPref(KEYS.voices) === 'babble' ? 'babble' : 'spoken',
    voiceCommands: readPref(KEYS.voiceCommands) === '1',
    highContrast: readPref(KEYS.highContrast) === '1',
    daily: readPref(KEYS.daily) === '1',
  };
}

export function saveOption<K extends keyof Options>(key: K, value: Options[K]): void {
  writePref(KEYS[key], typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
}

const BEST_PREFIX = 'fh.dailybest.';
const ORDER = ['A', 'B', 'C', 'D', 'E'];

export function dailyBest(date: string): string | null {
  return readPref(BEST_PREFIX + date);
}

export function recordDaily(date: string, rating: string): void {
  const prev = dailyBest(date);
  if (!prev || ORDER.indexOf(rating) < ORDER.indexOf(prev)) writePref(BEST_PREFIX + date, rating);
}
