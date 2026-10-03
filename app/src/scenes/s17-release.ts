import { SparkLines, cursorSpark, heatTrail, sparkFade } from '../kit/spark';
import { drawNote } from '../kit/note';
import { PrintOverlay } from '../kit/print-overlay';
// S17: the final commit, a human review, merging type and the front-on device/diff poster.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { ease, lerp } from '../engine/util';
import { Lens } from '../kit/lens';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { drawCursor } from '../kit/cursor';
import { heatColor, Voice, setLine, stamp } from '../kit/lyric-moves';
import { drawPickup, pickupHits, strobe } from '../kit/hookslam';
import { impact } from '../kit/impact';
import { fillRun, varRun } from '../kit/vartype';
import { afterBeats, beatsSince, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { PrintedDeviceWall } from './parts/s17-device-wall';
import { DeviceWall3D, wallCam } from './parts/s17-world';
import { resolveReleaseTimes, releaseState, type ReleaseTimes } from './parts/s17-release-state';
import { DIFF_BOXES, releaseLayout } from './parts/s17-release-layout';
import { machineLabel, releaseLyric } from './parts/s17-release-type';
import { affine, drawInscription, inscribe, typeWords } from '../kit/inscribe';
import { printRun } from './parts/s16-print';
import { drawPR, prActive, prHits, prTimes, type PRTimes } from './parts/s17-pr';

// Capital heights. The lowercase diff's descender is included in its measured ink box;
// its capitals are at least 201 px. 92 px Archivo has a 686/1000 cap.
// Labels use Plex's nominal 20 px size.
export const TYPE_LEVELS = { giant: 201, lyric: 63.112, label: 20 };

class World {
  print = new PrintOverlay();
  sparks = new SparkLines();
  users = 0;
  ground = new Ground();
  layer = new Layer2D();
  lens = new Lens();
  wall = new PrintedDeviceWall();
  wall3 = new DeviceWall3D();
  voice: Voice;
  times: ReleaseTimes;
  pr: PRTimes;
  diff = ['- d <= days', '+ d < days'].map(text => varRun(text, 340, { wdth: 100, wght: 900 }));
  constructor(ctx: SceneCtx) { this.voice = new Voice(ctx.lyrics, ctx.audio); this.times = resolveReleaseTimes(ctx.audio, ctx.lyrics); this.pr = prTimes(ctx.lyrics); }
  dispose() { this.sparks.dispose(); this.print.dispose(); this.wall3.dispose(); this.lens.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); this.wall.dispose(); }
}
const worlds = new WeakMap<THREE.WebGLRenderer, World>();

