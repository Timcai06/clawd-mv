// S15: an off-by-one error becomes a monumental engraved comparator.
// All six editorial entries share GPU resources, but never carry temporal state.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { blink, drawCursor, drawTrail } from '../kit/cursor';
import { MONTH_SOURCE, CALENDAR_WEEKDAYS } from '../kit/content';
import * as Clawd from '../kit/clawd';
import { beatsSince, span, hitAfter } from '../kit/time';
import { MONUMENT_FRAG } from './parts/s15-monument-glsl';
import {
  resolveFTimes, phaseAt, beatProgress, snipState, drawWordRun,
  currentFLine, holdThen, type FTimes,
} from './parts/s15-f-timing';

interface View {
  x: number; y: number; yaw: number; pitch: number; distance: number; fov: number;
}

const CLOSE: View = { x: -0.15, y: -0.7, yaw: -0.38, pitch: 0.17, distance: 15.5, fov: 34 };
const WALK: View = { x: 0, y: -1.25, yaw: 0.3, pitch: 0.26, distance: 19.8, fov: 34 };
const CUT: View = { x: -0.05, y: -1.2, yaw: -0.2, pitch: 0.12, distance: 19.0, fov: 34 };
const WIDE: View = { x: -4.5, y: -0.3, yaw: 0.25, pitch: 0.16, distance: 38, fov: 36 };

function mixView(a: View, b: View, p: number): View {
  return {
    x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), yaw: lerp(a.yaw, b.yaw, p),
    pitch: lerp(a.pitch, b.pitch, p), distance: lerp(a.distance, b.distance, p),
    fov: lerp(a.fov, b.fov, p),
  };
}

class World {
  users = 0;
  T: FTimes;
  ground = new Ground();
  layer = new Layer2D();
  glow = new GlowLayer();
  rules = new LineBatch(2000, { blend: 'normal' });
  camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 120);
  glyph = new FSPass(MONUMENT_FRAG, {
    camPos: { value: new THREE.Vector3() }, camR: { value: new THREE.Vector3() },
    camU: { value: new THREE.Vector3() }, camF: { value: new THREE.Vector3() },
    tanF: { value: 0.3 }, isPaper: { value: 0 }, opacity: { value: 1 },
    paperColor: { value: new THREE.Vector3(...lin('paper')) },
    inkColor: { value: new THREE.Vector3(...lin('ink')) },
    clayColor: { value: new THREE.Vector3(...lin('clay')) },
    barOffset: { value: new THREE.Vector3() }, barRoll: { value: 0 }, shiver: { value: 0 },
  }, { transparent: true, blending: THREE.CustomBlending });

  constructor(ctx: SceneCtx) {
    this.T = resolveFTimes(ctx);
    const m = this.glyph.mat;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
  }

  setView(v: View) {
    const cam = this.camera;
    cam.position.set(v.x + Math.sin(v.yaw) * Math.cos(v.pitch) * v.distance,
      v.y + Math.sin(v.pitch) * v.distance, Math.cos(v.yaw) * Math.cos(v.pitch) * v.distance);
    cam.up.set(0, 1, 0);
    cam.lookAt(v.x, v.y, 0);
    cam.fov = v.fov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const u = this.glyph.u;
    (u.camPos!.value as THREE.Vector3).copy(cam.position);
    const m = cam.matrixWorld;
    (u.camR!.value as THREE.Vector3).setFromMatrixColumn(m, 0);
    (u.camU!.value as THREE.Vector3).setFromMatrixColumn(m, 1);
    (u.camF!.value as THREE.Vector3).setFromMatrixColumn(m, 2).negate();
    u.tanF!.value = Math.tan(v.fov * Math.PI / 360);
  }

  project(x: number, y: number, z: number): [number, number] {
    const p = new THREE.Vector3(x, y, z).project(this.camera);
    return [(p.x * 0.5 + 0.5) * W, (0.5 - p.y * 0.5) * H];
  }

  dispose() {
    this.ground.pass.mat.dispose(); this.glyph.mat.dispose();
    this.layer.texture.dispose(); this.glow.layer.texture.dispose();
    this.rules.geo.dispose(); this.rules.mat.dispose();
  }
}

