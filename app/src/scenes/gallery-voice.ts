// Lyric typography v3 specimen: every line of the song set by the Voice (sound → form) with the
// default verse move (grid snap) and a few moves on the side. `--gallery voice`.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { Voice, drawSet, drawWithMissing, gridSnap, odometer, wrap } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';

export default class GalleryVoice extends Scene {
  private layer!: Layer2D;
  private voice!: Voice;
  override init() { this.layer = new Layer2D(); this.voice = new Voice(this.ctx.lyrics, this.ctx.audio); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx, v = this.voice, t = f.t;
    this.layer.clear(css('paper'));
    const line = this.ctx.lyrics.lastLine(t);
    c.fillStyle = css('ink', INK_SOFT.faint);
    for (let i = 0; i <= 12; i++) c.fillRect(96 + i * (W - 192) / 12, 0, 1, H);
    c.font = font(F.mono(500), 18); c.fillStyle = css('ink', INK_SOFT.strong);
    c.fillText(`${t.toFixed(3)} s   line ${line ? line.i : '—'}`, 96, 60);
    if (line) {
      const forms = v.forms(line, t), pres = v.presence(line, t);
      const sets = wrap(forms, 150, W - 192);
      const sc = v.breath(f.a.kick);
      c.save(); c.translate(96, 330); c.scale(sc, sc);
      sets.forEach((s, i) => drawSet(c, s, 0, i * 160, { on: 'paper', alpha: pres }));
      c.restore();
      gridSnap(c, forms, { x: 96, y: 760, colW: (W - 192) / 12, rowH: 110, cols: 12, size: 56, on: 'paper', t, alpha: pres });
      const w = forms.find((x) => x.singing);
      if (w) {
        c.font = font(F.mono(400), 16); c.fillStyle = css('ink', INK_SOFT.strong);
        c.fillText(`${w.text}  wdth ${w.axes.wdth.toFixed(1)}  wght ${w.axes.wght.toFixed(0)}  held ${w.held.toFixed(2)}`, 96, 96);
      }
    }
    odometer(c, Math.min(32, Math.max(0, (t % 8) * 5)), W - 380, 150, 90, { digits: 2, color: 'clay' });
    const r = varRun('undefined', 64, { wdth: 100, wght: 900 });
    drawWithMissing(c, r, W - 420, 220, (i) => ((t % 4) / 4) * 9 - i, css('ink'));
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
