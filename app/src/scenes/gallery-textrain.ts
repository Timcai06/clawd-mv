import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawTextRain, drawWordImpact, type TextRainState, type WordImpactState } from '../kit/textrain';

export function galleryTextRainState(t: number): { rain: TextRainState; impact: WordImpactState } {
  return { rain: { phase: t * 0.25, density: 0.25 + 0.75 * prog(t, 0, 3), speed: 0.7 + 0.3 * prog(t, 2, 4), angle: 0.16 * prog(t, 0, 3) },
    impact: { fall: prog(t, 4, 6), squash: prog(t, 6, 6.5) * (1 - prog(t, 6.5, 8)) } };
}

export default class GalleryTextRain extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx, state = galleryTextRainState(f.t);
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('TEXT RAIN / UNDEFINED', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S11 · AT DAYSIN (MONTH.TS:42)', 48, 134);
    const field = { x: 48, y: 182, width: 1824, height: 850 };
    drawTextRain(c, field, state.rain); drawWordImpact(c, field, state.impact);
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
