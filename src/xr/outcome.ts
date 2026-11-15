import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PokeInteractable, RayInteractable, createSystem, type Entity } from '@iwsdk/core';
import { ROLES } from '../agents/roles';
import { currentGame, type Game } from '../game/game';
import { CRISIS_REAL_S } from '../game/session';
import type { AgentId } from '../sim/types';
import { HudSystem } from './hud';
import { Label } from './label';
import { FhButton } from './tags';

const TICKS = 12;
const PRINCIPLE_NAME: Record<string, string> = {
  objectives: 'Clear objectives',
  span_of_control: 'Span of control',
  delegation: 'Delegation',
  verification: 'Checking information',
  one_message: 'One public message',
};

/** Outcome card, then the debrief: three key moments, a time scrubber over snapshots, and the missed whispers. */
export class OutcomeSystem extends createSystem({}) {
  private built: Game | null = null;
  private panel!: Group;
  private panelEntity!: Entity;
  private title!: Label;
  private body!: Label;
  private whispers!: Label;
  private moments: { group: Group; entity: Entity; label: Label }[] = [];
  private ticks: Group[] = [];
  private actions: { group: Group; label: Label }[] = [];
  private mode: 'hidden' | 'outcome' | 'debrief' = 'hidden';
  private dirty = true;
  private selected = -1;

  init(): void {
    HudSystem.handlers.set('outcome', (arg) => this.onAction(arg));
    HudSystem.handlers.set('moment', (arg) => {
      const g = currentGame;
      const k = g?.review?.moments[Number(arg)];
      if (!g || !k) return;
      this.selected = Number(arg);
      g.view(Math.round(k.t / 6));
      this.dirty = true;
    });
    HudSystem.handlers.set('scrub', (arg) => currentGame?.view(Number(arg)));
  }

  private button(parent: Entity, text: string, w: number, x: number, y: number, action: string, arg: string, color = 0x2f3640, h = 0.034): { group: Group; entity: Entity; label: Label } {
    const g = new Group();
    g.name = `Outcome_${action}_${arg}`;
    g.add(new Mesh(new BoxGeometry(w, h, 0.008), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.3 })));
    const label = new Label({ width: w * 0.95, aspect: (w * 0.95) / (h * 0.94), px: 72, bold: true, bg: 'none' });
    label.set(text);
    label.mesh.position.z = 0.0045;
    g.add(label.mesh);
    g.position.set(x, y, 0.004);
    const e = this.world.createTransformEntity(g, parent);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    e.addComponent(FhButton, { action, arg });
    return { group: g, entity: e, label };
  }

  private build(g: Game): void {
    this.built = g;
    this.mode = 'hidden';
    const b = g.board!;
    this.panel = new Group();
    this.panel.name = 'OutcomePanel';
    this.panel.position.set(0, 0.26, -0.02);
    this.panel.rotation.x = -0.25;
    this.panel.visible = false;
    const back = new Mesh(new BoxGeometry(0.62, 0.36, 0.006), new MeshStandardMaterial({ color: 0x14161a, transparent: true, opacity: 0.94 }));
    this.panel.add(back);
    this.title = new Label({ width: 0.58, aspect: 8, px: 60, bold: true, bg: 'none' });
    this.title.mesh.position.set(0, 0.155, 0.004);
    this.body = new Label({ width: 0.58, aspect: 3.4, px: 46, bg: 'none', align: 'left' });
    this.body.mesh.position.set(0, 0.07, 0.004);
    this.whispers = new Label({ width: 0.58, aspect: 9, px: 40, bg: 'rgba(10,40,60,0.9)', align: 'left' });
    this.whispers.mesh.position.set(0, -0.1, 0.004);
    this.panel.add(this.title.mesh, this.body.mesh, this.whispers.mesh);
    this.panelEntity = this.world.createTransformEntity(this.panel, b.entity);

    this.moments = [0, 1, 2].map((i) => {
      const m = this.button(this.panelEntity, '', 0.58, 0, 0.1 - i * 0.052, 'moment', String(i), 0x3a2f12, 0.048);
      return m;
    });
    this.ticks = [];
    for (let i = 0; i < TICKS; i++) {
      const t = Math.round(((i + 1) / TICKS) * CRISIS_REAL_S);
      const tk = this.button(this.panelEntity, `${Math.round(t / 8)}′`, 0.042, -0.275 + i * 0.05, -0.05, 'scrub', String(t), 0x24303a);
      this.ticks.push(tk.group);
    }
    this.actions = [
      this.button(this.panelEntity, 'Debrief', 0.18, -0.2, -0.15, 'outcome', 'debrief', 0x8a5a14),
      this.button(this.panelEntity, 'Play again', 0.18, 0, -0.15, 'outcome', 'again', 0x2f5a2f),
      this.button(this.panelEntity, 'Exit', 0.18, 0.2, -0.15, 'outcome', 'exit', 0x5a2f2f),
    ];
    g.on('outcome', () => { this.mode = 'outcome'; this.dirty = true; });
    g.on('debrief', () => { this.dirty = true; });
  }

  private onAction(arg: string): void {
    const g = currentGame;
    if (!g) return;
    if (arg === 'debrief') {
      this.mode = this.mode === 'debrief' ? 'outcome' : 'debrief';
      if (this.mode === 'debrief') g.session.showDebrief();
      else g.view(null);
      this.dirty = true;
    } else if (arg === 'again') {
      g.world.exitXR();
      location.reload();
    } else if (arg === 'exit') {
      g.world.exitXR();
    }
  }

  update(): void {
    const g = currentGame;
    if (!g?.board) return;
    if (this.built !== g) this.build(g);
    this.panel.visible = this.mode !== 'hidden';
    if (!this.dirty || this.mode === 'hidden') return;
    this.dirty = false;
    const o = g.outcome;
    const debriefMode = this.mode === 'debrief';
    this.actions[0].label.set(debriefMode ? 'Back' : 'Debrief');
    if (!debriefMode) {
      this.title.set(`The first hour is over · Rating ${o?.rating ?? '–'}`);
      this.body.set(o
        ? `People safe: ${o.safePct}%\nHospital power: ${o.hospitalUptimePct}%\nRumours countered: ${o.rumoursCountered}\nTeam trust: ${o.trust}`
        : '');
      this.body.mesh.visible = true;
      this.whispers.mesh.visible = false;
      this.moments.forEach((m) => (m.group.visible = false));
      this.ticks.forEach((t) => (t.visible = false));
      return;
    }
    const sel = this.selected >= 0 ? g.review?.moments[this.selected] : undefined;
    this.title.set(sel ? sel.feedback : 'Debrief · pinch a moment or a minute to replay the board');
    this.body.mesh.visible = false;
    const r = g.review;
    this.moments.forEach((m, i) => {
      const k = r?.moments[i];
      m.group.visible = !!k;
      if (k) {
        m.label.set(`${i === this.selected ? '▶ ' : ''}${Math.floor(k.t / 60)}′ · ${PRINCIPLE_NAME[k.principle] ?? k.principle}: ${k.what}`);
      }
    });
    this.ticks.forEach((t) => (t.visible = true));
    const missed = r?.missedWhispers ?? [];
    this.whispers.mesh.visible = true;
    this.whispers.set(missed.length
      ? `While you were busy: ${missed.slice(0, 2).map((w) => `${ROLES[w.from as AgentId]?.title ?? w.from} told ${ROLES[w.to as AgentId]?.title ?? w.to}, “${w.text}”`).join('  ·  ')}`
      : r ? 'You heard every private conversation this hour.' : 'Preparing your debrief…');
  }
}
