// S13: second chorus. A commit river breaks its banks, then LOCAL and CI collide.
// One shared world serves all eight editorial cuts; every draw is a function of song time.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font, fitSize } from '../engine/type';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { drawCursor, blink } from '../kit/cursor';
import { afterBeats, beatsSince, span } from '../kit/time';
import { CALENDAR_TESTS, GIT_LOG_COMMITS } from '../kit/content';
import * as Clawd from '../kit/clawd';
import { chorusScore, chorusState, commitId, inscribe, label, machineLine,
  type ChorusScore, type ChorusState } from './parts/s13-score';

const ROW = 82;
const PAPER = lin('paper');
const CLAY = lin('clay');
const PX = 13;

class GitfallWorld {
  ground = new Ground();
  layer = new Layer2D();
  glow = new GlowLayer();
  rules = new LineBatch(2400, { blend: 'normal' });
  T: ChorusScore;
  users = 0;

  constructor(ctx: SceneCtx) { this.T = chorusScore(ctx.audio, ctx.lyrics); }

  dispose() {
    this.ground.pass.mat.dispose();
    this.layer.texture.dispose();
    this.glow.layer.texture.dispose();
    this.rules.geo.dispose(); this.rules.mat.dispose();
  }

  /** Three scales of the same commit stream: remote traces, then the legible working log. */
  waterfall(c: CanvasRenderingContext2D, s: ChorusState, f: Frame, ctx: SceneCtx) {
    const T = this.T, au = ctx.audio;
    const overflow = s.second ? ease.outExpo(span(f.t, T.hit2, afterBeats(au, T.hit2, 0.7))) : 0;
    const lanes = [
      { x: 76, y: 252, w: 405, rows: 13, speed: 0.55, alpha: 0.22, size: 20 },
      { x: 506, y: 185, w: 452, rows: 14, speed: 0.8, alpha: 0.36, size: 24 },
      { x: 982, y: 175, w: 830, rows: 12, speed: 1, alpha: 1, size: 31 },
    ];
    for (let n = 0; n < lanes.length; n++) {
      const lane = lanes[n]!;
      c.save();
      const displaced = n === 2 ? overflow * -250 : overflow * -620;
      c.translate(lane.x, lane.y + displaced);
      // Perspective compression is deliberately graphic; the hero remains readable.
      c.transform(1, 0, n === 2 ? -0.035 : 0.02, 1, 0, 0);
      c.beginPath(); c.rect(0, 0, lane.w, 820); c.clip();
      c.globalAlpha = lane.alpha;
      if (n === 2) {
        c.fillStyle = css('ink', s.kind === 'clay' ? 0.9 : 0.78);
        c.fillRect(0, 0, lane.w, 820);
        label(c, 'git log --oneline --all', 30, 40, 22);
        label(c, `fix/october-32  /  ${String(s.rowCount).padStart(2, '0')} commits`, 30, 73, 16, 0.55);
        c.fillStyle = css('paper', 0.22); c.fillRect(30, 96, lane.w - 60, 1);
      }
      const scroll = s.scroll * lane.speed;
      const first = Math.floor(scroll);
      const off = scroll - first;
      for (let r = 0; r < lane.rows; r++) {
        const i = first - lane.rows + r + 1 + (s.second ? 24 : 0);
        if (i < 0 || i >= s.rowCount) continue;
        const y = 136 + r * ROW - off * ROW;
        const hot = i === s.rowCount - 1;
        const commit = GIT_LOG_COMMITS[i];
        const id = commit?.hash ?? commitId(i);
        const message = commit?.message ?? (i % 3 === 2 ? 'fix a bit' : 'fix');
        const land = n === 2 && hot ? Math.max(0, 1 - off * 3) : 0;
        c.save(); c.translate(land * 38, 0);
        c.fillStyle = css('paper', 0.1); c.fillRect(24, y + 22, lane.w - 48, 1);
        label(c, id, 32, y, lane.size, 0.9, 'clay');
        label(c, message, lane.size === 31 ? 208 : 160, y, lane.size, hot ? 1 : 0.7);
        if (n === 2) label(c, `HEAD~${s.rowCount - 1 - i}`, lane.w - 170, y, 18, 0.32);
        c.restore();
      }
      c.restore();
    }
  }

