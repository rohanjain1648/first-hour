import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PokeInteractable,
  RayInteractable,
  SphereGeometry,
  Vector3,
  createSystem,
  type Entity,
} from '@iwsdk/core';
import type { Proposal } from '../agents/orchestrator';
import { AGENT_IDS, ROLES } from '../agents/roles';
import type { Mood } from '../agents/types';
import { focusedAgent } from '../game/attention';
import { currentGame, type Game } from '../game/game';
import type { Action, AgentId } from '../sim/types';
import { HudSystem } from './hud';
import { Label } from './label';
import { FhButton } from './tags';

const MOOD_TINT: Record<Mood, number> = { calm: 0x000000, tense: 0x3a2a00, angry: 0x4a0a00, relieved: 0x002a10 };
const CAPTION_HOLD_S = 7;

interface Figure {
  id: AgentId;
  root: Group;
  body: MeshStandardMaterial;
  head: Vector3;
  caption: Label;
  nameplate: Label;
  card: Group;
  cardLabel: Label;
  cardFor: string | null;
  approve: Entity;
  deny: Entity;
  lastText: string;
  lastSayT: number;
}

/** short human description of an action for proposal cards */
export function describe(a: Action): string {
  switch (a.kind) {
    case 'deploy': return `Deploy ${a.token.replace(/\d+$/, '')} to ${a.cell.x},${a.cell.y}`;
    case 'recall': return `Recall ${a.token.replace(/\d+$/, '')}`;
    case 'cut_power': return `Cut power: ${a.district}`;
    case 'restore_power': return `Restore power: ${a.district}`;
    case 'broadcast': return `Broadcast: "${a.text.slice(0, 60)}${a.text.length > 60 ? '…' : ''}"`;
    case 'report': return `Report: ${a.fact}`;
  }
}

function preview(text: string): string {
  const w = text.split(/\s+/);
  return w.length > 6 ? `${w.slice(0, 6).join(' ')}…` : text;
}

/** local seat positions along the far edge, spread to about ±27° and ±9° so all four fit the VR Glasses view */
function seat(i: number, width: number, depth: number): [number, number] {
  const xs = [-0.4, -0.133, 0.133, 0.4];
  return [xs[i] * width, -depth / 2 - 0.05];
}

export class AgentsSystem extends createSystem({}) {
  private built: Game | null = null;
  private figs = new Map<AgentId, Figure>();
  private tmp!: Vector3;
  private heads: { id: AgentId; pos: Vector3 }[] = [];
  private clock = 0;

  init(): void {
    this.tmp = new Vector3();
    HudSystem.handlers.set('report', (arg) => {
      currentGame?.orch?.requestReport(arg as AgentId);
    });
    HudSystem.handlers.set('approve', (arg) => currentGame?.orch?.playerApprove(arg));
    HudSystem.handlers.set('deny', (arg) => currentGame?.orch?.playerDeny(arg));
  }

