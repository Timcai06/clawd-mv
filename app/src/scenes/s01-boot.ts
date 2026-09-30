// S01: the machine wakes as a drafting instrument. Paper rules never bloom;
// only the clay pen and canonical Clawd sprite enter the glow layer.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { ease, lerp } from '../engine/util';
import { F, font } from '../engine/type';
import { css } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { drawCursor, blink } from '../kit/cursor';
import { WELCOME_LINES } from '../kit/content';
import { afterBeats, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { openingTimes, bootState } from './parts/s01-timing';
import { mono, plotPath, rule, viewCanvas, WrittenLyric } from './parts/s01-drafting';

class BootWorld {
  users = 0;
  ground = new Ground();
  text = new Layer2D();
  glow = new GlowLayer();
  lines = new LineBatch(1200, { blend: 'normal' });
  T;
  lyric;
  constructor(ctx: SceneCtx) {
    this.T = openingTimes(ctx.audio, ctx.lyrics);
    this.lyric = new WrittenLyric(ctx.lyrics.get("Nine o'clock"));
  }
  dispose() {
    this.ground.pass.mat.dispose(); this.ground.pass.mesh.geometry.dispose();
    this.text.texture.dispose(); this.glow.layer.texture.dispose();
    this.lines.geo.dispose(); this.lines.mat.dispose();
  }
}
let shared: BootWorld | undefined;

export default class S01Boot extends Scene {
  private w!: BootWorld;
  override init() { this.w = shared ??= new BootWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); shared = undefined; } }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.T, au = this.ctx.audio, s = bootState(au, f.t, T);
    const welcome = f.t >= T.welcome;
    const v = s.view;
    // Subtle depth drift is present even during the isolated-cursor hold.
    w.ground.render(this.ctx.renderer, out, {
      kind: 'ink', t: f.t, camX: v.x - 960 + f.beat * 3, camY: v.y - 540 + f.beat * 2,
      zoom: v.zoom, grid: welcome ? lerp(0.15, 0.48, s.frame) : 0.12,
      cell: 72, haze: 0.25 + 0.08 * Math.sin(f.beat * Math.PI / 2),
      hazeY: 0.2, kick: f.a.kick, streaks: welcome ? 0.12 * (1 - s.frame) : 0,
      travel: f.beat * 0.03,
    });
    w.text.clear(); w.glow.clear(); w.lines.clear();
    const c = w.text.ctx, g = w.glow.ctx;
    c.save(); g.save(); viewCanvas(c, v); viewCanvas(g, v);

    if (!welcome) {
      const cursor = { x: 943, y: 575, h: 66, on: blink(f.beat) };
      drawCursor(c, cursor); drawCursor(g, cursor);
    } else {
      // The four sides are plotted in order, followed by the terminal divider.
      const frame: [number, number][] = [[960, 224], [1536, 224], [1536, 784], [384, 784], [384, 224], [960, 224]];
      const pen = plotPath(w.lines, v, frame, ease.inOutCubic(s.frame));
      rule(w.lines, v, [812, 270], [812, 270 + 466 * s.frame], 0.3);
      const cursor = { x: pen[0], y: pen[1] + 12, h: 28, on: s.frame < 1 ? 1 : 0 };
      drawCursor(c, cursor); drawCursor(g, cursor);
      // Corner ticks and a calibration ruler reveal with the welcome frame.
      for (let i = 0; i < 24; i++) {
        const k = span(s.frame, i / 30, (i + 1) / 30);
        rule(w.lines, v, [400 + i * 48, 810], [400 + i * 48, 810 + (i % 4 ? 5 : 12) * k], 0.16 * k);
      }
      const p = Clawd.pose('A1', { beat: f.beat, beat0: au.beatAt(T.welcome), p: s.pixels });
      const revealed = { ...p, cells: p.cells.slice(0, Math.floor(p.cells.length * s.pixels)) };
      Clawd.draw(c, 450, 431, revealed, { px: 18 });
      Clawd.draw(g, 450, 431, { ...revealed, cells: revealed.cells.filter(cell => cell.k === 'O') }, { px: 18, alpha: 0.38 });
      if (s.pixels > 0.5) mono(c, 'CLAWD / ONLINE', 450, 592, 18, 'paper', span(s.pixels, 0.5, 1) * 0.6);

      WELCOME_LINES.forEach((text, i) => {
        const display = text.replace(/^✻ /, '');
        c.font = font(F.mono(i === 0 ? 600 : 400), i === 0 ? 28 : 23);
        c.fillStyle = css('paper', i === 0 ? 1 : 0.6);
        c.fillText(display.slice(0, Math.floor(display.length * s.rows[i]!)), 856, 367 + i * 83);
        if (s.rows[i]! > 0 && s.rows[i]! < 1) {
          const x = 856 + c.measureText(display.slice(0, Math.floor(display.length * s.rows[i]!))).width;
          drawCursor(c, { x: x + 8, y: 372 + i * 83, h: 26 });
          drawCursor(g, { x: x + 8, y: 372 + i * 83, h: 26 });
        }
      });
      const ready = f.t >= afterBeats(au, T.welcome, 5);
      if (ready) {
        drawCursor(c, { x: 856, y: 720, h: 26, on: blink(f.beat) });
        drawCursor(g, { x: 856, y: 720, h: 26, on: blink(f.beat) });
      }
    }
    c.restore(); g.restore();
    // The lyric pen leaves the welcome frame before the notification interrupts it.
    if (f.t >= w.lyric.line.start) {
      const pen = w.lyric.draw(c, f.t, 260, 950, 'paper');
      if (pen) drawCursor(g, pen);
      mono(c, '09:00', 260, 875, 22, 'paper', 0.6);
    }
    w.lines.render(this.ctx.renderer, out);
    this.ctx.comp.draw(this.ctx.renderer, w.text.upload(), out);
    w.glow.composite(this.ctx, out, 1.8);
    return { ...postFor('ink'), hud: 0, grain: 0.025, bloomRadius: 0.65, vignette: 0.08 };
  }
}
