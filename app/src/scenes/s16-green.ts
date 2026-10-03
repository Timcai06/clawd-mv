import { SparkLines, cursorSpark, heatTrail, sparkFade } from '../kit/spark';
import { NIGHT, NightSky, ChromaGlow } from '../kit/night';
import { drawNote } from '../kit/note';
import { PrintOverlay } from '../kit/print-overlay';
// S16: the cropped GREEN slab above one foreshortened arc of nineteen engraved dominoes.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { css } from '../theme';
import { ease, lerp } from '../engine/util';
import { span } from '../kit/time';
import { Lens } from '../kit/lens';
import { Ground, postFor } from '../kit/ground';
import { drawCursor } from '../kit/cursor';
import { heatColor, Voice, odometer } from '../kit/lyric-moves';
import { affine, drawInscription, inscribe, land } from '../kit/inscribe';
import { varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { greenState, greenArcCards, greenTimes, type GreenTimes } from './parts/s16-green-state';
import { drawFree } from './parts/s15-layout';
import { resolveFTimes, type FTimes } from './parts/s15-f-timing';
import { drawDomino, polygon, printRun } from './parts/s16-print';

// Minimum capital heights: the fitted headline is >=510; 92 px Archivo has a 686/1000 cap.
// Plex label uses its 20 px font size (task's permitted convention).
export const TYPE_LEVELS = { giant: 510, lyric: 63.112, label: 20 };

class World {
  print = new PrintOverlay();
  sky = new NightSky();
  chroma = new ChromaGlow();
  sparks = new SparkLines();
  users = 0;
  ground = new Ground();
  layer = new Layer2D();
  lens = new Lens();
  times: GreenTimes;
  voice: Voice;
  f15: FTimes;
  constructor(ctx: SceneCtx) { this.times = greenTimes(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio); this.f15 = resolveFTimes(ctx); }
  dispose() { this.sky.dispose(); this.chroma.dispose(); this.sparks.dispose(); this.print.dispose(); this.lens.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); }
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

  override render(f: Frame, finalOut: THREE.WebGLRenderTarget) {
    const out = this.w.lens.rt;
    const w = this.w, v = w.voice, T = w.times, t = f.t;
    const s = greenState(this.ctx.audio, this.ctx.lyrics, v, t, T);
    // v4 motion: the lens rides the falling wave. Close on one, two, three (each topple a nudge),
    // then it can't keep up with "green and green…", widening as the run accelerates; "Nineteen
    // green!" lands as a hit and the frame opens to the identity for the S17 hand-off.
    const last = Math.max(0, s.passed - 1), card = s.cards[last]!;
    const cx = card.front.reduce((a, p) => a + p.x, 0) / 4, cy = card.front.reduce((a, p) => a + p.y, 0) / 4;
    const close = 1 - ease.inOutCubic(span(t, T.triggers[2]!, T.triggers[10] ?? T.nineteen.start));
    let nudge = 0;
    for (const at of T.triggers) if (t >= at) nudge = Math.pow(0.5, (t - at) / 0.08);
    const hit = t >= T.nineteen.start ? Math.pow(0.5, (t - T.nineteen.start) / 0.12) : 0;
    const open = ease.inOutCubic(span(t, T.nineteen.start, T.outgoingStart));
    const arrive = 1 - ease.outCubic(span(t, T.start, T.incomingEnd));
    const zoom = lerp(1 + 0.14 * close + 0.06 * (1 - close) + 0.025 * nudge + 0.1 * hit, 1, Math.max(open, arrive));
    const lens = { zoom, fx: lerp(cx, 960, Math.max(open, arrive)), fy: lerp(cy, 540, Math.max(open, arrive)),
      ax: lerp(cx, 960, Math.max(open, arrive)), ay: lerp(cy, 540, Math.max(open, arrive)),
      rot: (0.01 * nudge - 0.02 * hit) * (1 - open) };
    if (NIGHT) w.sky.render(this.ctx.renderer, out, 0.3, 0.5);
    else w.ground.render(this.ctx.renderer, out, { kind: 'paper', t, grid: 0, halftone: 0.08, pitch: 7, haze: 0 });
    w.layer.clear(); const c = w.layer.ctx;

    // Registration rules carry no extra annotation text.
    c.strokeStyle = css(NIGHT ? 'paper' : 'ink', NIGHT ? 0.3 : 0.55); c.lineWidth = 1;
    c.beginPath(); c.moveTo(96, 500); c.lineTo(96, 1080);
    c.moveTo(1530, 0); c.lineTo(1530, 655); c.moveTo(1530, 278); c.lineTo(1920, 278);
    c.moveTo(0, 820); c.lineTo(620, 820); c.stroke();
    if (s.form && s.form.born > 0) {
      const run = varRun('GREEN', 740, { wdth: s.form.axes.wdth, wght: Math.max(820, s.form.axes.wght) });
      // The reference's headline is INK. A stressed attack briefly prints clay, then
      // becomes the persistent ink title rather than disappearing between greens.
      printRun(c, run, s.headline, s.form.stress && s.form.singing ? 'clay' : NIGHT ? 'paper' : 'ink', 16,
        Math.min(1, s.form.born * 1.6), heatColor(s.form.stress && s.form.singing ? 'clay' : NIGHT ? 'paper' : 'ink', 'paper', s.form.age));
    }

    { const last = s.cards[18]!, p = last.front[1]!;
      drawNote(c, { ax: p.x, ay: p.y, x: p.x - 210, y: p.y - 90, text: '19/19 · flaky: 0', t0: T.nineteen.start + 0.35, on: NIGHT ? 'ink' : 'paper' }, t); }
    c.strokeStyle = css(NIGHT ? 'paper' : 'ink', NIGHT ? 0.4 : 0.8); c.lineWidth = 1.3;
    for (let i = 0; i < s.cards.length - 1; i++) {
      const a = s.cards[i]!.front[1]!, b = s.cards[i + 1]!.front[0]!;
      c.beginPath(); c.moveTo(a.x + 2, a.y - 24);
      c.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - 55, b.x - 4, b.y - 28); c.stroke();
      c.beginPath(); c.moveTo(b.x - 8, b.y - 31); c.lineTo(b.x - 4, b.y - 28); c.lineTo(b.x - 3, b.y - 34); c.stroke();
    }
    w.sparks.begin(c, undefined, NIGHT ? 'ink' : 'paper');
    const waveEnd = T.triggers.at(-1)!;
    const wavePath = (tb: number) => {
      const i = Math.max(0, Math.min(s.cards.length-2, T.triggers.filter(at=>at<=tb).length-1));
      const cards = greenArcCards(this.ctx.audio, tb, T);
      const a = cards[i]!.front[1]!, b = cards[i+1]!.front[0]!;
      const k = span(tb,T.triggers[i]!,T.triggers[i+1]!), q=1-k;
      return { x:q*q*(a.x+2)+2*q*k*(a.x+b.x)/2+k*k*(b.x-4),
        y:q*q*(a.y-24)+2*q*k*(Math.min(a.y,b.y)-55)+k*k*(b.y-28) };
    };
    if (t>=Math.max(T.triggers[0]!,T.incomingEnd) && t<waveEnd && sparkFade(t,T.outgoingStart)>0)
      cursorSpark(c,undefined,w.sparks,t,tb=>({...wavePath(tb),h:24}),
        {on:NIGHT ? 'ink' : 'paper',from:Math.max(T.triggers[0]!,T.incomingEnd),to:waveEnd,end:T.outgoingStart,seed:16});
    if (t>=T.incomingEnd && sparkFade(t,T.outgoingStart)>0) for(let i=0;i<s.cards.length-1;i++) {
      const a=s.cards[i]!.front[1]!, b=s.cards[i+1]!.front[0]!;
      heatTrail(w.sparks,t,tb=>{
        const k=span(tb,T.triggers[i]!,T.triggers[i+1]!),q=1-k;
        return {x:q*q*(a.x+2)+2*q*k*(a.x+b.x)/2+k*k*(b.x-4),
          y:q*q*(a.y-24)+2*q*k*(Math.min(a.y,b.y)-55)+k*k*(b.y-28)};
      },{from:T.triggers[i]!,to:T.triggers[i+1]!,width:1.3,alpha:sparkFade(t,T.outgoingStart)});
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
        w: card.face.w * 0.78, h: TYPE_LEVELS.lyric }, form.stress ? 'clay' : NIGHT ? 'paper' : 'ink', 100 + card.i,
        presence * Math.min(1, form.born * 1.6), heatColor(form.stress ? 'clay' : NIGHT ? 'paper' : 'ink', NIGHT ? 'ink' : 'paper', form.age)); c.restore();
    }

    // Numeric words belong to the faces; GREEN is the headline. Connecting words are typed into
    // the reference's upper-right registration field, a letter at a time (stage 9 ②), and each new
    // one feeds the field up a row like a ticker, carrying the older ones out of its top edge.
    // Only S16's own lines (R1: the previous line's held "free" is finished by drawFree below).
    { const joins = this.ctx.lyrics.lines.filter(l => l.start >= T.start - 0.05 && l.start < T.end)
        .flatMap(l => l.words).filter(wd => !/^(green\W*|one|two\W*|three|nineteen)$/i.test(wd.w) && wd.start <= t);
      if (joins.length) {
        c.save(); c.beginPath(); c.rect(1531, 0, 389, 277); c.clip();
        joins.forEach((wd, k) => {
          // rows above the newest, fed up by the newest word's onset
          let y = 205;
          for (let j = k + 1; j < joins.length; j++) y -= 110 * land(t, joins[j]!.start, 0.1);
          const fin = inscribe([{ ...v.form(wd, wd.end), born: 1, age: 0 }], 92), form = v.form(wd, t);
          drawInscription(c, { ...fin, glyphs: fin.glyphs.map(g => ({ ...g, form })) }, t,
            { on: NIGHT ? 'ink' : 'paper', head: 'type', place: (_g, x) => affine(1570 + x, y), seed: 160 + k });
        });
        c.restore();
      } }
    // C15 (R2): "free" is still sung for 0.24 s after the cut; finish it where S15 left it.
    const free = v.line('Snip the extra line and set October free').words.at(-1)!;
    if (t < free.end + 0.12) drawFree(c, v.form(free, t), this.ctx.audio, t, w.f15, NIGHT ? 'ink' : 'paper');

    const cl = s.clawd;
    Clawd.draw(c, cl.x, cl.y, Clawd.pose('A7', { beat: f.beat, beat0: 0, p: 0 }), { px: cl.px });
    c.strokeStyle = css(NIGHT ? 'paper' : 'ink', NIGHT ? 0.35 : 0.6); c.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      c.beginPath(); c.moveTo(1515 + i * 18, 448); c.lineTo(1515 + i * 18, 492 + (i % 3) * 25); c.stroke();
    }
    const final = v.form(T.nineteen, t);
    if (final.born > 0) {
      odometer(c, 18 + final.sung, 1570, 500, 92, { digits: 2, color: final.stress ? 'clay' : 'pass', on: NIGHT ? 'ink' : 'paper', age: final.age, pitch: 51 });
      c.font = font(F.mono(500), 20); c.fillStyle = css('pass', 0.6); c.fillText('/19 passed', 1675, 499);
      drawCursor(c, { x: 1808, y: 500, h: 24 });
    } else {
      c.font = font(F.mono(500), 20); c.fillStyle = css('pass', 0.6);
      c.fillText(`${s.passed}/19 passed`, 1570, 500); drawCursor(c, { x: 1808, y: 500, h: 24 });
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    if (NIGHT) w.chroma.composite(this.ctx.renderer, w.layer.texture, out, 0.55);
    else w.print.render(this.ctx.renderer, out);
    w.lens.film(this.ctx.renderer, finalOut, lens);
    return NIGHT ? { ...postFor('ink'), hud: 0, frame: 0, vignette: 0.35, ca: 0.6 } : { ...postFor('paper'), hud: 0, frame: 0, grain: 0.035 };
  }
}