let world: World | undefined;

export default class S15Line42 extends Scene {
  private w!: World;

  override init() {
    this.w = world ??= new World(this.ctx);
    this.w.users++;
  }

  override dispose() {
    if (this.w && --this.w.users === 0) { this.w.dispose(); world = undefined; }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.T, t = f.t, audio = this.ctx.audio;
    const phase = phaseAt(t, T.s15);
    const state = snipState(audio, t, T);
    const kind = state.paper ? 'paper' : 'ink';
    const reveal = ease.outExpo(beatProgress(audio, t, T.s15[2]!, 0.85));
    const walk = holdThen(beatProgress(audio, t, T.s15[3]!, 1.1));
    const pull = holdThen(span(t, T.s15[5]!, T.s16[0]!));
    let v = phase < 3 ? mixView({ ...CLOSE, distance: 28 }, CLOSE, reveal)
      : mixView(CLOSE, WALK, walk);
    if (t >= T.snip) v = mixView(WALK, CUT, ease.outExpo(beatProgress(audio, t, T.snip, 0.75)));
    if (phase === 5) v = mixView(CUT, WIDE, pull);
    w.setView(v);

    // Scene-specific grid density follows the microscope push and the later crane out.
    w.ground.render(this.ctx.renderer, out, {
      kind, t, camX: v.x * 45 + f.beat * 1.8, camY: v.y * 55,
      zoom: 1 + reveal * 0.45 - pull * 0.3, cell: 72,
      grid: phase < 2 ? 0.75 : 0.38, kick: f.a.kick * (phase < 2 ? 0.4 : 0.75),
      haze: state.paper ? 0 : 0.38, hazeY: 0.28,
      streaks: phase === 2 ? 0.5 * (1 - reveal) : 0.08,
      streakAngle: Math.PI / 2, travel: reveal * 4 + f.beat * 0.035,
      halftone: state.paper ? 0.28 + 0.12 * f.a.drums : 0,
      pitch: 12,
    });
    w.rules.clear();
    const c = w.layer.ctx;
    w.layer.clear(); w.glow.clear();
    const foreground = state.paper ? 'ink' : 'paper';
    const line = currentFLine(this.ctx.lyrics, t, T.s15[0]!, T.s16[0]!);

    if (phase < 2) this.drawCode(c, f, phase);
    else {
      // Physical camera and the label projection use exactly the same basis.
      w.glyph.u.opacity!.value = 1;
      w.glyph.u.isPaper!.value = state.paper ? 1 : 0;
      (w.glyph.u.barOffset!.value as THREE.Vector3).set(state.barX, state.barY, state.barZ);
      w.glyph.u.barRoll!.value = state.barRoll;
      const b = beatsSince(audio, t, T.s15[2]!);
      w.glyph.u.shiver!.value = state.paper ? 0 : 0.03 * Math.sin(b * Math.PI * 8) * (0.3 + f.a.kick);
      w.glyph.render(this.ctx.renderer, out);
      this.drawMonumentNotes(c, f, state.paper, phase);
      this.drawClawd(f, phase, state.paper);
      if (phase === 5) this.drawCalendar(c, f, pull);
    }

    // Lyrics are a live source annotation in the code view, then an engraved specimen legend.
    if (phase < 2) {
      c.fillStyle = css('paper', 0.6); c.font = font(F.mono(400), 18);
      c.fillText('// vocal annotation', 122, 845);
      drawWordRun(c, line, t, 122, 895, 1676, 38, 'paper');
    } else {
      c.fillStyle = css(foreground, 0.6); c.font = font(F.mono(400), 18);
      c.fillText(state.paper ? '42 / revised source' : '42 / comparator specimen', 122, 905);
      drawWordRun(c, line, t, 122, 967, 1660, 37, foreground, false);
    }

    const cursor = this.cursorAt(f, phase);
    drawCursor(c, { x: cursor[0], y: cursor[1], h: phase < 2 ? 29 : 18,
      on: blink(f.beat, phase >= 3) });
    if (!state.paper) drawCursor(w.glow.ctx, { x: cursor[0], y: cursor[1], h: phase < 2 ? 29 : 18,
      on: blink(f.beat, phase >= 3) });
    w.rules.render(this.ctx.renderer, out);
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    if (!state.paper) w.glow.composite(this.ctx, out, 1.5);

    const flash = hitAfter(t, T.snip, 0.024) * 0.88;
    const impact = 8 * hitAfter(t, T.wont, 0.045) + 11 * hitAfter(t, T.snip, 0.07);
    const fi = frameIdx(t);
    return {
      ...postFor(kind), hud: 0, frame: 0, paper: state.paper ? 1 : 0,
      grain: state.paper ? 0.035 : 0.04, vignette: state.paper ? 0 : 0.09,
      flash, shake: [impact * (hash(fi, 42) - 0.5), impact * (hash(fi, 43) - 0.5)] as [number, number],
    };
  }

