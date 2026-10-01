// S12: six side-by-side xerox generations persist behind the complete count-to-eleven row.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { hash } from '../engine/util';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { Voice, stamp, drawSet, setLine } from '../kit/lyric-moves';
import { fillRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { resolveX9Times, type X9Times } from './s09-z-shared';
import { mono, carry, enterBeat, toner, handoffBoxes } from './parts/s09-type';
import { xeroxSettings } from './parts/s12-copy';
import { COPIES, countState, handoffIn } from './parts/s12-layout';
// Archivo levels are cap heights; Plex label=18 is its CSS font size.
export const TYPE_LEVELS = { giant: 385, lyric: 65.856, label: 18 };
class World {
  ground = new Ground(); layer = new Layer2D(); copies = new Layer2D(); times: X9Times; voice: Voice; users = 0;
  constructor(ctx: SceneCtx) {
    this.times = resolveX9Times(ctx); this.voice = new Voice(ctx.lyrics, ctx.audio);
    const c = this.copies.ctx;
    COPIES.forEach((p, gen) => {
      c.save(); c.translate(p.x, p.y); c.rotate(p.roll);
      // Toner smear and increasingly large halftone clusters, baked once.
      c.fillStyle = css('ink', 0.6);
      const settings = xeroxSettings(gen), grain = settings.grain;
      for (let i = 0; i < grain; i++) {
        const x = hash(gen, i, 1) * (p.w + gen * 20) - 20, y = hash(gen, i, 2) * (p.h + 85) - 40;
        const r = 0.6 + gen * 0.3 * hash(gen, i, 3);
        c.fillRect(x, y, r, r);
      }
      c.strokeStyle = css('ink', 0.6); c.lineWidth = 1; c.strokeRect(0, 0, p.w, p.h);
      c.fillStyle = css('paper', 0.9); c.fillRect(1, 1, p.w - 2, p.h - 2);
      mono(c, '> npm test', 24, 48, 18, 'ink'); c.fillStyle = css('clay'); c.fillRect(160, 29, 8, 20);
      const names = ['october-31', 'november-30', 'leap-year', 'month-end', 'day-boundary'];
      names.forEach((name, i) => mono(c, `${gen >= 4 ? '×' : '✓'} ${name}`, 24, 100 + i * 28, 18, gen >= 4 ? 'fail' : 'ink'));
      mono(c, 'Test files   1 failed', 24, p.h - 113, 18);
      mono(c, 'Tests       19 failed', 24, p.h - 82, 18, gen >= 4 ? 'fail' : 'ink');
      mono(c, 'Expected 31 / got 32', 24, p.h - 51, 18, gen === 5 ? 'fail' : 'ink');
      if (gen === 5) {
        for (let i = 0; i < 4; i++) {
          mono(c, 'FAIL  day-boundary', 24, 270 + i * 56, 18, 'fail');
          mono(c, '× expected 31, received 32', 40, 294 + i * 56, 18, 'fail');
        }
      }
      // Halftone/dropout bites the printed content itself, with horizontal feed drags.
      c.save(); c.beginPath(); c.rect(0, 0, p.w, p.h); c.clip();
      c.fillStyle = css('paper');
      for (let i = 0; i < settings.dropout; i++) {
        const x = hash(gen, i, 7) * p.w, y = hash(gen, i, 8) * p.h;
        c.fillRect(x, y, 1 + hash(gen, i, 9) * gen * 2, 1);
      }
      c.fillStyle = css('ink', 0.3);
      for (let i = 0; i < settings.bands; i++) {
        const y = hash(gen, i, 10) * p.h, x = p.w * (0.75 + hash(gen, i, 11) * 0.25);
        c.fillRect(x, y, settings.drift, 0.8);
      }
      c.restore(); c.restore();
    });
    this.copies.upload();
  }
  dispose() { this.ground.pass.mat.dispose(); this.layer.texture.dispose(); this.copies.texture.dispose(); }
}
let world: World | undefined;
export default class S12Rerun extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, t = f.t, T = w.times, v = w.voice, au = this.ctx.audio;
    w.ground.render(this.ctx.renderer, out, { kind: 'paper', t, grid: 0, haze: 0, halftone: 0 });
    const entrance = enterBeat(au, t, T.rerunStart);
    this.ctx.comp.draw(this.ctx.renderer, w.copies.texture, out, { opacity: entrance });
    w.layer.clear(); const c = w.layer.ctx;
    if (entrance < 1) {
      const h = handoffIn(t, au, T);
      c.strokeStyle = css('ink', 1 - entrance); c.lineWidth = 4;
      for (const b of handoffBoxes(h)) c.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
    }
    carry(c, v, t, T.rerunStart, 96, 860, 'paper');
    const runs = v.line('Run it again, run it again, again');
    if (t < T.clear) {
      for (let i = 0; i < 3; i++) {
        const forms = v.forms(runs, t).slice(i * 3, i * 3 + 3), lead = forms[0];
        if (!lead || lead.born <= 0) continue;
        const x = [320, 870, 1410][i]!, y = 740;
        stamp(c, lead.text, x, y, 96, { t, at: lead.t0, axes: lead.axes,
          rot: -0.04 - i * 0.07, color: lead.stress ? 'clay' : 'ink', seed: 52 + i, box: false });
        drawSet(c, setLine(forms.slice(1), 96), x + 130, y + 36, { on: 'paper' });
      }
    }
    const clear = v.line('Clear the cache and count to ten'), forms = v.forms(clear, t);
    if (t >= T.clear) {
      const set = setLine(forms.slice(0, 4), 96);
      drawSet(c, set, 96, 615, { on: 'paper' });
      if (forms[4]!.born > 0) drawSet(c, setLine(forms.slice(4, 6), 96), 1130, 740, { on: 'paper' });
    }
    const s = countState(v, t, T);
    for (const d of s.digits) {
      c.save(); c.translate(d.x, d.y); c.scale(d.sx, d.sy);
      c.fillStyle = css(d.color); fillRun(c, d.run); c.restore();
    }
    if (s.dominant) toner(c, s.dominant, 77, 2600);
    if (s.number > 0) {
      const crab = s.clawd; Clawd.draw(c, crab.x, crab.y, crab.pose, { px: crab.px });
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    return { ...postFor('paper'), hud: 0, bloom: 0 };
  }
}
