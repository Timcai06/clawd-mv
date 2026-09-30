import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { creditsState, drawCredits } from '../kit/credits';

// Gallery seconds demonstrate the reveal; S18 will supply its own resolved start anchor.
export default class GalleryCredits extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.fillStyle = css('ink', INK_SOFT.faint);
    for (let i = 0; i <= 12; i++) c.fillRect(80 + i * (W - 160) / 12, 0, 1, H);
    for (const y of [160, 920]) c.fillRect(0, y, W, 1);
    drawCredits(c, { x: 80, y: 180, width: W - 160, height: 720 }, creditsState(f.t));
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
