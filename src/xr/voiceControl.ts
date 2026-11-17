import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, PokeInteractable, RayInteractable, SphereGeometry, createSystem } from '@iwsdk/core';
import { ROLES } from '../agents/roles';
import { currentGame, type Game } from '../game/game';
import type { AgentId } from '../sim/types';
import { parseCommand, type VoiceCommand } from '../voice/commands';
import { SpeechIn, type ListenState } from '../voice/speech';
import { HudSystem } from './hud';
import { Label } from './label';
import { FhButton } from './tags';

/** Run a command against the live game. Shared by voice and microgestures. Returns feedback for the banner. */
export function runCommand(g: Game, c: VoiceCommand): string {
  const orch = g.orch;
  if (!orch) return 'Not ready yet';
  const pick = (agent?: AgentId): AgentId | undefined =>
    agent ?? orch.focus ?? (['fire', 'hospital', 'utilities', 'press'] as AgentId[]).find((id) => orch.proposalFor(id));
  switch (c.kind) {
    case 'approve':
    case 'deny': {
      const id = pick(c.agent);
      const p = id ? orch.proposalFor(id) : undefined;
      if (!id || !p) return 'No proposal to answer';
      if (c.kind === 'approve') orch.playerApprove(p.id);
      else orch.playerDeny(p.id);
      return `${c.kind === 'approve' ? '✓ Approved' : '✗ Denied'}: ${ROLES[id].title}`;
    }
    case 'report': {
      const id = c.agent ?? orch.focus ?? 'fire';
      orch.requestReport(id);
      return `Report requested: ${ROLES[id].title}`;
    }
    case 'broadcast':
      HudSystem.handlers.get('broadcast-open')?.('', undefined as never);
      return 'Broadcast card opened';
    case 'pause':
      if (!g.session.paused) g.togglePause();
      return 'Paused';
    case 'resume':
      if (g.session.paused) g.togglePause();
      return 'Resumed';
    case 'order': {
      const id = orch.commanderOrder(c.agent, c.text);
      return `Order to ${ROLES[id].title}: “${c.text}”`;
    }
  }
}

/** Optional push-to-talk mic on the table. Hidden when the option is off or the browser cannot recognise speech. */
export class VoiceControlSystem extends createSystem({}) {
  private built: Game | null = null;
  private root: Group | null = null;
  private label!: Label;
  private mat!: MeshStandardMaterial;
  private speech: SpeechIn | null = null;
  private state: ListenState = 'idle';
  private heard = '';

  init(): void {
    HudSystem.handlers.set('mic', () => this.toggle());
  }

  private build(g: Game): void {
    this.built = g;
    if (!g.options.voiceCommands || !SpeechIn.supported()) return;
    const b = g.board!;
    const root = new Group();
    root.name = 'MicButton';
    this.mat = new MeshStandardMaterial({ color: 0x2f7f6f, emissive: 0x0a2a24 });
    const base = new Mesh(new CylinderGeometry(0.026, 0.026, 0.01, 20), this.mat);
    base.position.y = 0.005;
    const head = new Mesh(new SphereGeometry(0.012, 14, 10), new MeshStandardMaterial({ color: 0xdedede }));
    head.position.y = 0.022;
    root.add(base, head);
    this.label = new Label({ width: 0.16, aspect: 4.5, px: 54 });
    this.label.set('Pinch to talk');
    this.label.mesh.position.set(0, 0.05, -0.01);
    this.label.mesh.rotation.x = -0.4;
    root.add(this.label.mesh);
    root.position.set(-b.width * 0.09, 0, b.depth / 2 + 0.12);
    const e = this.world.createTransformEntity(root, b.entity);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    e.addComponent(FhButton, { action: 'mic' });
    this.root = root;
    this.speech = new SpeechIn(
      (text) => this.final(text),
      (text) => {
        this.heard = text;
        this.label.set(`“${text}”`);
      },
      (s) => {
        this.state = s;
        this.refresh();
      },
    );
  }

  private toggle(): void {
    this.speech?.toggle();
  }

  private final(text: string): void {
    const g = currentGame;
    if (!g) return;
    this.heard = text;
    const c = parseCommand(text);
    const feedback = c ? runCommand(g, c) : 'Did not catch that';
    this.label.set(`“${text}” → ${feedback}`);
    g.banner(`🎙 ${feedback}`);
  }

  private refresh(): void {
    if (!this.root) return;
    this.mat.color.setHex(this.state === 'listening' ? 0xe0463a : this.state === 'error' ? 0x7a7a7a : 0x2f7f6f);
    if (this.state === 'listening') this.label.set('Listening…');
    else if (this.state === 'error') this.label.set(`Mic unavailable (${this.speech?.lastError || 'error'}). Pinch to retry.`);
    else if (!this.heard) this.label.set('Pinch to talk');
  }

  update(): void {
    const g = currentGame;
    if (!g?.board || !g.orch) return;
    if (this.built !== g) this.build(g);
  }
}

/**
 * Optional hand microgestures (thumb on the side of the index finger), on either hand:
 * tap = approve the focused agent's proposal, swipe left = deny, swipe forward = ask for a report.
 */
export class MicrogestureSystem extends createSystem({}) {
  update(): void {
    const g = currentGame;
    if (!g?.orch || g.session.phase !== 'crisis' && g.session.phase !== 'onboarding') return;
    for (const side of ['left', 'right'] as const) {
      const pad = this.input.xr.gamepads[side];
      if (!pad || !this.input.xr.isPrimary('hand', side)) continue;
      let c: VoiceCommand | null = null;
      if (pad.getButtonDownByIdx(9)) c = { kind: 'approve' };
      else if (pad.getButtonDownByIdx(5)) c = { kind: 'deny' };
      else if (pad.getButtonDownByIdx(7)) c = { kind: 'report' };
      if (c) g.banner(`🤏 ${runCommand(g, c)}`);
    }
  }
}
