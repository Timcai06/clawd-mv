// S05 — front-elevation code ledges, three blueprint strata and a cropped filename.
// The sung line is a line of source on the walk level (stage 9 ②): its letters are the ledge Clawd
// walks, the read cursor's underline develops them letter by letter, and they scroll out with the
// platform. No predicted (unborn) letters are painted.
import * as THREE from 'three';
import { drawNote } from '../kit/note';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { css, lin } from '../theme';
import { GlowLayer, postFor } from '../kit/ground';
import { glowDraw, Voice } from '../kit/lyric-moves';
import { affine, drawInscription, headX, inscribe, fitWidth, type Inscription } from '../kit/inscribe';
import { varRun } from '../kit/vartype';
import { HANDOFF } from '../kit/handoff';
import { afterBeats, hitAfter, span } from '../kit/time';
import { impact } from '../kit/impact';
import { ease, lerp } from '../engine/util';
import { drawCursor } from '../kit/cursor';
import * as Clawd from '../kit/clawd';
import { cam05, handoffOut, platformLayout, platformTimes, READ_LINE, SOURCE_LEDGES, type PlatformTimes } from './parts/s05-platform-model';
import { applyCam2 } from '../kit/handoff';
import { hatchBlock, printRun } from './parts/s05-print';

export const TYPE_LEVELS = { giant: 320, lyric: 56, label: 18 }; // cap heights; source labels are 18px Mono
const PRINT = /* glsl */ `
uniform vec3 ink, paper;
uniform float pan;
void main() {
  vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  float dots = step(0.91, hash12(floor((p + vec2(pan, 0.0)) / 12.0)))
    * (1.0 - smoothstep(0.8, 1.5, length(mod(p,12.0)-6.0)));
  float fibre = hash12(floor(p * vec2(1.0, 0.22)));
  fragColor = vec4(mix(ink, paper, dots * 0.12 + fibre * 0.016), 1.0);
}`;

class PlatformWorld {
  glow = new GlowLayer();
  users = 0;
  text = new Layer2D();
  bg = new FSPass(PRINT, { ink: { value: new THREE.Vector3(...lin('ink')) }, paper: { value: new THREE.Vector3(...lin('paper')) }, pan: { value: 0 } });
  times: PlatformTimes;
  voice: Voice;
  private read?: { ins: Inscription; sc: number };
  constructor(ctx: SceneCtx) { this.times = platformTimes(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio); }
  /** The read line laid out once, each word in the shape it ends with (nothing reflows as it reads). */
  readLine(ctx: SceneCtx) {
    if (!this.read) {
      const line = ctx.lyrics.get('So I crack my claws and read it all over');
      const ins = inscribe(line.words.map((w) => ({ ...this.voice.form(w, w.end), age: 0, born: 1 })), READ_LINE.size, { space: 0.22 });
      this.read = { ins, sc: fitWidth(ins, READ_LINE.measure) };
    }
    return this.read;
  }
  dispose() { this.glow.dispose(); this.text.texture.dispose(); this.bg.mat.dispose(); }
}
let world: PlatformWorld | undefined;

