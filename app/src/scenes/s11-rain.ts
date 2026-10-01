// S11 — the stack-trace storm (storyboard v2 kf-S11, lyric typography v3: "depth storm").
// A deep field of `at daysIn (month.ts:42)` lines falls along a tilted rain; the camera sinks into it.
// The sung words are pulled out of the storm: each is born deep and soft on its onset and racks into
// focus on the focal plane, then drifts down with the rain. "Undefined" slams across the frame; the
// second "undefined" is pushed in front of the first and loses its glyphs to empty .notdef boxes as it
// is sung. "…and I don't know why" is small and alone at Clawd's feet while the camera rips back.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { clamp, ease, frameIdx, hash, lerp } from '../engine/util';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { beatsSince, span } from '../kit/time';
import { Voice, drawWithMissing, frameJitter, setLine, type WordForm } from '../kit/lyric-moves';
import { fillRun, varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { beatHit, resolveX9Times, type X9Times } from './s09-z-shared';
import { DeepStorm } from './parts/s11-deep';

const ROLL = -0.2; // the whole storm is tilted (kf-S11)

class World {
  ground = new Ground();
  storm: DeepStorm;
  camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 200);
  layer = new Layer2D();
  times: X9Times;
  voice: Voice;
  users = 0;
  constructor(ctx: SceneCtx) {
    this.storm = new DeepStorm(ctx.renderer);
    this.times = resolveX9Times(ctx);
    this.voice = new Voice(ctx.lyrics, ctx.audio);
  }
  dispose() { this.storm.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); }
}
let world: World | undefined;

