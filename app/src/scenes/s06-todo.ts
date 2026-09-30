// S06 — a working plotter sheet. The cursor writes the plan, draws three checks on
// measured snares, then crosses each task out. PAPER has no glow or lit surfaces.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { strokeText, drawStrokeText, writtenLength, type StrokeText } from '../engine/stroke';
import { F, font } from '../engine/type';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { css, lin, INK_SOFT } from '../theme';
import { drawCursor, drawTrail, blink } from '../kit/cursor';
import { postFor } from '../kit/ground';
import { afterBeats, beatsSince, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { resolveCTimes, todoState, lyricCharTimes, type CTimes } from './parts/s06-timing';

const ITEMS = ['Read the code', 'Write a plan', 'Fix October'];
const ROW_Y = [410, 575, 740];
const TEXT_X = 400, BOX_X = 282, BOX_SIZE = 52;

const PAPER = /* glsl */ `
uniform vec3 paper, ink, clay;
uniform float t, beat, kick, snare, zoom;
uniform vec2 pan, pen;
float rule(float v, float pitch, float width) {
  float d = abs(fract(v / pitch + 0.5) - 0.5) * pitch;
  return 1.0 - smoothstep(width, width + 0.7 / PX_SCALE, d);
}
void main() {
  vec2 s = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  vec2 q = (s - vec2(960.0, 540.0)) / zoom + pan;
  float minor = max(rule(q.x, 40.0, 0.25), rule(q.y, 40.0, 0.25));
  float major = max(rule(q.x, 200.0, 0.6), rule(q.y, 200.0, 0.6));
  float travel = beat * 48.0;
  float feed = rule(q.y - travel, 400.0, 0.7);
  float fibre = snoise(q * vec2(0.4, 0.014) + vec2(t * 0.08, 0.0));
  vec3 c = mix(paper, ink, minor * 0.025 + major * (0.065 + 0.045 * kick));
  c = mix(c, ink, (0.5 + 0.5 * fibre) * 0.012);
  c = mix(c, ink, feed * 0.08);
  // Registration marks travel across the sheet like a plotter carriage.
  float dash = step(0.72, fract(q.x / 36.0 + beat * 0.12));
  c = mix(c, clay, feed * dash * 0.14);
  vec2 d = abs(q - pen);
  float leader = max(rule(q.x - pen.x, 100000.0, 0.45) * step(d.y, 115.0),
                     rule(q.y - pen.y, 100000.0, 0.45) * step(d.x, 190.0));
  c = mix(c, clay, leader * (0.10 + 0.13 * snare));
  fragColor = vec4(c, 1.0);
}`;

interface View { x: number; y: number; zoom: number; angle: number }
interface Pen { x: number; y: number; moving: boolean }

class TodoWorld {
  users = 0;
  layer = new Layer2D();
  bg = new FSPass(PAPER, {
    paper: { value: new THREE.Vector3(...lin('paper')) }, ink: { value: new THREE.Vector3(...lin('ink')) },
    clay: { value: new THREE.Vector3(...lin('clay')) },
    t: { value: 0 }, beat: { value: 0 }, kick: { value: 0 }, snare: { value: 0 },
    zoom: { value: 1 }, pan: { value: new THREE.Vector2() }, pen: { value: new THREE.Vector2() },
  });
  times: CTimes;
  rows: StrokeText[];
  lyric: StrokeText;
  handoff: StrokeText;
  chars: [number, number][];
  handoffChars: [number, number][];

  constructor(ctx: SceneCtx) {
    this.times = resolveCTimes(ctx.audio, ctx.lyrics);
    this.rows = ITEMS.map((s) => strokeText(s, 'readable', 84));
    this.lyric = strokeText(this.times.plan.text, 'readable', 42);
    this.handoff = strokeText(this.times.claws.text, 'readable', 42);
    this.chars = lyricCharTimes(this.times.plan);
    this.handoffChars = lyricCharTimes(this.times.claws);
  }

  dispose() { this.bg.mat.dispose(); this.layer.texture.dispose(); }
}

let world: TodoWorld | undefined;

export default class S06Todo extends Scene {
  private w!: TodoWorld;

  override init() { this.w = world ??= new TodoWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  private viewAt(t: number): View {
    const T = this.w.times, au = this.ctx.audio;
    const enter = ease.outExpo(span(t, T.todo, afterBeats(au, T.todo, 0.6)));
    let x = lerp(930, 960, enter), y = lerp(515, 540, enter), zoom = lerp(1.12, 1, enter);
    let angle = lerp(-0.018, 0, enter);
    // Small impulses are percussion accents, not unmotivated camera cuts.
    T.checks.forEach((at, i) => {
      const p = span(t, at, afterBeats(au, at, 0.45));
      const impulse = t < at ? 0 : Math.sin(Math.PI * p) * (1 - p);
      zoom += impulse * 0.095;
      x += impulse * (i - 1) * 32;
      y += impulse * (ROW_Y[i]! - 540) * 0.09;
      angle += impulse * (i % 2 ? -0.007 : 0.007);
    });
    const exit = ease.inCubic(span(t, afterBeats(au, T.keyboard, -0.7), T.keyboard));
    x += 60 * exit; zoom += 0.08 * exit;
    return { x, y, zoom, angle };
  }

  private sheet(c: CanvasRenderingContext2D, t: number) {
    const T = this.w.times, au = this.ctx.audio, st = todoState(au, t, T);
    let pen: Pen = { x: BOX_X, y: ROW_Y[0]! - 18, moving: false };

    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 800), 210);
    c.fillText('PLAN', 263, 268);
    c.font = font(F.mono(500), 18); c.fillStyle = css('ink', INK_SOFT.strong);
    c.fillText('calendar / month.ts', 277, 112);
    c.fillText('01 — PREPARE', 1430, 112);
    c.fillRect(278, 300, 1370, 1.2);
    c.fillText('TASK', TEXT_X, 336); c.fillText('ACTION', BOX_X - 10, 336);
    c.textAlign = 'right'; c.fillText('OCTOBER  /  32 → 31', 1650, 336); c.textAlign = 'left';

    // The large counter belongs to the sheet, and counts completed pen motions.
    c.font = font(F.archivo(75, 500), 232); c.fillStyle = css('ink', INK_SOFT.faint);
    c.fillText(String(st.completed).padStart(2, '0'), 1360, 660);
    c.font = font(F.mono(400), 17); c.fillStyle = css('ink', INK_SOFT.strong);
    c.fillText('/ 03 TASKS', 1390, 704);
    for (let i = 0; i < 3; i++) {
      const y = ROW_Y[i]!, row = this.w.rows[i]!, written = st.rows[i]!;
      const top = y - BOX_SIZE + 7;
      if (t < T.rowStarts[i]!) continue;

      // Functional checkboxes are open drafting strokes, never a filled button.
      const boxPath: [number, number][] = [[BOX_X, top], [BOX_X + BOX_SIZE, top],
        [BOX_X + BOX_SIZE, top + BOX_SIZE], [BOX_X, top + BOX_SIZE], [BOX_X, top]];
      drawTrail(c, boxPath, Math.min(1, written * 6), { color: 'ink', width: 1.3, alpha: 0.6 });
      c.font = font(F.mono(400), 16); c.fillStyle = css('ink', INK_SOFT.mid);
      c.fillText(String(i + 1).padStart(2, '0'), 230, y - 8);

      c.save(); c.translate(TEXT_X, y);
      c.strokeStyle = css('ink', st.strikes[i]! >= 1 ? 0.6 : 1);
      c.lineWidth = 2.8; c.lineCap = 'round'; c.lineJoin = 'round';
      const head = drawStrokeText(c, row, row.total * written);
      if (head && written < 1) pen = { x: TEXT_X + head.x, y: y + head.y, moving: true };
      c.restore();

      const check = st.checks[i]!, strike = st.strikes[i]!;
      if (check > 0) {
        const pts: [number, number][] = [[BOX_X + 9, top + 26], [BOX_X + 23, top + 42],
          [BOX_X + 56, top + 2]];
        const h = drawTrail(c, pts, check, { width: 4, color: 'clay' });
        if (check < 1) pen = { x: h[0], y: h[1], moving: true };
      }
      if (strike > 0) {
        const pts: [number, number][] = [[TEXT_X - 8, y - 23], [TEXT_X + row.width * 0.46, y - 25],
          [TEXT_X + row.width + 12, y - 21]];
        const h = drawTrail(c, pts, strike, { width: 2.2, color: 'clay' });
        if (strike < 1) pen = { x: h[0], y: h[1], moving: true };
      }
      if (st.active === i && strike === 0 && check === 1)
        pen = { x: TEXT_X - 8, y: y - 23, moving: true };
      if (st.active === i && strike === 1) pen = { x: TEXT_X + row.width + 12, y: y - 21, moving: false };

      c.fillStyle = css('ink', 0.15); c.fillRect(278, y + 42, 1370, 0.8);
      c.font = font(F.mono(400), 15); c.fillStyle = css('ink', 0.5);
      c.textAlign = 'right'; c.fillText(['READ', 'WRITE', 'FIX'][i]!, 1638, y - 10); c.textAlign = 'left';
    }

    // Canonical Clawd stands on the plan's baseline and hops for each snare.
    const active = st.active, at = active < 0 ? T.todo : T.checks[active]!;
    const jump = active >= 0 && beatsSince(au, t, at) < 0.8;
    const pose = Clawd.pose(jump ? 'A6' : 'A3', {
      beat: au.beatAt(t), beat0: au.beatAt(at), p: 0, jumpBeats: 0.5,
    });
    Clawd.draw(c, 1250, 215, pose, { px: 13 });

    this.drawLyrics(c, t);
    return pen;
  }

  private drawLyrics(c: CanvasRenderingContext2D, t: number) {
    const T = this.w.times;
    const next = t >= T.claws.start;
    const text = next ? this.w.handoff : this.w.lyric;
    const chars = next ? this.w.handoffChars : this.w.chars;
    const width = Math.min(1, 1390 / text.width);
    c.save(); c.translate(278, 875); c.scale(width, width);
    c.strokeStyle = css('ink', 0.2); c.lineWidth = 1.1;
    drawStrokeText(c, text, text.total);
    c.strokeStyle = css('ink'); c.lineWidth = 1.8;
    drawStrokeText(c, text, writtenLength(text, chars, t));
    c.restore();
    c.font = font(F.mono(400), 15); c.fillStyle = css('ink', 0.55);
    c.fillText(next ? 'NEXT  /  ENTER' : 'READ → WRITE → CHECK', 278, 944);
    c.fillText('fix/october', 1500, 944);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, { renderer, comp } = this.ctx, view = this.viewAt(t);
    const st = todoState(this.ctx.audio, t, this.w.times);
    const layer = this.w.layer, c = layer.ctx;
    layer.clear();
    c.save(); c.translate(960, 540); c.rotate(view.angle); c.scale(view.zoom, view.zoom); c.translate(-view.x, -view.y);
    const pen = this.sheet(c, t);
    drawCursor(c, { x: pen.x + 3, y: pen.y + 11, h: pen.moving ? 22 : 27, on: blink(f.beat, pen.moving) });
    c.restore();
    const u = this.w.bg.u;
    u.t!.value = t; u.beat!.value = f.beat; u.kick!.value = f.a.kick; u.snare!.value = st.pulse;
    u.zoom!.value = view.zoom;
    (u.pan!.value as THREE.Vector2).set(view.x, view.y);
    (u.pen!.value as THREE.Vector2).set(pen.x, pen.y);
    this.w.bg.render(renderer, out);
    comp.draw(renderer, layer.upload(), out);
    const amp = 3.8 * st.pulse, fi = frameIdx(t);
    return { ...postFor('paper'), hud: 0, frame: 0, paper: 1,
      shake: [amp * (hash(fi, 6) - 0.5), amp * (hash(fi, 7) - 0.5)] as [number, number] };
  }
}
