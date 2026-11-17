import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  Vector3,
  createSystem,
} from '@iwsdk/core';
import { currentGame, type Game } from '../game/game';
import { Label } from './label';

const DROPS = 420;
const RAIN_TOP = 0.32;
const BANNER_S = 4;

const BANNERS: Record<string, string> = {
  'deck.bridge_collapse': '⚠ BRIDGE COLLAPSED · routes north are cut',
  'deck.generator_fault': '⚠ HOSPITAL GENERATOR FAULT',
  'deck.bus_stranded': '⚠ A BUS IS STRANDED',
  'deck.rumour_dam': '📣 RUMOUR SPREADING: “the dam burst”',
  'deck.rain_surge': '🌧 RAIN SURGE',
  'deck.substation_alarm': '⚡ SUBSTATION ALARM',
  'deck.viral_livestream': '📣 A LIVESTREAM IS GOING VIRAL',
  'power.outage': '⚡ GRID DOWN · hospital on generator',
  'rumour.new': '📣 New rumour on social media',
};

/** Rain over the board, pulsing danger cells, crew beacons, and the event banner. */
export class FxSystem extends createSystem({}) {
  private built: Game | null = null;
  private rain!: Points;
  private rainPos!: Float32Array;
  private danger!: InstancedMesh;
  private dangerMat!: MeshBasicMaterial;
  private beacons!: InstancedMesh;
  private beaconMat!: MeshBasicMaterial;
  private banner!: Label;
  private bannerUntil = 0;
  private logIdx = 0;
  private clock = 0;
  private m!: Matrix4;
  private q!: Quaternion;
  private p!: Vector3;
  private s!: Vector3;
  private flash = 0;
  private rainBlue = new Color(0xbfd8ff);

  init(): void {
    this.m = new Matrix4();
    this.q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
    this.p = new Vector3();
    this.s = new Vector3();
  }

  private build(g: Game): void {
    this.built = g;
    const b = g.board!;
    // rain: points in board space, falling and wrapping
    const geo = new BufferGeometry();
    this.rainPos = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) {
      this.rainPos[i * 3] = (Math.random() - 0.5) * (b.width + 0.1);
      this.rainPos[i * 3 + 1] = Math.random() * RAIN_TOP;
      this.rainPos[i * 3 + 2] = (Math.random() - 0.5) * (b.depth + 0.05);
    }
    geo.setAttribute('position', new BufferAttribute(this.rainPos, 3));
    this.rain = new Points(geo, new PointsMaterial({ color: 0xbfd8ff, size: 0.0035, transparent: true, opacity: 0.55, depthWrite: false }));
    this.rain.name = 'Rain';
    this.rain.frustumCulled = false;
    b.root.add(this.rain);

    this.dangerMat = new MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending });
    this.danger = new InstancedMesh(new PlaneGeometry(1, 1), this.dangerMat, 96);
    this.danger.name = 'DangerCells';
    this.danger.count = 0;
    this.danger.frustumCulled = false;
    b.root.add(this.danger);

    this.beaconMat = new MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.9, depthWrite: false });
    this.beacons = new InstancedMesh(new PlaneGeometry(1, 1), this.beaconMat, 8);
    this.beacons.name = 'CrewBeacons';
    this.beacons.count = 0;
    this.beacons.frustumCulled = false;
    b.root.add(this.beacons);

    this.banner = new Label({ width: 0.5, aspect: 7, px: 64, bold: true, bg: 'rgba(120,20,10,0.92)' });
    this.banner.mesh.position.set(0, 0.2, -b.depth / 2);
    this.banner.mesh.visible = false;
    b.root.add(this.banner.mesh);
    this.logIdx = g.sim?.log.length ?? 0;
    g.on('banner', (text) => this.show(String(text), 'rgba(20,60,90,0.92)'));
  }

  private show(text: string, bg?: string): void {
    this.banner.setBg(bg ?? 'rgba(120,20,10,0.92)');
    this.banner.set(text);
    this.banner.mesh.visible = true;
    this.bannerUntil = this.clock + BANNER_S;
  }

  update(delta: number): void {
    const g = currentGame;
    if (!g?.board || !g.sim) return;
    if (this.built !== g) this.build(g);
    this.clock += delta;
    const b = g.board;
    const sim = g.viewing ?? g.sim;
    const active = g.session.phase === 'onboarding' || g.session.phase === 'crisis';

    // new events → banner + lightning flash for deck events
    for (; this.logIdx < g.sim.log.length; this.logIdx++) {
      const e = g.sim.log[this.logIdx];
      const text = BANNERS[e.type];
      if (text) {
        this.show(text);
        if (e.type.startsWith('deck.')) this.flash = 1;
      }
    }
    if (this.banner.mesh.visible && this.clock > this.bannerUntil) this.banner.mesh.visible = false;

    // rain: speed and density follow the sim's rain intensity
    this.rain.visible = active && !g.session.paused;
    if (this.rain.visible) {
      const fall = (0.55 + 0.6 * sim.rain) * delta;
      for (let i = 0; i < DROPS; i++) {
        const y = i * 3 + 1;
        this.rainPos[y] -= fall * (0.8 + ((i * 37) % 10) / 25);
        if (this.rainPos[y] < 0.01) this.rainPos[y] += RAIN_TOP;
      }
      (this.rain.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      this.flash = Math.max(0, this.flash - delta * 2.5);
      (this.rain.material as PointsMaterial).color.setScalar(1).lerp(this.rainBlue, 1 - this.flash);
      (this.rain.material as PointsMaterial).opacity = Math.min(0.85, 0.3 + 0.35 * sim.rain + this.flash);
    }

    // danger cells pulse red
    let n = 0;
    for (const key of Object.keys(sim.peopleInDanger)) {
      if (n >= 96) break;
      const [x, y] = key.split(',').map(Number);
      const c = sim.cells[y]?.[x];
      if (!c || c.residents <= 0) continue;
      this.p.set(-b.width / 2 + (x + 0.5) * b.cell, 0.012 + 0.004 + c.elevation * 0.006 + Math.min(0.06, c.water * 0.012) + 0.002, -b.depth / 2 + (y + 0.5) * b.cell);
      this.s.set(b.cell * 0.92, b.cell * 0.92, 1);
      this.m.compose(this.p, this.q, this.s);
      this.danger.setMatrixAt(n++, this.m);
    }
    this.danger.count = n;
    this.danger.instanceMatrix.needsUpdate = true;
    this.dangerMat.opacity = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(this.clock * 5));

    // beacons above deployed crews
    let k = 0;
    for (const t of sim.tokens) {
      if (t.type !== 'crew' || !t.cell || k >= 8) continue;
      this.p.set(-b.width / 2 + (t.cell.x + 0.5) * b.cell, 0.09, -b.depth / 2 + (t.cell.y + 0.5) * b.cell);
      const on = Math.sin(this.clock * 9 + k) > 0;
      this.s.set(on ? 0.012 : 0.0001, on ? 0.012 : 0.0001, 1);
      this.m.compose(this.p, this.q, this.s);
      this.beacons.setMatrixAt(k++, this.m);
    }
    this.beacons.count = k;
    this.beacons.instanceMatrix.needsUpdate = true;
  }
}
