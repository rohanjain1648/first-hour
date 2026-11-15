import type { AgentId } from '../sim/types';

interface VoiceSpec {
  base: number;
  wave: OscillatorType;
  formant: number;
  rate: number;
}

/** pitch/timbre per agent: fire low and gruff, hospital mid and soft, utilities mid and clipped, press high and quick */
const VOICES: Record<AgentId, VoiceSpec> = {
  fire: { base: 110, wave: 'sawtooth', formant: 700, rate: 0.1 },
  hospital: { base: 190, wave: 'triangle', formant: 1100, rate: 0.115 },
  utilities: { base: 150, wave: 'square', formant: 900, rate: 0.085 },
  press: { base: 250, wave: 'triangle', formant: 1500, rate: 0.075 },
};

const MAX_S = 3;
const UNFOCUSED_DB = -12;

interface Voice {
  panner: PannerNode;
  out: GainNode;
}

/** Procedural "Simlish" babble: one syllable per ~2 characters, capped at 3 s, placed in 3D at each agent. */
export class Babble {
  private voices = new Map<AgentId, Voice>();

  constructor(private ctx: AudioContext, private dest: AudioNode) {}

  private voice(id: AgentId): Voice {
    let v = this.voices.get(id);
    if (!v) {
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 0.5;
      const out = this.ctx.createGain();
      out.connect(panner).connect(this.dest);
      v = { panner, out };
      this.voices.set(id, v);
    }
    return v;
  }

  setPosition(id: AgentId, x: number, y: number, z: number): void {
    const p = this.voice(id).panner;
    const t = this.ctx.currentTime;
    p.positionX.setTargetAtTime(x, t, 0.05);
    p.positionY.setTargetAtTime(y, t, 0.05);
    p.positionZ.setTargetAtTime(z, t, 0.05);
  }

  speak(id: AgentId, text: string, focused: boolean): void {
    const spec = VOICES[id];
    const v = this.voice(id);
    v.out.gain.value = focused ? 0.35 : 0.35 * Math.pow(10, UNFOCUSED_DB / 20);
    const n = Math.max(2, Math.min(Math.ceil(text.length / 2), Math.floor(MAX_S / spec.rate)));
    let t = this.ctx.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const pause = text[i * 2] === ' ' || text[i * 2] === ',' ? spec.rate * 0.6 : 0;
      this.syllable(spec, v.out, t, i, n);
      t += spec.rate + pause;
    }
  }

  private syllable(spec: VoiceSpec, dest: AudioNode, t: number, i: number, n: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = spec.wave;
    // gentle intonation: rises then falls across the sentence, with a little jitter per syllable
    const contour = 1 + 0.15 * Math.sin((i / n) * Math.PI) + (((i * 7919) % 13) / 13 - 0.5) * 0.2;
    osc.frequency.setValueAtTime(spec.base * contour, t);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = spec.formant * (0.85 + ((i * 31) % 7) / 20);
    bp.Q.value = 3;
    const env = this.ctx.createGain();
    const len = spec.rate * 0.8;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + len);
    osc.connect(bp).connect(env).connect(dest);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }
}