export default class S05Platform extends Scene {
  private w!: PlatformWorld;
  override init() { this.w = world ??= new PlatformWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  private tree(c: CanvasRenderingContext2D, x: number, y: number, scale: number, alpha: number) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    c.strokeStyle = css('paper', alpha); c.lineWidth = 2; c.fillStyle = css('paper', alpha);
    c.beginPath(); c.moveTo(-55, -80); c.lineTo(-55, 290);
    c.moveTo(-55, 22); c.lineTo(0, 22); c.moveTo(36, 52); c.lineTo(36, 124); c.lineTo(86,124);
    c.moveTo(122,155); c.lineTo(122,232); c.lineTo(168,232); c.stroke();
    for (let i = 0; i < 3; i++) {
      const xx = i * 86, yy = i * 108;
      c.beginPath(); c.moveTo(xx,yy+48); c.lineTo(xx,yy); c.lineTo(xx+23,yy); c.lineTo(xx+33,yy+11);
      c.lineTo(xx+66,yy+11); c.lineTo(xx+66,yy+48); c.closePath(); c.stroke();
      // File-tree names are intrinsic machine lettering (the storyboard exception).
      c.font = font(F.mono(i === 2 ? 700 : 400), i === 2 ? 70 : 54);
      c.fillText(['src','calendar','month.ts'][i]!,xx+100,yy+48);
    }
    c.restore();
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio;
    const s = platformLayout(au, f.t, T), c = w.text.ctx;
    w.text.clear(); w.glow.clear();
    // v4 motion: arrive pushed in on Clawd (continuing S04's push), pull out over the first beat;
    // a punch on "claws"; the last beat pushes in on the read line (the strike S06 picks up).
    const lw = this.ctx.lyrics.get('crack my claws').words, kw = (q: RegExp) => lw.find((x) => q.test(x.w))!;
    const claws = kw(/claws/i), crack = kw(/crack/i), all = kw(/^all$/i), over = kw(/over/i);
    // The read line (laid out once); its scan head is where "read" points the camera.
    const R = w.readLine(this.ctx), line = w.voice.line('So I crack my claws and read it all over');
    const lx = READ_LINE.x - s.offset, base = READ_LINE.top + R.ins.capH;
    const reveal = headX(R.ins, f.t, R.sc);
    c.save(); applyCam2(c, cam05(au, this.ctx.lyrics, f.t, T, { x: lx + reveal, y: base - R.ins.capH / 2 }));
    // Stage 9 ③ "all over": a clay scan line sweeps the whole frame left to right; what it passes
    // has been read (the code lines get a clay underline once the sweep has crossed their start).
    const sweepK = ease.outCubic(span(f.t, all.start, over.start + 0.06)), sweepX = lerp(-60, 1980, sweepK);
    const readAt = (x: number) => f.t >= all.start && sweepX > x;
    this.tree(c, 1130 - s.offset * 0.18, 55, 1, 0.6);
    this.tree(c, 180 - s.offset * 0.22, 75, 0.43, 0.2);
    this.tree(c, 660 - s.offset * 0.55, 288, 0.43, 0.25);
    hatchBlock(c,{x:0,y:208,w:120,h:174},0.28);
    hatchBlock(c,{x:938-s.offset*0.22,y:361,w:202,h:107},0.24);
    hatchBlock(c,{x:1760,y:0,w:160,h:210},0.45);
    for (const [i, b] of s.ledges.entries()) {
      if (SOURCE_LEDGES[i]!.y === READ_LINE.top) continue; // the read line's letters are this ledge
      c.strokeStyle = css('paper', b.depth === 1 ? 0.6 : 0.4); c.lineWidth = b.depth === 1 ? 2 : 1;
      c.beginPath(); c.moveTo(b.x,b.y); c.lineTo(b.x+b.w,b.y); c.lineTo(b.x+b.w,b.y+b.h);
      c.lineTo(b.x,b.y+b.h); c.stroke();
      hatchBlock(c, {x:b.x,y:b.y+5,w:b.depth===1?240:b.w,h:b.h-8},b.depth*0.45, b.depth===1?16:7);
    }
    c.font=font(F.mono(400),18); c.fillStyle=css('paper',0.55);
    const code: [string, number, number][] = [["import { calendar } from './calendar';",5-s.offset*0.22,457],['export function month(date: Date) {',170-s.offset*0.55,548]];
    for (const [text, x, y] of code) {
      c.fillStyle = css('paper', readAt(x) ? 0.95 : 0.55); c.fillText(text, x, y);
      if (readAt(x)) { c.fillStyle = css('clay'); c.fillRect(x, y + 6, Math.min(c.measureText(text).width, sweepX - x), 2); }
    }
    // S05 owns one line since the cuts sit between lines (R1); "Read the code" belongs to S06.
    // The line is source: a line number in the gutter, letters standing on the walk level (cap tops
    // on READ_LINE.top), developed by the read cursor's scan head and its clay underline.
    c.font = font(F.mono(400), 18); c.fillStyle = css('paper', 0.45); c.textAlign = 'right';
    c.fillText('36', lx - 34, base); c.textAlign = 'left';
    const live: Inscription = { ...R.ins, glyphs: R.ins.glyphs.map((g) => ({ ...g, form: w.voice.form(line.words[g.wi]!, f.t) })) };
    // "claws" jolts the line: every letter is knocked up and drops back (the claws hit the ledge).
    const jolt = -10 * hitAfter(f.t, claws.start, 0.07);
    drawInscription(c, live, f.t, { on: 'ink', head: 'scan', reveal, scale: R.sc, place: (_g, x) => affine(lx + x, base + jolt), glow: w.glow.ctx });
    // Clawd walks the line: after the hand-off beat he rides the word being sung (the pdoom
    // spark-on-the-curve method), hopping onto each new word, feet on its cap tops.
    const word = (wi: number) => { const g = R.ins.glyphs.filter((h) => h.wi === wi); return { x: g[0]!.x * R.sc, w: (g.at(-1)!.x + g.at(-1)!.adv - g[0]!.x) * R.sc }; };
    let rider={...s.clawd};
    const cur = R.ins.glyphs.filter((g) => f.t >= g.t).at(-1)?.wi;
    if (cur !== undefined && f.t > afterBeats(au, T.start, 1)) {
      const fc = w.voice.form(line.words[cur]!, f.t), a = word(Math.max(0, cur - 1)), b2 = word(cur);
      const k=ease.inOutCubic(span(f.t, fc.t0, fc.t0+0.12));
      const xa=lx+a.x+a.w*0.5, xb=lx+b2.x+b2.w*Math.min(1,fc.sung);
      const k1=ease.inOutCubic(span(f.t, afterBeats(au, T.start, 1), afterBeats(au, T.start, 1.6)));
      rider.x=lerp(rider.x, lerp(xa,xb,k)-8*rider.px, k1);
      rider.y=lerp(rider.y, READ_LINE.top-5*rider.px-26*Math.sin(Math.PI*k), k1);
    }
    // The canonical sprite is kept flat, including at the S04 match cut.
    // "crack": the right claw reaches out and snaps back (A10) and the tip sparks; "claws": both up.
    const armsUp=f.t>=claws.start && f.t<claws.start+0.32, cracking = f.t >= crack.start && f.t < claws.start;
    const pose=Clawd.pose(armsUp?'A7':cracking?'A10':'A5',{beat:f.beat,beat0:au.beatAt(cracking?crack.start:T.start),p:0,travel:0});
    Clawd.draw(c,rider.x,rider.y,pose,{px:rider.px});
    { const k = span(f.t, crack.start, crack.start + 0.28), tip = { x: rider.x + 16.5 * rider.px, y: rider.y + 1.5 * rider.px };
      if (k > 0 && k < 1) for (let i = 0; i < 4; i++) {
        const a = -1.0 + i * 0.6, d = 24 + 150 * ease.outCubic(k), sz = rider.px * (1 - k) + 2;
        c.fillStyle = css('clay'); c.fillRect(tip.x + Math.cos(a) * d - sz / 2, tip.y + Math.sin(a) * d - sz / 2, sz, sz);
      }
      const r = span(f.t, claws.start, claws.start + 0.45); // the claws' shock ring
      if (r > 0 && r < 1) {
        c.strokeStyle = css('paper', 0.7 * (1 - r)); c.lineWidth = 3 * (1 - r) + 1; c.beginPath();
        c.arc(rider.x + 8 * rider.px, rider.y + 2.5 * rider.px, 60 + 320 * ease.outExpo(r), 0, Math.PI * 2); c.stroke();
      } }
    glowDraw(c, w.glow.ctx, g => Clawd.draw(g, rider.x, rider.y, { ...pose, cells: pose.cells.filter(cell => cell.k === 'O') }, { px: rider.px, alpha: 0.25 }));
    const strike=handoffOut(f.t,au,T,{x0:lx,x1:lx+reveal+10,y:base+READ_LINE.under});
    c.strokeStyle=css('clay'); c.lineWidth=2;
    c.beginPath(); c.moveTo(strike.x0,strike.y); c.lineTo(strike.x1,strike.y); c.stroke();
    glowDraw(c, w.glow.ctx, g => { g.strokeStyle = css('clay'); g.lineWidth = 2; g.beginPath(); g.moveTo(strike.x0, strike.y); g.lineTo(strike.x1, strike.y); g.stroke(); });
    // Filename is machine text, a documented giant-type exception, not a sung word.
    c.fillStyle=css('paper',0.6);
    printRun(c,varRun('month.ts',430,{wdth:100,wght:900}),s.title);
    drawNote(c,{ax:s.title.x+s.title.w*0.93,ay:s.title.y+30,x:s.title.x+s.title.w*0.93+40,y:s.title.y-36,text:'48 lines',sub:'1 of them wrong',t0:T.read+0.2,on:'ink'},f.t);
    // The read cursor sits on the scan head and folds away into the underline over the last beat.
    const exit=span(f.t,afterBeats(au,T.end,-1),T.end), rc={x:lx+reveal+4,y:base,h:R.ins.capH*(1-exit),on:1};
    drawCursor(c,rc);
    glowDraw(c, w.glow.ctx, g => drawCursor(g, rc));
    // the sweep itself, and where it stops: a deadpan look at the function S15 will fix
    if (sweepK > 0 && sweepK < 1) {
      c.fillStyle = css('paper', 0.07); c.fillRect(sweepX - 180, -200, 180, 1500);
      c.fillStyle = css('clay'); c.fillRect(sweepX - 1, -200, 3, 1500);
      glowDraw(c, w.glow.ctx, g => { g.fillStyle = css('clay'); g.fillRect(sweepX - 1, -200, 3, 1500); });
    }
    { const [text, x, y] = code[1]!; c.font = font(F.mono(400), 18);
      drawNote(c, { ax: x + c.measureText(text).width + 8, ay: y - 6, x: x + c.measureText(text).width + 60, y: y - 34, text: '// line 42', sub: 'looks fine', t0: over.start, on: 'ink' }, f.t); }
    // The incoming platform starts directly below the shared Clawd rectangle.
    const entry=1-span(f.t,T.start,afterBeats(au,T.start,1));
    if(entry>0) { c.fillStyle=css('paper',0.5*entry); c.fillRect(HANDOFF.clawd04.x-30,HANDOFF.clawd04.y+30,180,1); }
    c.restore();
    w.bg.u.pan!.value=s.offset; w.bg.render(this.ctx.renderer,out);
    this.ctx.comp.draw(this.ctx.renderer,w.text.upload(),out);
    w.glow.composite(this.ctx, out, 1.6);
    const shake = impact(f.t, [{ t: crack.start, shake: 3, half: 0.05 }, { t: claws.start, shake: 7, kick: 0.02 }], T.end).shake;
    return {...postFor('ink'),hud:0,frame:0,ca:0.6,grain:0.022,vignette:0,shake};
  }
}