  /** Rows enter on measured beats; failures twitch without advancing any state. */
  fitTests(c: CanvasRenderingContext2D, f: Frame, s: ChorusState, ctx: SceneCtx) {
    const b = Math.max(0, beatsSince(ctx.audio, f.t, this.T.tests));
    const appear = ease.outExpo(span(b, 0, 0.7));
    const fi = frameIdx(f.t);
    c.save(); c.translate(105, 215); c.scale(1 + 0.06 * (1 - appear), 1);
    c.globalAlpha = appear;
    c.fillStyle = css('ink', 0.97); c.fillRect(0, 0, 820, 762);
    label(c, 'calendar / month.test.ts', 32, 43, 22);
    label(c, '19 failed', 620, 43, 22, 1, 'fail');
    c.fillStyle = css('paper', 0.2); c.fillRect(32, 63, 756, 1);
    const active = Math.floor(b * 3) % 19;
    for (let i = 0; i < 19; i++) {
      const dx = (hash(fi, i, 13) - 0.5) * (i === active ? 34 : 8) * f.a.snare;
      const dy = (hash(fi, i, 14) - 0.5) * 12 * (i === active ? 1 : 0.25);
      const y = 94 + i * 33 + dy;
      c.fillStyle = css('fail'); c.fillRect(32 + dx, y - 11, 8, 8);
      label(c, CALENDAR_TESTS[i]!, 58 + dx, y, 19, i === active ? 1 : 0.65);
      label(c, 'FAIL', 707 + dx, y, 16, 0.9, 'fail');
    }
    c.restore();
    // A separate, oversized machine voice records the repeated failure.
    c.save(); c.translate(94, 181);
    c.font = font(F.archivo(62 + 25 * (1 - s.impact), 900), 122);
    c.fillStyle = css('paper'); c.fillText('THROWING FITS', 0, 0);
    c.restore();
  }

  /** Freeze the last test result rather than colouring the environment with semantic red. */
  pickup(c: CanvasRenderingContext2D, f: Frame, ctx: SceneCtx, second: boolean) {
    const t0 = second ? this.T.pickup2 : this.T.start;
    const hit = second ? this.T.hit2 : this.T.hit1;
    const line = ctx.lyrics.lastLine(f.t);
    const b = beatsSince(ctx.audio, f.t, t0);
    const x = 164, y = 552;
    c.save();
    label(c, second ? 'HEAD  /  ONE MORE' : 'HEAD  /  RETRY', x, 172, 20, 0.7);
    label(c, 'git commit -m', x, y - 114, 24, 0.45);
    if (line) {
      const visible = line.words.filter((w) => w.start <= f.t && !/commit/i.test(w.w)).map((w) => w.w).join(' ');
      c.font = font(F.archivo(87.5, 800), 132); c.fillStyle = css('paper');
      c.fillText(visible.toUpperCase(), x, y);
      const commit = line.words.find((w) => /commit/i.test(w.w));
      if (commit && f.t >= commit.start) {
        c.font = font(F.archivo(87.5, 900), 240); c.fillText('COM—', x - 8, y + 246);
      }
    }
    // The short-lived failed-test copies are a memory of S12, not an extra accent colour.
    for (let j = 0; j < 3; j++) {
      c.save(); c.globalAlpha = 0.12 - 0.025 * j;
      c.translate(1290 + j * 22, 375 - j * 32);
      label(c, 'calendar / tests', 0, 0, 20);
      label(c, '19 failed', 0, 46, 43, 1, 'fail');
      c.restore();
    }
    label(c, `staged  /  ${second ? '24' : '01'}`, x, 940, 19, 0.5);
    c.restore();
    const head = { x: x + 52, y: 846, h: 62, on: blink(ctx.audio.beatAt(f.t)) };
    drawCursor(c, head); drawCursor(this.glow.ctx, head);
    // A hairline is still being plotted during the hold; the log itself is frozen.
    const tail = span(f.t, t0, hit) * 530;
    this.rules.seg2(x + 88, 847, x + 88 + tail, 847, 1.25, CLAY, 0.8);
    label(c, b < 3 ? 'awaiting commit' : 'awaiting accent', 760, 847, 18, 0.45);
  }

  /** Level two: two oversized solid rows, compressed width, a full-field clay flip. */
  impact(c: CanvasRenderingContext2D, f: Frame, s: ChorusState, ctx: SceneCtx) {
    if (s.kind !== 'clay') return;
    const at = s.second ? this.T.hit2 : this.T.hit1;
    const b = beatsSince(ctx.audio, f.t, at);
    const settle = ease.outExpo(span(b, 0, 0.55));
    const width = lerp(62, 100, settle);
    c.save();
    c.translate(44, lerp(-140, 0, settle));
    const family = F.archivo(width, 900);
    c.font = font(family, fitSize('COMMIT', family, W - 30, 530));
    c.fillStyle = css('ink'); c.fillText('COMMIT', 0, 440);
    c.globalAlpha = 0.2;
    c.fillText('COMMIT', -96, 1040);
    c.globalAlpha = 1;
    label(c, s.second ? 'ONE MORE / AGAIN' : 'ONE MORE / CHORUS 02', 68, 82, 24, 1, 'ink');
    label(c, `git commit  ${s.second ? commitId(24) : GIT_LOG_COMMITS[0]!.hash}`, 68, 486, 23, 1, 'ink');
    c.restore();
    // The log window bursts out of the block cursor, remaining on top of the bottom echo.
    c.save();
    const k = Math.max(0.05, settle);
    c.translate(983, 758); c.scale(k, k); c.translate(-640, -164);
    c.fillStyle = css('ink'); c.fillRect(0, 0, 1280, 326);
    label(c, 'git log --oneline', 32, 45, 24, 0.65);
    for (let i = 0; i < 3; i++) {
      label(c, s.second ? commitId(24 + i) : GIT_LOG_COMMITS[i]!.hash, 32, 111 + i * 69, 31, 1, 'clay');
      label(c, i === 2 ? 'fix a bit' : 'fix', 253, 111 + i * 69, 42);
    }
    c.restore();
  }

