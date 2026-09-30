import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawIssue, type IssueState } from '../kit/issue';
import { CALENDAR_ISSUE } from '../kit/content';

export function galleryIssueState(t: number): IssueState {
  return { titleProgress: prog(t, 0, 2), stamp: prog(t, 1, 2), circle: prog(t, 2.4, 4), calendar: { dayCount: 32, errorPhase: 0 } };
}

export default class GalleryIssue extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('ISSUE / OCTOBER 32', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S03', 48, 134);
    c.fillStyle = css('clay'); c.font = font(F.archivo(75, 900), 155); c.fillText(`#${CALENDAR_ISSUE.number}`, 48, 424);
    drawIssue(c, { x: 640, y: 136, width: 1200, height: 930 }, galleryIssueState(f.t));
    drawIssue(c, { x: 48, y: 575, width: 460, height: 414 }, galleryIssueState(f.t));
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
