import { createSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AudioSystem, ensureAudio } from './audio/audioSystem';
import { Game } from './game/game';
import { dailySeed, dateKey } from './game/daily';
import { dailyBest, saveOption, type Options } from './game/options';
import { SpeechIn, SpeechOut } from './voice/speech';
import { AgentsSystem } from './xr/agentsView';
import { BroadcastSystem } from './xr/broadcast';
import { ChipsSystem } from './xr/chips';
import { FxSystem } from './xr/fx';
import { HudSystem } from './xr/hud';
import { Label } from './xr/label';
import { MindsSystem } from './xr/minds';
import { MicrogestureSystem, VoiceControlSystem } from './xr/voiceControl';
import { OutcomeSystem } from './xr/outcome';
import { ThreadsSystem } from './xr/threads';
import { PlaneReaderSystem } from './xr/planes';
import { TraySystem } from './xr/tray';

let game: Game | null = null;
/** dev-only fast-forward for testing full sessions: press F to toggle x8 */
let SPEED = 1;
if (import.meta.env.DEV) {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF') return;
    SPEED = SPEED === 1 ? 8 : 1;
    console.info('[FH] dev speed', SPEED);
  });
}

class GameLoopSystem extends createSystem({}) {
  update(delta: number): void {
    game?.update(Math.min(delta, 0.1) * SPEED);
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(PlaneReaderSystem);
  world.registerSystem(GameLoopSystem);
  world.registerSystem(TraySystem);
  world.registerSystem(HudSystem);
  world.registerSystem(AgentsSystem);
  world.registerSystem(ThreadsSystem);
  world.registerSystem(ChipsSystem);
  world.registerSystem(AudioSystem);
  world.registerSystem(BroadcastSystem);
  world.registerSystem(OutcomeSystem);
  world.registerSystem(FxSystem);
  world.registerSystem(MindsSystem);
  world.registerSystem(VoiceControlSystem);
  world.registerSystem(MicrogestureSystem);
  game = new Game(world, world.getSystem(PlaneReaderSystem)!);
  (window as unknown as { __fh: Game }).__fh = game;

  const landing = document.getElementById('landing');
  const startBtn = document.getElementById('start-btn');
  const g = game;
  const bind = (id: string, key: keyof Options, get: () => boolean, set: (v: boolean) => void) => {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.checked = get();
    el.addEventListener('change', () => {
      set(el.checked);
      const value = (key === 'voices' ? (el.checked ? 'spoken' : 'babble') : el.checked) as Options[typeof key];
      saveOption(key, value);
      refreshDaily();
    });
  };
  bind('opt-ai', 'ai', () => g.options.ai, (v) => (g.options.ai = v));
  bind('opt-voices', 'voices', () => g.options.voices === 'spoken', (v) => (g.options.voices = v ? 'spoken' : 'babble'));
  bind('opt-voicecmd', 'voiceCommands', () => g.options.voiceCommands, (v) => (g.options.voiceCommands = v));
  bind('opt-contrast', 'highContrast', () => g.options.highContrast, (v) => (g.options.highContrast = v));
  bind('opt-daily', 'daily', () => g.options.daily, (v) => (g.options.daily = v));
  const mark = (labelId: string, ok: boolean, why: string) => {
    const l = document.getElementById(labelId);
    if (!l || ok) return;
    l.setAttribute('data-unsupported', '');
    l.title = why;
  };
  mark('lbl-voices', SpeechOut.supported(), 'This browser has no speech synthesis; agents will use babble.');
  mark('lbl-voicecmd', SpeechIn.supported(), 'This browser has no speech recognition; the mic button stays hidden.');
  const dailyLine = document.getElementById('daily-line');
  function refreshDaily(): void {
    if (!dailyLine) return;
    const key = dateKey(new Date());
    const best = dailyBest(key);
    dailyLine.textContent = g.options.daily
      ? `Daily challenge ${key} · seed ${dailySeed(new Date()) % 10000}${best ? ` · your best today: ${best}` : ''}`
      : g.save.sessions > 0
        ? `Sessions played: ${g.save.sessions}${g.save.bestRating ? ` · best rating ${g.save.bestRating}` : ''}${g.save.upgrades.length ? ` · upgrades: ${g.save.upgrades.join(', ')}` : ''}`
        : '';
  }
  refreshDaily();
  startBtn?.addEventListener('click', () => {
    landing?.setAttribute('hidden', '');
    Label.highContrast = g.options.highContrast;
    console.info('[FH] options', JSON.stringify(g.options));
    const ac = ensureAudio();
    console.info('[FH] audio', ac?.state ?? 'unavailable');
    game!.start();
  });
  game.session.onPhase((p) => {
    if (p === 'landing') landing?.removeAttribute('hidden');
  });
});
