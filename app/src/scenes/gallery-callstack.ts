import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawCallStack, type CallStackState } from '../kit/callstack';

export function galleryCallStackState(t: number): CallStackState {
  return { fromFrame: 2 * prog(t, 2, 6), toFrame: 2, rowHeight: 170,
    highlight: t < 7 ? prog(t, 6, 7) : 0.65 + 0.35 * Math.cos((t - 7) * Math.PI) };
}

export default class GalleryCallStack extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('CALL STACK / DOWN TO THE BUG', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S14 · FRAME BY FRAME', 48, 134);
    drawCallStack(c, { x: 450, y: 292, width: 1380, height: 720 }, galleryCallStackState(f.t));
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 200); c.fillText('42', 48, 464);
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
