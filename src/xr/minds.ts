import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  PokeInteractable,
  RayInteractable,
  TorusGeometry,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { AGENT_IDS, ROLES } from '../agents/roles';
import { currentGame, type Game } from '../game/game';
import type { AgentId } from '../sim/types';
import { AgentsSystem, describe } from './agentsView';
import { HudSystem } from './hud';
import { Label } from './label';
import { FhButton } from './tags';
import { viewFlags } from './viewFlags';

const PAIRS: [AgentId, AgentId][] = [
  ['fire', 'hospital'], ['fire', 'utilities'], ['fire', 'press'],
  ['hospital', 'utilities'], ['hospital', 'press'], ['utilities', 'press'],
];

const bar = (v: number) => '●'.repeat(Math.round(v / 20)) + '○'.repeat(5 - Math.round(v / 20));

/**
 * "Agent Minds" X-ray: pinch the lens to see what every agent intends, how much it trusts you,
 * whether it is holding information back, what it remembers, and who has been talking to whom.
 */
export class MindsSystem extends createSystem({}) {
  private built: Game | null = null;
  private panels = new Map<AgentId, Label>();
  private lines!: LineSegments;
  private linePos!: Float32Array;
  private lineCol!: Float32Array;
  private lensLabel!: Label;
  private a!: Vector3;
  private b!: Vector3;
  private tick = 0;

  init(): void {
    this.a = new Vector3();
    this.b = new Vector3();
    HudSystem.handlers.set('minds', () => {
      viewFlags.minds = !viewFlags.minds;
      currentGame?.banner(viewFlags.minds ? '🔍 Agent Minds: on' : '🔍 Agent Minds: off');
    });
  }

  private build(g: Game): void {
    this.built = g;
    viewFlags.minds = false;
    const b = g.board!;
    const lens = new Group();
    lens.name = 'MindsLens';
    const ring = new Mesh(new TorusGeometry(0.022, 0.006, 10, 28), new MeshStandardMaterial({ color: 0x9fe8ff, emissive: 0x1f5a6a }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.008;
    lens.add(ring);
    this.lensLabel = new Label({ width: 0.09, aspect: 3, px: 96, bold: true });
    this.lensLabel.set('Minds');
    this.lensLabel.mesh.position.set(0, 0.045, 0);
    this.lensLabel.mesh.rotation.x = -0.5;
    lens.add(this.lensLabel.mesh);
    lens.position.set(-b.width * 0.22, 0, b.depth / 2 + 0.12);
    const e = this.world.createTransformEntity(lens, b.entity);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    e.addComponent(FhButton, { action: 'minds' });

    for (const id of AGENT_IDS) {
      const l = new Label({ width: 0.24, aspect: 2.0, px: 50, bg: 'rgba(8,32,44,0.94)', align: 'left' });
      l.mesh.visible = false;
      g.world.scene.add(l.mesh);
      this.panels.set(id, l);
    }
    const geo = new BufferGeometry();
    this.linePos = new Float32Array(PAIRS.length * 6);
    this.lineCol = new Float32Array(PAIRS.length * 6);
    geo.setAttribute('position', new BufferAttribute(this.linePos, 3));
    geo.setAttribute('color', new BufferAttribute(this.lineCol, 3));
    this.lines = new LineSegments(geo, new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 }));
    this.lines.name = 'MindsLinks';
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    g.world.scene.add(this.lines);
  }

  update(delta: number): void {
    const g = currentGame;
    if (!g?.board || !g.orch || !g.agents) return;
    if (this.built !== g) this.build(g);
    const on = viewFlags.minds;
    this.lensLabel.set(on ? 'Minds ●' : 'Minds');
    this.lines.visible = on;
    for (const l of this.panels.values()) l.mesh.visible = on;
    if (!on) return;
    const agents = this.world.getSystem(AgentsSystem);
    if (!agents) return;
    const { pos } = g.head();

    this.tick += delta;
    const refreshText = this.tick > 0.25;
    if (refreshText) this.tick = 0;
    for (const id of AGENT_IDS) {
      const st = g.agents[id];
      const panel = this.panels.get(id)!;
      agents.headOf(id, this.a);
      panel.mesh.position.set(this.a.x, this.a.y + 0.17, this.a.z);
      panel.mesh.lookAt(pos);
      if (!refreshText) continue;
      const p = g.orch.proposalFor(id);
      const intent = p ? `${describe(p.action)} (${p.rationale})` : st.inFlight ? 'Thinking…' : 'Watching the water';
      const ignored = Math.max(0, Math.round(g.session.crisisElapsed - st.lastFocusedT));
      panel.set(
        `${ROLES[id].title}\n` +
          `Intent: ${intent}\n` +
          `Trust ${bar(st.trust)} ${Math.round(st.trust)} · ${st.mood}${st.holdsChip ? ' · ★ authority' : ''}\n` +
          `${st.trust < 30 ? 'Holding information back' : 'Sharing what it knows'}${g.orch.focus === id ? ' · you are watching' : ignored > 45 ? ` · unwatched ${ignored}s` : ''}\n` +
          `Remembers: ${st.memory[st.memory.length - 1] ?? st.pastMemory[st.pastMemory.length - 1] ?? '—'}`,
      );
    }

    PAIRS.forEach(([x, y], i) => {
      agents.headOf(x, this.a);
      agents.headOf(y, this.b);
      this.linePos.set([this.a.x, this.a.y + 0.03, this.a.z, this.b.x, this.b.y + 0.03, this.b.z], i * 6);
      const k = Math.min(1, g.orch!.pairTalk(x, y) / 4);
      const r = 0.15 + 0.4 * k, gg = 0.35 + 0.6 * k, bb = 0.45 + 0.55 * k;
      this.lineCol.set([r, gg, bb, r, gg, bb], i * 6);
    });
    this.lines.geometry.getAttribute('position').needsUpdate = true;
    this.lines.geometry.getAttribute('color').needsUpdate = true;
  }
}
