// S02: one giant printed PING crossing an ink/paper split; no editor behind the headline.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { Voice, gridSnap, drawSet, setLine } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import { drawCursor } from '../kit/cursor';
import { afterBeats, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { openingTimes } from './parts/s01-timing';
import { mono } from './parts/s01-drafting';
import { printInBox, grain, cursorFromTop } from './parts/s01-print';
import { notifyLayout, handoffIn, PING_BOX, WAKE_CLAWD } from './parts/s02-layout';
import { drawReportLyrics } from './parts/s03-form';
export const TYPE_LEVELS = { giant: 625, lyric: 50.8, label: 20 };
class NotifyWorld {
  users = 0; ground = new Ground(); layer = new Layer2D(); T; voice;
  constructor(ctx: SceneCtx) { this.T = openingTimes(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio); }
  dispose() { this.ground.pass.mat.dispose(); this.ground.pass.mesh.geometry.dispose(); this.layer.texture.dispose(); }
}
let shared: NotifyWorld | undefined;
export default class S02Notify extends Scene {
  private w!: NotifyWorld;
  override init() { this.w = shared ??= new NotifyWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); shared = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, au = this.ctx.audio, t = f.t, s = notifyLayout(t, au, w.T), c = w.layer.ctx;
    // The paper wipe starts from the shared cursor, reaching the measured 1/3 split on the ping beat.
    w.ground.render(this.ctx.renderer, out, { kind: 'paper', t, grid: 0, haze: 0, flipTo: 'ink', wipe: s.edge / 1920 * (1 - s.exit) });
    w.layer.clear();
    const line = w.voice.line(0), ping = w.voice.form(line.words[3]!, t);
    if (ping.born > 0 && s.exit < 1) {
      const drop = -180 * (1 - span(t, ping.t0, afterBeats(au, ping.t0, 0.18))) ** 2;
      const box = { ...PING_BOX, y: PING_BOX.y + drop };
      const run = varRun('PING', 100, { wdth: ping.axes.wdth, wght: Math.max(800, ping.axes.wght) });
      for (const left of [true, false]) {
        c.save(); c.beginPath(); c.rect(left ? 0 : s.edge, 0, left ? s.edge : 1920 - s.edge, 1080); c.clip();
        c.globalAlpha = (1 - s.exit) * Math.min(1, ping.born * 1.6);
        const hit = t < afterBeats(au, ping.t0, 0.18);
        c.fillStyle = css(ping.stress && hit ? 'clay' : left ? 'paper' : 'ink'); printInBox(c, run, box); c.restore();
      }
      grain(c, box, 22, 500);
    }
    const pos = WAKE_CLAWD;
    Clawd.draw(c, pos.x, pos.y, Clawd.pose('A2', { beat: f.beat, beat0: au.beatAt(w.T.ping) - 1, p: span(t, w.T.ping, w.T.screen) }), { px: pos.px, alpha: 1 - s.exit });
    const card = s.card;
    c.fillStyle = css('paper'); c.fillRect(card.x, card.y, card.w, card.h);
    c.strokeStyle = css('ink', 0.6); c.lineWidth = 1.5; c.strokeRect(card.x, card.y, card.w, card.h);
    mono(c, 'Issue #1031 · calendar', card.x + 24, card.y + card.h * 0.65, 20, 'ink', 0.6);
    drawCursor(c, { x: card.x + card.w - 42, y: card.y + card.h * 0.65, h: 28 });
    if (t < afterBeats(au,w.T.ping,1)) drawCursor(c, { ...cursorFromTop(handoffIn(t, au, w.T)), on: 1-span(t,w.T.ping,afterBeats(au,w.T.ping,1)) });
    for (const left of [true, false]) {
      const edge = s.edge * (1-s.exit);
      c.save(); c.beginPath(); c.rect(left?0:edge,0,left?edge:1920-edge,1080); c.clip();
      drawSet(c,setLine(w.voice.forms(line,t).slice(0,3),74),96,1008,{on:left?'ink':'paper',alpha:w.voice.presence(line,t)});
      c.restore();
    }
    gridSnap(c, w.voice.forms(line, t).slice(4), { x: 720, y: 948, colW: 160, rowH: 80, cols: 7, size: 74, on: 'paper', t, alpha: w.voice.presence(line, t) });
    // Got/a/bug can precede the bug-snapped S03 cut. Same TITLE positions on both sides.
    if (t >= w.voice.line(1).start) drawReportLyrics(c, w.voice, t);
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    return { ...postFor('paper'), hud: 0, bloom: 0, grain: 0.03, vignette: 0 };
  }
}
