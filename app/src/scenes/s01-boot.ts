import { SparkLines, cursorSpark, heatTrail, sparkFade } from '../kit/spark';
import { drawNote } from '../kit/note';
// S01: frontal welcome frame, partial paper rules, clay pixels and a perspective floor.
import type * as THREE from 'three';
import { Lens } from '../kit/lens';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { css } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { blink } from '../kit/cursor';
import { glowDraw, Voice, drawSet, setLine } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import { afterBeats, span } from '../kit/time';
import { ease, lerp } from '../engine/util';
import { cursorFromTop, printInBox } from './parts/s01-print';
import * as Clawd from '../kit/clawd';
import { openingTimes, bootState, handoffOut, WELCOME_BOX, BOOT_CLAWD } from './parts/s01-timing';
export const TYPE_LEVELS = { giant: null, lyric: 50.8, label: 20 }; // cap heights; Archivo 74 px = 50.764 cap px
class BootWorld { lens = new Lens();
  sparks = new SparkLines();
  users = 0; ground = new Ground(); text = new Layer2D(); glow = new GlowLayer(); T; voice;
  constructor(ctx: SceneCtx) { this.T = openingTimes(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio); }
  dispose() { this.sparks.dispose(); this.lens.dispose(); this.ground.pass.mat.dispose(); this.ground.pass.mesh.geometry.dispose(); this.text.texture.dispose(); this.glow.dispose(); }
}
let shared: BootWorld | undefined;
export default class S01Boot extends Scene {
  private w!: BootWorld;
  override init() { this.w = shared ??= new BootWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); shared = undefined; } }
  /** v4 motion: tight on the lone cursor, a long pull-back as the welcome frame draws, a lean-in on the last beat. */
  private view(t: number) {
    const au = this.ctx.audio, T = this.w.T;
    const cur = cursorFromTop(handoffOut(T.start, au, T));
    const back = ease.inOutCubic(span(t, afterBeats(au, T.welcome, -1.5), afterBeats(au, T.welcome, 3)));
    const lean = Math.sin(Math.PI * span(t, afterBeats(au, T.ping, -2), T.ping)) * 0.06;
    const zoom = lerp(2.6, 1, back) + lean;
    return { zoom, fx: lerp(cur.x + 10, 960, back), fy: lerp(cur.y - 20, 540, back), ax: 960, ay: 540, rot: 0.02 * (1 - back) };
  }

  override render(f: Frame, finalOut: THREE.WebGLRenderTarget) {
    const out = this.w.lens.rt;
    const w = this.w, au = this.ctx.audio, s = bootState(au, f.t, w.T);
    w.ground.render(this.ctx.renderer, out, { kind: 'ink', t: f.t, grid: 0, haze: 0.24, hazeY: 0.25, kick: f.a.kick });
    w.text.clear(); w.glow.clear(); const c = w.text.ctx, g = w.glow.ctx;
    w.sparks.begin(c, g, 'ink');
    // Perspective rules only below the horizon; the welcome frame's surrounding space stays empty.
    c.strokeStyle = css('paper', 0.13); c.lineWidth = 1; c.beginPath();
    for (let x = -1920; x <= 3840; x += 340) { c.moveTo(960 + (x - 960) * 0.03, 775); c.lineTo(x, 1080); }
    for (let i = 0; i < 12; i++) { const y = 775 + 305 * (i / 11) ** 2.5; c.moveTo(0, y); c.lineTo(1920, y); } c.stroke();
    if (f.t >= w.T.welcome) {
      const b = WELCOME_BOX;
      const frameEnd = afterBeats(au, w.T.welcome, 1.4);
      const progress = (tb: number) => bootState(au, tb, w.T).frame;
      const paths = [
        (tb: number) => ({ x: b.x, y: b.y + b.h * progress(tb) }),
        (tb: number) => ({ x: b.x + b.w * 0.88 * progress(tb), y: b.y }),
        (tb: number) => ({ x: b.x + b.w * 0.86 * progress(tb), y: b.y + b.h }),
        (tb: number) => ({ x: b.x + b.w, y: tb === w.T.welcome ? b.y + b.h * 0.28 : b.y + b.h * 0.57 * progress(tb) }),
      ];
      for (const path of paths) heatTrail(w.sparks, f.t, path,
        { from: w.T.welcome, to: frameEnd, width: 2, cold: sparkFade(f.t, w.T.ping) === 0 });
      c.save(); c.setLineDash([2, 3]); c.strokeStyle = css('paper', 0.25); c.strokeRect(b.x, b.y, b.w, b.h); c.restore();
      c.fillStyle = css('paper', 0.6);
      printInBox(c,varRun('Welcome to Claude Code',74,{wdth:75,wght:700}),{x:582,y:255,w:660,h:50.8});
      c.font = font(F.mono(), 20); c.fillText('cwd: ~/calendar', 582, 342);
      const title = 'Works on My Machine', text = title.slice(0, Math.floor(title.length * s.rows[1]!));
      c.fillText(text, 582, 376);
      const p = Clawd.pose('A1', { beat: f.beat, beat0: au.beatAt(w.T.welcome), p: s.pixels });
      for (const cell of p.cells) if (cell.k === 'O') {
        c.strokeStyle = css('clay', 0.42); c.lineWidth = 0.8;
        c.strokeRect(BOOT_CLAWD.x + cell.x * BOOT_CLAWD.px, BOOT_CLAWD.y + (cell.y + p.dy) * BOOT_CLAWD.px, BOOT_CLAWD.px, BOOT_CLAWD.px);
        glowDraw(c, g, g => { g.strokeStyle = c.strokeStyle; g.lineWidth = c.lineWidth;
          g.strokeRect(BOOT_CLAWD.x + cell.x * BOOT_CLAWD.px, BOOT_CLAWD.y + (cell.y + p.dy) * BOOT_CLAWD.px, BOOT_CLAWD.px, BOOT_CLAWD.px); });
      }
      const reveal = { ...p, cells: p.cells.filter((cell, i) => cell.k === 'D' || i < Math.floor(p.cells.length * s.pixels)) };
      Clawd.draw(c, BOOT_CLAWD.x, BOOT_CLAWD.y, reveal, { px: BOOT_CLAWD.px });
      Clawd.draw(g, BOOT_CLAWD.x, BOOT_CLAWD.y, { ...reveal, cells: reveal.cells.filter(cell => cell.k === 'O') }, { px: BOOT_CLAWD.px, alpha: 0.25 });
    }
    const frameEnd = afterBeats(au, w.T.welcome, 1.4);
    const cursorAt = (tb: number) => {
      const base = cursorFromTop(handoffOut(tb, au, w.T));
      if (tb >= w.T.welcome && tb < frameEnd) return { x: WELCOME_BOX.x + WELCOME_BOX.w * 0.88 * bootState(au, tb, w.T).frame,
        y: WELCOME_BOX.y, h: base.h, on: 1 };
      return { ...base, on: blink(au.beatAt(tb), tb >= afterBeats(au, w.T.ping, -1)) };
    };
    cursorSpark(c, g, w.sparks, f.t, cursorAt, { on: 'ink', from: w.T.welcome, to: frameEnd, end: w.T.ping, seed: 1 });
    const line = w.voice.line(0), forms = w.voice.forms(line, f.t);
    drawSet(c, setLine(forms, 74), 480, 752, { on: 'ink', glow: g });
    { const q = cursorFromTop(handoffOut(f.t, au, w.T));
      drawNote(c, { ax: q.x + 14, ay: q.y - 12, x: q.x + 80, y: q.y - 70, text: 'pid 1031 · idle', t0: w.T.start + 0.6, t1: w.T.welcome, on: 'ink' }, f.t); }
    this.ctx.comp.draw(this.ctx.renderer, w.text.upload(), out); w.sparks.finish(this.ctx, out); w.glow.composite(this.ctx, out, 2.0);
    this.w.lens.film(this.ctx.renderer, finalOut, this.view(f.t));
    return { ...postFor('ink'), hud: 0, grain: 0.03, ca: 0.6, vignette: 0 };
  }
}
