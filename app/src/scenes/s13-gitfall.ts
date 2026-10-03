import { drawPickup, pickupHits } from "../kit/hookslam";
import { impact } from "../kit/impact";
import { PrintOverlay } from '../kit/print-overlay';
// S13: diagonal clay/ink print, perspective COMMIT, an upward log and colliding solid panels.
import { drawNote } from '../kit/note';
import type * as THREE from "three";
import { Scene, type Frame, type SceneCtx } from "../engine/scene";
import { Layer2D } from "../engine/gl";
import { F, font } from "../engine/type";
import { hash, frameIdx, ease, lerp } from "../engine/util";
import { css } from "../theme";
import { GlowLayer, postFor } from "../kit/ground";
import { glowDraw, heatColor, Voice, gridSnap } from "../kit/lyric-moves";
import { fillRun, varRun } from "../kit/vartype";
import { drawCursor, blink } from "../kit/cursor";
import { afterBeats, beatsSince, span } from "../kit/time";
import { chorusScore, chorusState, commitId, type ChorusScore } from "./parts/s13-score";
import { gitfallLayout, handoffIn, implode, implodeTarget } from "./parts/s13-layout";
import {
  drawWarped,
  drawSprite,
  printTexture,
  rule,
  polygon,
  mapQuad,
  type Point,
  type Quad,
} from "./parts/s08-print";

