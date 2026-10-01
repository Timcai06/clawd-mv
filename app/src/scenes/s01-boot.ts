// S01: frontal welcome frame, partial paper rules, clay pixels and a perspective floor.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { css } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { drawCursor, blink } from '../kit/cursor';
import { Voice, drawSet, setLine } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import { afterBeats } from '../kit/time';
import { cursorFromTop, printInBox } from './parts/s01-print';
import * as Clawd from '../kit/clawd';
import { openingTimes, bootState, handoffOut, WELCOME_BOX, BOOT_CLAWD } from './parts/s01-timing';
export const TYPE_LEVELS = { giant: null, lyric: 50.8, label: 20 }; // cap heights; Archivo 74 px = 50.764 cap px
class BootWorld {
  users = 0; ground = new Ground(); text = new Layer2D(); glow = new GlowLayer(); T; voice;
  constructor(ctx: SceneCtx) { this.T = openingTimes(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio); }
  dispose() { this.ground.pass.mat.dispose(); this.ground.pass.mesh.geometry.dispose(); this.text.texture.dispose(); this.glow.layer.texture.dispose(); }
}
let shared: BootWorld | undefined;
export default class S01Boot extends Scene {
  private w!: BootWorld;
  override init() { this.w = shared ??= new BootWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); shared = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, au = this.ctx.audio, s = bootState(au, f.t, w.T);
    w.ground.render(this.ctx.renderer, out, { kind: 'ink', t: f.t, grid: 0, haze: 0.24, hazeY: 0.25, kick: f.a.kick });
    w.text.clear(); w.glow.clear(); const c = w.text.ctx, g = w.glow.ctx;
    // Perspective rules only below the horizon; the welcome frame's surrounding space stays empty.
    c.strokeStyle = css('paper', 0.13); c.lineWidth = 1; c.beginPath();
    for (let x = -1920; x <= 3840; x += 340) { c.moveTo(960 + (x - 960) * 0.03, 775); c.lineTo(x, 1080); }
    for (let i = 0; i < 12; i++) { const y = 775 + 305 * (i / 11) ** 2.5; c.moveTo(0, y); c.lineTo(1920, y); } c.stroke();
    if (f.t >= w.T.welcome) {
      const b = WELCOME_BOX, r = s.frame;
      c.strokeStyle = css('paper', 0.8); c.lineWidth = 2;
      c.beginPath(); c.moveTo(b.x, b.y + b.h * r); c.lineTo(b.x, b.y); c.lineTo(b.x + b.w * 0.88 * r, b.y);
      c.moveTo(b.x, b.y + b.h); c.lineTo(b.x + b.w * 0.86 * r, b.y + b.h);
      c.moveTo(b.x + b.w, b.y + b.h * 0.28); c.lineTo(b.x + b.w, b.y + b.h * 0.57 * r); c.stroke();
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
      }
      const reveal = { ...p, cells: p.cells.filter((cell, i) => cell.k === 'D' || i < Math.floor(p.cells.length * s.pixels)) };
      Clawd.draw(c, BOOT_CLAWD.x, BOOT_CLAWD.y, reveal, { px: BOOT_CLAWD.px });
      Clawd.draw(g, BOOT_CLAWD.x, BOOT_CLAWD.y, { ...reveal, cells: reveal.cells.filter(cell => cell.k === 'O') }, { px: BOOT_CLAWD.px, alpha: 0.25 });
    }
    const cursor = { ...cursorFromTop(handoffOut(f.t, au, w.T)), on: blink(f.beat, f.t >= afterBeats(au,w.T.ping,-1)) };
    drawCursor(c, cursor); drawCursor(g, cursor);
    const line = w.voice.line(0), forms = w.voice.forms(line, f.t);
    drawSet(c, setLine(forms, 74), 480, 752, { on: 'ink' });
    this.ctx.comp.draw(this.ctx.renderer, w.text.upload(), out); w.glow.composite(this.ctx, out, 1.4);
    return { ...postFor('ink'), hud: 0, grain: 0.03, bloomRadius: 0.6, vignette: 0 };
  }
}
