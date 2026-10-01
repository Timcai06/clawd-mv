import { PrintOverlay } from '../kit/print-overlay';
// S08: the flat, bilateral-bleed COMMIT print in kf-S08; one shared world for all twelve cuts.
import type * as THREE from "three";
import { Scene, type Frame, type SceneCtx } from "../engine/scene";
import { Layer2D } from "../engine/gl";
import { F, font } from "../engine/type";
import { hash, frameIdx, ease, lerp } from "../engine/util";
import { css } from "../theme";
import { postFor } from "../kit/ground";
import { heatColor, Voice, gridSnap } from "../kit/lyric-moves";
import { varRun, type Axes } from "../kit/vartype";
import { drawCursor, blink } from "../kit/cursor";
import { afterBeats, beatsSince, span } from "../kit/time";
import { MONTH_SOURCE } from "../kit/content";
import {
  commitScore,
  commitLayout,
  handoffIn,
  handoffOut,
  type CommitScore,
} from "./parts/s08-layout";
import {
  drawWarped,
  drawSprite,
  printTexture,
  rule,
  polygon,
} from "./parts/s08-print";

// Values are cap heights for Archivo; label is the Mono font size (as permitted by the task).
export const TYPE_LEVELS = { giant: 550, lyric: 72, label: 20 };
class World {
  print = new PrintOverlay();
  layer = new Layer2D();
  grain = printTexture(8);
  voice: Voice;
  T: CommitScore;
  users = 0;
  constructor(ctx: SceneCtx) {
    this.voice = new Voice(ctx.lyrics, ctx.audio);
    this.T = commitScore(ctx.audio, ctx.lyrics);
  }
  dispose() { this.print.dispose();
    this.layer.texture.dispose();
  }
}
let world: World | undefined;
export default class S08Commit extends Scene {
  private w!: World;
  override init() {
    this.w = world ??= new World(this.ctx);
    this.w.users++;
  }
  override dispose() {
    if (--this.w.users === 0) {
      this.w.dispose();
      world = undefined;
    }
  }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w,
      T = w.T,
      t = f.t,
      au = this.ctx.audio,
      v = w.voice;
    const s = commitLayout(au, this.ctx.lyrics, t, T, v),
      c = w.layer.ctx;
    const clay = s.hook && !s.frozen;
    w.layer.clear(css(clay ? "clay" : "paper"));
    const cam = this.camera(t, s, T);
    c.save();
    c.translate(cam.fx, cam.fy); c.rotate(cam.rot); c.scale(cam.zoom, cam.zoom); c.translate(-cam.fx, -cam.fy);
    if (clay && s.form.born > 0) {
      drawWarped(
        c,
        "COMMIT",
        { ...s.form.axes, wght: Math.max(800, s.form.axes.wght) },
        s.giant,
        "paper",
        heatColor("paper", "clay", s.form.age),
      );
      this.brackets(c, "ink");
      // One machine annotation and its fine rule; second hash replaces the first after the repeat.
      c.font = font(F.mono(500), TYPE_LEVELS.label);
      c.fillStyle = css("ink", 0.6);
      c.fillText(
        s.second
          ? "b7e42af · fix: calendar loop"
          : "a1f3c9e · fix: calendar loop",
        96,
        960,
      );
      drawSprite(c, s.clawd, "ink", "clay");
      for (let i = 0; i < 3; i++) {
        rule(
          c,
          [800 + i * 15, 290 + i * 9],
          [950 + i * 15, 210 + i * 9],
          "paper",
          0.85,
          1.5,
        );
        rule(
          c,
          [1220 + i * 20, 270 + i * 8],
          [1300 + i * 20, 232 + i * 8],
          "paper",
          0.85,
          1.5,
        );
      }
    } else {
      if (!(t >= T.brackets && t < T.taps[0]!)) this.brackets(c, "ink");
      if (s.taps) this.keyboard(c, f, T);
      else if (s.preview) this.preview(c, f);
      else if (t >= T.quit && t < T.pick2) this.code(c, f, T);
      if (!s.frozen)
        drawSprite(c, { ...s.clawd, x: 1560, y: 650, angle: 0 }, "clay", "ink");
    }
    const line = this.ctx.lyrics.lastLine(t);
    if (line && v.presence(line, t, 1) > 0) {
      const hook = /one more commit/i.test(line.text);
      if (!hook || s.frozen) {
        // The preceding scene's last line survives the cut; forms retain already sung words.
        const forms = v.forms(line, t);
        const pres = v.presence(line, t, 1);
        c.save();
        c.translate(960, 360);
        c.scale(v.breath(f.a.kick), v.breath(f.a.kick));
        c.translate(-960, -360);
        const cells = gridSnap(c, forms, {
          x: 96,
          y: 170,
          colW: 144,
          rowH: 144,
          cols: 12,
          size: 100,
          on: clay ? "clay" : "paper",
          t,
          alpha: pres,
        });
        c.restore();
        if (t >= T.brackets && t < T.taps[0]!) this.fitBrackets(c, t, cells, f);
      }
    }
    if (s.frozen) {
      const p = handoffIn(t, au, { ...T, start: s.second ? T.pick2 : T.start });
      drawCursor(c, { ...p, on: blink(au.beatAt(t)) });
    }
    c.restore();
    // The hash's hairline is the only outgoing object; no transition outside the last beat.
    if (t >= T.hit1) {
      const p = handoffOut(t, au, T);
      const exiting = t >= afterBeats(au, T.end, -1);
      rule(
        c,
        [p.x0, p.y],
        [p.x1, p.y],
        exiting ? "clay" : "ink",
        exiting ? 1 : 0.6,
        exiting ? 2 : 1,
      );
    }
    c.drawImage(w.grain, 0, 0, 1920, 1080);
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.print.render(this.ctx.renderer, out, clay ? 0.04 : 0.05);
    const magnitude = 10 * s.impact,
      fi = frameIdx(t);
    return {
      ...postFor(clay ? "clay" : "paper"),
      hud: 0,
      frame: 0,
      bloom: 0,
      vignette: 0,
      shake: [
        (hash(fi, 81) - 0.5) * magnitude,
        (hash(fi, 82) - 0.5) * magnitude,
      ] as [number, number],
    };
  }
  /**
   * v4 motion: the print is filmed. Before each hook the frame creeps in on the cursor (tension),
   * inhales on the last half beat, then the slam throws it back out; held COMMITs drift; paper
   * lines bump on every sung word; "my machine" pushes into the calendar preview.
   */
  private camera(t: number, s: ReturnType<typeof commitLayout>, T: CommitScore) {
    const au = this.ctx.audio;
    const hit = s.second ? T.hit2 : T.hit1, pre = s.second ? T.pick2 : T.start;
    let zoom = 1, rot = 0, fx = 960, fy = 540;
    if (s.frozen) {
      const creep = ease.inQuad(span(t, pre, hit));
      const inhale = ease.inOutCubic(span(t, afterBeats(au, hit, -0.5), hit));
      zoom = 1 + 0.22 * creep - 0.12 * inhale;
      fx = 960; fy = 560;
    } else {
      const b = Math.max(0, beatsSince(au, t, hit));
      // slam: arrives too close, kicks back past 1 and settles
      zoom = 1 + 0.16 * Math.exp(-b * 6) * Math.cos(b * 9);
      rot = 0.025 * Math.exp(-b * 5) * Math.sin(b * 11);
      if (s.hook) zoom += 0.05 * ease.inOutQuad(span(t, hit, s.second ? T.works : T.brackets));
    }
    if (!s.hook && !s.frozen) {
      const line = this.ctx.lyrics.lastLine(t);
      let bump = 0, sign = 1;
      for (const w of line?.words ?? []) if (t >= w.start) { bump = Math.pow(0.5, (t - w.start) / 0.08); sign = w.index % 2 ? 1 : -1; }
      zoom += 0.02 * bump + 0.03 * ease.inOutQuad(span(t, T.brackets, T.end));
      rot += 0.004 * bump * sign;
      if (s.preview) {
        const k = ease.inOutCubic(span(t, T.works, T.end));
        zoom += 0.16 * k; fx = lerp(960, 420, k); fy = lerp(540, 560, k);
      }
    }
    return { zoom, rot, fx, fy };
  }

  /** "Every bracket's gonna fit": the corner brackets creep in word by word, then snap shut on "fit". */
  private fitBrackets(c: CanvasRenderingContext2D, t: number, cells: { x: number; y: number; w: number; h: number; form: { text: string; t0: number; born: number; axes: Axes } }[], f: Frame) {
    const fit = cells.find((x) => /^fit/i.test(x.form.text));
    const born = cells.filter((x) => x.form.born > 0).length;
    const creep = Math.min(1, born / 4) * 0.25;
    const snap = fit && t >= fit.form.t0 ? ease.outBack(span(t, fit.form.t0, fit.form.t0 + 0.16), 2.2) : 0;
    const homeL = { x: 96, y: 200 }, homeR = { x: 212, y: 200 };
    const cy = fit ? fit.y + fit.h * 0.5 + 34 : 200;
    const fw = fit ? varRun(fit.form.text, 100, fit.form.axes).width : 0;
    const tl = fit ? { x: fit.x - 46, y: cy } : homeL, tr = fit ? { x: fit.x + 14 + fw + 12, y: cy } : homeR;
    const k = Math.max(creep, snap);
    c.font = font(F.mono(400), 100);
    c.fillStyle = css(snap > 0 ? "clay" : "ink", snap > 0 ? 1 : 0.6);
    c.fillText("[", lerp(homeL.x, tl.x, k), lerp(homeL.y, tl.y, k));
    c.fillText("]", lerp(homeR.x, tr.x, k), lerp(homeR.y, tr.y, k));
    // the other pairs lean in with the creep and recoil on the snap
    const rec = snap > 0 ? Math.exp(-(t - fit!.form.t0) / 0.12) : 0;
    c.fillStyle = css("ink", 0.6);
    c.fillText("{", 1490 - 120 * creep + 40 * rec, 200);
    c.fillText("}", 1605 - 120 * creep + 40 * rec, 200);
    c.fillText("(", 1670 - 90 * creep + 30 * rec, 980);
    c.fillText(")", 1790 - 90 * creep + 30 * rec, 980);
    rule(c, [270, 146], [840, 146], "ink", 0.6 * (1 - k));
    void f;
  }

  private brackets(c: CanvasRenderingContext2D, color: "ink" | "paper") {
    // Graphic brackets share the lyric cap level, never create another type scale.
    c.font = font(F.mono(400), 100);
    c.fillStyle = css(color, 0.6);
    c.fillText("[", 96, 200);
    c.fillText("]", 212, 200);
    rule(c, [270, 146], [840, 146], color, 0.6);
    c.fillText("{", 1490, 200);
    c.fillText("}", 1605, 200);
    rule(c, [1660, 146], [1824, 146], color, 0.6);
    c.fillText("(", 1670, 980);
    c.fillText(")", 1790, 980);
  }
  private keyboard(c: CanvasRenderingContext2D, f: Frame, T: CommitScore) {
    const shot = T.taps.filter((t) => f.t >= t).length - 1;
    c.save();
    c.translate(shot === 1 ? 80 : 0, shot === 2 ? -70 : 0);
    c.transform(1, shot === 1 ? -0.09 : 0, shot === 2 ? 0 : 0.15, 1, 0, 0);
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 10; col++) {
        const x = 210 + col * 135,
          y = 630 + row * 98,
          hot = (col + row) % 3 === Math.floor(f.beat * 4) % 3;
        polygon(
          c,
          [
            [x, y + 70],
            [x + 110, y + 70],
            [x + 123, y + 92],
            [x + 13, y + 92],
          ],
          "ink",
          0.55,
        );
        for (let i = 0; i < 26; i += 2)
          rule(
            c,
            [x + 6 + i * 4, y + 72],
            [x + 19 + i * 4, y + 90],
            "paper",
            0.6,
          );
        c.fillStyle = css(hot ? "clay" : "paper");
        c.fillRect(x, y, 110, 70);
        rule(c, [x, y], [x + 110, y], "ink", 0.4);
      }
    c.restore();
  }
  private code(c: CanvasRenderingContext2D, f: Frame, T: CommitScore) {
    c.font = font(F.mono(400), 20);
    c.fillStyle = css("ink", 0.35);
    const offset = Math.floor(
      (this.ctx.audio.beatAt(f.t) - this.ctx.audio.beatAt(T.quit)) * 3,
    );
    for (let i = 0; i < 10; i++)
      c.fillText(
        MONTH_SOURCE[(i + offset) % MONTH_SOURCE.length]!,
        210,
        610 + i * 36,
      );
  }
  private preview(c: CanvasRenderingContext2D, f: Frame) {
    c.fillStyle = css("ink", 0.12);
    c.fillRect(1000, 550, 650, 420);
    for (let day = 1; day <= 31; day++) {
      const x = 1020 + ((day + 3) % 7) * 88,
        y = 580 + Math.floor((day + 3) / 7) * 65;
      c.fillStyle = css("paper");
      c.fillRect(x, y, 80, 55);
      c.font = font(F.mono(400), 20);
      c.fillStyle = css("ink", 0.5);
      c.fillText(String(day), x + 12, y + 35);
      if (
        day === 31 &&
        f.t >= this.w.T.shots.at(-1)!.start &&
        Math.floor(f.beat * 8) % 2 === 0
      ) {
        c.fillStyle = css("fail");
        c.fillRect(x + 65, y + 8, 5, 5);
      }
    }
  }
}
