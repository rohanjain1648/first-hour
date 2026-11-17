import { Vector3, createSystem } from '@iwsdk/core';
import { AGENT_IDS } from '../agents/roles';
import { currentGame, type Game } from '../game/game';
import type { AgentId } from '../sim/types';
import { AgentsSystem } from '../xr/agentsView';
import { Ambient } from './ambient';
import { Babble } from './babble';
import { SpeechOut } from '../voice/speech';

let ctx: AudioContext | null = null;

/** Call from a user gesture (the Start click) so the browser allows audio. */
export function ensureAudio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    ctx = null;
  }
  return ctx;
}

export class AudioSystem extends createSystem({}) {
  private wired: Game | null = null;
  private babble: Babble | null = null;
  private ambient: Ambient | null = null;
  private speech: SpeechOut | null = null;
  private fwd!: Vector3;
  private p!: Vector3;

  init(): void {
    this.fwd = new Vector3();
    this.p = new Vector3();
  }

  private wire(g: Game, c: AudioContext): void {
    this.wired = g;
    const master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
    this.babble = new Babble(c, master);
    this.ambient = new Ambient(c, master);
    const amb = this.ambient;
    g.on('reject', () => amb.chime('reject'));
    g.on('place', () => amb.chime('place'));
    g.on('pickup', () => amb.chime('pickup'));
    if (g.options.voices === 'spoken' && SpeechOut.supported()) this.speech = new SpeechOut();
    g.orch?.on('say', (d) => {
      const { agent, text } = d as { agent: AgentId; text: string };
      const focused = g.orch?.focus === agent;
      // attention made audible: the agent you face (and every onboarding line) speaks aloud; the rest murmur
      if (this.speech && (focused || g.session.phase === 'onboarding')) this.speech.speak(agent, text);
      else this.babble?.speak(agent, text, focused);
    });
    g.on('pause', () => this.speech?.stop());
    g.orch?.on('whisper', () => amb.chime('whisper'));
    g.orch?.on('proposal', () => amb.chime('place'));
    let seen = g.sim?.log.length ?? 0;
    g.on('pause', () => void c.suspend());
    g.on('resume', () => void c.resume());
    // deck events chime (Director, Task 12)
    const check = () => {
      const log = g.sim?.log ?? [];
      for (; seen < log.length; seen++) if (log[seen].type.startsWith('deck.')) amb.chime('event');
    };
    this.checkDeck = check;
  }

  private checkDeck: () => void = () => {};

  update(): void {
    const g = currentGame;
    if (!g?.orch || !g.sim || !ctx) return;
    if (this.wired !== g) this.wire(g, ctx);
    const l = ctx.listener;
    const { pos, dir } = g.head();
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(dir.x, t, 0.02);
      l.forwardY.setTargetAtTime(dir.y, t, 0.02);
      l.forwardZ.setTargetAtTime(dir.z, t, 0.02);
      l.upX.setTargetAtTime(0, t, 0.02);
      l.upY.setTargetAtTime(1, t, 0.02);
      l.upZ.setTargetAtTime(0, t, 0.02);
    }
    const agents = this.world.getSystem(AgentsSystem);
    if (agents && this.babble) {
      for (const id of AGENT_IDS) {
        agents.headOf(id, this.p);
        this.babble.setPosition(id, this.p.x, this.p.y, this.p.z);
      }
    }
    this.ambient?.setRain(g.session.phase === 'crisis' || g.session.phase === 'onboarding' ? g.sim.rain : 0.3);
    this.checkDeck();
  }
}
