import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, PokeInteractable, Pressed, RayInteractable, createSystem, type Entity } from '@iwsdk/core';
import { currentGame, type Game } from '../game/game';
import { Label } from './label';
import { FhButton } from './tags';

export type ButtonHandler = (arg: string, e: Entity) => void;

/** Shared pinch-button routing plus the pause dial. Other modules register handlers by action name. */
export class HudSystem extends createSystem({
  pressed: { required: [FhButton, Pressed] },
}) {
  static handlers = new Map<string, ButtonHandler>();
  private built: Game | null = null;
  private dialLabel!: Label;
  private pausedLabel!: Label;
  private dialMat!: MeshStandardMaterial;

  init(): void {
    HudSystem.handlers.set('pause', () => currentGame?.togglePause());
    this.cleanupFuncs.push(
      this.queries.pressed.subscribe('qualify', (e) => {
        const h = HudSystem.handlers.get(e.getValue(FhButton, 'action') as string);
        h?.(e.getValue(FhButton, 'arg') as string, e);
      }),
    );
  }

  private build(g: Game): void {
    this.built = g;
    const b = g.board!;
    const dial = new Group();
    dial.name = 'PauseDial';
    this.dialMat = new MeshStandardMaterial({ color: 0x2b2f36, emissive: 0x111111 });
    const disc = new Mesh(new CylinderGeometry(0.035, 0.035, 0.012, 24), this.dialMat);
    disc.position.y = 0.006;
    dial.add(disc);
    this.dialLabel = new Label({ width: 0.09, aspect: 3, px: 110, bold: true });
    this.dialLabel.set('Pause');
    this.dialLabel.mesh.position.set(0, 0.05, 0);
    this.dialLabel.mesh.rotation.x = -0.5;
    dial.add(this.dialLabel.mesh);
    dial.position.set(b.width / 2 + 0.06, 0, b.depth / 2 + 0.02);
    const e = this.world.createTransformEntity(dial, b.entity);
    e.addComponent(RayInteractable);
    e.addComponent(PokeInteractable);
    e.addComponent(FhButton, { action: 'pause' });

    this.pausedLabel = new Label({ width: 0.5, aspect: 4, px: 80, bold: true });
    this.pausedLabel.set('Paused. Pinch the dial to resume.');
    this.pausedLabel.mesh.position.set(0, 0.16, 0);
    this.pausedLabel.mesh.visible = false;
    b.root.add(this.pausedLabel.mesh);
  }

  update(): void {
    const g = currentGame;
    if (!g?.board) return;
    if (this.built !== g) this.build(g);
    const paused = g.session.paused;
    this.dialLabel.set(paused ? 'Resume' : 'Pause');
    this.dialMat.color.setHex(paused ? 0xe8a33d : 0x2b2f36);
    this.pausedLabel.mesh.visible = paused;
  }
}
