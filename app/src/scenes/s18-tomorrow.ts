// S18: today's commits become a night sky; the cursor survives into tomorrow's issue.
// The star graph is a commit diagram, not a generic particle nebula. Only clay enters glow.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx, type PostOverrides } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { clamp, ease, hash, lerp } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { drawCursor, blink } from '../kit/cursor';
import { drawEditor } from '../kit/editor';
import { drawWelcome, welcomeLayout } from '../kit/welcome';
import { drawNotify } from '../kit/notify';
import { drawCredits, creditsState, CREDIT_LINES } from '../kit/credits';
import { drawCalendar } from '../kit/calendar';
import { FILE_TREE, MONTH_PATH, MONTH_SOURCE, COMMITS, GIT_LOG_COMMITS,
  WELCOME_LINES, NEXT_ISSUE, CALENDAR_MONTHS } from '../kit/content';
import * as Clawd from '../kit/clawd';
import { afterBeats, beatsSince, span } from '../kit/time';
import { DeviceWall } from './parts/s17-device-wall';
import { resolveReleaseTimes, tomorrowState, type ReleaseTimes } from './parts/s17-release-state';
import { machineLabel } from './parts/s17-release-type';

// The repaired source preserves line numbers and removes exactly the single equals sign.
const FIXED_SOURCE = MONTH_SOURCE.map((line, i) => i === 41 ? line.replace('<=', '<') : line);
const SKY_COMMITS = [...new Map([...COMMITS, ...GIT_LOG_COMMITS].map(commit => [commit.hash, commit])).values()];
const WELCOME_BOX = { x: 340, y: 280, width: 1240, height: 640 };
const CREDIT_COPY = [
  CREDIT_LINES[0], CREDIT_LINES[1],
  'Created by Tim · music generated with Suno',
  CREDIT_LINES[3], CREDIT_LINES[4], CREDIT_LINES[5],
] as const;

interface Star { x: number; y: number; depth: number; hash: string }

class TomorrowWorld {
  ground = new Ground();
  layer = new Layer2D();
  glow = new GlowLayer();
  lines = new LineBatch(6000, { blend: 'normal' });
  wall: DeviceWall;
  times: ReleaseTimes;
  users = 0;
  stars: Star[];

  constructor(ctx: SceneCtx) {
    this.times = resolveReleaseTimes(ctx.audio, ctx.lyrics);
    this.wall = new DeviceWall(ctx.renderer);
    this.stars = SKY_COMMITS.map((commit, i) => ({
      x: 140 + hash(i, 1701) * 1620, y: 180 + hash(i, 1801) * 720,
      depth: 0.4 + hash(i, 42) * 0.6, hash: commit.hash,
    }));
  }

  dispose() {
    this.wall.dispose(); this.layer.texture.dispose(); this.glow.layer.texture.dispose();
    this.ground.pass.mat.dispose(); this.lines.geo.dispose(); this.lines.mat.dispose();
  }
}

const worlds = new WeakMap<THREE.WebGLRenderer, TomorrowWorld>();

export default class S18Tomorrow extends Scene {
  private world!: TomorrowWorld;

  override init() {
    this.world = worlds.get(this.ctx.renderer) ?? new TomorrowWorld(this.ctx);
    worlds.set(this.ctx.renderer, this.world); this.world.users++;
  }

  override dispose() {
    if (--this.world.users === 0) { this.world.dispose(); worlds.delete(this.ctx.renderer); }
  }

  private sprite(c: CanvasRenderingContext2D, f: Frame, action: Clawd.Action,
    x: number, y: number, px: number, start: number, p = 0, alpha = 1) {
    const pose = Clawd.pose(action, { beat: f.beat, beat0: this.ctx.audio.beatAt(start), p });
    Clawd.draw(c, x, y, pose, { px, alpha, eye: css('ink', alpha) });
  }