export default class S11Rain extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  /** Camera state: sinks into the storm, jolts on the slams, rips back on "why". */
  private view(t: number) {
    const T = this.w.times, au = this.ctx.audio;
    const b = Math.max(0, beatsSince(au, t, T.stack));
    const pull = ease.outExpo(span(t, T.why, T.rainEnd + 0.3));
    const z = lerp(14, 8, ease.inOutCubic(span(b, 0, 14))) + pull * 26;
    return { z, pull, b };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio, t = f.t, v = w.voice;
    const { z, pull, b } = this.view(t);
    const hit = Math.max(beatHit(au, t, T.impacts[0], 0.12), beatHit(au, t, T.impacts[1], 0.12));

    w.ground.render(this.ctx.renderer, out, { kind: 'ink', t, camX: b * 18, camY: b * 70, zoom: 1 + pull * 0.4,
      grid: 0.18, haze: 0.35, hazeY: 0.5, streaks: 0.8 + 0.2 * f.a.kick, streakAngle: ROLL, travel: b * 0.25, kick: f.a.kick });

    // The storm: distance fallen is a function of beats (speeds up with the song's tempo), plus a
    // lurch on each slam.
    const d = b * 3.4 + (t >= T.impacts[0] ? 2 : 0) + (t >= T.impacts[1] ? 2 : 0);
    const reveal = 0.35 + 0.65 * ease.outCubic(span(b, 0, 2));
    w.storm.update(d, 0, reveal, f.a.kick * 0.5 + hit);
    const cam = w.camera;
    cam.position.set(Math.sin(b * 0.21) * 0.6, Math.cos(b * 0.17) * 0.4, z);
    cam.up.set(Math.sin(ROLL), Math.cos(ROLL), 0);
    cam.lookAt(cam.position.x * 0.3, 0, -20);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    const r = this.ctx.renderer;
    r.setRenderTarget(out); r.render(w.storm.scene, cam);

    const c = w.layer.ctx;
    w.layer.clear();
    this.verse(c, t, f.a.kick);
    this.undefinedSlams(c, t, hit);
    this.why(c, t, f.beat, pull);
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);

    const k = 16 * hit, fi = frameIdx(t);
    return { ...postFor('ink'), hud: 0, bloom: 0.25, bloomThreshold: 1.05, vignette: 0.22,
      shake: [k * (hash(fi, 21) * 2 - 1), k * (hash(fi, 22) * 2 - 1)] as [number, number] };
  }

  /** "Stack traces falling like rain from the sky": words rack out of the storm into focus. */
  private verse(c: CanvasRenderingContext2D, t: number, kick: number) {
    const v = this.w.voice, au = this.ctx.audio;
    const line = v.line('Stack traces falling like rain from the sky');
    const pres = v.presence(line, t, 0);
    if (pres <= 0) return;
    const forms = v.forms(line, t);
    // Two rows on the storm's slant: "Stack traces falling" / "like rain from the sky".
    const rows = [forms.slice(0, 3), forms.slice(3)];
    c.save();
    c.translate(W / 2, H / 2); c.rotate(ROLL * 0.55); c.scale(v.breath(kick), v.breath(kick));
    rows.forEach((row, ri) => {
      const set = setLine(row, 132, { space: 0.22 });
      const x0 = -set.width / 2 + (ri === 0 ? -150 : 150), y0 = ri === 0 ? -70 : 110;
      for (const s of set.words) this.rack(c, s.form, s.run, x0 + s.x, y0, pres, t, au);
    });
    c.restore();
  }

  /** Focus pull for one word: deep, small and soft on its onset → sharp on the focal plane, then it
   * keeps falling slowly with the rain. Clay when stressed. */
  private rack(c: CanvasRenderingContext2D, f: WordForm, run: ReturnType<typeof varRun>, x: number, y: number,
    pres: number, t: number, au: SceneCtx['audio']) {
    if (f.born <= 0) return;
    const k = ease.outExpo(clamp((t - f.t0) / 0.26));
    const fall = Math.max(0, beatsSince(au, t, f.t0)) * 9;
    const sc = lerp(0.42, 1, k), blur = (1 - k) * 16;
    c.save();
    c.translate(x + run.width / 2, y + fall + (1 - k) * -160);
    c.scale(sc, sc);
    c.globalAlpha = pres * lerp(0.25, 1, k);
    if (blur > 0.3) c.filter = `blur(${blur.toFixed(1)}px)`;
    c.fillStyle = css(f.stress ? 'clay' : 'paper');
    fillRun(c, run, -run.width / 2, 0);
    c.restore();
  }

  /** "Undefined, undefined": two slams; the second is pushed in front and loses its glyphs. */
  private undefinedSlams(c: CanvasRenderingContext2D, t: number, hit: number) {
    const v = this.w.voice, T = this.w.times;
    const line = v.line('Undefined, undefined, and I don’t know why');
    const [a, b] = line.words;
    if (!a || t < a.start) return;
    const fa = v.form(a, t, { minWidth: 75, maxWidth: 100, rest: 860 });
    const second = t >= b!.start;
    const back = second ? ease.outExpo(clamp((t - b!.start) / 0.3)) : 0;
    const pull = ease.outExpo(span(t, T.why, T.rainEnd + 0.3));
    // First: across the frame, rotated with the storm; recedes when the second lands.
    this.slam(c, 'undefined', fa, t, {
      cx: W / 2 + 40, cy: lerp(430, 300, back), width: lerp(1820, 1300, back), alpha: lerp(1, 0.28, back) * (1 - pull * 0.7),
      blur: back * 7, grain: 1,
    });
    if (second) {
      const fb = v.form(b!, t, { minWidth: 75, maxWidth: 112.5, rest: 900 });
      const k = t - b!.start;
      const drop = k < 0.09 ? lerp(-260, 14, ease.inQuad(k / 0.09)) : lerp(14, 0, ease.outCubic(clamp((k - 0.09) / 0.14)));
      // Glyphs go missing one by one through the sung word, left to right.
      const run = varRun('undefined', 100, { wdth: fb.axes.wdth, wght: Math.max(800, fb.axes.wght) });
      const size = 100 * 1700 / run.width, big = varRun('undefined', size, { wdth: fb.axes.wdth, wght: Math.max(800, fb.axes.wght) });
      c.save();
      c.translate(W / 2, 640 + drop - pull * 140); c.rotate(ROLL * 0.6);
      const s = 1 - pull * 0.45; c.scale(s, s);
      c.globalAlpha = 1 - pull * 0.5;
      drawWithMissing(c, big, -big.width / 2, big.capH / 2, (i) => fb.sung * 11 - i * 1.15 - 0.6, css('paper'));
      this.grain(c, big.width, big.capH, 31);
      c.restore();
    }
    void hit;
  }

  private slam(c: CanvasRenderingContext2D, text: string, f: WordForm, t: number,
    o: { cx: number; cy: number; width: number; alpha: number; blur: number; grain: number }) {
    const k = t - f.t0;
    const drop = k < 0.09 ? lerp(-300, 16, ease.inQuad(k / 0.09)) : lerp(16, 0, ease.outCubic(clamp((k - 0.09) / 0.14)));
    const axes = { wdth: f.axes.wdth, wght: Math.max(800, f.axes.wght) };
    const r0 = varRun(text, 100, axes), run = varRun(text, 100 * o.width / r0.width, axes);
    c.save();
    c.translate(o.cx, o.cy + drop); c.rotate(ROLL * 0.6);
    c.globalAlpha = o.alpha;
    if (o.blur > 0.3) c.filter = `blur(${o.blur.toFixed(1)}px)`;
    c.fillStyle = css('paper');
    fillRun(c, run, -run.width / 2, run.capH / 2);
    c.filter = 'none';
    if (o.grain) this.grain(c, run.width, run.capH, 17);
    c.restore();
  }

  /** Dry-brush grain knocked out of a word's ink (deterministic, re-seeded per frame like film). */
  private grain(c: CanvasRenderingContext2D, w: number, h: number, seed: number) {
    c.save();
    c.globalCompositeOperation = 'destination-out';
    const fi = frameIdx(0); // static grain: the print does not boil
    for (let i = 0; i < 900; i++) {
      const x = (hash(seed, i, 1, fi) - 0.5) * w * 1.05, y = (hash(seed, i, 2, fi) - 0.5) * h * 1.6 - h * 0.1;
      const r = 0.8 + 2.6 * Math.pow(hash(seed, i, 3), 4);
      c.globalAlpha = 0.5 + 0.5 * hash(seed, i, 4);
      c.fillRect(x, y, r, r);
    }
    c.restore();
  }

  /** "and I don't know why": small, alone, at Clawd's feet; "why" stretches with the held note. */
  private why(c: CanvasRenderingContext2D, t: number, beat: number, pull: number) {
    const v = this.w.voice, T = this.w.times, au = this.ctx.audio;
    const line = v.line('Undefined, undefined, and I don’t know why');
    const rest = line.words.slice(2);
    const forms = rest.map((w) => v.form(w, t, { maxWidth: 125 }));
    const cx = W / 2, base = 1000;
    if (t >= rest[0]!.start) {
      const set = setLine(forms, 54, { space: 0.24 });
      c.save(); c.translate(cx - set.width / 2, base);
      for (const s of set.words) {
        if (s.form.born <= 0) continue;
        c.globalAlpha = Math.min(1, s.form.born * 1.6);
        c.fillStyle = css(s.form.stress ? 'clay' : 'paper');
        fillRun(c, s.run, s.x, 0);
      }
      c.restore();
    }
    // Clawd: tiny under the storm, arms up; jumps on the slams; still on "why".
    const latest = t >= T.impacts[1] ? T.impacts[1] : T.impacts[0];
    const jumping = t >= latest - 0.3 && t < latest + 0.25;
    const px = lerp(7, 5, pull);
    const sz = Clawd.size(px);
    Clawd.draw(c, cx - sz.w / 2 + frameJitter(t, 3) * (t < T.why ? 2 : 0), 905 - sz.h, Clawd.pose(t >= T.why ? 'A3' : jumping ? 'A6' : 'A7', {
      beat, beat0: au.beatAt(latest) - 0.75, jumpBeats: 0.75, p: 0,
    }), { px });
  }
}
