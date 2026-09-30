// S17: one last commit becomes a one-character diff, a drawn merge, then every machine.
// All nine editorial entries share GPU resources. Every placement is recomputed from song time.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font, fitSize } from '../engine/type';
import { clamp, ease, frameIdx, hash, lerp } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { drawCursor, blink } from '../kit/cursor';
import { Stage, type Panel } from '../kit/stage';
import { drawPr } from '../kit/pr';
import { gitMergePoint, gitConfetti } from '../kit/gitgraph';
import { drawCalendar } from '../kit/calendar';
import { MONTH_PATH, PR_TITLE, COMMITS } from '../kit/content';
import * as Clawd from '../kit/clawd';
import { afterBeats, beatsSince, span } from '../kit/time';
import { DeviceWall } from './parts/s17-device-wall';
import { resolveReleaseTimes, releaseState, type ReleaseTimes } from './parts/s17-release-state';
import { machineLabel, releaseLyric } from './parts/s17-release-type';

class ReleaseWorld {
  ground = new Ground();
  layer = new Layer2D();
  lines = new LineBatch(4000, { blend: 'normal' });
  stage: Stage;
  pr: Panel;
  wall: DeviceWall;
  times: ReleaseTimes;
  users = 0;

  constructor(ctx: SceneCtx) {
    this.times = resolveReleaseTimes(ctx.audio, ctx.lyrics);
    this.stage = new Stage(ctx.renderer, W, H, true);
    this.pr = this.stage.addPanel(1200, 740, 1.35);
    this.wall = new DeviceWall(ctx.renderer);
  }

  dispose() {
    this.stage.dispose(); this.wall.dispose(); this.layer.texture.dispose();
    this.ground.pass.mat.dispose();
    this.lines.geo.dispose(); this.lines.mat.dispose();
  }
}

const worlds = new WeakMap<THREE.WebGLRenderer, ReleaseWorld>();

export default class S17Release extends Scene {
  private world!: ReleaseWorld;

  override init() {
    this.world = worlds.get(this.ctx.renderer) ?? new ReleaseWorld(this.ctx);
    worlds.set(this.ctx.renderer, this.world); this.world.users++;
  }

  override dispose() {
    if (--this.world.users === 0) { this.world.dispose(); worlds.delete(this.ctx.renderer); }
  }

  private mascot(c: CanvasRenderingContext2D, f: Frame, action: Clawd.Action | null,
    x: number, y: number, px: number, start: number, p = 0) {
    Clawd.draw(c, x, y, Clawd.pose(action, {
      beat: f.beat, beat0: this.ctx.audio.beatAt(start), p, jumpBeats: 1,
    }), { px });
  }

