import { SparkLines, cursorSpark, heatTrail, sparkFade } from '../kit/spark';
import { drawNote } from '../kit/note';
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
import { mono, counter19 } from './parts/s09-type';
import { scopeState, handoffIn, handoffOut, SCOPE, scopeHead } from './parts/s09-scope';
import { Rig } from '../kit/rig';
import { cameraAt, ridgeY, ridgeZ, RIDGES, wx, wy } from './parts/s09-world';
// 19 is a machine counter, capH=140 (reference + nineteen09), not a ≥200px giant.
// Archivo levels are cap heights; Plex label=18 is its CSS font size.
export const TYPE_LEVELS = { giant: null, lyric: 65.856, label: 18 };
class World {
  sparks = new SparkLines();
  glow = new GlowLayer();
  ground = new Ground(); layer = new Layer2D(); rig = new Rig(); times: X9Times; voice: Voice; users = 0;
  constructor(ctx: SceneCtx) { this.times = resolveX9Times(ctx); this.voice = new Voice(ctx.lyrics, ctx.audio); }
  dispose() { this.sparks.dispose(); this.glow.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); }
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
    // v5: a 3D camera over the instrument (parts/s09-world.ts). The glass is the plane z = 0; past
    // runs stand behind it as ridges, drawn far to near with their undersides filled (hidden lines).
    const rig = w.rig; rig.set(cameraAt(au, t, T));
    const P = (sx: number, sy: number, z = 0) => rig.proj(wx(sx), wy(sy), z);
    const Pw = (x: number, y: number, z: number) => rig.proj(x, y, z);
    const rule = (x0: number, y0: number, x1: number, y1: number, alpha: number) => {
      const a = P(x0, y0), b = P(x1, y1); if (!a || !b) return;
      c.strokeStyle = css('paper', alpha); c.lineWidth = 1; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    };
    // history: the runs that already failed, receding (fog by depth)
    const floorY = wy(1012), sxs: number[] = [];
    for (let sx = 16; sx <= 1904; sx += 10) sxs.push(sx);
    for (let k = RIDGES - 1; k >= 1; k--) {
      const z = ridgeZ(au, t, T, k);
      const fog = Math.exp(-(-z) / 9);
      const pts = sxs.map((sx) => Pw(wx(sx), ridgeY(k, sx), z));
      if (pts.some((q) => !q)) continue;
      const a = Pw(wx(1904), floorY, z)!, b = Pw(wx(16), floorY, z)!;
      c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q!.x, q!.y) : c.moveTo(q!.x, q!.y)));
      c.lineTo(a.x, a.y); c.lineTo(b.x, b.y); c.closePath();
      c.fillStyle = css('ink'); c.fill();
      // engraved: a few horizontal hairlines under each crest, denser where the ridge is high
      c.save(); c.clip();
      c.strokeStyle = css('paper', 0.07 * fog); c.lineWidth = 0.8;
      for (let i = 1; i < 6; i++) { const yy = Pw(0, wy(SCOPE.y) + 0.22 * i, z)!.y; c.beginPath(); c.moveTo(b.x, yy); c.lineTo(a.x, yy); c.stroke(); }
      c.restore();
      c.strokeStyle = css('paper', 0.75 * fog); c.lineWidth = 1.3;
      c.beginPath(); pts.forEach((q, i) => (i ? c.lineTo(q!.x, q!.y) : c.moveTo(q!.x, q!.y))); c.stroke();
    }
    // the glass: graticule at z = 0
    rule(56, 30, 56, 1028, 0.6); rule(78, 52, 1888, 52, 0.6); rule(56, 1012, 1872, 1012, 0.6);
    for (let x = 108; x <= 1748; x += 200) {
      rule(x, 54, x, 926, 0.18); rule(x, 985, x, 1012, 0.5);
    }
    for (const y of [198, 264, 473, 760, 936]) {
      c.setLineDash([3, 5]); rule(350, y, 1872, y, 0.24); c.setLineDash([]);
    }
    for (let y = 70; y < 985; y += 18) rule(1842, y, 1870, y, 0.5);
    // the current run: bright, drawn up to the scan head
    c.strokeStyle = css('paper', 1); c.lineWidth = 2.5; c.beginPath();
    let first = true;
    for (let sx = SCOPE.traceX; sx <= s.head; sx += 3) {
      const q = Pw(wx(sx), ridgeY(0, sx), 0); if (!q) continue;
      if (first) { c.moveTo(q.x, q.y); first = false; } else c.lineTo(q.x, q.y);
    }
    c.stroke();
    const base = handoffIn(t, au, T);
    rule(base.x0, base.y, base.x1, base.y, 0.94);
    for (let x = 108; x < s.head; x += SCOPE.period / 2) {
      const q = P(x, SCOPE.y); if (!q) continue;
      const r = 9 * q.s / 100;
      c.fillStyle = css('clay'); c.beginPath(); c.arc(q.x, q.y, r, 0, Math.PI * 2); c.fill();
      glowDraw(c, w.glow.ctx, g => { g.fillStyle = css('clay'); g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.fill(); });
    }
    const headP = P(s.head, SCOPE.y) ?? { x: s.head, y: SCOPE.y, s: 100, w: 1 };
    w.sparks.begin(c, w.glow.ctx, 'ink');
    const scan = (tb: number) => { const q = P(scopeHead(tb, T), SCOPE.y) ?? headP; return { x: q.x - 16, y: q.y + 16, h: 32, w: 32 }; };
    cursorSpark(c, w.glow.ctx, w.sparks, t, scan,
      { on: 'ink', from: T.waiting, to: T.terminalEnd-1/60, end: T.terminalEnd, seed: 9 });
    if (sparkFade(t, T.terminalEnd) > 0) heatTrail(w.sparks, t, tb => {
      const x = scopeHead(tb, T);
      return P(x, 540 - ridgeY(0, x) * 100) ?? headP;
    }, { from: Math.max(T.waiting, t-0.4), width: 2.5, alpha: sparkFade(t, T.terminalEnd) });
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
        c.save(); c.beginPath(); c.rect(pass ? headP.x - run.width : x, 338, run.width * form.sung, 122); c.clip();
        c.fillStyle = heatColor(form.stress ? 'clay' : 'paper', 'ink', form.age);
        fillRun(c, run, pass ? headP.x - run.width : x, 427);
        if (form.stress) glowDraw(c, w.glow.ctx, g => {
          g.beginPath(); g.rect(pass ? headP.x - run.width : x, 338, run.width * form.sung, 122); g.clip();
          g.fillStyle = c.fillStyle; fillRun(g, run, pass ? headP.x - run.width : x, 427);
        }); c.restore();
        drawCursor(c, { x: pass ? headP.x : x + run.width * form.sung, y: 427, h: 72,
          on: form.singing ? 1 : pass ? blink(f.beat) : 0 });
        glowDraw(c, w.glow.ctx, g => drawCursor(g, { x: pass ? headP.x : x + run.width * form.sung, y: 427, h: 72,
          on: form.singing ? 1 : pass ? blink(f.beat) : 0 }));
      }
      x += run.width + 24;
    }
    // C8 (R2): "machine" ends 0.09 s after the cut; S08 sings it out, S09 does not re-set the line.
    drawNote(c, { ax: headP.x, ay: headP.y - 18, x: headP.x + 46, y: headP.y - 120, text: 'expected: pass', sub: 'actual: pending', t0: T.waiting + 0.4, on: 'ink' }, t);
    const crab = s.clawd; Clawd.draw(c, crab.x, crab.y, crab.pose, { px: crab.px });
    glowDraw(c, w.glow.ctx, g => Clawd.draw(g, crab.x, crab.y, { ...crab.pose, cells: crab.pose.cells.filter(cell => cell.k === 'O') }, { px: crab.px, alpha: 0.25 }));
    counter19(c, n.x, n.baseline, n.capH, 'paper');
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.sparks.finish(this.ctx, out);
    w.glow.composite(this.ctx, out, 2.0);
    return { ...postFor('ink'), ca: 0.6, hud: 0 };
  }
}
