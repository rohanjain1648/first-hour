import type { AgentId } from '../sim/types';
import { pickVoices, type VoiceSetting } from './voices';

/** Spoken agent voices via the browser's speech synthesis. No network, nothing stored. */
export class SpeechOut {
  private settings: Record<AgentId, VoiceSetting<SpeechSynthesisVoice>> | null = null;

  static supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  constructor() {
    if (!SpeechOut.supported()) return;
    const load = () => (this.settings = pickVoices(window.speechSynthesis.getVoices()));
    load();
    window.speechSynthesis.addEventListener?.('voiceschanged', load);
  }

  /** speak one line; a newer line from anyone interrupts the current one so speech never piles up */
  speak(id: AgentId, text: string): void {
    if (!SpeechOut.supported()) return;
    const s = this.settings ?? pickVoices(window.speechSynthesis.getVoices());
    const u = new SpeechSynthesisUtterance(text);
    const v = s[id];
    if (v.voice) u.voice = v.voice;
    u.pitch = v.pitch;
    u.rate = v.rate;
    u.volume = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  stop(): void {
    if (SpeechOut.supported()) window.speechSynthesis.cancel();
  }
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

type RecognitionCtor = new () => RecognitionLike;

function ctor(): RecognitionCtor | null {
  const w = globalThis as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type ListenState = 'idle' | 'listening' | 'error';

/** Push-to-talk speech recognition. One phrase per press; the browser handles the audio. */
export class SpeechIn {
  state: ListenState = 'idle';
  lastError = '';
  private rec: RecognitionLike | null = null;

  static supported(): boolean {
    return ctor() !== null;
  }

  constructor(
    private onFinal: (text: string) => void,
    private onInterim: (text: string) => void = () => {},
    private onState: (s: ListenState) => void = () => {},
  ) {}

  toggle(): void {
    if (this.state === 'listening') this.stop();
    else this.start();
  }

  start(): void {
    const C = ctor();
    if (!C) return;
    this.rec?.abort();
    const rec = new C();
    rec.lang = 'en-US';
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const r = e.results[e.results.length - 1];
      const text = r[0]?.transcript ?? '';
      if (r.isFinal) this.onFinal(text);
      else this.onInterim(text);
    };
    rec.onerror = (e) => {
      this.lastError = e.error;
      this.set('error');
    };
    rec.onend = () => {
      if (this.state === 'listening') this.set('idle');
    };
    this.rec = rec;
    try {
      rec.start();
      this.set('listening');
    } catch (err) {
      this.lastError = String(err);
      this.set('error');
    }
  }

  stop(): void {
    this.rec?.stop();
    this.set('idle');
  }

  private set(s: ListenState): void {
    this.state = s;
    this.onState(s);
  }
}
