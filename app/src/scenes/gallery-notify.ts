import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { CALENDAR_ISSUE, CALENDAR_ROLLOVER, NEXT_ISSUE } from '../kit/content';
import { drawNotify, type NotifyState } from '../kit/notify';

export function galleryNotifyState(t: number): NotifyState {
  const next = t >= 4;
  return { issueNumber: next ? NEXT_ISSUE.number : CALENDAR_ISSUE.number,
    message: next ? NEXT_ISSUE.project : CALENDAR_ISSUE.title,
    pop: prog(t, next ? 4 : 0, next ? 5 : 1) };
}

export default class GalleryNotify extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('NOTIFICATION / CALENDAR', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S02 · S18', 48, 134);
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 230); c.fillText('PING', 48, 490);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 24);
    c.fillText(CALENDAR_ROLLOVER.morning[f.t < 4 ? 0 : 1], 48, 573);
    drawNotify(c, { x: 1070, y: 796, width: 780, height: 216 }, galleryNotifyState(f.t));
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
