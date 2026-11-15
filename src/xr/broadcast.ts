import { BoxGeometry, Group, Mesh, MeshStandardMaterial, PokeInteractable, RayInteractable, createSystem, type Entity } from '@iwsdk/core';
import { defaultDrafts } from '../agents/rumor';
import { currentGame, type Game } from '../game/game';
import { HudSystem } from './hud';
import { Label } from './label';
import { FhButton } from './tags';

/** 3 game minutes = 30 real seconds */
export const BROADCAST_RECHARGE_S = 30;

/** The broadcast card: pinch it, pick one of three drafts (press agent's, or ready-made), and it goes out. */
export class BroadcastSystem extends createSystem({}) {
  private built: Game | null = null;
  private cardLabel!: Label;
  private options: { entity: Entity; group: Group; label: Label }[] = [];
  private open = false;
  private counters: string | undefined;
  private texts: string[] = [];
  private readyAt = 0;
  private clock = 0;

  init(): void {
    HudSystem.handlers.set('broadcast-open', () => this.toggle());
    HudSystem.handlers.set('broadcast-pick', (arg) => this.pick(Number(arg)));
  }

  private build(g: Game): void {
    this.built = g;
    this.options = [];
    this.open = false;
    this.readyAt = 0;
    const b = g.board!;
    const card = new Group();
    card.name = 'BroadcastCard';
    card.add(new Mesh(new BoxGeometry(0.09, 0.006, 0.06), new MeshStandardMaterial({ color: 0x9b6bd6, emissive: 0x2a1240 })));
    this.cardLabel = new Label({ width: 0.09, aspect: 1.6, px: 110, bold: true, bg: 'none' });
    this.cardLabel.mesh.rotation.x = -Math.PI / 2;
    this.cardLabel.mesh.position.y = 0.004;
    card.add(this.cardLabel.mesh);
    card.position.set(-b.width * 0.36, 0.006, b.depth / 2 + 0.12);
    const cardEntity = this.world.createTransformEntity(card, b.entity);
    cardEntity.addComponent(RayInteractable);
    cardEntity.addComponent(PokeInteractable);
    cardEntity.addComponent(FhButton, { action: 'broadcast-open' });

    for (let i = 0; i < 3; i++) {
      const og = new Group();
      og.name = `BroadcastOption_${i}`;
      const label = new Label({ width: 0.3, aspect: 4.2, px: 52, bg: 'rgba(48,22,72,0.96)' });
      og.add(label.mesh);
      og.position.set(0.12, 0.2 - i * 0.075, -0.05);
      og.visible = false;
      const e = this.world.createTransformEntity(og, cardEntity);
      e.addComponent(RayInteractable);
      e.addComponent(PokeInteractable);
      e.addComponent(FhButton, { action: 'broadcast-pick', arg: String(i) });
      this.options.push({ entity: e, group: og, label });
    }
  }

  private toggle(): void {
    const g = currentGame;
    if (!g?.sim || this.clock < this.readyAt) return;
    this.open = !this.open;
    if (this.open) {
      const d = defaultDrafts(g.sim);
      this.texts = d.drafts;
      this.counters = d.counters;
      g.orch?.requestDrafts();
    }
  }

  private pick(i: number): void {
    const g = currentGame;
    if (!g || !this.open || !this.texts[i]) return;
    const r = g.act({ kind: 'broadcast', text: this.texts[i], counters: this.counters }, 'player');
    g.emit(r.ok ? 'place' : 'reject', r);
    this.open = false;
    if (r.ok) this.readyAt = this.clock + BROADCAST_RECHARGE_S;
  }

  update(delta: number): void {
    const g = currentGame;
    if (!g?.board || !g.orch) return;
    if (this.built !== g) this.build(g);
    if (!g.session.paused) this.clock += delta;
    // press agent drafts replace the ready-made ones while the card is open
    if (this.open && g.orch.drafts.length === 3 && g.orch.drafts[0] !== this.texts[0]) this.texts = [...g.orch.drafts];
    const wait = Math.ceil(this.readyAt - this.clock);
    this.cardLabel.set(wait > 0 ? `Ready in ${wait}s` : this.open ? 'Close' : 'Broadcast');
    this.options.forEach((o, i) => {
      o.group.visible = this.open;
      if (this.open) o.label.set(this.texts[i] ?? '');
    });
  }
}