  private pickup(c: CanvasRenderingContext2D, f: Frame) {
    const T = this.world.times, hook = this.ctx.lyrics.get('I need one last commit');
    machineLabel(c, 'fix/october-32  →  main', 110, 190, 25, 'ink', 0.6);
    // This is the longest release hold: typography types, but geometry stays locked.
    c.fillStyle = css('ink', 0.12); c.fillRect(110, 310, 1700, 1); c.fillRect(110, 790, 1700, 1);
    c.font = font(F.archivo(87.5, 900), 220); c.fillStyle = css('ink');
    c.fillText('ONE LAST', 105, 600);
    releaseLyric(c, hook, f.t, 115, 735, 52, 'ink', 1470, true);
    drawCursor(c, { x: 1635, y: 594, h: 180, on: blink(f.beat) });
    machineLabel(c, '19 / 19 TESTS  ·  1 CHARACTER', 115, 865, 25);
    const left = beatsSince(this.ctx.audio, T.hit, f.t);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = css('ink', left > i ? 0.15 : 0.6); c.fillRect(1500 + i * 58, 840, 30, 8);
    }
  }

  private impact(c: CanvasRenderingContext2D, f: Frame, impact: number) {
    const T = this.world.times, b = beatsSince(this.ctx.audio, f.t, T.hit);
    const land = ease.outExpo(clamp(b / 0.28));
    const width = lerp(75, 125, ease.outCubic(clamp(b / 2)));
    const family = F.archivo(width, 900);
    c.save(); c.translate(W / 2, 535 - (1 - land) * 340);
    // Filled repeats push past every edge; the central word remains the dominant slab.
    const size = fitSize('COMMIT', family, 2080, 530);
    c.font = font(family, size); c.textAlign = 'center';
    const echoes = [-1, 1];
    for (const side of echoes) {
      c.fillStyle = css('ink', 0.18); c.fillText('COMMIT', side * impact * 90, side * 390 + size * 0.3);
    }
    c.fillStyle = css('paper'); c.fillText('COMMIT', 0, size * 0.3); c.restore();
    const hash = COMMITS[0]!.hash;
    c.font = font(F.mono(600), 84); c.fillStyle = css('ink');
    c.fillText(hash, lerp(960, 122, land), lerp(600, 865, land));
    drawCursor(c, { x: 100 + c.measureText(hash).width + 30, y: 865, h: 80, color: 'ink' });
    machineLabel(c, 'FINAL COMMIT  /  ONE CHARACTER  /  LEVEL 03', 125, 945, 24);
    this.mascot(c, f, 'A6', 1430, 840, 18, T.hit);
    // A single expanding impact bar connects the title to the PR's hairline rule.
    c.fillStyle = css('ink'); c.fillRect(110, 180, 1700 * land, lerp(36, 2, land));
  }

  private pullRequest(f: Frame, shot: number, b: number, p: number, out: THREE.WebGLRenderTarget) {
    const w = this.world, at = w.times.release[2]!.start;
    const pop = ease.outExpo(clamp(beatsSince(this.ctx.audio, f.t, at) / 0.8));
    w.stage.clearPoster(); w.pr.clear();
    drawPr(w.pr.ctx, { x: 0, y: 0, width: 1200, height: 740 }, {
      titleProgress: clamp(beatsSince(this.ctx.audio, f.t, at) / 1.4),
      diffProgress: clamp(beatsSince(this.ctx.audio, f.t, at) / 2),
      reviewProgress: shot >= 4 ? clamp(b / 0.55) : 0,
    });
    w.pr.update({ x: 1130, y: 580 + (1 - pop) * 300, z: 35, rz: -1.2, alpha: pop });
    w.stage.view({ x: 1020, y: 565, zoom: lerp(0.86, 1.04, p), yaw: lerp(-12, 2, pop), pitch: 5 });
    w.stage.render(out);
  }

  private diff(c: CanvasRenderingContext2D, f: Frame, b: number) {
    const at = this.world.times.release[3]!.start;
    const e = ease.outExpo(clamp(b / 0.75));
    machineLabel(c, MONTH_PATH + '  :  42', 112, 230, 29, 'ink', 0.6);
    c.fillStyle = css('fail', 0.12); c.fillRect(100, 290, 1720, 205);
    c.fillStyle = css('pass', 0.12); c.fillRect(100, 535, 1720, 205);
    c.font = font(F.mono(500), 118);
    c.fillStyle = css('fail'); c.fillText('- d <= days', 130, 435);
    c.fillStyle = css('pass'); c.fillText('+ d <  days', 130, 680);
    // The deleted equals is lifted into its own enormous printing plate.
    const x = lerp(720, 1410, e), y = lerp(390, 480, e);
    c.save(); c.translate(x, y); c.rotate(lerp(0, -0.11, e));
    c.fillStyle = css('fail'); c.fillRect(-100 * e, -54, 310 * e + 10, 42 + 14 * e);
    c.fillRect(-100 * e, 36, 310 * e + 10, 42 + 14 * e); c.restore();
    machineLabel(c, '− 1 CHARACTER', 1275, 770, 28, 'fail');
    machineLabel(c, '+ 0 EXTRA DAYS', 1275, 820, 28, 'pass');
    c.fillStyle = css('ink', 0.3); c.fillRect(100, 865, 1720, 1);
    this.mascot(c, f, 'A3', 170, 800, 11, at);
    drawCursor(c, { x: lerp(728, 1615, e), y: lerp(454, 590, e), h: 42 });
  }

  private review(c: CanvasRenderingContext2D, f: Frame, b: number) {
    const at = this.world.times.release[4]!.start;
    const pop = ease.outBack(clamp(b / 0.65));
    c.save(); c.translate(220, 415 + (1 - pop) * 210); c.scale(pop, pop);
    // Human reviewer represented by a neutral typographic avatar, with no invented identity.
    c.fillStyle = css('ink'); c.fillRect(0, 0, 180, 180);
    c.fillStyle = css('paper'); c.font = font(F.mono(600), 88); c.fillText('H', 60, 122);
    c.restore();
    c.fillStyle = css('clay'); c.font = font(F.archivo(125, 900), 290);
    c.fillText('LGTM', 470, 655 + (1 - pop) * 110);
    const line = this.ctx.lyrics.get('Then you wrote');
    releaseLyric(c, line, f.t, 480, 335, 40, 'ink', 1210, true);
    const check = clamp(b / 0.8);
    const lines = this.world.lines; lines.clear();
    lines.seg2(258, 710, 302, 756, 6, lin('ink'), check);
    lines.seg2(302, 756, lerp(302, 395, check), lerp(756, 638, check), 6, lin('ink'));
    machineLabel(c, 'REVIEWED BY A HUMAN  /  READY TO MERGE', 480, 760, 26, 'ink', 0.6);
    this.mascot(c, f, 'A12', 1390, 785, 16, at);
  }

  private merge(c: CanvasRenderingContext2D, f: Frame, merge: number, celebration: boolean) {
    const T = this.world.times, at = T.release[5]!.start, lb = this.world.lines;
    lb.clear();
    const p = celebration ? 1 : merge;
    const scale = celebration ? 1.34 : lerp(1.58, 1.32, ease.outExpo(clamp(beatsSince(this.ctx.audio, f.t, at) / 1.5)));
    const tx = 230, ty = 280;
    const X = (v: number) => tx + v * scale, Y = (v: number) => ty + v * scale;
    lb.seg2(X(50), Y(190), X(950), Y(190), 2, lin('ink'), 0.65);
    for (const x of [150, 420, 860]) {
      c.fillStyle = css('ink'); c.beginPath(); c.arc(X(x), Y(190), 13, 0, Math.PI * 2); c.fill();
    }
    const pts: [number, number][] = [[150, 190], [230, 190], [280, 350], [680, 350]];
    for (let i = 1; i < pts.length; i++) lb.seg2(X(pts[i - 1]![0]), Y(pts[i - 1]![1]), X(pts[i]![0]), Y(pts[i]![1]), 3, lin('clay'));
    let previous = gitMergePoint(0);
    for (let i = 1; i <= 90; i++) {
      const next = gitMergePoint(p * i / 90);
      lb.seg2(X(previous.x), Y(previous.y), X(next.x), Y(next.y), 3, lin('clay'));
      previous = next;
    }
    drawCursor(c, { x: X(previous.x), y: Y(previous.y) + 16, h: 38 });
    machineLabel(c, 'main', X(48), Y(128), 34);
    machineLabel(c, 'fix/october-32', X(340), Y(425), 27, 'clay');
    machineLabel(c, 'a1f3c9e', X(610), Y(315), 24, 'clay');
    const confetti = clamp(beatsSince(this.ctx.audio, f.t, at) / 8);
    for (const piece of gitConfetti(confetti)) {
      c.save(); c.translate(X(piece.x), Y(piece.y - 160)); c.rotate(piece.rotation);
      c.globalAlpha *= piece.opacity; c.fillStyle = css(piece.color);
      c.fillRect(-piece.width, -piece.height, piece.width * 1.4, piece.height * 1.4); c.restore();
    }
    const title = celebration ? 'FREE.' : 'MERGED.';
    const family = F.archivo(celebration ? 125 : 100, 900);
    c.font = font(family, celebration ? 215 : 165); c.fillStyle = css('ink');
    c.fillText(title, 110, celebration ? 340 : 250);
    if (!celebration) {
      const press = Math.sin(Math.PI * clamp(beatsSince(this.ctx.audio, f.t, at) / 0.4));
      c.fillStyle = css('clay'); c.fillRect(1210, 172 + press * 8, 600, 90 - press * 8);
      machineLabel(c, 'MERGE PULL REQUEST', 1250, 232, 29);
    }
    this.mascot(c, f, 'A12', celebration ? 1260 : 1570, celebration ? 700 : 690,
      celebration ? 24 : 13, celebration ? T.release[6]!.start : at);
  }

  private devices(c: CanvasRenderingContext2D, f: Frame, shot: number, pull: number) {
    machineLabel(c, '31 DAYS  ·  EVERY SCREEN  ·  SAME ONE-CHARACTER FIX', 110, 220, 24, 'ink', 0.6);
    if (shot === 7) {
      const b = beatsSince(this.ctx.audio, f.t, this.world.times.release[7]!.start);
      const x = lerp(220, 1370, clamp(b / 3));
      this.mascot(c, f, 'A6', x, 820, 10, afterBeats(this.ctx.audio, this.world.times.release[7]!.start, Math.floor(b)));
    } else {
      c.font = font(F.archivo(125, 900), 155); c.fillStyle = css('ink');
      c.fillText('EVERY MACHINE.', 110, 940);
      machineLabel(c, '16 × 5  /  CLAWD', 1430, 260, 24, 'ink', pull);
    }
    // One prominent calendar remains legible while the wall is still close.
    if (shot === 7 && pull < 0.25) {
      c.save(); c.globalAlpha = 1 - pull * 4;
      drawCalendar(c, { x: 120, y: 290, width: 470, height: 440 }, { dayCount: 31, highlightedDays: [31] });
      c.restore();
    }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const w = this.world, T = w.times, s = releaseState(this.ctx.audio, f.t, T);
    const c = w.layer.ctx;
    w.layer.clear(); w.lines.clear();
    const motion = s.shot === 0 ? 0 : f.beat - this.ctx.audio.beatAt(T.release[0]!.start);
    w.ground.render(this.ctx.renderer, out, {
      kind: s.ground, t: f.t, kick: s.shot === 0 ? 0 : f.a.kick,
      camX: motion * (s.shot >= 7 ? 20 : 7), camY: motion * 3,
      grid: s.shot === 1 ? 0.2 : 0.72, halftone: s.shot === 1 ? 0.85 : 0.3,
      zoom: s.shot >= 7 ? s.wallZoom : 1 + s.impact * 0.14,
    });
    if (s.shot === 2) this.pullRequest(f, s.shot, s.b, s.p, out);
    if (s.shot >= 7) w.wall.render(this.ctx.renderer, out, {
      zoom: s.wallZoom, lit: s.wallLit, beat: f.beat, kick: f.a.kick,
      x: lerp(-150, 0, s.wallPull), y: lerp(-70, 0, s.wallPull), yaw: lerp(-0.15, 0, s.wallPull),
    });
    const line = this.ctx.lyrics.lineAt(f.t) ?? this.ctx.lyrics.lastLine(f.t);
    switch (s.shot) {
      case 0: this.pickup(c, f); break;
      case 1: this.impact(c, f, s.impact); break;
      case 2:
        machineLabel(c, 'PULL REQUEST  /  1031', 110, 250, 25);
        this.mascot(c, f, 'A3', 150, 755, 15, T.release[2]!.start); break;
      case 3: this.diff(c, f, s.b); break;
      case 4: this.review(c, f, s.b); break;
      case 5: this.merge(c, f, s.merge, false); break;
      case 6: this.merge(c, f, s.merge, true); break;
      default: this.devices(c, f, s.shot, s.wallPull);
    }
    if (s.shot >= 2 && s.shot !== 4) releaseLyric(c, line, f.t, 112, 138, 31, 'ink', 1600, s.shot === 2);
    if (s.shot >= 2 && s.shot <= 4) {
      c.fillStyle = css('ink', 0.3); c.fillRect(110, 180, 1700, 1);
      machineLabel(c, s.shot === 3 ? 'ONE CHARACTER. ONE DAY LESS.' : PR_TITLE, 112, 990, 25, 'ink', 0.6);
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.lines.render(this.ctx.renderer, out);
    const fi = frameIdx(f.t), shake = s.impact * 28;
    return { ...postFor(s.ground), hud: 0, grain: s.shot === 1 ? 0.045 : 0.025,
      shake: [shake * (hash(fi, 1031) - 0.5) * 2, shake * (hash(fi, 1032) - 0.5) * 2] };
  }
}
