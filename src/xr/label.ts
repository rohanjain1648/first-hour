import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

export interface LabelOpts {
  /** width in meters; height follows the canvas aspect */
  width: number;
  px?: number;
  aspect?: number;
  fg?: string;
  bg?: string;
  align?: CanvasTextAlign;
  bold?: boolean;
}

/** A text plane drawn on a canvas. High-contrast by default (light text on near-black). */
export class Label {
  readonly mesh: Mesh;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private tex: CanvasTexture;
  private text = '\u0000';

  constructor(private opts: LabelOpts) {
    const aspect = opts.aspect ?? 4;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024;
    this.canvas.height = Math.round(1024 / aspect);
    this.ctx = this.canvas.getContext('2d')!;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    const mat = new MeshBasicMaterial({ map: this.tex, transparent: true, side: DoubleSide, depthWrite: false });
    this.mesh = new Mesh(new PlaneGeometry(opts.width, opts.width / aspect), mat);
    this.mesh.renderOrder = 10;
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const { ctx, canvas, opts } = this;
    let px = opts.px ?? 64;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (opts.bg !== 'none') {
      ctx.fillStyle = opts.bg ?? 'rgba(16,18,22,0.92)';
      const r = Math.min(48, canvas.height / 3);
      ctx.beginPath();
      ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, r);
      ctx.fill();
    }
    ctx.fillStyle = opts.fg ?? '#f6f1e7';
    ctx.textAlign = opts.align ?? 'center';
    ctx.textBaseline = 'middle';
    // shrink the font until every wrapped line fits the canvas
    let lines: string[] = [];
    for (;;) {
      ctx.font = `${opts.bold ? '700' : '500'} ${px}px system-ui, -apple-system, Segoe UI, sans-serif`;
      lines = wrap(ctx, text, canvas.width - 80);
      if (lines.length * px * 1.2 <= canvas.height * 0.92 || px <= 14) break;
      px -= 3;
    }
    const lh = px * 1.2;
    const top = canvas.height / 2 - ((lines.length - 1) * lh) / 2;
    const x = ctx.textAlign === 'left' ? 40 : canvas.width / 2;
    lines.forEach((l, i) => ctx.fillText(l, x, top + i * lh));
    this.tex.needsUpdate = true;
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > max && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}