  private button(parent: Entity, label: string, color: number, x: number, action: string): { entity: Entity; label: Label } {
    const g = new Group();
    g.name = `Btn_${action}`;
    const mesh = new Mesh(new BoxGeometry(0.045, 0.03, 0.012), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25 }));
    g.add(mesh);
    const l = new Label({ width: 0.045, aspect: 1.5, px: 220, bold: true, bg: 'none', fg: '#101010' });
    l.set(label);
    l.mesh.position.z = 0.0065;
    g.add(l.mesh);
    g.position.set(x, -0.035, 0);
    const e = this.world.createTransformEntity(g, parent);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    e.addComponent(FhButton, { action, arg: '' });
    return { entity: e, label: l };
  }

  private build(g: Game): void {
    this.built = g;
    const b = g.board!;
    AGENT_IDS.forEach((id, i) => {
      const role = ROLES[id];
      const root = new Group();
      root.name = `Agent_${id}`;
      const [x, z] = seat(i, b.width, b.depth);
      root.position.set(x, 0.012, z);
      const body = new MeshStandardMaterial({ color: role.color, roughness: 0.6 });
      const torso = new Mesh(new CapsuleGeometry(0.018, 0.045, 4, 12), body);
      torso.position.y = 0.04;
      const head = new Mesh(new SphereGeometry(0.017, 16, 12), new MeshStandardMaterial({ color: 0xe6c9a8, roughness: 0.7 }));
      head.position.y = 0.092;
      root.add(torso, head);

      const badgeG = new Group();
      badgeG.name = `Badge_${id}`;
      const badge = new Mesh(new CylinderGeometry(0.014, 0.014, 0.006, 16), new MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x6a4a00 }));
      badge.rotation.x = Math.PI / 2;
      badgeG.add(badge);
      badgeG.position.set(0, 0.05, 0.022);

      const nameplate = new Label({ width: 0.2, aspect: 4.5, px: 70, bold: true });
      nameplate.mesh.position.set(0, 0.14, 0);
      root.add(nameplate.mesh);
      const caption = new Label({ width: 0.34, aspect: 2.6, px: 62 });
      caption.mesh.position.set(0, 0.23, 0);
      caption.mesh.visible = false;
      root.add(caption.mesh);

      const card = new Group();
      card.position.set(0, 0.36, 0);
      const cardLabel = new Label({ width: 0.3, aspect: 3.4, px: 58, bg: 'rgba(40,30,8,0.95)' });
      card.add(cardLabel.mesh);
      card.visible = false;

      const rootEntity = this.world.createTransformEntity(root, b.entity);
      const badgeEntity = this.world.createTransformEntity(badgeG, rootEntity);
      badgeEntity.addComponent(RayInteractable);
      badgeEntity.addComponent(PokeInteractable);
      badgeEntity.addComponent(FhButton, { action: 'report', arg: id });
      const cardEntity = this.world.createTransformEntity(card, rootEntity);
      const approve = this.button(cardEntity, '✓', 0x6fcf6f, -0.035, 'approve');
      const deny = this.button(cardEntity, '✗', 0xe06a5a, 0.035, 'deny');

      this.figs.set(id, {
        id, root, body, head: new Vector3(), caption, nameplate, card, cardLabel, cardFor: null,
        approve: approve.entity, deny: deny.entity, lastText: '', lastSayT: -99,
      });
      this.heads.push({ id, pos: new Vector3() });
    });
    g.orch!.on('say', (d) => {
      const { agent, text } = d as { agent: AgentId; text: string };
      const f = this.figs.get(agent);
      if (!f) return;
      f.lastText = text;
      f.lastSayT = this.clock;
    });
  }

  update(delta: number): void {
    const g = currentGame;
    if (!g?.board || !g.orch || !g.agents) return;
    if (this.built !== g) this.build(g);
    this.clock += delta;
    const { pos, dir } = g.head();

    for (const h of this.heads) {
      const f = this.figs.get(h.id)!;
      f.root.getWorldPosition(h.pos);
      h.pos.y += 0.09;
    }
    const focus = focusedAgent(dir, pos, this.heads);
    g.orch.setFocus(focus);

    for (const f of this.figs.values()) {
      const st = g.agents[f.id];
      // billboard toward the head (yaw only)
      f.root.getWorldPosition(this.tmp);
      const yaw = Math.atan2(pos.x - this.tmp.x, pos.z - this.tmp.z) - g.board.root.rotation.y;
      f.root.rotation.y = yaw;
      f.body.emissive = f.body.emissive ?? new Color();
      f.body.emissive.setHex(MOOD_TINT[st.mood]);
      f.nameplate.set(`${ROLES[f.id].title}${st.holdsChip ? ' ★' : ''} · ${Math.round(st.trust)}`);

      const fresh = this.clock - f.lastSayT < CAPTION_HOLD_S && f.lastText;
      f.caption.mesh.visible = !!fresh;
      if (fresh) {
        const focused = focus === f.id;
        f.caption.set(focused ? f.lastText : `💬 ${preview(f.lastText)}`);
        f.caption.mesh.scale.setScalar(focused ? 1 : 0.7);
      }

      const p: Proposal | undefined = g.orch.proposals.find((q) => q.agent === f.id);
      f.card.visible = !!p;
      if (p && f.cardFor !== p.id) {
        f.cardFor = p.id;
        f.cardLabel.set(`${describe(p.action)}\n${p.rationale}`);
        f.approve.setValue(FhButton, 'arg', p.id);
        f.deny.setValue(FhButton, 'arg', p.id);
      }
      if (!p) f.cardFor = null;
    }
  }

  /** world position of an agent's head (for threads and chips) */
  headOf(id: AgentId, out: Vector3): Vector3 {
    const f = this.figs.get(id);
    if (!f) return out.set(0, 0, 0);
    f.root.getWorldPosition(out);
    out.y += 0.09;
    return out;
  }

  /** world position of an agent's feet (for a held chip) */
  feetOf(id: AgentId, out: Vector3): Vector3 {
    const f = this.figs.get(id);
    if (!f) return out.set(0, 0, 0);
    f.root.getWorldPosition(out);
    out.y += 0.01;
    return out;
  }
}
