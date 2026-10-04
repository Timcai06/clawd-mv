import { SparkLines, cursorSpark, heatTrail, sparkFade } from '../kit/spark';
import { drawNote } from '../kit/note';
import { PrintOverlay } from '../kit/print-overlay';
// S15 — v5: the ≤ as a raymarched, engraved solid (parts/s15-world.ts); a forty-two counter; a carved cut.
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
import { drawInscription, inscribe } from '../kit/inscribe';
import { fillRun, varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { resolveFTimes, type FTimes } from './parts/s15-f-timing';
import { Lens } from '../kit/lens';
import { RaymarchPass } from '../kit/raymarch';
import { Rig, planeAffine, p3, type P3 } from '../kit/rig';
import { MONTH_SOURCE } from '../kit/content';
import { VoxelClawd } from '../kit/clawd3d';
import { lin } from '../theme';
import { S15_GLSL, BAR_C, BAR_H, TIP, UPPER_END, LOWER_END, BEAM_HW, DEPTH_HZ, CUT_X, CLAWD_AT, CLAWD_VOX, barPose, cameraAt, onBar } from './parts/s15-world';
import { TYPE_LEVELS as PRINT_LEVELS, LYRIC_SIZE, drawFree, handoffIn, monumentState } from './parts/s15-layout';
export const TYPE_LEVELS = { ...PRINT_LEVELS };
const CODE = 'for (let d = 0; d <= days; d++) {';
// Stage 9 ③ (docs/reference/event-tables.md "S15"): the file is searched. From the cut the source
// scrolls fast through month.ts, brakes on "is," with line 42 on the code row; the found line grows
// from the file's size to the specimen's; "on" pops the gutter's 42 in clay; "line" underlines it.
const FILE_SIZE = 24, FILE_LH = 34;
const fileLine = (n: number) => (n === 42 ? CODE : MONTH_SOURCE[(n * 7) % MONTH_SOURCE.length]!);

// v5: the ≤ is a raymarched solid lit by one key light and turned into engraving (pdoom's
// light-to-line method); the snip lights the cut with a clay flash. Ground: engraved strokes that
// thicken in the solid's cast shadow.
const S15_SHADE = /* glsl */ `
${S15_GLSL}
uniform vec3 paperC, inkC, clayC, bgC; uniform float paperMode, flashK; uniform vec3 cutPos;
vec3 background(vec3 rd, vec2 px) { return bgC * (1.0 + 0.08 * (1.0 - clamp(px.y / 540.0 * 0.5 + 0.5, 0.0, 1.0))); }
vec3 shade(vec3 p, vec3 n, vec3 rd, float id, float t) {
  vec3 L = normalize(vec3(-0.38, 0.9, 0.22));
  float sh = softShadow(p + n * 0.02, L, 10.0);
  float occ = ao(p, n);
  float dif = max(dot(n, L), 0.0) * sh;
  vec3 col;
  vec3 lineC = paperMode > 0.5 ? inkC : paperC;
  if (id < 0.5) {
    // ground: horizontal burin strokes, broken, thick in the cast shadow and under the solid
    float shade = clamp((1.0 - sh) * 0.8 + (1.0 - occ) * 0.9, 0.0, 1.0);
    float u = p.z * 5.5 + 0.35 * sin(p.x * 0.6) + 0.15 * snoise(p.xz * 0.8);
    float brk = step(0.35, snoise(vec2(p.x * 0.9, floor(u) * 3.1)));
    float cov = hatch(u, 0.04 + 0.55 * shade) * mix(0.35, 1.0, brk);
    float fade = exp(-max(0.0, length(p.xz - vec2(0.5, 0.0)) - 9.0) / 7.0);
    col = mix(bgC, lineC, cov * 0.75 * fade);
  } else {
    float tone = 0.04 + 0.96 * pow(dif, 0.85) * mix(0.55, 1.0, occ);
    float cov = engraveTone(faceU(p / scale, n, 9.0, 0.62), tone);
    col = mix(paperC, inkC, cov * 0.93);
  }
  // the snip: a clay flash at the cut lights everything near it
  vec3 dl = cutPos - p; float d2 = dot(dl, dl);
  col += clayC * flashK * max(dot(n, normalize(dl)), 0.0) * 6.0 / (1.0 + 3.0 * d2);
  float fog = 1.0 - exp(-max(0.0, t - 26.0) / 30.0);
  return mix(col, bgC, fog);
}`;

class World {
  sparks = new SparkLines();
  glow = new GlowLayer();
  print = new PrintOverlay();
  users = 0;
  T: FTimes;
  voice: Voice;
  ground = new Ground();
  layer = new Layer2D();
  lens = new Lens();
  shadow = new Layer2D();
  rig = new Rig();
  rm = new RaymarchPass(S15_SHADE, {
    barT: { value: new THREE.Vector3() }, barRoll: { value: 0 }, gap: { value: 0 }, scale: { value: 1 },
    paperC: { value: new THREE.Vector3(...lin('paper')) }, inkC: { value: new THREE.Vector3(...lin('ink')) },
    clayC: { value: new THREE.Vector3(...lin('clay')) }, bgC: { value: new THREE.Vector3(...lin('ink')) },
    paperMode: { value: 0 }, flashK: { value: 0 }, cutPos: { value: new THREE.Vector3() },
  });
  clawd = new VoxelClawd();
  clawdScene = new THREE.Scene();
  constructor(ctx: SceneCtx) {
    this.T = resolveFTimes(ctx); this.voice = new Voice(ctx.lyrics, ctx.audio);
    this.clawd.mesh.scale.setScalar(CLAWD_VOX); this.clawdScene.add(this.clawd.mesh);
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
  dispose() { this.rm.dispose(); this.clawd.dispose(); this.sparks.dispose(); this.glow.dispose(); this.print.dispose(); this.lens.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); this.shadow.texture.dispose(); }
}
let world: World | undefined;

export default class S15Line42 extends Scene {
  private w!: World;
  private tNow = 0;
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
      // a slow push, then (from "forty-two") a dive into the "<=" — at the bottom of the dive it is
      // the solid, whose camera is born close on the tip of the "<"
      const g = this.leGlyph(), E = this.found();
      // stage 9 ③: a key per keyword (snap, hold) instead of the slow push, then the dive
      let k = { zoom: 1, x: 960, y: 540, rot: 0 };
      for (const n of [{ t: E.is, zoom: 1.08, x: 900, y: 640, rot: -0.006 }, { t: E.line, zoom: 1.14, x: 760, y: 650, rot: -0.012 }]) {
        const e = ease.outExpo(span(t, n.t - 0.02, n.t + 0.2));
        if (e <= 0) break;
        k = { zoom: lerp(k.zoom, n.zoom, e), x: lerp(k.x, n.x, e), y: lerp(k.y, n.y, e), rot: lerp(k.rot, n.rot, e) };
      }
      const kick = 1 + 0.04 * (t >= E.is ? Math.pow(0.5, (t - E.is) / 0.07) : 0) + 0.03 * (t >= E.on ? Math.pow(0.5, (t - E.on) / 0.07) : 0);
      const dive = ease.inExpo(span(t, T.fortyTwo + 0.2, T.s15[2]!));
      const fx = lerp(k.x, g.cx - g.w * 0.25, Math.min(1, dive * 3));
      const fy = lerp(k.y, g.cy, Math.min(1, dive * 3));
      return { zoom: k.zoom * kick * Math.pow(26, dive), fx, fy, ax: 960, ay: 540, rot: k.rot + 0.05 * dive };
    }
    // from the solid on, the camera is the 3D camera (parts/s15-world.ts cameraAt); a snip hit only
    const hit = t >= T.snip ? Math.pow(0.5, (t - T.snip) / 0.09) : 0;
    void s16;
    return { zoom: 1 + 0.05 * hit, fx: 960, fy: 540, ax: 960, ay: 540, rot: 0.012 * hit };
  }

  override render(f: Frame, finalOut: THREE.WebGLRenderTarget) {
    const out = this.w.lens.rt;
    const w = this.w, T = w.T, t = f.t, audio = this.ctx.audio;
    this.tNow = t;
    const s = monumentState(audio, t, T), kind = s.paper ? 'paper' : 'ink';
    const specimen = t >= Math.min(T.s15[2]!, T.less);
    w.layer.clear(); w.glow.clear(); const c = w.layer.ctx;
    if (specimen) this.solid(f, out, s.paper);
    else {
      w.ground.render(this.ctx.renderer, out, { kind, t, grid: 0.16, haze: 0, streaks: 0, halftone: 0, kick: f.a.kick * 0.15 });
      this.source(c);
    }
    if (s.piece.visible) this.piece(c, s.piece, s.paper);
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
    const cutScreenX = specimen ? (w.rig.proj(CUT_X, BAR_C.y, BAR_H.z)?.x ?? 960) : 960;
    if (t >= T.snip && t < snipEnd + 0.4) {
      const path = (tb: number) => ({ x: lerp(rule.x0, rule.x1, span(tb,T.snip,snipEnd)), y: rule.y });
      heatTrail(w.sparks,t,path,{from:T.snip,to:snipEnd,width:1,cold:sparkFade(t,T.s16[0]!)===0});
    }
    const at = (tb: number) => tb >= T.snip && tb < snipEnd
      ? { x: lerp(rule.x0,rule.x1,span(tb,T.snip,snipEnd)), y: rule.y, h:25, w:12 }
      : { x:760,y:1032,h:25,w:12 };
    cursorSpark(c, s.paper ? undefined : w.glow.ctx, w.sparks,t,at,
      {on:kind,from:T.snip,to:snipEnd,end:T.s16[0]!,seed:15,
        // most sparks where the cursor crosses the cut in the stone (the 3D cut point, projected)
        boost:tb=>60*Math.exp(-(((lerp(rule.x0,rule.x1,span(tb,T.snip,snipEnd))-cutScreenX)/70)**2))});
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.sparks.finish(this.ctx, out);
    if (!s.paper) w.glow.composite(this.ctx, out, 2.0);
    else w.print.render(this.ctx.renderer, out);
    w.lens.film(this.ctx.renderer, finalOut, this.lensView(t));
    const flash = t < T.snip ? 0 : 0.86 * (1 - ease.outExpo(span(t, T.snip, afterBeats(audio, T.snip, 0.24))));
    return { ...postFor(kind), hud: 0, frame: 0, paper: s.paper ? 1 : 0, ca: s.paper ? 0 : 0.6,
      vignette: 0, grain: 0.035, flash, shake: [0, 0] as [number, number] };
  }

  /** The raymarched ≤ and the voxel Clawd on the bar. */
  private solid(f: Frame, out: THREE.WebGLRenderTarget, paper: boolean) {
    const w = this.w, T = w.T, t = f.t, audio = this.ctx.audio, r = this.ctx.renderer;
    const cam = cameraAt(audio, t, T);
    w.rig.set(cam); w.rm.setCam(cam);
    const b = barPose(audio, t, T), u = w.rm.u;
    (u.barT!.value as THREE.Vector3).set(b.t.x, b.t.y, b.t.z); u.barRoll!.value = b.roll; u.gap!.value = b.gap;
    (u.bgC!.value as THREE.Vector3).set(...lin(paper ? 'paper' : 'ink'));
    u.paperMode!.value = paper ? 1 : 0;
    u.flashK!.value = t >= T.snip ? Math.pow(0.5, (t - T.snip) / 0.12) : 0;
    const cut = onBar(b, p3(CUT_X, BAR_C.y + BAR_H.y, 0.3));
    (u.cutPos!.value as THREE.Vector3).set(cut.x, cut.y + 0.4, cut.z + 0.6);
    (u.outlineC!.value as THREE.Vector3).set(...lin(paper ? 'ink' : 'paper')); u.outlineW!.value = paper ? 1.6 : 1.2;
    w.rm.render(r, out);
    // Clawd stands on the bar left of the cut; snipping from the cut until October
    const cutting = t >= T.snip && t < T.s15[5]!;
    const pose = Clawd.pose(cutting ? 'A10' : 'A3', { beat: cutting ? 1 / 3 : audio.beatAt(t), beat0: 0, p: 0, reach: 3, travel: 0 });
    const at = onBar(b, CLAWD_AT);
    w.clawd.update(pose);
    w.clawd.mesh.position.set(at.x, at.y, at.z); w.clawd.mesh.rotation.set(-b.roll, -0.15, 0);
    w.clawd.light([-0.38, 0.9, 0.22], 0.45, 0.6 * (t >= T.snip ? Math.pow(0.5, (t - T.snip) / 0.12) : 0));
    r.setRenderTarget(out); r.clearDepth(); r.render(w.clawdScene, w.rig.cam);
  }

  /** Canvas text laid on a face of the solid: ux along the stroke, uy down the face (pdoom planeAffine). */
  private faceWord(c: CanvasRenderingContext2D, form: WordForm, at: P3, ux: P3, uy: P3, capH: number, on: 'paper' | 'ink', presence: number) {
    if (form.born <= 0) return;
    // Stage 9 ②: carved a letter at a time while the word is sung, in the shape the word ends with.
    const fin = inscribe([{ ...this.w.voice.form(form.word, form.word.end), text: form.text.replace(/[“”"]/g, ''), born: 1, age: 0 }], 100);
    const A = planeAffine(this.w.rig, at, ux, uy, capH / fin.capH, 0, 0);
    if (!A) return;
    void on;
    drawInscription(c, { ...fin, glyphs: fin.glyphs.map((g) => ({ ...g, form })) }, this.tNow, { on: 'paper', head: 'scan', alpha: presence,
      place: (_g, x) => ({ ...A, e: A.a * x + A.e, f: A.b * x + A.f }) });
  }
  /** World width of a word carved at cap height `capH` (in its final shape). */
  private faceWidth(form: WordForm, capH: number) {
    const run = varRun(form.text.replace(/[“”"]/g, ''), 100, this.w.voice.form(form.word, form.word.end).axes);
    return run.width * capH / run.capH;
  }

  /** The cut stone that becomes S16's first domino (2D, last beat). */
  private piece(c: CanvasRenderingContext2D, q: { cx: number; cy: number; angle: number }, paper: boolean) {
    c.save(); c.translate(q.cx, q.cy); c.rotate(q.angle);
    c.fillStyle = css('paper'); c.fillRect(-35, -105, 70, 210);
    c.beginPath(); c.rect(-35, -105, 70, 210); c.clip();
    c.strokeStyle = css('ink', 0.85); c.lineWidth = 1.1;
    for (let i = -210; i < 120; i += 4) { c.beginPath(); c.moveTo(-35, i); c.lineTo(35, i + 46); c.stroke(); }
    c.restore();
    c.save(); c.translate(q.cx, q.cy); c.rotate(q.angle);
    c.strokeStyle = css(paper ? 'ink' : 'paper', 0.8); c.lineWidth = 1.2; c.strokeRect(-35, -105, 70, 210); c.restore();
  }

  /** The search's word times. */
  private found() {
    const wd = this.w.voice.line('There it is, on line forty-two').words;
    return { there: wd[0]!.start, is: wd[2]!.start, on: wd[3]!.start, line: wd[4]!.start };
  }
  /** Which file line sits on the code row (fractional): scrolling from line 1, braking onto 42 on "is,". */
  private scrollLine(t: number) {
    const T = this.w.T, E = this.found();
    const u = span(t, T.s15[0]!, E.is + 0.12);
    // fast through most of it, then a hard brake (outExpo) onto 42
    return lerp(1, 42, ease.outExpo(u) * 0.35 + 0.65 * ease.outCubic(u));
  }
  /** Where the "<=" of line 42 sits in the source panel (the camera dives into it). */
  private leGlyph() {
    const c = this.w.layer.ctx, size = 58, x0 = 128, y = 760;
    c.save(); c.font = font(F.mono(500), size);
    const pre = c.measureText(CODE.slice(0, CODE.indexOf('<='))).width, le = c.measureText('<=').width;
    c.restore();
    return { x0, y, size, cx: x0 + pre + le / 2, cy: y - size * 0.32, w: le };
  }

  private source(c: CanvasRenderingContext2D) {
    c.strokeStyle = css('paper', 0.35); c.lineWidth = 1;
    c.strokeRect(96, 225, 1728, 600);
    c.font = font(F.mono(500), TYPE_LEVELS.label); c.fillStyle = css('paper', 0.6);
    c.fillText('src/calendar/month.ts:42', 120, 268);
    c.fillRect(120, 294, 1680, 1);
    const T = this.w.T, t = this.tNow, g = this.leGlyph(), E = this.found();
    const lit = t >= T.fortyTwo ? 1 : 0;
    // the file scrolling past behind the lyric (dim Mono, with its gutter)
    const L = this.scrollLine(t), grow = ease.outExpo(span(t, E.is + 0.06, E.is + 0.26));
    c.save(); c.beginPath(); c.rect(96, 300, 1728, 525); c.clip();
    c.font = font(F.mono(400), FILE_SIZE);
    for (let n = Math.floor(L) - 16; n <= Math.floor(L) + 3; n++) {
      if (n < 1 || (n >= 42 && grow > 0)) continue;
      // once found, the rest of the file steps back
      const y = g.y - (L - n) * FILE_LH, dim = lerp(1, 0.55, grow);
      c.fillStyle = css('paper', (n === 42 ? 0.6 : 0.22) * dim); c.fillText(fileLine(n), g.x0, y);
      c.fillStyle = css('paper', 0.18 * dim); c.fillText(String(n).padStart(2, ' '), g.x0 - 64, y);
    }
    c.restore();
    if (grow <= 0) return;
    // "on": the gutter's 42 pops in clay; "line": the found line is underlined
    const pop = t >= E.on ? 1 + 0.8 * Math.pow(0.5, (t - E.on) / 0.06) : 0;
    if (pop > 0) {
      c.save(); c.translate(g.x0 - 40, g.y - 6); c.scale(pop, pop); c.font = font(F.mono(600), 26); c.fillStyle = css('clay'); c.textAlign = 'right'; c.fillText('42', 0, 0); c.restore();
      glowDraw(c, this.w.glow.ctx, gg => { gg.font = font(F.mono(600), 26); gg.fillStyle = css('clay'); gg.textAlign = 'right'; gg.fillText('42', g.x0 - 40, g.y - 6); gg.textAlign = 'left'; });
    } else { c.font = font(F.mono(500), 18); c.fillStyle = css('paper', 0.4); c.fillText('42', g.x0 - 52, g.y - 6); }
    if (t >= E.line) {
      const u = ease.outExpo(span(t, E.line, E.line + 0.22));
      c.fillStyle = css('clay'); c.fillRect(g.x0, g.y + 16, (1824 - 96 - 64) * u, 4);
    }
    // the found line grows from the file's size to the specimen's
    c.save(); c.translate(g.x0, g.y); const sc = lerp(FILE_SIZE / g.size, 1, grow); c.scale(sc, sc); c.translate(-g.x0, -g.y);
    c.font = font(F.mono(500), g.size);
    const i = CODE.indexOf('<=');
    c.fillStyle = css('paper', 0.82); c.fillText(CODE.slice(0, i), g.x0, g.y);
    c.fillStyle = lit ? heatColor('clay', 'ink', t - T.fortyTwo) : css('paper', 0.82);
    c.fillText('<=', g.x0 + c.measureText(CODE.slice(0, i)).width, g.y);
    c.fillStyle = css('paper', 0.82); c.fillText(CODE.slice(i + 2), g.x0 + c.measureText(CODE.slice(0, i + 2)).width, g.y);
    if (lit) glowDraw(c, this.w.glow.ctx, gg => { gg.font = c.font; gg.fillStyle = css('clay'); gg.fillText('<=', g.x0 + c.measureText(CODE.slice(0, i)).width, g.y); });
    c.restore();
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
      // carved into the solid's front faces (z = +depth): "Less" up the upper stroke, "than" down the
      // lower one, "or" and "equal" along the bar — they turn and foreshorten with the camera
      const dir = (a: P3, e: P3) => { const dx = e.x - a.x, dy = e.y - a.y, L = Math.hypot(dx, dy); return p3(dx / L, dy / L, 0); };
      const du = dir(TIP, UPPER_END), dl = dir(TIP, LOWER_END);
      const cap = 0.62, zf = DEPTH_HZ + 0.005;
      const along = (a: P3, d: P3, s: number) => p3(a.x + d.x * s - d.y * -cap * 0.5, a.y + d.y * s + d.x * -cap * 0.5, zf);
      const down = (d: P3) => p3(d.y, -d.x, 0);
      const b = barPose(audio, t, T);
      const barFace = (x: number) => onBar(b, p3(x, BAR_C.y - cap * 0.5, BAR_H.z + 0.005));
      const barUx = onBar(b, p3(1, 0, 0)), barO = onBar(b, p3(0, 0, 0));
      const bx = p3(barUx.x - barO.x, barUx.y - barO.y, barUx.z - barO.z);
      const by0 = onBar(b, p3(0, -1, 0)), by = p3(by0.x - barO.x, by0.y - barO.y, by0.z - barO.z);
      const places: [P3, P3, P3][] = [
        [along(TIP, du, 3.2), du, down(du)],
        [along(TIP, dl, 3.6), dl, down(dl)],
        [barFace(BAR_C.x - BAR_H.x + 1.2), bx, by],
        [barFace(CUT_X + 1.6), bx, by],
      ];
      void BEAM_HW;
      forms.slice(0, 4).forEach((form, i) => { const [at, ux, uy] = places[i]!; this.faceWord(c, form, at, ux, uy, cap, 'paper', presence); });
      forms.slice(4).forEach((form, i) => this.word(c, form, 110, 290 + i * 120, 'ink', 0, presence));
      return;
    }
    if (line.i === v.line('Snip the extra line and set October free').i) {
      // Stage 9 ②: "Snip the extra line" is carved along the extra line itself, on the stone right of
      // the snip, so it falls away with it; "and set October" runs down the lower stroke that stays.
      const cap = 0.62, b = barPose(audio, t, T);
      const barUx = onBar(b, p3(1, 0, 0)), barO = onBar(b, p3(0, 0, 0)), by0 = onBar(b, p3(0, -1, 0));
      const bx = p3(barUx.x - barO.x, barUx.y - barO.y, barUx.z - barO.z), by = p3(by0.x - barO.x, by0.y - barO.y, by0.z - barO.z);
      let x = CUT_X + 0.45;
      forms.slice(0, 4).forEach((form) => {
        this.faceWord(c, form, onBar(b, p3(x, BAR_C.y - cap * 0.5, BAR_H.z + 0.005)), bx, by, cap, 'paper', presence);
        x += this.faceWidth(form, cap) + cap * 0.32;
      });
      const dl = (() => { const dx = LOWER_END.x - TIP.x, dy = LOWER_END.y - TIP.y, L = Math.hypot(dx, dy); return p3(dx / L, dy / L, 0); })();
      let s2 = 3.6;
      forms.slice(4, 7).forEach((form) => {
        const at = p3(TIP.x + dl.x * s2 + dl.y * cap * 0.5, TIP.y + dl.y * s2 - dl.x * cap * 0.5, DEPTH_HZ + 0.005);
        this.faceWord(c, form, at, dl, p3(dl.y, -dl.x, 0), cap, 'paper', presence);
        s2 += this.faceWidth(form, cap) + cap * 0.32;
      });
      const free = forms[7]!;
      drawFree(c, free, audio, t, T, on, presence);
      return;
    }
    // Words sung on either side of an editorial cut keep their original onset and axes.
    drawSet(c, setLine(forms, LYRIC_SIZE), 110, 180, { on, glow: on === 'ink' ? this.w.glow.ctx : undefined, alpha: presence });
  }
}