  /** A test surface is a single flat colour with crisp machine text, never a glowing status. */
  testScreen(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
    local: boolean, f: Frame, opacity: number) {
    c.save(); c.translate(x, y); c.globalAlpha *= opacity;
    c.fillStyle = css('ink'); c.fillRect(0, 0, w, h);
    c.fillStyle = css('paper', 0.08); c.fillRect(0, 0, w, 92);
    label(c, local ? 'LOCAL / localhost' : 'CI / clean runner', 36, 54, 26);
    label(c, local ? '19 / 19 passed' : '19 / 19 failed', 36, 162, 47, 1, local ? 'pass' : 'fail');
    label(c, 'calendar / month.test.ts', 36, 207, 20, 0.5);
    for (let i = 0; i < 19; i++) {
      const col = i % 5, row = Math.floor(i / 5);
      const tx = 36 + col * (w - 72) / 5, ty = 259 + row * 106;
      c.fillStyle = css(local ? 'pass' : 'fail'); c.fillRect(tx, ty, (w - 106) / 5, 74);
      c.save(); c.strokeStyle = css('paper'); c.lineWidth = 3;
      c.beginPath();
      if (local) { c.moveTo(tx + 19, ty + 38); c.lineTo(tx + 30, ty + 49); c.lineTo(tx + 51, ty + 25); }
      else { c.moveTo(tx + 22, ty + 26); c.lineTo(tx + 45, ty + 49); c.moveTo(tx + 45, ty + 26); c.lineTo(tx + 22, ty + 49); }
      c.stroke(); c.restore();
      label(c, String(i + 1).padStart(2, '0'), tx + 70, ty + 44, 18, 0.9);
    }
    label(c, local ? 'same commit / cached environment' : 'same commit / cold environment', 36, h - 30, 17, 0.45);
    c.restore();
    void f;
  }

  screens(c: CanvasRenderingContext2D, f: Frame, s: ChorusState, ctx: SceneCtx) {
    const entry = ease.outExpo(span(f.t, this.T.split, afterBeats(ctx.audio, this.T.split, 0.5)));
    const width = 790, height = 762;
    const left = lerp(-830, 70, entry) + 570 * s.crush;
    const right = lerp(1960, 1060, entry) - 570 * s.crush;
    const y = 163 + 27 * s.crush;
    const opacity = 1 - 0.25 * s.eject;
    // A narrow shaft of negative space is preserved for Clawd until the actual collision.
    c.save();
    c.translate(left + width / 2, y + height / 2); c.rotate(-0.035 * s.crush);
    this.testScreen(c, -width / 2, -height / 2, width, height, true, f, opacity); c.restore();
    c.save();
    c.translate(right + width / 2, y + height / 2); c.rotate(0.035 * s.crush);
    this.testScreen(c, -width / 2, -height / 2, width, height, false, f, opacity); c.restore();
    label(c, 'MY MACHINE', 80, 114, 25, 0.9);
    label(c, 'YOUR MACHINE', 1080, 114, 25, 0.9);
    this.rules.seg2(959, 148, 959, 925, 1.2, PAPER, (1 - s.crush) * 0.3);
  }

  clawd(c: CanvasRenderingContext2D, f: Frame, s: ChorusState, ctx: SceneCtx, glow = false) {
    if (s.frozen) return;
    const T = this.T, at = s.second ? T.hit2 : T.hit1;
    let action: Clawd.Action = s.testMode || s.split ? 'A8' : 'A4';
    let x = 779, y = 869, beat0 = ctx.audio.beatAt(at);
    if (beatsSince(ctx.audio, f.t, at) < 1) action = 'A6';
    if (s.split) { x = 859; y = 643; }
    if (s.crush > 0) { action = 'A6'; beat0 = ctx.audio.beatAt(T.collision); }
    if (s.eject > 0) {
      x += 760 * s.eject; y -= 1290 * s.eject;
      c.save(); c.translate(x + 8 * PX, y + 2.5 * PX); c.rotate(s.eject * 2.1);
      x = -8 * PX; y = -2.5 * PX;
    }
    const pose = Clawd.pose(action, { beat: f.beat, beat0, p: 0, jumpBeats: 0.65 });
    Clawd.draw(c, x, y, pose, { px: PX, body: css('clay'), eye: glow ? css('clay', 0) : css('ink') });
    if (s.eject > 0) c.restore();
  }

