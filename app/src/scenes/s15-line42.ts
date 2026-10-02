import { SparkLines, cursorSpark, heatTrail, sparkFade } from '../kit/spark';
import { drawNote } from '../kit/note';
import { PrintOverlay } from '../kit/print-overlay';
// S15 — an engraved solid ≤, a forty-two counter, and a carved equal-stroke cut.
// The reference cut frame remains INK; sustained PAPER begins at the October shot.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { css } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { afterBeats, span } from '../kit/time';
import { ease, hash, lerp } from '../engine/util';
import { glowDraw, heatColor, Voice, drawSet, setLine, odometer, type WordForm } from '../kit/lyric-moves';
import { fillRun, varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { resolveFTimes, type FTimes } from './parts/s15-f-timing';
import { Monument } from './parts/s15-monument';
import { Lens } from '../kit/lens';
import { SCULPTURE, TYPE_LEVELS as PRINT_LEVELS, LYRIC_SIZE, freeState, handoffIn, heroState, monumentState } from './parts/s15-layout';
export const TYPE_LEVELS = { ...PRINT_LEVELS };

class World {
  sparks = new SparkLines();
  glow = new GlowLayer();
  print = new PrintOverlay();
  users = 0;
  T: FTimes;
  voice: Voice;
  ground = new Ground();
  monument = new Monument();
  layer = new Layer2D();
  lens = new Lens();
  shadow = new Layer2D();
  constructor(ctx: SceneCtx) {
    this.T = resolveFTimes(ctx); this.voice = new Voice(ctx.lyrics, ctx.audio);
    const c = this.shadow.ctx;
    c.strokeStyle = css('paper', 0.24); c.lineWidth = 0.65;
    // Ground contact is a patch of engraved horizontal strokes, never a blurred light shadow.
    for (let i = 0; i < 680; i++) {
      const y = 858 + hash(i, 15, 1) * 114;
      const x = 140 + hash(i, 15, 2) * 1680;
      const len = 14 + hash(i, 15, 3) * 200;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + len, y + hash(i, 15, 4) * 2); c.stroke();
    }
  }
  dispose() { this.sparks.dispose(); this.glow.dispose(); this.print.dispose(); this.lens.dispose(); this.ground.pass.mat.dispose(); this.monument.dispose(); this.layer.texture.dispose(); this.shadow.texture.dispose(); }
}
let world: World | undefined;

