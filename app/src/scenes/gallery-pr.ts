import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawPr, type PrState } from '../kit/pr';

export function galleryPrState(t: number): PrState {
  return { titleProgress: prog(t, 0, 2), diffProgress: prog(t, 2, 4), reviewProgress: prog(t, 4, 5.5), mergePress: prog(t, 7, 8) };
}

export default class GalleryPr extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('PULL REQUEST / ONE CHARACTER', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S17 · FIX OCTOBER', 48, 134);
    drawPr(c, { x: 320, y: 200, width: 1344, height: 830 }, galleryPrState(f.t));
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
