import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
  type Entity,
  type World,
} from '@iwsdk/core';
import { MAP_H, MAP_W } from '../sim/map';
import type { CellType, SimState, XY } from '../sim/types';
import { boardSize, type P3, type PlaneInfo } from './table';

const PALETTE: Record<CellType, number> = {
  river: 0x2f6f9f,
  bank: 0xb9a77a,
  road: 0x6b6660,
  bridge: 0x8a6a4a,
  residential: 0x9fbf7a,
  hospital: 0xf2efe9,
  school: 0xe8c56a,
  substation: 0x7a7f8c,
  firestation: 0xc8553d,
  park: 0x6fa060,
};

/** meters of tile height per elevation step, and per unit of water */
const ELEV_H = 0.006;
const BASE_H = 0.004;
const WATER_H = 0.012;
const WATER_SHOW = 0.02;

export class BoardView {
  readonly root: Group;
  readonly entity: Entity;
  readonly width: number;
  readonly depth: number;
  readonly cell: number;
  private tiles: InstancedMesh;
  private water: InstancedMesh;
  private houses: InstancedMesh;
  private bags: InstancedMesh;
  private unfoldT = 1;
  private unfoldDur = 2;
  private unfoldResolve: (() => void) | null = null;
  private m = new Matrix4();
  private q = new Quaternion();
  private p = new Vector3();
  private sc = new Vector3();
  private c = new Color();
  private local = new Vector3();
  private lastPowered = '';
  private highlight: Mesh;