export default class S15Line42 extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  /**
   * v4 motion: "There it is, on line forty-two" pushes into the line and its counter; the ≤ is
   * met by a slow lateral dolly; each of "Less / than / or / equal" nudges the lens; "Snip" is a hit
   * with a roll; "set October free" pulls out to the full frame by the S16 cut.
   */
  private lensView(t: number) {
    const T = this.w.T;
    const s16 = T.s16[0]!;
    if (t < T.s15[2]!) {
      const k = ease.inOutCubic(span(t, T.s15[0]!, T.s15[2]!));
      return { zoom: 1 + 0.45 * k, fx: lerp(960, 760, k), fy: lerp(540, 520, k), ax: 960, ay: 540, rot: -0.02 * k };
    }
    const dolly = ease.inOutQuad(span(t, T.s15[2]!, T.snip));
    let zoom = 1.1 - 0.06 * dolly, rot = 0;
    const fx = 880, fy = lerp(640, 560, dolly);
    const line = this.ctx.lyrics.lastLine(t);
    for (const wd of line?.words ?? []) if (t >= wd.start) { const k = Math.pow(0.5, (t - wd.start) / 0.09); zoom += 0.025 * k; rot += (wd.index % 2 ? 0.005 : -0.005) * k; }
    const hit = t >= T.snip ? Math.pow(0.5, (t - T.snip) / 0.1) : 0;
    zoom += 0.14 * hit; rot += 0.035 * hit;
    const out = ease.inOutCubic(span(t, T.snip, s16));
    return { zoom: lerp(zoom, 1, out), fx: lerp(fx, 960, out), fy: lerp(fy, 540, out), ax: 960, ay: 540, rot: rot * (1 - out * 0.7) };
  }

  override render(f: Frame, finalOut: THREE.WebGLRenderTarget) {
    const out = this.w.lens.rt;
    const w = this.w, T = w.T, t = f.t, audio = this.ctx.audio;
    const s = monumentState(audio, t, T), kind = s.paper ? 'paper' : 'ink';
    const specimen = t >= Math.min(T.s15[2]!, T.less);
    w.ground.render(this.ctx.renderer, out, { kind, t, grid: specimen ? 0 : 0.16,
      haze: 0, streaks: 0, halftone: s.paper ? 0.08 : 0, kick: f.a.kick * 0.15 });
    w.layer.clear(); w.glow.clear(); const c = w.layer.ctx;
    if (specimen) {
      if (!s.paper) this.ctx.comp.draw(this.ctx.renderer, w.shadow.upload(), out);
      w.monument.render(this.ctx.renderer, out, s);
      const hero = heroState(audio, t, T);
      Clawd.draw(c, hero.cx - 8 * hero.px, hero.cy - 2.5 * hero.px, hero.pose, { px: hero.px });
      if (!s.paper) glowDraw(c, w.glow.ctx, g => Clawd.draw(g, hero.cx - 8 * hero.px, hero.cy - 2.5 * hero.px,
        { ...hero.pose, cells: hero.pose.cells.filter(cell => cell.k === 'O') }, { px: hero.px, alpha: 0.25 }));
    } else this.source(c);
    this.lyrics(c, f);
    // One machine annotation at the bottom; its incoming clay rule is exactly line14.
    const rule = handoffIn(t, audio, T);
    c.strokeStyle = css(rule.clay > 0.01 ? 'clay' : s.paper ? 'ink' : 'paper', 0.6);
    c.lineWidth = 1; c.beginPath(); c.moveTo(rule.x0, rule.y); c.lineTo(rule.x1, rule.y); c.stroke();
    if (!s.paper && rule.clay > 0.01) glowDraw(c, w.glow.ctx, g => { g.strokeStyle = c.strokeStyle; g.lineWidth = 1;
      g.beginPath(); g.moveTo(rule.x0, rule.y); g.lineTo(rule.x1, rule.y); g.stroke(); });
    drawNote(c, { ax: (rule.x0 + rule.x1) / 2, ay: rule.y, x: (rule.x0 + rule.x1) / 2 + 60, y: rule.y - 64, text: 'Δ −1 char', sub: '<= → <', t0: afterBeats(audio, T.snip, 1), on: s.paper ? 'paper' : 'ink' }, t);
    c.font = font(F.mono(400), TYPE_LEVELS.label); c.fillStyle = css(s.paper ? 'ink' : 'paper', 0.6);
    c.fillText(s.paper ? 'line 42: for (let d = 0; d < days; d++)' : 'line 42: for (let d = 0; d <= days; d++)', 96, 1030);
    w.sparks.begin(c, s.paper ? undefined : w.glow.ctx, kind);
    const snipEnd = afterBeats(audio,T.snip,0.25);
    if (t >= T.snip && t < snipEnd + 0.4) {
      const path = (tb: number) => ({ x: lerp(rule.x0, rule.x1, span(tb,T.snip,snipEnd)), y: rule.y });
      heatTrail(w.sparks,t,path,{from:T.snip,to:snipEnd,width:1,cold:sparkFade(t,T.s16[0]!)===0});
    }
    const at = (tb: number) => tb >= T.snip && tb < snipEnd
      ? { x: lerp(rule.x0,rule.x1,span(tb,T.snip,snipEnd)), y: rule.y, h:25, w:12 }
      : { x:760,y:1032,h:25,w:12 };
    cursorSpark(c, s.paper ? undefined : w.glow.ctx, w.sparks,t,at,
      {on:kind,from:T.snip,to:snipEnd,end:T.s16[0]!,seed:15,
        // Existing fracture axis in s15-monument-glsl.ts / monumentBounds, projected at the current scale.
        boost:tb=>60*Math.exp(-(((lerp(rule.x0,rule.x1,span(tb,T.snip,snipEnd))-(1260+(1040-1260)*monumentState(audio,tb,T).scale))/70)**2))});
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.sparks.finish(this.ctx, out);
    if (!s.paper) w.glow.composite(this.ctx, out, 2.0);
    else w.print.render(this.ctx.renderer, out);
    w.lens.film(this.ctx.renderer, finalOut, this.lensView(t));
    const flash = t < T.snip ? 0 : 0.86 * (1 - ease.outExpo(span(t, T.snip, afterBeats(audio, T.snip, 0.24))));
    return { ...postFor(kind), hud: 0, frame: 0, paper: s.paper ? 1 : 0, ca: s.paper ? 0 : 0.6,
      vignette: 0, grain: 0.035, flash, shake: [0, 0] as [number, number] };
  }

  private source(c: CanvasRenderingContext2D) {
    c.strokeStyle = css('paper', 0.35); c.lineWidth = 1;
    c.strokeRect(96, 225, 1728, 600);
    c.font = font(F.mono(500), TYPE_LEVELS.label); c.fillStyle = css('paper', 0.6);
    c.fillText('src/calendar/month.ts:42', 120, 268);
    c.fillRect(120, 294, 1680, 1);
    // No dormant lyrics in the code specimen: only the sung Archivo words enter its fields.
  }

  private word(c: CanvasRenderingContext2D, form: WordForm, x: number, y: number,
    on: 'paper' | 'ink', roll = 0, alpha = 1) {
    if (form.born <= 0) return;
    c.save(); c.translate(x, y); c.rotate(roll);
    drawSet(c, setLine([form], LYRIC_SIZE), 0, 0, { on, glow: on === 'ink' ? this.w.glow.ctx : undefined, alpha }); c.restore();
  }

  private lyrics(c: CanvasRenderingContext2D, f: Frame) {
    const w = this.w, T = w.T, v = w.voice, t = f.t, audio = this.ctx.audio;
    const line = this.ctx.lyrics.lastLine(t);
    if (!line) return;
    const presence = v.presence(line, t);
    if (presence <= 0) return;
    const forms = v.forms(line, t);
    const on = t >= T.s15[5]! ? 'paper' : 'ink';
    if (line.i === v.line('There it is, on line forty-two').i) {
      drawSet(c, setLine(forms.slice(0, 3), LYRIC_SIZE), 122, 410, { on, glow: on === 'ink' ? this.w.glow.ctx : undefined, alpha: presence });
      drawSet(c, setLine(forms.slice(3, 5), LYRIC_SIZE), 122, 550, { on, glow: on === 'ink' ? this.w.glow.ctx : undefined, alpha: presence });
      const number = forms[5]!;
      if (number.born > 0) {
        odometer(c, 1 + 41 * ease.inOutCubic(number.sung), 750, 550, LYRIC_SIZE,
          { digits: 2, axes: number.axes, color: number.stress ? 'clay' : 'paper', on, age: number.age, glow: w.glow.ctx, alpha: number.born * presence });
      }
      return;
    }
    if (line.i === v.line('“Less than or equal” — well, that won’t do').i) {
      const poses = [
        { x: 970, y: 319, roll: -0.394, face: 1 },
        { x: 1070, y: 476, roll: 0.344, face: 4 },
        { x: 660, y: 827, roll: 0, face: 6 },
        { x: 1350, y: 827, roll: 0, face: 6 },
      ];
      forms.slice(0, 4).forEach((form, i) => {
        const p = poses[i]!, polygon = SCULPTURE[p.face]!.points;
        c.save(); c.beginPath(); c.moveTo(polygon[0]!.x, polygon[0]!.y);
        for (const q of polygon.slice(1)) c.lineTo(q.x, q.y);
        c.closePath(); c.clip();
        this.word(c, form, p.x, p.y, 'paper', p.roll, presence); c.restore();
      });
      forms.slice(4).forEach((form, i) => this.word(c, form, 110, 290 + i * 120, 'ink', 0, presence));
      return;
    }
    if (line.i === v.line('Snip the extra line and set October free').i) {
      forms.slice(0, 7).forEach((form, i) => this.word(c, form, 110, 175 + i * 112, on, 0, presence));
      const free = forms[7]!;
      if (free.born > 0) {
        const escape = freeState(audio, t, T);
        c.save(); c.translate(escape.x, escape.baseline); c.rotate(escape.roll);
        c.globalAlpha = free.born * presence; c.fillStyle = heatColor(free.stress ? 'clay' : 'ink', on, free.age);
        fillRun(c, varRun('FREE', LYRIC_SIZE, free.axes), 0, 0); c.restore();
      }
      return;
    }
    // Words sung on either side of an editorial cut keep their original onset and axes.
    drawSet(c, setLine(forms, LYRIC_SIZE), 110, 180, { on, glow: on === 'ink' ? this.w.glow.ctx : undefined, alpha: presence });
  }
}
