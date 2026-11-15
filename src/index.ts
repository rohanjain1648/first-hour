import { createSystem, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { Game } from './game/game';
import { writePref } from './game/persist';
import { PlaneReaderSystem } from './xr/planes';

let game: Game | null = null;

class GameLoopSystem extends createSystem({}) {
  update(delta: number): void {
    game?.update(Math.min(delta, 0.1));
  }
}

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(PlaneReaderSystem);
  world.registerSystem(GameLoopSystem);
  game = new Game(world, world.getSystem(PlaneReaderSystem)!);
  (window as unknown as { __fh: Game }).__fh = game;

  const landing = document.getElementById('landing');
  const startBtn = document.getElementById('start-btn');
  const aiToggle = document.getElementById('ai-toggle') as HTMLInputElement | null;
  if (aiToggle) {
    aiToggle.checked = game.aiEnabled;
    aiToggle.addEventListener('change', () => {
      game!.aiEnabled = aiToggle.checked;
      writePref('fh.ai', aiToggle.checked ? '1' : '0');
    });
  }
  startBtn?.addEventListener('click', () => {
    landing?.setAttribute('hidden', '');
    game!.start();
  });
  game.session.onPhase((p) => {
    if (p === 'landing') landing?.removeAttribute('hidden');
  });
});
