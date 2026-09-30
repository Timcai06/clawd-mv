// S09: progress as an oscilloscope. Echoes are reconstructed from the beat grid,
// never framebuffer feedback, so reverse seeks and shutter samples are identical.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { lerp } from '../engine/util';
import { F, font } from '../engine/type';
import { css, lin } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { drawCursor, blink } from '../kit/cursor';
import { beatsSince } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { resolveX9Times, terminalState, type X9Times } from './s09-z-shared';
import { mono, sungLine } from './parts/s09-type';

const X0 = 260, X1 = 1670, Y0 = 544;
export function scopePoint(beat: number): [number, number] {
  const phase = ((beat % 8) + 8) % 8, local = phase - Math.floor(phase);
  const spike = Math.exp(-Math.pow((local - 0.16) / 0.045, 2));
  const recoil = Math.exp(-Math.pow((local - 0.26) / 0.07, 2));
  return [lerp(X0, X1, phase / 8), Y0 - 123 * spike + 52 * recoil];
}
class World {
  ground = new Ground(); layer = new Layer2D();
  lines = new LineBatch(6000, { blend: 'normal' });
  hot = new LineBatch(100, { blend: 'add' });
  times: X9Times; users = 0;
  constructor(ctx: SceneCtx) { this.times = resolveX9Times(ctx); }
  dispose() {
    this.ground.pass.mat.dispose(); this.layer.texture.dispose();
    for (const b of [this.lines, this.hot]) { b.geo.dispose(); b.mat.dispose(); }
  }
}
let world: World | undefined;
export default class S09Terminal extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio, t = f.t;
    const s = terminalState(au, t, T), scan = Math.max(0, beatsSince(au, t, T.waiting));
    const zoom = lerp(1, 1.2, s.push), riseY = (1 - s.rise) * 880;
    const xy = (x: number, y: number): [number, number] =>
      [960 + (x - 960) * zoom, 540 + (y + riseY - 540) * zoom];
    w.ground.render(this.ctx.renderer, out, {
      kind: 'ink', t, camX: 32 * scan, camY: 65 * s.push, zoom, kick: f.a.kick,
      haze: 0.45, grid: 0.6, cell: 88, streaks: 0.12 + 0.2 * s.rise,
      streakAngle: Math.PI / 2, travel: scan * 0.08,
    });
    const lb = w.lines; lb.clear(); w.hot.clear();
    const paper = lin('paper'), clay = lin('clay');
    const line = (ax: number, ay: number, bx: number, by: number, width: number,
      alpha: number, color = paper) => lb.seg2(...xy(ax, ay), ...xy(bx, by), width * zoom, color, alpha);
    // Open instrument graticule: no opaque terminal panel over the live ink ground.
    for (let i = 0; i <= 32; i++) {
      const x = lerp(X0, X1, i / 32), major = i % 4 === 0;
      line(x, 318, x, 715, major ? 1 : 0.7, major ? 0.19 : 0.07);
      line(x, 722, x, major ? 735 : 728, 1, 0.6);
    }
    for (let y = 344; y <= 704; y += 40) line(X0, y, X1, y, 0.8, y === Y0 ? 0.38 : 0.1);
    line(X0, 290, X1, 290, 1, 0.65); line(X0, 745, X1, 745, 1, 0.65);
    line(178, Y0, 225, Y0, 1.3, 0.65);
    for (let y = 384; y <= 704; y += 80) line(207, y, 225, y, 1, 0.4);
    const sweep = Math.floor(scan / 8);
    for (let echo = 3; echo >= 0; echo--) {
      const start = (sweep - echo) * 8;
      if (start < 0 || t < T.waiting) continue;
      const end = echo === 0 ? scan : start + 7.999;
      let previous = scopePoint(start);
      for (let b = start + 0.018; b <= end; b += 0.018) {
        const p = scopePoint(b);
        line(...previous, ...p, echo ? 1.4 : 2.1, echo ? 0.1 / echo : 0.15 + 0.55 * Math.exp(-(scan - b) * 0.5), echo ? paper : clay);
        previous = p;
      }
    }
    // Dots retain the coordinates of their creation, one per measured beat.
    for (let i = 0; i < s.dots; i++) {
      const q = xy(...scopePoint(i + 0.16));
      lb.seg2(q[0] - 3, q[1], q[0] + 3, q[1], 6 * zoom, clay, Math.max(0.18, 1 - (scan - i) / 12));
    }
    const head = scopePoint(scan), hs = xy(...head);
    if (t >= T.waiting) {
      line(head[0], 318, head[0], 715, 1, 0.26, clay);
      const hdr = clay.map(v => v * 3.5) as [number, number, number];
      w.hot.seg2(hs[0], hs[1] - 7, hs[0], hs[1] + 7, 8 * zoom, hdr, 0.9);
      for (let b = Math.max(sweep * 8, scan - 0.5); b < scan; b += 0.025)
        w.hot.seg2(...xy(...scopePoint(b)), ...xy(...scopePoint(Math.min(scan, b + 0.025))),
          2 * zoom, hdr, (b - scan + 0.5) * 0.6);
    }
    lb.render(this.ctx.renderer, out);
    w.layer.clear(); const c = w.layer.ctx;
    c.save(); c.translate(960, 540); c.scale(zoom, zoom); c.translate(-960, -540 + riseY);
    mono(c, 'CALENDAR / MONTH.TEST.TS', X0, 184, 22, 'paper', 0.6);
    mono(c, 'TEST PROGRESS / LIVE TRACE', X0, 232, 16, 'paper', 0.4);
    mono(c, '01', 162, 394, 15, 'paper', 0.4); mono(c, '00', 162, 554, 15, 'paper', 0.7);
    mono(c, '−1', 162, 714, 15, 'paper', 0.4);
    c.font = font(F.mono(600), 62); c.fillStyle = css('paper');
    c.fillText('$ ' + 'npm test'.slice(0, s.chars), X0, 858);
    const caret = X0 + c.measureText('$ ' + 'npm test'.slice(0, s.chars)).width + 12;
    drawCursor(c, { x: t < T.waiting ? caret : head[0] - 5, y: t < T.waiting ? 858 : head[1] + 8,
      h: t < T.waiting ? 52 : 24, on: blink(f.beat, s.chars < 8 || t >= T.waiting) });
    mono(c, `SWEEP ${String(sweep + 1).padStart(2, '0')} / ${String(s.dots).padStart(2, '0')} SAMPLES`, X0, 778, 17, 'paper', 0.55);
    mono(c, t >= T.waiting ? 'WAITING FOR A PASS' : 'STARTING TEST RUN', 1160, 778, 17, 'paper', 0.55);
    Clawd.draw(c, 1430, 258, Clawd.pose(t < T.waiting ? 'A4' : 'A3', {
      beat: f.beat, beat0: au.beatAt(T.terminal), p: s.push, look: 1,
    }), { px: 10 });
    if (t >= T.waiting) sungLine(c, this.ctx, t, X0, 957, X1 - X0, 'paper', 28);
    c.restore(); this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.hot.render(this.ctx.renderer, out);
    return { ...postFor('ink'), bloomThreshold: 1.05, bloomKnee: 0.02, bloom: 0.48, hud: 0, vignette: 0.08 };
  }
}
