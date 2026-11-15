export type ChimeKind = 'event' | 'reject' | 'place' | 'pickup' | 'whisper';

const CHIMES: Record<ChimeKind, { freqs: number[]; wave: OscillatorType; len: number; gain: number }> = {
  event: { freqs: [523, 659, 784], wave: 'sine', len: 0.5, gain: 0.25 },
  reject: { freqs: [220, 185], wave: 'square', len: 0.18, gain: 0.12 },
  place: { freqs: [660], wave: 'triangle', len: 0.09, gain: 0.2 },
  pickup: { freqs: [440], wave: 'triangle', len: 0.06, gain: 0.15 },
  whisper: { freqs: [1200, 1500], wave: 'sine', len: 0.25, gain: 0.08 },
};

/** Rain (filtered noise, intensity follows the sim) and short procedural chimes. */
export class Ambient {
  private rainGain: GainNode;
  private lowpass: BiquadFilterNode;

  constructor(private ctx: AudioContext, private dest: AudioNode) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 1800;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    src.connect(this.lowpass).connect(this.rainGain).connect(dest);
    src.start();
  }

  /** intensity 0..~1.2 */
  setRain(intensity: number): void {
    const t = this.ctx.currentTime;
    this.rainGain.gain.setTargetAtTime(Math.min(0.18, 0.12 * intensity), t, 0.5);
    this.lowpass.frequency.setTargetAtTime(1200 + 1200 * Math.min(1, intensity), t, 0.5);
  }

  chime(kind: ChimeKind): void {
    const c = CHIMES[kind];
    let t = this.ctx.currentTime + 0.01;
    for (const f of c.freqs) {
      const osc = this.ctx.createOscillator();
      osc.type = c.wave;
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(c.gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + c.len);
      osc.connect(g).connect(this.dest);
      osc.start(t);
      osc.stop(t + c.len + 0.02);
      t += c.len * 0.45;
    }
  }
}