  private drawCode(c: CanvasRenderingContext2D, f: Frame, phase: number) {
    const T = this.w.T, audio = this.ctx.audio;
    const zoom = phase === 1 ? holdThen(beatProgress(audio, f.t, T.s15[1]!, 1.7)) : 0;
    c.font = font(F.mono(400), 21); c.fillStyle = css('paper', 0.6);
    c.fillText('src / calendar / month.ts', 122, 145);
    c.fillText('daysIn()  /  breakpoint', 122, 183);
    c.textAlign = 'right'; c.fillText('OFFSET: 0  /  LABEL: 1', 1798, 145); c.textAlign = 'left';
    this.rule(122, 218, 1798, 218, 'paper', 0.3);
    const rows = [39, 40, 41, 42, 43, 44];
    rows.forEach((n, i) => {
      const y = 330 + i * 78;
      if (n === 42) {
        c.fillStyle = css('clay', 0.13 * (1 - zoom)); c.fillRect(100, y - 52, 1720, 73);
        const size = 53 + zoom * 225;
        c.font = font(F.archivo(87.5 + zoom * 25, 800), size);
        c.fillStyle = css('clay'); c.fillText('42', 122, y + zoom * 67);
        c.save(); c.globalAlpha = 1 - zoom;
        c.font = font(F.mono(500), 43); c.fillStyle = css('paper');
        const code = MONTH_SOURCE[41]!.trim();
        c.fillText(code, 260, y);
        const prefix = code.slice(0, code.indexOf('<='));
        const x = 260 + c.measureText(prefix).width;
        c.fillStyle = css('clay'); c.fillText('<=', x, y);
        c.restore();
      } else {
        c.save(); c.globalAlpha = (1 - zoom) * (n === 41 || n === 43 ? 0.5 : 0.25);
        c.font = font(F.mono(400), 24); c.fillStyle = css('paper');
        c.fillText(String(n), 122, y); c.fillText(MONTH_SOURCE[n - 1]!.trim(), 260, y);
        c.restore();
      }
    });
    if (zoom > 0) {
      c.save(); c.globalAlpha = zoom;
      c.font = font(F.mono(500), 27); c.fillStyle = css('paper');
      c.fillText('ONE CHARACTER.', 715, 463); c.fillText('ONE EXTRA DAY.', 715, 511);
      c.font = font(F.mono(400), 20); c.fillStyle = css('paper', 0.6);
      c.fillText('d <= days', 717, 570);
      this.rule(644, 414, 644, 632, 'paper', 0.3);
      c.restore();
    }
    const pose = Clawd.pose(phase === 0 ? 'A7' : 'A3', {
      beat: f.beat, beat0: audio.beatAt(T.s15[phase]!), p: zoom,
    });
    Clawd.draw(c, 1540, 276, pose, { px: 7 });
    Clawd.draw(this.w.glow.ctx, 1540, 276, pose, { px: 7 });
    // The line-42 marker is measured against the complete mono run.
    this.rule(224, 286, 224, 777, 'paper', 0.12 * (1 - zoom));
  }