  private starMap(c: CanvasRenderingContext2D, f: Frame, opacity: number) {
    const w = this.world, at = w.times.tomorrow[0]!.start, b = beatsSince(this.ctx.audio, f.t, at);
    const reveal = clamp(b / 14);
    const drift = beatsSince(this.ctx.audio, f.t, w.times.tomorrow[2]!.start);
    const points = w.stars.map((star, i) => ({
      x: star.x + Math.sin(drift * 0.055 + i * 0.37) * 22 * star.depth,
      y: star.y + Math.cos(drift * 0.06 + i * 0.24) * 12 * star.depth,
    }));
    const lb = w.lines;
    const illuminated = Math.min(points.length, Math.floor(reveal * points.length) + 1);
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!, star = w.stars[i]!;
      const on = clamp(reveal * points.length - i + 1);
      const voice = 0.55 + f.a.vocal * 0.3 + f.a.other * 0.15;
      const alpha = opacity * on * voice;
      if (i > 0) {
        const prev = points[i - 1]!;
        lb.seg2(prev.x, prev.y, lerp(prev.x, point.x, on), lerp(prev.y, point.y, on), 1.1, lin('paper'), alpha * 0.42);
      }
      if (i > 2 && i % 3 === 0) {
        const branch = points[i - 3]!;
        lb.seg2(branch.x, branch.y, point.x, point.y, 0.85, lin('paper'), alpha * 0.25);
      }
      lb.seg2(point.x - 4, point.y, point.x + 4, point.y, 1.5, lin('paper'), alpha);
      lb.seg2(point.x, point.y - 4, point.x, point.y + 4, 1.5, lin('paper'), alpha);
      if (i % 2 === 0) machineLabel(c, star.hash, point.x + 12, point.y - 11, 19, 'paper', alpha * 0.6);
    }
    const tip = points[Math.max(0, illuminated - 1)]!;
    const cursor = { x: tip.x + 10, y: tip.y + 13, h: 28, on: blink(f.beat), color: 'clay' as const };
    c.save(); c.globalAlpha *= opacity; drawCursor(c, cursor); c.restore();
    w.glow.ctx.save(); w.glow.ctx.globalAlpha *= opacity; drawCursor(w.glow.ctx, cursor); w.glow.ctx.restore();
    machineLabel(c, 'TODAY / ' + SKY_COMMITS.length + ' COMMITS / ONE LESS CHARACTER', 112, 145, 23, 'paper', opacity * 0.65);
  }

  /** Local INK rendering: shared office components are PAPER-only, so this stays scene-owned. */
  private nightEditor(c: CanvasRenderingContext2D, f: Frame, opacity: number, zoom: number) {
    c.save(); c.globalAlpha *= opacity;
    c.translate(W / 2, 565); c.scale(zoom, zoom); c.translate(-W / 2, -565);
    const x = 320, y = 295, width = 1280, height = 630;
    c.fillStyle = css('ink', 0.96); c.fillRect(x, y, width, height);
    c.fillStyle = css('paper', 0.12); c.fillRect(x, y + 42, width, 1); c.fillRect(x + 280, y + 42, 1, height - 42);
    machineLabel(c, 'month.ts', x + 308, y + 28, 20, 'paper');
    machineLabel(c, 'EXPLORER', x + 24, y + 80, 17, 'paper', 0.6);
    for (const [i, text] of ['src', '  calendar', '    month.ts', '    month.test.ts', 'package.json'].entries()) {
      machineLabel(c, text, x + 24, y + 130 + i * 38, 19, 'paper', i === 2 ? 1 : 0.55);
    }
    const source = FIXED_SOURCE.slice(35, 44);
    for (let i = 0; i < source.length; i++) {
      const yy = y + 100 + i * 36;
      machineLabel(c, String(i + 36), x + 305, yy, 19, 'paper', 0.4);
      machineLabel(c, source[i]!, x + 355, yy, 19, 'paper', i === 6 ? 1 : 0.62);
    }
    c.fillStyle = css('paper', 0.15); c.fillRect(x + 280, y + 445, width - 280, 1);
    machineLabel(c, 'TERMINAL', x + 307, y + 476, 17, 'paper', 0.6);
    machineLabel(c, 'clawd ~/calendar $', x + 310, y + 533, 23, 'paper');
    machineLabel(c, 'main  ·  calendar  ·  TypeScript', x + 24, y + height - 18, 17, 'paper', 0.6);
    const start = this.world.times.tomorrow[1]!.start;
    const chars = Math.floor(clamp(beatsSince(this.ctx.audio, f.t, start) / 1.5) * 6);
    machineLabel(c, 'exit 0'.slice(0, chars), x + 630, y + 533, 28, 'paper');
    drawCursor(c, { x: x + 630 + chars * 17, y: y + 540, h: 29, on: blink(f.beat) });
    this.sprite(c, f, f.t < start ? 'A3' : 'A1', x + 48, y + 360, 11, start);
    c.restore();
  }

  private nightWelcome(c: CanvasRenderingContext2D, f: Frame, opacity: number, zoom: number, wave: boolean) {
    const w = this.world, frame = welcomeLayout(WELCOME_BOX);
    c.save(); c.globalAlpha *= opacity;
    c.translate(W / 2, 600); c.scale(zoom, zoom); c.translate(-W / 2, -600);
    c.fillStyle = css('ink', wave ? 0.94 : 0.83); c.fillRect(frame.x, frame.y, 1200, 640);
    const left = frame.x, top = frame.y;
    const lb = w.lines;
    const project = (x: number, y: number): [number, number] => [W / 2 + (x - W / 2) * zoom, 600 + (y - 600) * zoom];
    for (const [ax, ay, bx, by] of [
      [left, top, left + 1200, top], [left, top + 640, left + 1200, top + 640],
      [left, top, left, top + 640], [left + 1200, top, left + 1200, top + 640],
      [left + 420, top + 48, left + 420, top + 592],
    ]) {
      const a = project(ax!, ay!), b = project(bx!, by!);
      lb.seg2(...a, ...b, 1, lin('paper'), opacity * 0.3);
    }
    // The same slot and typography as kit/welcome; the frame is printed with paper on ink.
    for (const [i, text] of WELCOME_LINES.entries()) {
      machineLabel(c, text, left + 464, top + 185 + i * 76, i === 0 ? 32 : 26, 'paper', i === 0 ? 1 : 0.6);
    }
    const at = w.times.tomorrow[wave ? 3 : 2]!.start;
    const b = beatsSince(this.ctx.audio, f.t, at);
    const action: Clawd.Action = wave && b < 2.5 ? 'A13' : 'A1';
    this.sprite(c, f, action, frame.clawd.x, frame.clawd.y, 20, at);
    // Only the clay body is repeated in the emissive layer; eye holes remain transparent.
    const glow = w.glow.ctx;
    glow.save(); glow.globalAlpha = opacity * 0.18;
    glow.translate(W / 2, 600); glow.scale(zoom, zoom); glow.translate(-W / 2, -600);
    const pose = Clawd.pose(action, { beat: f.beat, beat0: this.ctx.audio.beatAt(at), p: 0 });
    Clawd.draw(glow, frame.clawd.x, frame.clawd.y, { ...pose, cells: pose.cells.filter(cell => cell.k === 'O') }, { px: 20 });
    glow.restore();
    drawCursor(c, { x: left + 1130, y: top + 430, h: 32, on: blink(f.beat) });
    c.restore();
  }

  private calendar(c: CanvasRenderingContext2D, f: Frame, flip: number, dawn: boolean) {
    const T = this.world.times;
    const at = T.tomorrow[4]!.start;
    const rise = ease.outExpo(clamp(beatsSince(this.ctx.audio, f.t, at) / 1));
    const fg = dawn ? 'ink' : 'paper';
    c.save(); c.translate(0, (1 - rise) * 260);
    machineLabel(c, dawn ? '09:00 / NOVEMBER 1' : '23:59 / OCTOBER 31', 112, 250, 30, fg, 0.6);
    // A folded single-day leaf makes the rollover readable while the full calendar changes.
    const leaf = Math.abs(Math.cos(Math.PI * flip));
    c.save(); c.translate(520, 620); c.scale(1, Math.max(0.001, leaf));
    c.fillStyle = css(fg); c.font = font(F.archivo(125, 900), 375);
    c.textAlign = 'center'; c.fillText(flip < 0.5 ? '31' : '01', 0, 115);
    machineLabel(c, flip < 0.5 ? 'OCT' : 'NOV', -220, -160, 52, fg); c.restore();
    if (dawn) drawCalendar(c, { x: 1040, y: 275, width: 730, height: 610 }, {
      month: CALENDAR_MONTHS.october, nextMonth: CALENDAR_MONTHS.november,
      highlightedDays: [31], nextHighlightedDays: [1], flip,
    });
    else {
      // Night blueprint of the 31-day calendar; no large PAPER card before the ground flip.
      machineLabel(c, 'OCTOBER / 2026', 1100, 365, 35, 'paper');
      for (let d = 1; d <= 31; d++) {
        machineLabel(c, String(d).padStart(2, '0'), 1110 + (d - 1) % 7 * 82,
          455 + Math.floor((d - 1) / 7) * 68, 30, d === 31 ? 'clay' : 'paper', d === 31 ? 1 : 0.5);
      }
    }
    this.sprite(c, f, 'A1', 175, 865, 13, at);
    drawCursor(c, { x: 720, y: 890, h: 39, on: blink(f.beat) });
    c.restore();
  }

  private morning(c: CanvasRenderingContext2D, f: Frame, pop: number, opacity = 1) {
    const T = this.world.times, at = T.tomorrow[5]!.start;
    c.save(); c.globalAlpha *= opacity;
    drawEditor(c, { x: 265, y: 260, width: 1390, height: 700 }, {
      activity: 'files', sidebar: { mode: 'files', files: FILE_TREE, expandedDepth: 2, selectedPath: MONTH_PATH },
      tabs: [{ id: MONTH_PATH, label: 'month.ts' }], activeTab: MONTH_PATH,
      breadcrumbs: ['src', 'calendar', 'month.ts'], lines: FIXED_SOURCE,
      firstLine: 35, currentLine: 42, status: { branch: 'main' },
    });
    const slot = drawWelcome(c, { x: 375, y: 375, width: 1160, height: 500 }, {
      lines: [WELCOME_LINES[0], WELCOME_LINES[1], 'Issue #1032 · calendar', 'Ready for one more commit.'], cursor: blink(f.beat) === 1,
    });
    this.sprite(c, f, 'A2', slot.x, slot.y, slot.width / 16, at);
    drawNotify(c, { x: 1090, y: 770, width: 700, height: 195 }, { ...NEXT_ISSUE, pop,
      message: 'One more day. One more issue.' });
    c.restore();
  }

  private credits(c: CanvasRenderingContext2D, f: Frame, opacity: number) {
    const T = this.world.times, at = T.tomorrow[6]!.start;
    const progress = clamp(beatsSince(this.ctx.audio, f.t, at) / 1.2);
    // Clear the office with a printed PAPER plate. The live ground continues outside it.
    c.save(); c.globalAlpha *= ease.outCubic(progress);
    c.fillStyle = css('paper'); c.fillRect(95, 235, 1740, 705);
    c.restore();
    const state = creditsState(f.t, at, CREDIT_COPY);
    state.opacity = opacity;
    drawCredits(c, { x: 112, y: 240, width: 1696, height: 700 }, state);
    c.fillStyle = css('ink', 0.3 * opacity); c.fillRect(112, 204, 1696, 1);
    machineLabel(c, 'WORKS ON MY MACHINE / COLOPHON', 112, 160, 24, 'ink', opacity * 0.6);
    const tipX = lerp(112, 1720, ease.outCubic(clamp(beatsSince(this.ctx.audio, f.t, at) / 6)));
    this.world.lines.seg2(112, 965, tipX, 965, 1.2, lin('clay'), opacity);
    drawCursor(c, { x: tipX, y: 982, h: 33, on: blink(f.beat) * opacity });
    this.sprite(c, f, 'A2', 1580, 974, 9, T.tomorrow[5]!.start, 0, opacity);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget): PostOverrides {
    const w = this.world, T = w.times, s = tomorrowState(this.ctx.audio, f.t, T);
    const c = w.layer.ctx;
    w.layer.clear(); w.glow.clear(); w.lines.clear();
    const travel = beatsSince(this.ctx.audio, f.t, T.tomorrow[0]!.start);
    w.ground.render(this.ctx.renderer, out, {
      kind: s.ground, t: f.t, camX: travel * (s.dawn ? 2.2 : 6), camY: travel * 1.5,
      kick: f.a.kick * (s.dawn ? 0.2 : 0.45), grid: s.dawn ? 0.55 : 0.3,
      haze: s.dawn ? 0 : 0.35 + f.a.vocal * 0.2, hazeY: 0.2,
      streaks: s.shot === 0 ? 0.25 * (1 - s.p) : 0, travel: travel * 0.09,
      halftone: s.dawn ? 0.28 : 0,
    });
    if (!s.dawn) {
      this.starMap(c, f, s.starOpacity);
      // The office cards occlude the sky; their own hairline frames are drawn later.
      w.lines.render(this.ctx.renderer, out); w.lines.clear();
    }
    switch (s.shot) {
      case 0: {
        const returnP = ease.inOutCubic(s.p);
        w.wall.render(this.ctx.renderer, out, { zoom: lerp(0.82, 2.4, returnP), lit: s.wallLit,
          beat: f.beat, kick: f.a.kick * 0.2, opacity: 1 - ease.outCubic(s.p) });
        this.nightEditor(c, f, ease.inOutCubic(span(s.p, 0.28, 1)), lerp(0.82, 1, returnP));
        break;
      }
      case 1: this.nightEditor(c, f, 1, 1); break;
      case 2: {
        const close = 1 - ease.outExpo(clamp(s.b / 1.2));
        if (close > 0) this.nightEditor(c, f, close, 1);
        this.nightWelcome(c, f, 1 - close, lerp(1, 0.87, ease.inOutCubic(s.p)), false);
        break;
      }
      case 3: this.nightWelcome(c, f, 1, lerp(1.05, 1.6, ease.outExpo(clamp(s.b / 0.85))), true); break;
      case 4: this.calendar(c, f, s.calendarFlip, s.dawn); break;
      case 5: this.morning(c, f, clamp(s.b / 0.8)); break;
      default:
        this.morning(c, f, 1, 1 - ease.outExpo(clamp(s.b / 1.2)));
        this.credits(c, f, s.creditsOpacity);
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.lines.render(this.ctx.renderer, out);
    if (!s.dawn) w.glow.composite(this.ctx, out, 1.7);
    const post = postFor(s.ground);
    return { ...post, hud: 0, bloom: s.dawn ? 0 : 0.28, grain: s.dawn ? 0.022 : 0.035,
      vignette: s.dawn ? 0 : 0.12, fade: s.shot === 6 ? 1 - s.creditsOpacity : 0 };
  }
}
