import { CylinderGeometry, Grabbed, Group, Mesh, MeshStandardMaterial, OneHandGrabbable, Vector3, createSystem, type Entity } from '@iwsdk/core';
import { AGENT_IDS } from '../agents/roles';
import { currentGame, type Game } from '../game/game';
import type { AgentId } from '../sim/types';
import { AgentsSystem } from './agentsView';
import { FhChip } from './tags';

export const CHIP_DROP_RADIUS = 0.12;
const FOLLOW = 10;

/** Two gold delegation chips. Release one near an agent to give authority; take it back by grabbing it away. */
export class ChipsSystem extends createSystem({
  chips: { required: [FhChip] },
  held: { required: [FhChip, Grabbed] },
}) {
  private built: Game | null = null;
  private owner: (AgentId | null)[] = [null, null];
  private pos!: Vector3;
  private home!: Vector3;
  private feet!: Vector3;

  init(): void {
    this.pos = new Vector3();
    this.home = new Vector3();
    this.feet = new Vector3();
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', () => currentGame?.emit('pickup')),
      this.queries.held.subscribe('disqualify', (e) => this.release(e)),
    );
  }

  private build(g: Game): void {
    this.built = g;
    this.owner = [null, null];
    for (let i = 0; i < 2; i++) {
      const holder = new Group();
      holder.name = `Chip_${i}`;
      holder.add(new Mesh(new CylinderGeometry(0.016, 0.016, 0.005, 24), new MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.8, roughness: 0.25, emissive: 0x3a2a00 })));
      const e = this.world.createTransformEntity(holder);
      e.addComponent(FhChip, { index: i });
      e.addComponent(OneHandGrabbable, { translate: true, rotate: false });
      this.homeOf(g, i, this.home);
      holder.position.copy(this.home);
    }
  }

  private nearestAgent(p: Vector3): AgentId | null {
    const agents = this.world.getSystem(AgentsSystem);
    if (!agents) return null;
    let best: AgentId | null = null;
    let bestD = CHIP_DROP_RADIUS;
    for (const id of AGENT_IDS) {
      agents.feetOf(id, this.feet);
      const d = Math.hypot(p.x - this.feet.x, p.z - this.feet.z);
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    return best;
  }

  private release(e: Entity): void {
    const g = currentGame;
    if (!g?.orch || !e.object3D) return;
    const i = e.getValue(FhChip, 'index') as number;
    e.object3D.getWorldPosition(this.pos);
    const target = this.nearestAgent(this.pos);
    const prev = this.owner[i];
    if (target === prev) return;
    if (target && this.owner.includes(target)) return; // one chip per agent; the other chip goes home
    if (prev) g.orch.takeChip(prev);
    if (target) g.orch.giveChip(target);
    this.owner[i] = target;
    g.emit('place');
  }

  private homeOf(g: Game, i: number, out: Vector3): Vector3 {
    const id = this.owner[i];
    const agents = this.world.getSystem(AgentsSystem);
    if (id && agents) {
      agents.feetOf(id, out);
      out.y += 0.01 + i * 0.006;
      return out;
    }
    // right end of the near edge, past the tokens
    const b = g.board!;
    out.set(b.width / 2 - 0.03 - i * 0.04, 0.02, b.depth / 2 + 0.1);
    return b.root.localToWorld(out);
  }

  update(delta: number): void {
    const g = currentGame;
    if (!g?.board || !g.orch) return;
    if (this.built !== g) this.build(g);
    // keep owners in sync if the orchestrator changed authority some other way
    this.owner = this.owner.map((id) => (id && g.agents?.[id].holdsChip ? id : null));
    const k = 1 - Math.exp(-FOLLOW * delta);
    for (const e of this.queries.chips.entities) {
      if (e.hasComponent(Grabbed) || !e.object3D) continue;
      this.homeOf(g, e.getValue(FhChip, 'index') as number, this.home);
      e.object3D.position.lerp(this.home, k);
    }
  }
}
