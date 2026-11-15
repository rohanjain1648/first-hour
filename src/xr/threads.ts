import {
  Group,
  Mesh,
  MeshBasicMaterial,
  PokeInteractable,
  QuadraticBezierCurve3,
  RayInteractable,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  createSystem,
  type Entity,
} from '@iwsdk/core';
import type { Thread } from '../agents/orchestrator';
import { ROLES } from '../agents/roles';
import { currentGame, type Game } from '../game/game';
import { AgentsSystem } from './agentsView';
import { HudSystem } from './hud';
import { Label } from './label';
import { FhButton } from './tags';

const POOL = 4;
const HEARD_HOLD_S = 6;

interface Slot {
  group: Group;
  tube: Mesh | null;
  mat: MeshBasicMaterial;
  bead: Entity;
  beadObj: Group;
  label: Label;
  threadId: string | null;
}

/** Whisper threads: a glowing arc between two agents; pinch the bead in the middle to eavesdrop. */
export class ThreadsSystem extends createSystem({}) {
  private built: Game | null = null;
  private slots: Slot[] = [];
  private a!: Vector3;
  private b!: Vector3;
  private mid!: Vector3;
  private heard: { text: string; until: number; pos: Vector3 } | null = null;
  private heardLabel!: Label;
  private clock = 0;

  init(): void {
    this.a = new Vector3();
    this.b = new Vector3();
    this.mid = new Vector3();
    HudSystem.handlers.set('eavesdrop', (arg) => currentGame?.orch?.eavesdrop(arg));
  }

  private build(g: Game): void {
    this.built = g;
    this.slots = [];
    for (let i = 0; i < POOL; i++) {
      const group = new Group();
      group.visible = false;
      g.world.scene.add(group);
      const mat = new MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.75, depthWrite: false });
      const beadObj = new Group();
      beadObj.name = `WhisperBead_${i}`;
      beadObj.add(new Mesh(new SphereGeometry(0.014, 14, 10), new MeshBasicMaterial({ color: 0xd8f6ff })));
      beadObj.visible = false;
      const bead = this.world.createTransformEntity(beadObj);
      bead.addComponent(RayInteractable);
      bead.addComponent(PokeInteractable);
      bead.addComponent(FhButton, { action: 'eavesdrop', arg: '' });
      const label = new Label({ width: 0.26, aspect: 3, px: 60, bg: 'rgba(10,40,60,0.95)' });
      label.mesh.visible = false;
      this.slots.push({ group, tube: null, mat, bead, beadObj, label, threadId: null });
    }
    this.heardLabel = new Label({ width: 0.3, aspect: 3, px: 58, bg: 'rgba(10,40,60,0.95)' });
    this.heardLabel.mesh.visible = false;
    g.world.scene.add(this.heardLabel.mesh);
    g.orch!.on('whisperHeard', (d) => {
      const th = d as Thread;
      const pos = new Vector3();
      const agents = this.world.getSystem(AgentsSystem)!;
      agents.headOf(th.from, this.a);
      agents.headOf(th.to, this.b);
      pos.addVectors(this.a, this.b).multiplyScalar(0.5);
      pos.y += 0.2;
      this.heard = { text: `${ROLES[th.from].title} → ${ROLES[th.to].title}: “${th.text}”`, until: this.clock + HEARD_HOLD_S, pos };
    });
  }

  update(delta: number): void {
    const g = currentGame;
    if (!g?.orch || !g.board) return;
    if (this.built !== g) this.build(g);
    this.clock += delta;
    const agents = this.world.getSystem(AgentsSystem);
    if (!agents) return;
    const threads = g.orch.activeThreads().filter((t) => !t.heard);

    this.slots.forEach((slot, i) => {
      const th = threads[i];
      if (!th) {
        slot.group.visible = false;
        slot.beadObj.visible = false;
        slot.threadId = null;
        return;
      }
      if (slot.threadId !== th.id) {
        slot.threadId = th.id;
        agents.headOf(th.from, this.a);
        agents.headOf(th.to, this.b);
        this.mid.addVectors(this.a, this.b).multiplyScalar(0.5);
        this.mid.y += 0.12;
        const curve = new QuadraticBezierCurve3(this.a.clone(), this.mid.clone(), this.b.clone());
        if (slot.tube) {
          slot.group.remove(slot.tube);
          slot.tube.geometry.dispose();
        }
        slot.tube = new Mesh(new TubeGeometry(curve, 24, 0.0025, 6, false), slot.mat);
        slot.group.add(slot.tube);
        slot.beadObj.position.copy(curve.getPoint(0.5));
        slot.bead.setValue(FhButton, 'arg', th.id);
      }
      slot.group.visible = true;
      slot.beadObj.visible = true;
      slot.mat.opacity = 0.45 + 0.35 * Math.sin(this.clock * 6);
    });

    const h = this.heard;
    this.heardLabel.mesh.visible = !!h && this.clock < h.until;
    if (h && this.clock < h.until) {
      this.heardLabel.set(h.text);
      this.heardLabel.mesh.position.copy(h.pos);
      const { pos } = g.head();
      this.heardLabel.mesh.lookAt(pos);
    }
  }
}
