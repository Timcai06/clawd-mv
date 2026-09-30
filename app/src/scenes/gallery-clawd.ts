// Dev gallery (never in the edit): all Clawd actions A1-A13 looping side by side on paper.
// Render with: bun scripts/render.ts stills --gallery clawd --t 4,4.3,4.6 --out ../out/wip/clawd
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, clearRT } from '../engine/gl';
import { F, font } from '../engine/type';
import { lin, css, INK_SOFT, POSTER_POST } from '../theme';
import * as Clawd from '../kit/clawd';

const CJK = 'system-ui, "PingFang SC", "Noto Sans CJK SC", sans-serif';
const ACTIONS: [Clawd.Action | null, string][] = [
  [null, '基准'], ['A1', '睡'], ['A2', '醒'], ['A3', '待机'], ['A4', '打字'],
  ['A5', '横着走'], ['A6', '跳'], ['A7', '举手'], ['A8', '慌'], ['A9', '数数'],
  ['A10', '剪'], ['A11', '下沉'], ['A12', '庆祝'], ['A13', '挥手'],
];
const LOOP = 4; // beats per demo loop

export default class GalleryClawd extends Scene {
  layer = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    clearRT(renderer, out, lin('paper'));
    const c = this.layer.ctx;
    this.layer.clear();
    const cols = 5, cw = (W - 160) / cols, ch = 300, px = 12;
    const beat0 = Math.floor(f.beat / LOOP) * LOOP;
    c.strokeStyle = css('ink', INK_SOFT.faint);
    c.lineWidth = 1;
    ACTIONS.forEach(([a, label], i) => {
      const x = 80 + (i % cols) * cw, y = 70 + Math.floor(i / cols) * ch;
      c.strokeRect(x, y, cw, ch);
      c.fillStyle = css('ink');
      c.font = font(F.mono(500), 22);
      c.fillText(a ?? '—', x + 20, y + 40);
      c.font = `500 22px ${CJK}`;
      c.fillStyle = css('ink', INK_SOFT.strong);
      c.fillText(label, x + 90, y + 40);
      const p = Clawd.pose(a, { beat: f.beat, beat0, p: (f.beat - beat0) / LOOP, travel: a === 'A5' ? 12 : undefined });
      const s = Clawd.size(px);
      Clawd.draw(c, x + (cw - s.w) / 2 - (a === 'A5' ? 6 * px : 0), y + ch / 2 + 10, p, { px });
    });
    c.fillStyle = css('ink', INK_SOFT.mid);
    c.font = font(F.mono(400), 20);
    c.fillText(`beat ${f.beat.toFixed(2)} · loop ${LOOP} beats · t ${f.t.toFixed(2)}s`, 80, 1050);
    comp.draw(renderer, this.layer.upload(), out);
    return { ...POSTER_POST };
  }
}