  private rule(ax: number, ay: number, bx: number, by: number,
    token: 'paper' | 'ink' | 'clay', alpha = 1, width = 1.2) {
    this.w.rules.seg2(ax, ay, bx, by, width, lin(token), alpha);
  }

  private drawMonumentNotes(c: CanvasRenderingContext2D, f: Frame, paper: boolean, phase: number) {
    const token = paper ? 'ink' : 'paper';
    c.font = font(F.mono(500), 23); c.fillStyle = css(token);
    c.fillText('month.ts : 42', 122, 142);
    c.font = font(F.mono(400), 18); c.fillStyle = css(token, 0.6);
    c.fillText(paper ? 'd < days' : 'd <= days', 122, 180);
    const right = this.w.project(2.65, 2.5, 0.64);
    if (phase < 5) {
      this.rule(right[0] + 28, right[1] - 24, 1600, 260, token, 0.45);
      this.rule(1600, 260, 1798, 260, token, 0.45);
      c.textAlign = 'right'; c.font = font(F.mono(400), 18);
      c.fillText(paper ? 'STRICT BOUND' : 'INCLUSIVE BOUND', 1798, 247);
      c.textAlign = 'left';
      const base = this.w.project(-2.95, -3.7, 0.64);
      if (!paper) {
        this.rule(122, 727, base[0] - 30, 727, 'clay', 0.75);
        this.rule(base[0] - 30, 727, base[0], base[1], 'clay', 0.75);
        c.fillStyle = css('clay'); c.fillText('EXTRA LINE', 122, 714);
        c.fillStyle = css('paper', 0.6); c.fillText('31 + 1 = 32', 122, 757);
      }
    }
  }

  private cursorAt(f: Frame, phase: number): [number, number] {
    const T = this.w.T, state = snipState(this.ctx.audio, f.t, T);
    if (phase < 2) return phase === 0 ? [1094, 564] : [657, 592];
    const a = state.barRoll;
    const x = 2.95 * Math.cos(a) + state.barX;
    const y = 2.95 * Math.sin(a) - 3.7 + state.barY;
    return this.w.project(x, y, 0.7 + state.barZ);
  }

  private drawClawd(f: Frame, phase: number, paper: boolean) {
    const { T } = this.w, audio = this.ctx.audio;
    let action: Clawd.Action = 'A3', beat0 = audio.beatAt(T.s15[2]!);
    let x = -1.95, y = -3.40, z = 0.72;
    let p = 0;
    if (phase >= 3 && f.t < T.snip) {
      const walked = beatProgress(audio, f.t, T.s15[3]!, 0.6);
      x = lerp(-1.95, 1.12, ease.outCubic(walked));
      const b = beatsSince(audio, f.t, T.wont);
      // Two deliberate stomps, each using the canonical jump and landing squash.
      const jump = b < 0.8 ? 0 : 0.8;
      if (b >= 0 && b < 1.6) { action = 'A6'; beat0 = audio.beatAt(T.wont) + jump; }
      else if (walked < 1) { action = 'A5'; p = walked; }
    }
    if (f.t >= T.snip && phase < 5) {
      action = 'A10'; x = 1.12; beat0 = audio.beatAt(T.snip);
      y = lerp(-3.40, -0.77, ease.outExpo(beatProgress(audio, f.t, T.snip, 0.8)));
    }
    if (phase === 5) {
      action = 'A12'; beat0 = audio.beatAt(T.october);
      x = -1.95; y = -2.62;
    }
    const a = this.w.project(x, y, z), b = this.w.project(x + 0.13, y, z);
    const px = Math.max(3, Math.min(8, Math.hypot(b[0] - a[0], b[1] - a[1])));
    const pose = Clawd.pose(action, { beat: f.beat, beat0, p, travel: 0, reach: 6, jumpBeats: 0.8 });
    Clawd.draw(this.w.layer.ctx, a[0] - 8 * px, a[1] - 5 * px, pose, { px });
    if (!paper) Clawd.draw(this.w.glow.ctx, a[0] - 8 * px, a[1] - 5 * px, pose, { px });
    if (f.t >= T.snip && phase < 5) {
      const head = this.cursorAt(f, phase);
      drawTrail(this.w.layer.ctx, [[a[0] + 8 * px, a[1] - 3 * px], [head[0], head[1]]],
        1 - stateFade(this.ctx.audio, f.t, T.snip), { width: 1.8, alpha: 0.65 });
    }
  }

