// S16: the cropped GREEN slab above one foreshortened arc of nineteen engraved dominoes.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { drawCursor } from '../kit/cursor';
import { Voice, drawSet, setLine, odometer } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { greenState, greenTimes, type GreenTimes } from './parts/s16-green-state';
import { drawDomino, polygon, printRun } from './parts/s16-print';

// Minimum capital heights: the fitted headline is >=510; 92 px Archivo has a 686/1000 cap.
// Plex label uses its 20 px font size (task's permitted convention).
export const TYPE_LEVELS = { giant: 510, lyric: 63.112, label: 20 };

class World {
  users = 0;
  ground = new Ground();
  layer = new Layer2D();
  times: GreenTimes;
  voice: Voice;
  constructor(ctx: SceneCtx) { this.times = greenTimes(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio); }
  dispose() { this.ground.pass.mat.dispose(); this.layer.texture.dispose(); }
}
const worlds = new WeakMap<THREE.WebGLRenderer, World>();

export default class S16Green extends Scene {
  private w!: World;
  override init() {
    this.w = worlds.get(this.ctx.renderer) ?? new World(this.ctx);
    worlds.set(this.ctx.renderer, this.w); this.w.users++;
  }
  override dispose() {
    if (--this.w.users === 0) { this.w.dispose(); worlds.delete(this.ctx.renderer); }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, v = w.voice, T = w.times, t = f.t;
    const s = greenState(this.ctx.audio, this.ctx.lyrics, v, t, T);
    w.ground.render(this.ctx.renderer, out, { kind: 'paper', t, grid: 0, halftone: 0.08, pitch: 7, haze: 0 });
    w.layer.clear(); const c = w.layer.ctx;

    // Registration rules carry no extra annotation text.
    c.strokeStyle = css('ink', 0.55); c.lineWidth = 1;
    c.beginPath(); c.moveTo(96, 500); c.lineTo(96, 1080);
    c.moveTo(1530, 0); c.lineTo(1530, 655); c.moveTo(1530, 278); c.lineTo(1920, 278);
    c.moveTo(0, 820); c.lineTo(620, 820); c.stroke();
    if (s.form && s.form.born > 0) {
      const run = varRun('GREEN', 740, { wdth: s.form.axes.wdth, wght: Math.max(820, s.form.axes.wght) });
      // The reference's headline is INK. A stressed attack briefly prints clay, then
      // becomes the persistent ink title rather than disappearing between greens.
      printRun(c, run, s.headline, s.form.stress && s.form.singing ? 'clay' : 'ink', 16,
        Math.min(1, s.form.born * 1.6));
    }

    c.strokeStyle = css('ink', 0.8); c.lineWidth = 1.3;
    for (let i = 0; i < s.cards.length - 1; i++) {
      const a = s.cards[i]!.front[1]!, b = s.cards[i + 1]!.front[0]!;
      c.beginPath(); c.moveTo(a.x + 2, a.y - 24);
      c.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - 55, b.x - 4, b.y - 28); c.stroke();
      c.beginPath(); c.moveTo(b.x - 8, b.y - 31); c.lineTo(b.x - 4, b.y - 28); c.lineTo(b.x - 3, b.y - 34); c.stroke();
    }
    const numericLine = v.line('One goes green, and two, and three');
    for (const card of s.cards) {
      drawDomino(c, card);
      if (!card.label) continue;
      const line = card.i === 18 ? v.line('Nineteen green!') : numericLine;
      const form = v.form(card.label, t), presence = v.presence(line, t);
      if (form.born <= 0 || presence <= 0) continue;
      c.save(); polygon(c, card.front); c.clip();
      const run = varRun(form.text.replace(/[,!]/g, ''), 92, form.axes);
      printRun(c, run, { x: card.face.x + 5, y: card.face.y + card.face.h * 0.72,
        w: card.face.w * 0.78, h: TYPE_LEVELS.lyric }, form.stress ? 'clay' : 'ink', 100 + card.i,
        presence * Math.min(1, form.born * 1.6)); c.restore();
    }

    // Numeric words belong to the faces; GREEN is the headline. Connecting words
    // occupy the reference's upper-right paper margin, one at a time.
    const line = this.ctx.lyrics.lineAt(t) ?? this.ctx.lyrics.lastLine(t);
    if (line && line.start < T.end && line.end >= T.start) {
      const words = v.forms(line, t).filter(x => !/^(green\W*|one|two\W*|three|nineteen)$/i.test(x.text));
      const latest = words.filter(x => x.born > 0).at(-1);
      if (latest) drawSet(c, setLine([latest], 92), 1570, 205, { on: 'paper', alpha: v.presence(line, t) });
    }
    const previous = v.line('Snip the extra line and set October free');
    if (v.presence(previous, t) > 0) drawSet(c, setLine(v.forms(previous, t).slice(-2), 92),
      120, 1010, { on: 'paper', alpha: v.presence(previous, t) });

    const cl = s.clawd;
    Clawd.draw(c, cl.x, cl.y, Clawd.pose('A7', { beat: f.beat, beat0: 0, p: 0 }), { px: cl.px });
    c.strokeStyle = css('ink', 0.6); c.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      c.beginPath(); c.moveTo(1515 + i * 18, 448); c.lineTo(1515 + i * 18, 492 + (i % 3) * 25); c.stroke();
    }
    const final = v.form(T.nineteen, t);
    if (final.born > 0) {
      odometer(c, 18 + final.sung, 1570, 500, 92, { digits: 2, color: final.stress ? 'clay' : 'pass', pitch: 51 });
      c.font = font(F.mono(500), 20); c.fillStyle = css('pass', 0.6); c.fillText('/19 passed', 1675, 499);
      drawCursor(c, { x: 1808, y: 500, h: 24 });
    } else {
      c.font = font(F.mono(500), 20); c.fillStyle = css('pass', 0.6);
      c.fillText(`${s.passed}/19 passed`, 1570, 500); drawCursor(c, { x: 1808, y: 500, h: 24 });
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    return { ...postFor('paper'), hud: 0, frame: 0, grain: 0.035 };
  }
}
