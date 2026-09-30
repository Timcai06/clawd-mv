// Gallery seconds exercise the API; production scenes provide beat/lyric timing.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { WELCOME_LINES } from '../kit/content';
import { drawWelcome, type WelcomeState } from '../kit/welcome';
import { draw, pose } from '../kit/clawd';

export function galleryWelcomeState(t: number): WelcomeState {
  const count = Math.floor(prog(t, 0, 6) * WELCOME_LINES.reduce((n, line) => n + line.length, 0));
  let remaining = count, lineCount = 0;
  while (lineCount < WELCOME_LINES.length && remaining >= WELCOME_LINES[lineCount].length) {
    remaining -= WELCOME_LINES[lineCount].length; lineCount++;
  }
  return { lineCount, charCount: remaining, cursor: t < 6 };
}

export default class GalleryWelcome extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('WELCOME / ONE MORE DAY', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S01 · S18', 48, 134);
    const slot = drawWelcome(c, { x: 220, y: 250, width: 1480, height: 720 }, galleryWelcomeState(f.t));
    const sprite = pose(f.t < 7 ? 'A1' : 'A13', { beat: f.beat, beat0: 0, p: prog(f.t, 0, 10) });
    sprite.cells = sprite.cells.slice(0, Math.floor(sprite.cells.length * prog(f.t, 0.5, 3)));
    draw(c, slot.x, slot.y, sprite, { px: slot.width / 16 });
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