  private drawCalendar(c: CanvasRenderingContext2D, f: Frame, pull: number) {
    const T = this.w.T, audio = this.ctx.audio;
    const state = snipState(audio, f.t, T);
    const enter = ease.outExpo(beatProgress(audio, f.t, T.s15[5]!, 0.75));
    const x = lerp(1700, 952, enter), y = 304, cw = 112, ch = 89;
    c.save(); c.globalAlpha = enter;
    c.font = font(F.archivo(100, 700), 67); c.fillStyle = css('ink');
    c.fillText('OCTOBER', x, y - 64);
    c.font = font(F.mono(400), 18); c.fillStyle = css('ink', 0.6);
    c.fillText('2026 / 31 DAYS', x, y - 31);
    CALENDAR_WEEKDAYS.forEach((day, i) => c.fillText(day, x + i * cw + 12, y + 12));
    for (let row = 0; row <= 5; row++) this.rule(x, y + 26 + row * ch, x + cw * 7, y + 26 + row * ch, 'ink', 0.22 * enter);
    for (let col = 0; col <= 7; col++) this.rule(x + col * cw, y + 26, x + col * cw, y + 26 + ch * 5, 'ink', 0.22 * enter);
    for (let d = 1; d <= 31; d++) {
      const cell = d + 3, col = cell % 7, row = Math.floor(cell / 7);
      c.font = font(F.mono(500), 33); c.fillStyle = css('ink');
      c.fillText(String(d).padStart(2, '0'), x + col * cw + 21, y + 84 + row * ch);
    }
    const bx = x + 43, by = y + 84 + ch * 5;
    // The unnumbered cell is removed, rather than turning an invalid date into a test status.
    if (state.burst < 1) {
      c.save(); c.translate(bx, by - 22); c.scale(1 + state.burst * 1.5, 1 + state.burst * 1.5);
      c.globalAlpha *= 1 - state.burst;
      c.fillStyle = css('clay'); c.font = font(F.mono(500), 37); c.textAlign = 'center';
      c.fillText('32', 0, 15); c.restore();
    }
    for (let i = 0; i < 18 && state.burst > 0; i++) {
      const angle = i * Math.PI * 2 / 18;
      const distance = 90 * state.burst * (0.7 + hash(i, 32) * 0.6);
      const dx = Math.cos(angle), dy = Math.sin(angle);
      this.rule(bx + dx * distance, by - 22 + dy * distance,
        bx + dx * (distance + 15 * (1 - state.burst)), by - 22 + dy * (distance + 15 * (1 - state.burst)),
        'clay', (1 - state.burst) * enter, 2);
    }
    c.fillStyle = css('ink'); c.font = font(F.mono(500), 27);
    c.fillText('for (let d = 0; d < days; d++)', x, 854);
    const head = drawTrail(c, [[x, 872], [x + 616, 872]], pull, { width: 1.5 });
    drawCursor(c, { x: head[0], y: head[1], h: 13 });
    c.restore();
  }
}

function stateFade(audio: SceneCtx['audio'], t: number, at: number) {
  return ease.outCubic(beatProgress(audio, t, at, 1.1));
}
