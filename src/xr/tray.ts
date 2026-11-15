import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  OneHandGrabbable,
  Vector3,
  createSystem,
  Grabbed,
  type Entity,
} from '@iwsdk/core';
import { currentGame, type Game } from '../game/game';
import type { ResourceType, Token } from '../sim/types';
import { FhToken } from './tags';

const LOOK: Record<ResourceType, { color: number; make: () => Mesh }> = {
  crew: { color: 0xd8432f, make: () => new Mesh(new CylinderGeometry(0.011, 0.013, 0.03, 12)) },
  bus: { color: 0xf0c22e, make: () => new Mesh(new BoxGeometry(0.036, 0.018, 0.018)) },
  sandbags: { color: 0xc9b27c, make: () => new Mesh(new BoxGeometry(0.03, 0.012, 0.02)) },
  pump: { color: 0x2f7fd0, make: () => new Mesh(new CylinderGeometry(0.012, 0.012, 0.026, 12)) },
  fuel: { color: 0xe07a1f, make: () => new Mesh(new CylinderGeometry(0.01, 0.01, 0.028, 10)) },
};

const FOLLOW = 12; // 1/s, how fast a released token glides home

/**
 * Resource tokens: pinch-grab from the tray, release over a cell to deploy,
 * release off the board to recall. Positions always follow the sim (agents move tokens too).
 */
export class TraySystem extends createSystem({
  tokens: { required: [FhToken] },
  held: { required: [FhToken, Grabbed] },
}) {
  private built: Game | null = null;
  private home!: Vector3;
  private pos!: Vector3;

  init(): void {
    this.home = new Vector3();
    this.pos = new Vector3();
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', () => currentGame?.emit('pickup')),
      this.queries.held.subscribe('disqualify', (e) => this.release(e)),
    );
  }

  private build(g: Game): void {
    this.built = g;
    for (const tok of g.sim!.tokens) {
      const look = LOOK[tok.type];
      const mesh = look.make();
      mesh.material = new MeshStandardMaterial({ color: look.color, roughness: 0.55 });
      const holder = new Group();
      holder.name = `Token_${tok.id}`;
      holder.add(mesh);
      const e = this.world.createTransformEntity(holder);
      e.addComponent(FhToken, { tokenId: tok.id });
      e.addComponent(OneHandGrabbable, { translate: true, rotate: false });
      this.homeOf(g, tok, this.home);
      holder.position.copy(this.home);
    }
    const sand = g.sim!.tokens.find((t) => t.id === 'sand1')!;
    const p = this.homeOf(g, sand, new Vector3());
    const c = g.board!.cellCenter({ x: 0, y: 5 });
    console.info('[FH] tray', JSON.stringify({ sand1: p.toArray(), bank05: c.toArray() }));
  }

  private tokenOf(g: Game, e: Entity): Token | undefined {
    const id = e.getValue(FhToken, 'tokenId') as string;
    return g.sim?.tokens.find((t) => t.id === id);
  }

  private release(e: Entity): void {
    const g = currentGame;
    if (!g?.sim || !g.board || !e.object3D) return;
    const tok = this.tokenOf(g, e);
    if (!tok) return;
    g.board.showHighlight(null);
    e.object3D.getWorldPosition(this.pos);
    const cell = g.board.cellAt(this.pos);
    if (cell) {
      if (tok.cell && tok.cell.x === cell.x && tok.cell.y === cell.y) return;
      if (tok.cell) g.act({ kind: 'recall', token: tok.id }, 'player');
      const r = g.act({ kind: 'deploy', token: tok.id, cell }, 'player');
      g.emit(r.ok ? 'place' : 'reject', r);
    } else if (tok.cell) {
      g.act({ kind: 'recall', token: tok.id }, 'player');
      g.emit('place');
    }
  }

  /** tray slot when undeployed; on its cell (fanned out) when deployed */
  private homeOf(g: Game, tok: Token, out: Vector3): Vector3 {
    const board = g.board!;
    const toks = g.sim!.tokens;
    if (!tok.cell) {
      const idle = toks.filter((t) => !t.cell);
      const i = idle.indexOf(tok);
      return board.trayPoint((i + 0.5) / Math.max(idle.length, 1), out);
    }
    const same = toks.filter((t) => t.cell && t.cell.x === tok.cell!.x && t.cell.y === tok.cell!.y);
    const k = same.indexOf(tok);
    board.cellCenter(tok.cell, out);
    out.x += (k - (same.length - 1) / 2) * board.cell * 0.3;
    out.y += 0.012;
    return out;
  }

  update(delta: number): void {
    const g = currentGame;
    if (!g?.sim || !g.board) return;
    if (this.built !== g) this.build(g);

    for (const e of this.queries.held.entities) {
      if (!e.object3D) continue;
      e.object3D.getWorldPosition(this.pos);
      g.board.showHighlight(g.board.cellAt(this.pos));
    }

    const k = 1 - Math.exp(-FOLLOW * delta);
    for (const e of this.queries.tokens.entities) {
      if (e.hasComponent(Grabbed) || !e.object3D) continue;
      const tok = this.tokenOf(g, e);
      if (!tok) continue;
      this.homeOf(g, tok, this.home);
      e.object3D.position.lerp(this.home, k);
    }
  }
}