export default class S17Release extends Scene {
  private w!: World;
  override init() {
    this.w = worlds.get(this.ctx.renderer) ?? new World(this.ctx);
    worlds.set(this.ctx.renderer, this.w); this.w.users++;
  }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); worlds.delete(this.ctx.renderer); } }

  private graph(c: CanvasRenderingContext2D, f: Frame, s: ReturnType<typeof releaseLayout>) {
    c.strokeStyle = css('ink'); c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, 434); c.lineTo(830, 434);
    c.bezierCurveTo(889, 434, 915, 546, 994, 546); c.lineTo(1920, 546); c.stroke();
    for (const node of s.nodes) {
      c.fillStyle = css('ink'); c.beginPath(); c.arc(node.x, node.y, 10, 0, Math.PI * 2); c.fill();
    }
    const T = this.w.times, join = span(f.t, T.release[5]!.start, afterBeats(this.ctx.audio, T.release[5]!.start, 2));
    if (join < 1) {
      c.strokeStyle = css('clay'); c.lineWidth = 3;
      c.beginPath(); c.moveTo(408, 434); c.bezierCurveTo(660, 610, 900, 610, lerp(900, 1160, join), lerp(610, 546, join)); c.stroke();
      drawCursor(c, { x: lerp(900, 1160, join), y: lerp(610, 546, join) + 12, h: 28 });
    }
  }

  private sparkJoin(c: CanvasRenderingContext2D, t: number) {
    const T=this.w.times, audio=this.ctx.audio, from=T.release[5]!.start, to=afterBeats(audio,from,2);
    if (t<from || t>=to+0.4) return;
    const join=span(t,from,to), end=T.tomorrow[0]!.start;
    const path=(tb:number, shapeJoin=span(tb,from,to))=>{
      const k=span(tb,from,to),q=1-k;
      return {x:q*q*q*408+3*q*q*k*660+3*q*k*k*900+k*k*k*lerp(900,1160,shapeJoin),
        y:q*q*q*434+3*q*q*k*610+3*q*k*k*610+k*k*k*lerp(610,546,shapeJoin)};
    };
    this.w.sparks.begin(c,undefined,'paper');
    heatTrail(this.w.sparks,t,tb=>path(tb,join),{from,to,width:3,alpha:sparkFade(t,end)});
    if(t<to) cursorSpark(c,undefined,this.w.sparks,t,tb=>({...path(tb),y:path(tb).y+12,h:28}),
      {on:'paper',from,to,end,seed:17});
  }

  private review(c: CanvasRenderingContext2D, t: number) {
    c.fillStyle = css('paper'); c.fillRect(96, 270, 1728, 570);
    c.fillStyle = css('ink', 0.12); c.fillRect(96, 270, 1728, 1); c.fillRect(96, 840, 1728, 1);
    machineLabel(c, 'REVIEW / #1031', 120, 330, 20, 'ink', 0.6);
    const line = this.w.voice.line('Then you wrote, “Looks good to me”');
    releaseLyric(c, this.w.voice, line, t, 120, 450, 1680, 'paper', [0, 3]);
    releaseLyric(c, this.w.voice, line, t, 120, 650, 1680, 'paper', [3, 7]);
    const good = line.words.find((w) => /good/i.test(w.w))!, me = line.words.at(-1)!;
    drawNote(c, { ax: 1500, ay: 330, x: 1530, y: 400, text: 'reviewed in 4.2 s', t0: good.start + 0.3, on: 'paper' }, t);
    // Stage 9 ②: the review is stamped on "me" (bureau.ts's stamp: 1.55 → 1 in 0.18 s).
    stamp(c, 'APPROVED', 1440, 560, 96, { t, at: me.start, rot: -0.09, color: 'pass', seed: 31 });
  }

  private merge(c: CanvasRenderingContext2D, t: number, join: number) {
    const v = this.w.voice, line = v.line('Merged to main, and now we’re free');
    const forms = v.forms(line, t).slice(0, 3).map(f => ({ ...f, text: f.text.replace(/,/g, '').toUpperCase() }));
    const set = setLine(forms, 300), sx = Math.min(1, 1728 / Math.max(1, set.width));
    c.save(); c.translate(96, 0); c.scale(sx, 1);
    for (let i = 0; i < set.words.length; i++) {
      const s = set.words[i]!;
      if (s.form.born <= 0) continue;
      c.globalAlpha = Math.min(1, s.form.born * 1.6); c.fillStyle = heatColor(s.form.stress ? 'clay' : 'ink', 'paper', s.form.age);
      fillRun(c, s.run, i === 2 ? lerp(0, s.x, join) : s.x, i === 2 ? lerp(810, 490, join) : 490);
    }
    c.restore();
    // Stage 9 ③: "and now we're" is typed; "free" breaks free: each letter, once struck, floats up
    // out of the line and keeps rising through the held note (no fade: they leave the frame).
    const tail = typeWords(c, v, line.words.slice(3, 6), t, { x: 96, y: 960, size: 92, on: 'paper', cursor: t < line.words[6]!.start, seed: 176 });
    const free = line.words[6]!;
    if (tail && t >= free.start) {
      const fin = inscribe([{ ...v.form(free, free.end), born: 1, age: 0 }], 92), x0 = 96 + tail.ins.width + 92 * 0.26;
      drawInscription(c, { ...fin, glyphs: fin.glyphs.map((g) => ({ ...g, form: v.form(free, t) })) }, t, { on: 'paper', head: 'type', seed: 177,
        place: (g, x) => { const u = Math.max(0, t - g.t - 0.12); return affine(x0 + x + 18 * u * (g.gi - 1.5), 960 - 260 * u * u - 60 * u, (g.gi - 1.5) * 0.08 * u); } });
    }
    // Stage 9 ③: Clawd celebrates the merge, a hop on every beat through the held "free".
    const au = this.ctx.audio, merged = line.words[0]!.start;
    Clawd.draw(c, 1560, 960 - 5 * 11.5, Clawd.pose('A12', { beat: au.beatAt(t), beat0: au.beatAt(merged), p: 0 }), { px: 11.5 });
  }

  /**
   * v4 motion (the chorus grammar, last time): creep and inhale into the final COMMIT, a sprung hit,
   * a slow push into the diff with a nudge per word, a punch on "good", a push along the merge.
   * The device-wall crane is the scene's own camera, so the lens rests at identity from there on.
   */
  private lensView(t: number, shot: number) {
    const T = this.w.times, au = this.ctx.audio, R = T.release;
    let zoom = 1, rot = 0, fx = 960, fy = 540;
    if (shot === 0) {
      zoom = 1 + 0.18 * ease.inQuad(span(t, R[0]!.start, T.hit)) - 0.09 * ease.inOutCubic(span(t, afterBeats(au, T.hit, -0.5), T.hit));
    } else if (shot === 1) {
      const b = Math.max(0, beatsSince(au, t, T.hit));
      zoom = 1 + 0.18 * Math.exp(-b * 6) * Math.cos(b * 9); rot = 0.03 * Math.exp(-b * 5) * Math.sin(b * 11);
    } else if (prActive(t, this.w.pr)) {
      // the PR page keys its own camera in the canvas (crisp type); the lens rests
    } else if (shot < 7) {
      zoom = 1 + 0.06 * ease.inOutQuad(span(t, R[2]!.start, R[7]!.start)); fy = 620;
      const line = this.ctx.lyrics.lastLine(t);
      for (const wd of line?.words ?? []) if (t >= wd.start) {
        const k = Math.pow(0.5, (t - wd.start) / 0.09), big = /good|merged/i.test(wd.w) ? 3 : 1;
        zoom += 0.02 * big * k; rot += (wd.index % 2 ? 0.005 : -0.005) * big * k;
      }
      const settle = ease.inOutCubic(span(t, afterBeats(au, R[7]!.start, -1), R[7]!.start));
      zoom = lerp(zoom, 1, settle); rot *= 1 - settle;
    }
    return { zoom, fx, fy, rot };
  }

  override render(f: Frame, finalOut: THREE.WebGLRenderTarget) {
    const out = this.w.lens.rt;
    const w = this.w, T = w.times, v = w.voice, t = f.t;
    const state = releaseState(this.ctx.audio, t, T), s = releaseLayout(this.ctx.audio, this.ctx.lyrics, t, T);
    w.ground.render(this.ctx.renderer, out, { kind: state.ground, t, grid: 0, halftone: 0.12, pitch: 7, haze: 0 });
    w.layer.clear(); const c = w.layer.ctx;

    if (state.shot <= 1) {
      const hook = v.line('I need one last commit'), au = this.ctx.audio;
      const flooded = state.shot === 1 || t >= afterBeats(au, T.release[0]!.start, 1);
      // Pickup level 3 (kit/hookslam): once the incoming clay has flooded, the ground strobes on the
      // 8ths and the words re-slam on every beat; COMMIT itself is this scene's own print below.
      const strobeOn = flooded ? strobe(3, hook, t, f.beat, 'clay', hook.words.at(-1)!.start) : 'clay';
      if (state.shot === 0) {
        c.fillStyle = css(strobeOn); const b = flooded ? { x: 0, y: 0, w: 1920, h: 1080 } : s.incoming; c.fillRect(b.x, b.y, b.w, b.h);
      }
      if (flooded) drawPickup(c, v, hook, t, 3, au, { on: strobeOn, hit: hook.words.at(-1)!.start });
      else releaseLyric(c, v, hook, t, 96, 900, 1728, 'paper', [0, 4]);
      const commit = v.form(hook.words.at(-1)!, t, { minWidth: 62, maxWidth: 112.5, rest: 900 });
      if (commit.born > 0) {
        const run = varRun('COMMIT', 760, commit.axes), box = { x: -60, y: 205, w: 2040, h: 530 };
        // level 3: six filled afterimages burst from the MIT slam and die out before the still beat
        const age = t - T.hit;
        if (age >= 0) for (let j = 6; j >= 1; j--) {
          const k = 1 + j * 0.07 * (1 + age * 2.5), a = (0.42 - j * 0.06) * Math.pow(0.5, age / 0.18);
          if (a < 0.01) continue;
          c.save(); c.translate(960, 470); c.scale(k, k); c.translate(-960, -470);
          printRun(c, run, box, j % 2 ? 'paper' : 'ink', 17, a); c.restore();
        }
        printRun(c, run, box, flooded ? 'ink' : 'clay', 17,
          Math.min(1, commit.born * 1.6), heatColor(flooded ? 'ink' : 'clay', flooded ? 'clay' : 'paper', commit.age));
      }
    } else {
      const machineLine = v.line('And it works on every machine');
      const deviceBand = t >= machineLine.start;
      if (deviceBand) {
        // v5: the wall is real hardware in depth (parts/s17-world.ts); the camera is born on one screen
        // and pulls back to the storyboard's front-on frame by the last shot
        const opacity = s.wall ? s.wallOpacity : span(t, machineLine.start, afterBeats(this.ctx.audio, machineLine.start, 1));
        if (!s.wall) w.wall.draw(c, v, t, opacity);
        else {
          const sc = w.wall3.screenCtx; sc.clearRect(0, 0, 512, 384);
          const forms = v.forms(machineLine, t).slice(-2), set = setLine(forms, 150);
          sc.save(); sc.translate(24, 240); sc.scale(Math.min(1, 464 / Math.max(1, set.width)), 1);
          for (const x of set.words) if (x.form.born > 0) { sc.fillStyle = heatColor(x.form.stress ? 'ink' : 'paper', 'clay', x.form.age); fillRun(sc, x.run, x.x, 0); }
          sc.restore();
          const every = this.ctx.lyrics.get('And it works on every machine').words.find((x) => /every/i.test(x.w))!.start;
          w.wall3.setCam(wallCam(span(t, every, afterBeats(this.ctx.audio, T.release.at(-1)!.end, -0.4))));
          w.wall3.render(this.ctx.renderer, out, Math.pow(0.5, (f.beat % 1) / 0.15));
        }
        this.graph(c, f, s);
        Clawd.draw(c, s.clawd.x, s.clawd.y, Clawd.pose(null, { beat: f.beat, beat0: 0, p: 0 }), { px: s.clawd.px });
      }
      // Stage 9 ③: from "Pull" until the card squashes into MERGED, the PR page (parts/s17-pr.ts)
      // owns the frame: its own camera, Clawd, the diff and the review.
      const pr = prActive(t, w.pr);
      if ((state.shot === 2 || state.shot === 3 || state.shot >= 7) && !s.review && !pr) {
        for (let i = 0; i < 2; i++) printRun(c, w.diff[i]!, DIFF_BOXES[i]!, i ? 'pass' : 'fail', 171 + i, 0.6);
      }
      if (s.review && !pr) this.review(c, t);
      else if (s.merge) { this.merge(c, t, s.join); this.sparkJoin(c, t); }
      else if (deviceBand) {
        if (!s.wall) releaseLyric(c, v, machineLine, t, 96, 700, 1728, 'paper', [0, 4]);
      } else if (!pr) {
        const line = this.ctx.lyrics.lineAt(t) ?? this.ctx.lyrics.lastLine(t);
        if (line) releaseLyric(c, v, line, t, 96, 220);
        machineLabel(c, 'PR #1031 / month.ts:42', 96, 335, 20, 'ink', 0.6);
      }
      drawPR(c, v, this.ctx.audio, t, w.pr);
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.print.render(this.ctx.renderer, out, state.ground === 'clay' ? 0.04 : 0.05);
    w.lens.film(this.ctx.renderer, finalOut, this.lensView(t, state.shot));
    // Level 3 impacts: every pickup slam and re-slam, the MIT at 20 px; then the film's one complete
    // stillness, the last beat before "Pull request".
    const pull = T.release[2]!.start, hook = v.line('I need one last commit');
    const hits = [...pickupHits(3, this.ctx.audio, hook), { t: T.hit, shake: 20, kick: 0.03 }];
    const still = t >= afterBeats(this.ctx.audio, pull, -1) && t < pull;
    const shake = state.shot <= 1 && !still ? impact(t, hits).shake
      : prActive(t, w.pr) ? impact(t, prHits(w.pr)).shake : [0, 0] as [number, number];
    return { ...postFor(state.ground), hud: 0, frame: 0, grain: 0.035, shake };
  }
}
