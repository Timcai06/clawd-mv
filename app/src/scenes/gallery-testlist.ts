// Dev-only seconds exercise component states; production scenes supply beat timing.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { frameIdx, prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawTestList, testCounts, type TestListState } from '../kit/testlist';

export function galleryTestListState(t: number): TestListState {
  if (t < 1) return { defaultStatus: 'idle' };
  if (t < 2) return { defaultStatus: 'idle', statuses: ['pass', 'running'] };
  if (t < 4) return { visibleCount: Math.floor(19 * prog(t, 2, 3.5)) };
  if (t < 6) return { fracture: prog(t, 4, 6) };
  if (t < 8) return { twitchPhase: frameIdx(t), twitchAmount: 0.65 };
  return { passedCount: Math.floor(19 * prog(t, 8, 11)) };
}

export default class GalleryTestList extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx, state = galleryTestListState(f.t), count = testCounts(state);
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('TESTS / CALENDAR', 48, 79);
    c.font = font(F.mono(), 18); c.fillStyle = css('ink', INK_SOFT.strong); c.fillText('S10 · S13 · S16', 48, 134);
    c.fillStyle = css(count.failed ? 'fail' : count.passed ? 'pass' : 'ink'); c.font = font(F.archivo(100, 900), 192);
    c.fillText(String(count.passed || count.failed || count.total).padStart(2, '0'), 48, 406);
    c.font = font(F.mono(), 22); c.fillText(count.text, 48, 466);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18);
    const label = f.t < 1 ? 'NOT RUN' : f.t < 2 ? 'RUNNING' : f.t < 4 ? 'FAILED' : f.t < 6 ? 'SHATTER' : f.t < 8 ? 'TWITCH' : 'GREEN';
    c.fillText(label, 48, 975);
    drawTestList(c, { x: 620, y: 154, width: 1240, height: 850 }, state);
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
