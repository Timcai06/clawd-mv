import { PrintOverlay } from '../kit/print-overlay';
import { drawNote } from '../kit/note';
// S02: one giant printed PING crossing an ink/paper split; no editor behind the headline.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { heatColor, Voice, gridSnap, drawSet, setLine } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import { drawCursor } from '../kit/cursor';
import { afterBeats, beatsSince, span } from '../kit/time';
import { ease, lerp } from '../engine/util';
import { Lens } from '../kit/lens';
import * as Clawd from '../kit/clawd';
import { openingTimes } from './parts/s01-timing';
import { mono } from './parts/s01-drafting';
import { printInBox, grain, cursorFromTop } from './parts/s01-print';
import { notifyLayout, handoffIn, view02, drawCardContent, PING_BOX, WAKE_CLAWD } from './parts/s02-layout';
export const TYPE_LEVELS = { giant: 625, lyric: 50.8, label: 20 };
class NotifyWorld {
  print = new PrintOverlay('step(edge, p.x)', { edge: { value: 0 } }, 'uniform float edge;');
  users = 0; ground = new Ground(); layer = new Layer2D(); lens = new Lens(); T; voice;
  constructor(ctx: SceneCtx) { this.T = openingTimes(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio); }
  dispose() { this.print.dispose(); this.lens.dispose(); this.ground.pass.mat.dispose(); this.ground.pass.mesh.geometry.dispose(); this.layer.texture.dispose(); }
}
let shared: NotifyWorld | undefined;
export default class S02Notify extends Scene {
  private w!: NotifyWorld;
  override init() { this.w = shared ??= new NotifyWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); shared = undefined; } }

  override render(f: Frame, finalOut: THREE.WebGLRenderTarget) {
    const out = this.w.lens.rt;
    const w = this.w, au = this.ctx.audio, t = f.t, s = notifyLayout(t, au, w.T), c = w.layer.ctx;
    // The paper wipe starts from the shared cursor, reaching the measured 1/3 split on the ping beat.
    w.ground.render(this.ctx.renderer, out, { kind: 'paper', t, grid: 0, haze: 0, flipTo: 'ink', wipe: s.edge / 1920 * (1 - s.exit) });
    w.layer.clear();
    const line = w.voice.line(0), ping = w.voice.form(line.words[3]!, t);
    if (ping.born > 0 && s.exit < 1) {
      const drop = -180 * (1 - span(t, ping.t0, afterBeats(au, ping.t0, 0.18))) ** 2;
      // C2: over the last beat PING squashes into the notification card's band as the card flies
      // to the form's top bar (scaleY (1-k)^3, like pdoom's 9s collapsing into the loom's weft);
      // the card is drawn over it, so the word ends inside the bar S03 unfolds from.
      const e = 1 - (1 - s.exit) ** 3, card0 = s.card;
      const box = { x: lerp(PING_BOX.x, card0.x, e), y: lerp(PING_BOX.y + drop, card0.y, e),
        w: lerp(PING_BOX.w, card0.w, e), h: lerp(PING_BOX.h, card0.h, e) };
      const run = varRun('PING', 100, { wdth: ping.axes.wdth, wght: Math.max(800, ping.axes.wght) });
      for (const left of [true, false]) {
        c.save(); c.beginPath(); c.rect(left ? 0 : s.edge, 0, left ? s.edge : 1920 - s.edge, 1080); c.clip();
        c.globalAlpha = Math.min(1, ping.born * 1.6);
        const hit = t < afterBeats(au, ping.t0, 0.18);
        c.fillStyle = heatColor(ping.stress && hit ? 'clay' : left ? 'paper' : 'ink', left ? 'ink' : 'paper', ping.age); printInBox(c, run, box); c.restore();
      }
      grain(c, box, 22, 500);
    }
    const pos = WAKE_CLAWD, card = s.card;
    // A14: the ping startles Clawd (a one-pixel hop) and its eyes go to the notification card.
    const ping0 = au.beatAt(w.T.ping), look = Clawd.gaze(pos.x, pos.y, pos.px, { x: card.x + card.w / 2, y: card.y + card.h / 2 });
    Clawd.draw(c, pos.x, pos.y, Clawd.pose('A14', { beat: f.beat, beat0: ping0, p: span(t, w.T.ping, w.T.screen), look, startle: ping0 }), { px: pos.px, alpha: 1 - s.exit });
    c.fillStyle = css('paper'); c.fillRect(card.x, card.y, card.w, card.h);
    c.strokeStyle = css('ink', 0.6); c.lineWidth = 1.5; c.strokeRect(card.x, card.y, card.w, card.h);
    drawCardContent(c, w.voice, t, card);
    if (t < afterBeats(au,w.T.ping,1)) drawCursor(c, { ...cursorFromTop(handoffIn(t, au, w.T)), on: 1-span(t,w.T.ping,afterBeats(au,w.T.ping,1)) });
    // Stage 9 ②: "on my screen" is typed into the card itself (it is the screen, drawCardContent);
    // the first half of the line stayed on S01's prompt, it is not repeated here.
    drawNote(c, { ax: card.x + card.w - 30, ay: card.y, x: card.x + card.w - 250, y: card.y - 58, text: '1 unread', sub: 'priority: weird', t0: afterBeats(au, w.T.ping, 1), on: 'paper' }, t);
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.print.pass.u.edge!.value = s.edge * (1 - s.exit);
    w.print.render(this.ctx.renderer, out);
    w.lens.film(this.ctx.renderer, finalOut, view02(t, au, w.T, w.voice.line(0).words.slice(4)));
    return { ...postFor('paper'), hud: 0, bloom: 0, grain: 0.03, vignette: 0 };
  }
}
