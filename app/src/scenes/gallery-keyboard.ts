import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawKeyboard, keyboardKeys, type KeyboardState } from '../kit/keyboard';

export function galleryKeyboardState(t: number): KeyboardState {
  if (t < 4) return { highlightKey: 'Enter', depressions: keyboardKeys({}).map((key) => key.label === 'Enter' ? prog(t, 1, 2) * (1 - prog(t, 3, 4)) : 0) };
  return { highlightKey: 'Enter', wavePhase: (t - 4) / 2, waveAmount: prog(t, 4, 5) };
}

export default class GalleryKeyboard extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('KEYBOARD / CLAWS ON THE KEYS', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S07 · ENTER', 48, 134);
    drawKeyboard(c, { x: 80, y: 300, width: 1760, height: 630 }, galleryKeyboardState(f.t));
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