  streamRules(s: ChorusState, f: Frame) {
    const motion = s.frozen ? 0 : s.scroll * ROW;
    for (let lane = 0; lane < 3; lane++) {
      const x = 64 + lane * 455;
      this.rules.seg2(x, 163, x, 970, 1, PAPER, s.split ? 0 : 0.15);
      for (let r = 0; r < 12 && !s.split; r++) {
        const y = 170 + ((r * ROW - motion * (0.3 + lane * 0.2)) % 850 + 850) % 850;
        this.rules.seg2(x - 6, y, x + 9, y, 1.1, CLAY, 0.4);
      }
    }
    if (!s.split && !s.frozen && s.kind === 'ink') {
      const y = 910 - (s.scroll % 1) * ROW;
      this.rules.seg2(932, 175, 932, y, 1.7, CLAY, 0.85);
      drawCursor(this.layer.ctx, { x: 921, y, h: 30 });
      drawCursor(this.glow.ctx, { x: 921, y, h: 30 });
    }
    void f;
  }
}

let world: GitfallWorld | undefined;

export default class S13Gitfall extends Scene {
  private w!: GitfallWorld;

  override init() { this.w = world ??= new GitfallWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.T, s = chorusState(this.ctx.audio, f.t, T);
    w.ground.render(this.ctx.renderer, out, {
      kind: s.kind, t: f.t, camX: s.split ? 0 : s.scroll * 18,
      camY: -s.scroll * ROW * 0.38, zoom: s.frozen ? 1.18 : 1,
      kick: s.frozen ? 0.12 * f.a.kick : f.a.kick, grid: s.frozen ? 0.3 : 0.65,
      haze: 0.2, streaks: s.frozen || s.split ? 0.05 : 0.75,
      travel: s.scroll * 0.65, halftone: s.kind === 'clay' ? 0.8 : 0,
    });
    w.layer.clear(); w.glow.clear(); w.rules.clear();
    const c = w.layer.ctx;
    if (s.frozen) w.pickup(c, f, this.ctx, f.t >= T.pickup2);
    else if (s.split) w.screens(c, f, s, this.ctx);
    else {
      w.waterfall(c, s, f, this.ctx);
      if (s.testMode) w.fitTests(c, f, s, this.ctx);
      else if (s.kind === 'ink') {
        c.save(); c.translate(80, 173); c.font = font(F.archivo(62, 900), 155);
        c.fillStyle = css('paper'); c.fillText('FIX', 0, 0); c.restore();
        label(c, 'and fix / and fix a bit', 92, 225, 20, 0.6);
      }
      w.impact(c, f, s, this.ctx);
    }
    w.streamRules(s, f);
    w.clawd(c, f, s, this.ctx);
    if (s.kind === 'ink') w.clawd(w.glow.ctx, f, s, this.ctx, true);

    const line = machineLine(this.ctx.lyrics, f.t, T.start, T.end);
    if (line && !s.frozen && s.kind === 'ink') {
      // Words are committed into the river's fixed command strip, or span both test surfaces.
      c.fillStyle = css('ink', 0.98); c.fillRect(74, 975, 1772, 76);
      label(c, '$', 96, 1027, 27, 1, 'clay');
      inscribe(c, line, f.t, 144, 1027, 31, 100, 'paper', 'paper', true);
      const p = span(f.t, line.start, line.end);
      const head = { x: 145 + c.measureText(line.text).width * p, y: 1043, h: 12 };
      drawCursor(c, head);
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.rules.render(this.ctx.renderer, out);
    if (s.kind === 'ink') w.glow.composite(this.ctx, out, 1.45);
    const magnitude = (s.frozen ? 0 : 13 * s.impact) + (s.testMode ? f.a.snare * 3 : 0) + 8 * s.crush * (1 - s.eject);
    const fi = frameIdx(f.t);
    return { ...postFor(s.kind), bloom: s.kind === 'ink' ? 0.38 : 0, vignette: 0.1, hud: 0,
      shake: [(hash(fi, 131) - 0.5) * magnitude, (hash(fi, 132) - 0.5) * magnitude] as [number, number] };
  }
}
