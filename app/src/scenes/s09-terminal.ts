// S09: the reference oscilloscope, with reconstructed afterimages and a clay scan head.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { css } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { drawCursor, blink } from '../kit/cursor';
import { afterBeats, span } from '../kit/time';
import { clamp, ease, lerp } from '../engine/util';
import { glowDraw, heatColor, Voice } from '../kit/lyric-moves';
import { varRun, fillRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { resolveX9Times, type X9Times } from './s09-z-shared';
import { mono, carry, counter19 } from './parts/s09-type';
import { scopeState, handoffIn, handoffOut, SCOPE } from './parts/s09-scope';
// 19 is a machine counter, capH=140 (reference + nineteen09), not a ≥200px giant.
// Archivo levels are cap heights; Plex label=18 is its CSS font size.
export const TYPE_LEVELS = { giant: null, lyric: 65.856, label: 18 };
class World {
  glow = new GlowLayer();
  ground = new Ground(); layer = new Layer2D(); times: X9Times; voice: Voice; users = 0;
  constructor(ctx: SceneCtx) { this.times = resolveX9Times(ctx); this.voice = new Voice(ctx.lyrics, ctx.audio); }
  dispose() { this.glow.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); }
}
let world: World | undefined;
export default class S09Terminal extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, au = this.ctx.audio, T = w.times, t = f.t;
    const s = scopeState(au, t, T);
    w.ground.render(this.ctx.renderer, out, { kind: 'ink', t, grid: 0, haze: 0, streaks: 0 });
    w.layer.clear(); w.glow.clear(); const c = w.layer.ctx;
    // v4 motion: the scope is filmed close. The lens rides the scan head while we wait for a pass,
    // pulses on every beat like the trace, and opens back to the full graticule on the last beat
    // (the 19 counter is handed to S10 at its exact position).
    const follow = ease.inOutCubic(span(t, T.terminal, afterBeats(au, T.terminal, 2)));
    const exit = ease.inOutCubic(span(t, afterBeats(au, T.terminalEnd, -1), T.terminalEnd));
    const beatPulse = Math.pow(0.5, (f.beat - Math.floor(f.beat)) / 0.12) * (t >= T.waiting ? 1 : 0);
    const zoom = 1 + (0.14 * follow + 0.018 * beatPulse) * (1 - exit);
    const fx = lerp(560, clamp(s.head * 0.5 + 300, 600, 1000), follow), fy = lerp(380, SCOPE.y - 60, follow);
    c.save(); c.translate(lerp(fx, 960, 0.5), lerp(fy, 540, 0.5)); c.scale(zoom, zoom); c.rotate(-0.01 * follow * (1 - exit)); c.translate(-fx, -fy);
    const rule = (x0: number, y0: number, x1: number, y1: number, alpha: number) => {
      c.strokeStyle = css('paper', alpha); c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    };
    rule(56, 30, 56, 1028, 0.6); rule(78, 52, 1888, 52, 0.6); rule(56, 1012, 1872, 1012, 0.6);
    for (let x = 108; x <= 1748; x += 200) {
      rule(x, 54, x, 926, 0.18); rule(x, 985, x, 1012, 0.5);
    }
    for (const y of [198, 264, 473, 760, 936]) {
      c.setLineDash([3, 5]); rule(350, y, 1872, y, 0.24); c.setLineDash([]);
    }
    for (let y = 70; y < 985; y += 18) rule(1842, y, 1870, y, 0.5);
    s.traces.forEach((points, e) => {
      if (!points.length) return;
      c.strokeStyle = css('paper', e === 2 ? 1 : 0.16); c.lineWidth = e === 2 ? 2.5 : 1;
      c.setLineDash(e === 2 ? [] : [2, 4]); c.beginPath();
      points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    });
    c.setLineDash([]);
    const base = handoffIn(t, au, T);
    rule(base.x0, base.y, base.x1, base.y, 0.94);
    for (let x = 108; x < s.head; x += SCOPE.period / 2) {
      c.fillStyle = css('clay'); c.beginPath(); c.arc(x, SCOPE.y, 9, 0, Math.PI * 2); c.fill();
      glowDraw(c, w.glow.ctx, g => { g.fillStyle = css('clay'); g.beginPath(); g.arc(x, SCOPE.y, 9, 0, Math.PI * 2); g.fill(); });
    }
    c.fillStyle = css('clay'); c.fillRect(s.head - 16, SCOPE.y - 16, 32, 32);
    glowDraw(c, w.glow.ctx, g => { g.fillStyle = css('clay'); g.fillRect(s.head - 16, SCOPE.y - 16, 32, 32); });
    const n = handoffOut(t, au, T);
    mono(c, 'npm test', 96, 290, TYPE_LEVELS.label, 'paper');
    mono(c, 'running 19 tests…', 96, 322, TYPE_LEVELS.label, 'paper');
    const v = w.voice, line = v.line("So I run the tests, I’m waiting for a pass");
    // Mono-like equal-pitch cells, but sung outlines/axes still come exclusively from vartype.
    let x = 96;
    for (const form of v.forms(line, t)) {
      const pass = form.text.replace(/[^a-z]/gi, '').toLowerCase() === 'pass';
      const run = varRun(form.text, 96, form.axes);
      if (form.born > 0) {
        c.save(); c.beginPath(); c.rect(pass ? s.head - run.width : x, 338, run.width * form.sung, 122); c.clip();
        c.fillStyle = heatColor(form.stress ? 'clay' : 'paper', 'ink', form.age);
        fillRun(c, run, pass ? s.head - run.width : x, 427);
        if (form.stress) glowDraw(c, w.glow.ctx, g => {
          g.beginPath(); g.rect(pass ? s.head - run.width : x, 338, run.width * form.sung, 122); g.clip();
          g.fillStyle = c.fillStyle; fillRun(g, run, pass ? s.head - run.width : x, 427);
        }); c.restore();
        drawCursor(c, { x: pass ? s.head : x + run.width * form.sung, y: 427, h: 72,
          on: form.singing ? 1 : pass ? blink(f.beat) : 0 });
        glowDraw(c, w.glow.ctx, g => drawCursor(g, { x: pass ? s.head : x + run.width * form.sung, y: 427, h: 72,
          on: form.singing ? 1 : pass ? blink(f.beat) : 0 }));
      }
      x += run.width + 24;
    }
    carry(c, v, t, T.terminal, 96, 427, 'ink', 96, w.glow.ctx);
    const crab = s.clawd; Clawd.draw(c, crab.x, crab.y, crab.pose, { px: crab.px });
    glowDraw(c, w.glow.ctx, g => Clawd.draw(g, crab.x, crab.y, { ...crab.pose, cells: crab.pose.cells.filter(cell => cell.k === 'O') }, { px: crab.px, alpha: 0.25 }));
    c.restore();
    counter19(c, n.x, n.baseline, n.capH, 'paper');
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.glow.composite(this.ctx, out, 1.6);
    return { ...postFor('ink'), ca: 0.6, hud: 0 };
  }
}