  constructor(world: World, plane: PlaneInfo, facing: P3) {
    const { width, depth } = boardSize(plane);
    this.width = width;
    this.depth = depth;
    this.cell = width / MAP_W;
    this.root = new Group();
    this.root.name = 'TownBoard';
    this.root.position.set(plane.center.x, plane.center.y, plane.center.z);
    // local +z (row 7, the near edge with the tray) points at the player
    this.root.rotation.y = Math.atan2(facing.x - plane.center.x, facing.z - plane.center.z);

    const wood = new MeshStandardMaterial({ color: 0x6e4f33, roughness: 0.8 });
    const slab = new Mesh(new BoxGeometry(width + 0.04, 0.012, depth + 0.12), wood);
    slab.position.set(0, 0.006, 0.03);
    this.root.add(slab);

    const n = MAP_W * MAP_H;
    const tileMat = new MeshStandardMaterial({ roughness: 0.95 });
    this.tiles = new InstancedMesh(new BoxGeometry(1, 1, 1), tileMat, n);
    this.tiles.name = 'Tiles';
    const waterMat = new MeshStandardMaterial({ color: 0x3a8fd0, transparent: true, opacity: 0.72, roughness: 0.15, metalness: 0.1 });
    this.water = new InstancedMesh(new BoxGeometry(1, 1, 1), waterMat, n);
    this.water.name = 'Water';
    this.houses = new InstancedMesh(new ConeGeometry(0.55, 0.9, 4), new MeshStandardMaterial({ roughness: 0.7 }), n);
    this.houses.name = 'Houses';
    this.bags = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xc9b27c, roughness: 1 }), n);
    this.bags.name = 'Sandbags';
    this.tiles.position.y = this.water.position.y = this.houses.position.y = this.bags.position.y = 0.012;
    this.root.add(this.tiles, this.water, this.houses, this.bags);

    const hl = new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, emissive: 0xffffff, emissiveIntensity: 0.4 }));
    hl.scale.set(this.cell, 0.002, this.cell);
    hl.visible = false;
    this.highlight = hl;
    this.root.add(hl);

    this.entity = world.createTransformEntity(this.root);
  }

  /** world-space top center of a cell */
  cellCenter(c: XY, out = new Vector3()): Vector3 {
    out.set(this.colX(c.x), 0.012 + BASE_H + 5 * ELEV_H, this.rowZ(c.y));
    return this.root.localToWorld(out);
  }

  /** grid cell under a world point (within 4 cm above/below the board), or null */
  cellAt(world: { x: number; y: number; z: number }): XY | null {
    this.local.set(world.x, world.y, world.z);
    this.root.worldToLocal(this.local);
    if (this.local.y < -0.04 || this.local.y > 0.12) return null;
    const x = Math.floor((this.local.x + this.width / 2) / this.cell);
    const y = Math.floor((this.local.z + this.depth / 2) / this.cell);
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
    return { x, y };
  }

  showHighlight(c: XY | null): void {
    this.highlight.visible = !!c;
    if (c) this.highlight.position.set(this.colX(c.x), 0.012 + BASE_H + 5 * ELEV_H + 0.003, this.rowZ(c.y));
  }

  /** world point on the near edge (tray strip), u in 0..1 across the board */
  trayPoint(u: number, out = new Vector3()): Vector3 {
    out.set((u - 0.5) * this.width, 0.02, this.depth / 2 + 0.05);
    return this.root.localToWorld(out);
  }

  unfold(durationS = 2): Promise<void> {
    this.unfoldDur = durationS;
    this.unfoldT = 0;
    return new Promise((r) => (this.unfoldResolve = r));
  }

  update(dt: number): void {
    if (this.unfoldT < 1) {
      this.unfoldT = Math.min(1, this.unfoldT + dt / this.unfoldDur);
      const k = 1 - Math.pow(1 - this.unfoldT, 3);
      this.root.scale.set(1, Math.max(0.001, k), 1);
      if (this.unfoldT >= 1) {
        this.unfoldResolve?.();
        this.unfoldResolve = null;
      }
    }
  }

  syncFrom(s: SimState): void {
    let i = 0;
    let houses = 0;
    let bags = 0;
    const powerKey = s.cells.map((r) => r.map((c) => (c.powered ? 1 : 0)).join('')).join('');
    const colorsDirty = powerKey !== this.lastPowered;
    for (const row of s.cells) {
      for (const c of row) {
        const h = BASE_H + c.elevation * ELEV_H;
        const x = this.colX(c.x);
        const z = this.rowZ(c.y);
        this.q.identity();
        this.p.set(x, h / 2, z);
        this.sc.set(this.cell * 0.96, h, this.cell * 0.96);
        this.m.compose(this.p, this.q, this.sc);
        this.tiles.setMatrixAt(i, this.m);
        if (colorsDirty) {
          this.c.setHex(PALETTE[c.type]);
          if (!c.powered && c.type !== 'river' && c.type !== 'bank' && c.type !== 'park') this.c.multiplyScalar(0.55);
          this.tiles.setColorAt(i, this.c);
        }

        const show = c.type !== 'river' && c.water > WATER_SHOW;
        const wh = show ? Math.min(0.06, c.water * WATER_H) : 0.0001;
        this.p.set(x, h + wh / 2, z);
        this.sc.set(show ? this.cell : 0.0001, wh, show ? this.cell : 0.0001);
        this.m.compose(this.p, this.q, this.sc);
        this.water.setMatrixAt(i, this.m);

        if (c.type === 'residential' && c.residents > 0) {
          const hs = this.cell * 0.5;
          this.p.set(x, h + hs * 0.45, z);
          this.sc.set(hs, hs, hs);
          this.m.compose(this.p, this.q, this.sc);
          this.houses.setMatrixAt(houses, this.m);
          this.c.setHex(c.powered ? 0xf4d6a0 : 0x6d6a66);
          this.houses.setColorAt(houses, this.c);
          houses++;
        }
        if (c.sandbags > 0) {
          const bh = 0.004 * Math.min(3, c.sandbags) + 0.004;
          this.p.set(x, h + bh / 2, z - this.cell * 0.38);
          this.sc.set(this.cell * 0.9, bh, this.cell * 0.18);
          this.m.compose(this.p, this.q, this.sc);
          this.bags.setMatrixAt(bags, this.m);
          bags++;
        }
        i++;
      }
    }
    this.tiles.instanceMatrix.needsUpdate = true;
    if (colorsDirty && this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;
    this.lastPowered = powerKey;
    this.water.instanceMatrix.needsUpdate = true;
    this.houses.count = houses;
    this.houses.instanceMatrix.needsUpdate = true;
    if (this.houses.instanceColor) this.houses.instanceColor.needsUpdate = true;
    this.bags.count = bags;
    this.bags.instanceMatrix.needsUpdate = true;
  }

  private colX(x: number): number {
    return -this.width / 2 + (x + 0.5) * this.cell;
  }
  private rowZ(y: number): number {
    return -this.depth / 2 + (y + 0.5) * this.cell;
  }
}

/** A simple desk for rooms with no detectable table (and the VR operations room). */
export function buildFallbackDesk(world: World, plane: PlaneInfo, vr: boolean): Entity {
  const g = new Group();
  g.name = 'FallbackDesk';
  const top = new Mesh(new BoxGeometry(1.0, 0.03, 0.7), new MeshStandardMaterial({ color: 0x3b3f46, roughness: 0.6 }));
  top.position.y = -0.015;
  g.add(top);
  const legMat = new MeshStandardMaterial({ color: 0x24262b });
  for (const [x, z] of [[-0.46, -0.31], [0.46, -0.31], [-0.46, 0.31], [0.46, 0.31]]) {
    const leg = new Mesh(new CylinderGeometry(0.015, 0.015, plane.center.y, 8), legMat);
    leg.position.set(x, -plane.center.y / 2, z);
    g.add(leg);
  }
  if (vr) {
    const floor = new Mesh(new BoxGeometry(8, 0.01, 8), new MeshStandardMaterial({ color: 0x1d2026 }));
    floor.position.y = -plane.center.y;
    g.add(floor);
  }
  g.position.set(plane.center.x, plane.center.y, plane.center.z);
  return world.createTransformEntity(g as Object3D);
}