export const TYPE_LEVELS = { giant: 930, lyric: 72, label: 20 }; // Archivo cap heights; Mono label font size.
class World {
  layer = new Layer2D();
  glow = new GlowLayer();
  printMask = new Layer2D();
  print = new PrintOverlay('texture(mask, vUv).a', { mask: { value: this.printMask.texture } }, 'uniform sampler2D mask;');
  grain = printTexture(13);
  voice: Voice;
  T: ChorusScore;
  users = 0;
  constructor(ctx: SceneCtx) {
    this.voice = new Voice(ctx.lyrics, ctx.audio);
    this.T = chorusScore(ctx.audio, ctx.lyrics);
    this.target = implodeTarget(ctx.audio, ctx.lyrics, this.T);
  }
  target: { x: number; y: number; w: number; h: number };
  dispose() {
    this.layer.texture.dispose(); this.glow.dispose(); this.printMask.texture.dispose(); this.print.dispose();
  }
}
let world: World | undefined;
export default class S13Gitfall extends Scene {
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
      au = this.ctx.audio,
      t = f.t,
      v = w.voice,
      c = w.layer.ctx;
    const stripGlow: (() => void)[] = [];
    const s = gitfallLayout(au, this.ctx.lyrics, t, T, v);
    w.layer.clear(css("ink")); w.glow.clear(); w.printMask.clear();
    // v4 motion (same grammar as S08): creep and inhale before each COMMIT, a sprung kick on the
    // hit, a bump per sung word, nervous jitter while every test is throwing fits, a push into the
    // local/CI collision, settling to the identity frame on the last beat (S14 hand-off).
    {
      const st = chorusState(au, t, T);
      const hit = st.second ? T.hit2 : T.hit1, pre = st.second ? T.pickup2 : T.start;
      let zoom = 1, rot = 0, fx = 960, fy = 560, jx = 0, jy = 0;
      if (st.frozen) {
        zoom = 1 + 0.2 * ease.inQuad(span(t, pre, hit)) - 0.1 * ease.inOutCubic(span(t, afterBeats(au, hit, -0.5), hit));
      } else {
        const b = Math.max(0, beatsSince(au, t, hit));
        zoom = 1 + 0.16 * Math.exp(-b * 6) * Math.cos(b * 9);
        rot = 0.03 * Math.exp(-b * 5) * Math.sin(b * 11);
        const line = this.ctx.lyrics.lastLine(t);
        for (const wd of line?.words ?? []) if (t >= wd.start) { const k = Math.pow(0.5, (t - wd.start) / 0.08); zoom += 0.02 * k; rot += (wd.index % 2 ? 0.006 : -0.006) * k; }
        if (st.testMode) { const fi = frameIdx(t); jx = (hash(fi, 7) - 0.5) * 14; jy = (hash(fi, 8) - 0.5) * 10; rot += (hash(fi >> 2, 9) - 0.5) * 0.01; }
        if (st.split) {
          const push = ease.inOutCubic(span(t, T.split, T.collision));
          const back = ease.inOutCubic(span(t, afterBeats(au, T.end, -1), T.end));
          zoom += (0.12 * push + 0.06 * st.crush) * (1 - back); fx = lerp(960, 760, push * (1 - back)); fy = lerp(560, 760, push * (1 - back));
        }
      }
      // C13: the page implodes into S14's first cursor (outermost transform).
      const k = Math.min(implode(t, au, T), 0.9999), q = w.target, qx = q.x + q.w / 2, qy = q.y + q.h / 2;
      c.save(); c.translate(qx, qy); c.scale(1 - k, 1 - k); c.translate(-qx, -qy);
      c.save(); c.translate(fx + jx, fy + jy); c.rotate(rot); c.scale(zoom, zoom); c.translate(-fx, -fy);
    }
    const entering = t < afterBeats(au, T.start, 1);
    if (entering) {
      const r = handoffIn(t, au, T);
      c.fillStyle = css("clay");
      c.fillRect(r.x, r.y, r.w, r.h);
    } else
      polygon(
        c,
        [
          [0, 0],
          [937, 0],
          [1096, 1080],
          [0, 1080],
        ],
        "clay",
      );
    // Register the clay area once, including the existing camera transform.
    glowDraw(c, w.printMask.ctx, m => {
      m.fillStyle = css('paper');
      if (entering) { const r = handoffIn(t, au, T); m.fillRect(r.x, r.y, r.w, r.h); }
      else polygon(m, [[0,0],[937,0],[1096,1080],[0,1080]], 'paper');
    });
    const g = w.glow.ctx; g.save(); g.setTransform(c.getTransform());
    g.beginPath(); g.rect(-10000,-10000,20000,20000);
    if (entering) { const r = handoffIn(t, au, T); g.rect(r.x,r.y,r.w,r.h); }
    else { g.moveTo(0,0); g.lineTo(937,0); g.lineTo(1096,1080); g.lineTo(0,1080); g.closePath(); }
    g.clip('evenodd');
    this.river(c, s.travel, s.handoff.pitch);
    // Printed archive retains the previous sung COMMIT; it is never drawn before that onset.
    if (s.form.born > 0) {
      const axes = { ...s.form.axes, wght: Math.max(800, s.form.axes.wght) };
      drawWarped(c, "COMMIT", axes, s.giant, "ink", heatColor("ink", "clay", s.form.age));
      if (!s.split && !s.frozen) {
        // Level two grows by measured beats: the submitted words fill the clay half, top to bottom.
        const at = s.second ? T.hit2 : T.hit1,
          count = Math.min(
            3,
            1 + Math.floor(Math.max(0, beatsSince(au, t, at))),
          );
        for (let i = 1; i < count; i++) {
          c.save();
          c.globalAlpha = 0.13;
          const q = s.giant.map(([x, y]) => [x, y - i * 300] as Point) as Quad;
          drawWarped(c, "COMMIT", axes, q, "ink", heatColor("ink", "clay", s.form.age));
          c.restore();
        }
      }
    }
    this.speedLines(c, t, T);
    if (s.split) {
      this.panel(c, s.local, true);
      this.panel(c, s.ci, false);
      this.splinters(c, t, T, s.arrive, s.crush);
    } else if (s.testMode) this.tests(c, t);
    if (s.split) {
      const q = s.ci, cx = (q[0]![0] + q[1]![0]) / 2, top = Math.min(q[0]![1], q[1]![1]);
      drawNote(c, { ax: cx, ay: top, x: cx - 120, y: top - 70, text: 'works on: 1 machine', t0: afterBeats(au, T.collision, 0.6), on: 'ink' }, t);
    }
    drawSprite(c, s.clawd, "clay", "pit");
    glowDraw(c, g, g => drawSprite(g, { ...s.clawd, pose: { ...s.clawd.pose, cells: s.clawd.pose.cells.filter(cell => cell.k === 'O') } }, 'clay', 'ink'), 0.25);
    const line = this.ctx.lyrics.lastLine(t);
    if (line && v.presence(line, t, 1) > 0) {
      const hook = /one more commit/i.test(line.text);
      if (!hook) {
        if (/fix a bit/i.test(line.text)) this.stack(c, t, stripGlow);
        else {
          // One readable row below the panel collision; born words cross shot cuts unchanged.
          const y = s.split ? 884 : 145;
          gridSnap(c, v.forms(line, t), {
            x: 96,
            y,
            colW: 144,
            rowH: 100,
            cols: 12,
            size: 100,
            on: s.split ? "ink" : "clay",
            glow: g,
            t,
            alpha: v.presence(line, t, 1),
          });
        }
      }
    }
    // Pickup level 2 (kit/hookslam): the cursor holds until the I, then one word per hit.
    const pick = this.ctx.lyrics.find("I need one more commit")[s.second ? 3 : 2]!;
    const hitK = impact(t, pickupHits(2, au, pick), T.end), swapped = s.frozen && hitK.swap;
    if (s.frozen && t < pick.words[0]!.start + 0.05) {
      const cursor = { x: 960 - 19.8, y: 576, h: 72, on: blink(au.beatAt(t)) };
      drawCursor(c, cursor); glowDraw(c, g, g => drawCursor(g, cursor));
    }
    g.restore();
    for (const paint of stripGlow) paint(); stripGlow.length = 0;
    c.restore(); c.restore();
    if (s.frozen) {
      // In screen space (the creep would crop a full-frame word). An impact frame swaps the ground.
      if (swapped) { c.fillStyle = css("paper"); c.fillRect(0, 0, 1920, 1080); }
      // S13 previews its own COMMIT from the first syllable, so the pickup stops at "commit".
      drawPickup(c, v, pick, t, 2, au, { on: swapped ? "paper" : "ink", from: pick.words[0]!.start + 0.05 });
    }
    const inward = implode(t, au, T);
    if (inward > 0) { // what the page leaves: S14's cursor (glowing on the ink)
      const q = w.target, cur = { x: q.x, y: q.y + q.h, h: q.h };
      drawCursor(c, cur); glowDraw(c, w.glow.ctx, g => drawCursor(g, cur));
    }
    c.drawImage(w.grain, 0, 0, 1920, 1080);
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.printMask.upload(); w.print.render(this.ctx.renderer, out, 0.04);
    w.glow.composite(this.ctx, out, 1.6);
    const fi = frameIdx(t),
      magnitude = (s.split ? 4 * s.crush : 13 * s.impact) * (1 - implode(t, au, T));
    const kick = s.frozen ? hitK.shake : [0, 0];
    return {
      ...postFor("ink"),
      hud: 0,
      frame: 0,
      ca: 0.6,
      vignette: 0,
      shake: [
        (hash(fi, 131) - 0.5) * magnitude + kick[0]!,
        (hash(fi, 132) - 0.5) * magnitude + kick[1]!,
      ] as [number, number],
    };
  }
  private river(c: CanvasRenderingContext2D, travel: number, pitch: number) {
    // One machine annotation: all rows are a single log column, not independent captions.
    c.save();
    c.beginPath();
    c.rect(1410, 0, 510, 1080);
    c.clip();
    c.transform(1, -0.075, 0.09, 1, 0, 0);
    rule(c, [1380, 0], [1380, 1220], "paper", 0.5, 1);
    c.font = font(F.mono(400), 20);
    const scroll = travel / pitch,
      first = Math.floor(scroll),
      offset = (scroll - first) * pitch;
    for (let r = -1; r < 34; r++) {
      const id = first + r,
        y = r * pitch - offset;
      c.fillStyle = css("paper", 0.4);
      c.fillText(commitId(id), 1435, y);
      c.fillStyle = css(
        id % 3 === 2 ? "clay" : "paper",
        id % 3 === 2 ? 1 : 0.6,
      );
      c.fillText(id % 3 === 2 ? "fix a bit" : "fix", 1585, y);
      if (id % 3 === 2) glowDraw(c, this.w.glow.ctx, g => { g.font = c.font; g.fillStyle = c.fillStyle; g.fillText('fix a bit', 1585, y); });
    }
    c.restore();
  }
  private panel(c: CanvasRenderingContext2D, q: Quad, local: boolean) {
    const shifted = q.map(([x, y]) => [x - 12, y + 12] as Point);
    polygon(c, shifted, "ink");
    for (let i = 0; i < 70; i++) {
      const u = i / 70,
        a = mapQuad(q, u, 1),
        b = mapQuad(q, u + 0.007, 1);
      rule(c, a, [b[0] - 12, b[1] + 12], "paper", 0.65, 0.8);
    }
    polygon(c, q, local ? "paper" : "ink");
    // Fine structural rules, not outlined typography. CI has the frame shown in the storyboard.
    if (!local) {
      for (let i = 0; i < 4; i++)
        rule(c, q[i]!, q[(i + 1) % 4]!, "paper", 0.9, 5);
    }
    const inner: Quad = [
      mapQuad(q, 0.13, 0.15),
      mapQuad(q, 0.76, 0.15),
      mapQuad(q, 0.76, 0.78),
      mapQuad(q, 0.13, 0.78),
    ];
    drawWarped(
      c,
      local ? "local" : "CI",
      { wdth: 62, wght: 900 },
      inner,
      local ? "ink" : "paper",
    );
    const x = 0.84,
      ys = [0.35, 0.69];
    if (local) {
      const a = mapQuad(q, x - 0.06, 0.51),
        b = mapQuad(q, x, 0.66),
        d = mapQuad(q, x + 0.11, 0.3);
      c.strokeStyle = css("pass");
      c.lineWidth = 13;
      c.beginPath();
      c.moveTo(...a);
      c.lineTo(...b);
      c.lineTo(...d);
      c.stroke();
    } else {
      rule(
        c,
        mapQuad(q, x - 0.08, ys[0]!),
        mapQuad(q, x + 0.09, ys[1]!),
        "fail",
        1,
        24,
      );
      rule(
        c,
        mapQuad(q, x + 0.09, ys[0]!),
        mapQuad(q, x - 0.08, ys[1]!),
        "fail",
        1,
        24,
      );
    }
  }
  private speedLines(c: CanvasRenderingContext2D, t: number, T: ChorusScore) {
    const travel = Math.max(0, beatsSince(this.ctx.audio, t, T.split));
    for (let i = 0; i < 24; i++) {
      const a: Point = [hash(i, 13) * 900, hash(i, 17) > 0.5 ? 0 : 1080];
      const k = 0.2 + hash(i, 18) * 0.45;
      rule(
        c,
        a,
        [a[0] + (1035 - a[0]) * k, a[1] + (725 - a[1]) * k],
        "ink",
        0.55,
        0.6 + hash(i, 19),
      );
    }
    for (let i = 0; i < 14; i++) {
      const x = 955 + hash(i, 22) * 470,
        y = hash(i, 23) * 1080;
      rule(c, [x, y], [x + 10, y + 70 + hash(i, 24) * 200], "paper", 0.45, 1);
    }
    // The streak phase is seek-independent; motion stays within the same print corridor.
    for (let i = 0; i < 3; i++) {
      const y = 300 + ((travel * 140 + i * 180) % 500);
      rule(c, [1380, y], [1395, y + 90], "clay", 0.9, 2);
      glowDraw(c, this.w.glow.ctx, g => rule(g, [1380, y], [1395, y + 90], 'clay', 0.9, 2));
    }
  }
  private splinters(
    c: CanvasRenderingContext2D,
    t: number,
    T: ChorusScore,
    arrive: number,
    crush: number,
  ) {
    const b = beatsSince(this.ctx.audio, t, T.split);
    for (let i = 0; i < 26; i++) {
      const angle = hash(i, 130) * Math.PI * 2,
        dist = 40 + hash(i, 131) * 240;
      const pulse = arrive * (0.7 + 0.3 * Math.sin(b * 1.8 + i)),
        x = 1045 + Math.cos(angle) * dist * pulse,
        y = 735 + Math.sin(angle) * dist * pulse;
      const dx = Math.cos(angle) * (7 + 12 * crush),
        dy = Math.sin(angle) * (15 + 20 * crush);
      polygon(
        c,
        [
          [x, y],
          [x + dx, y + dy],
          [x + dx - 6, y + dy + 14],
        ],
        i % 3 === 0 ? "clay" : i % 2 ? "paper" : "ink",
      );
      if (i % 3 === 0) glowDraw(c, this.w.glow.ctx, g => polygon(g,
        [[x,y],[x+dx,y+dy],[x+dx-6,y+dy+14]], 'clay'));
    }
  }
  private tests(c: CanvasRenderingContext2D, t: number) {
    // Semantic colour is confined to failed-test markers; other machine ink is <=60% opacity.
    const active = Math.floor(this.ctx.audio.beatAt(t) * 3) % 19;
    c.font = font(F.mono(400), 20);
    c.fillStyle = css("ink", 0.55);
    c.fillText("calendar / month.test.ts", 96, 590);
    for (let i = 0; i < 19; i++) {
      const x = 110 + (i % 5) * 140,
        y = 640 + Math.floor(i / 5) * 67;
      c.fillStyle = css("fail");
      c.fillRect(
        x + (i === active ? Math.sin(this.ctx.audio.beatAt(t) * 14) * 5 : 0),
        y,
        12,
        12,
      );
      c.fillStyle = css("ink", 0.4);
      c.fillText(String(i + 1).padStart(2, "0"), x + 22, y + 14);
    }
  }
  private stack(c: CanvasRenderingContext2D, t: number, stripGlow: (() => void)[]) {
    const v = this.w.voice,
      line = v.line("“Fix,” and “fix,” and “fix a bit”");
    // Two singles followed by one phrase; each new fix pushes preceding records up one pitch.
    const groups = [
      line.words.slice(0, 2),
      line.words.slice(2, 4),
      line.words.slice(4),
    ];
    const forms = groups.map((words) => words.map((word) => v.form(word, t)));
    const born = groups.filter((words) =>
      words.some((w) => w.start <= t),
    ).length;
    forms.forEach((row, i) => {
      const y = 530 + (i - born + 1) * 112;
      let x = 96;
      for (const form of row) {
        const run = varRun(form.text, 100, form.axes);
        if (form.born > 0) {
          c.fillStyle = heatColor(form.stress || i === 2 ? "clay" : "paper", "ink", form.age);
          // Clay stress stays visible on an ink print strip inside the clay half.
          c.fillStyle = css("ink", 0.9);
          c.fillRect(x - 8, y - 88, run.width + 16, 104);
          c.fillStyle = heatColor(form.stress || i === 2 ? "clay" : "paper", "ink", form.age);
          c.globalAlpha = Math.min(1, form.born * 1.6);
          fillRun(c, run, x, y);
          if (form.stress || i === 2) {
            const g = this.w.glow.ctx;
            // Defer these strip-local words until after the ground clip is restored.
            const matrix = c.getTransform(), alpha = c.globalAlpha, xx = x;
            stripGlow.push(() => { g.save(); g.setTransform(matrix); g.globalAlpha = alpha;
              g.fillStyle = heatColor('clay','ink',form.age); fillRun(g,run,xx,y); g.restore(); });
          }
          c.globalAlpha = 1;
        }
        x += run.width + 26;
      }
    });
  }
}
