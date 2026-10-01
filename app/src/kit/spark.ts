// Particle clock/ballistics adapted from mexicat/pdoom-video _motifs.ts (MIT).
// No integration state: every segment is recomputed from its birth index and age.
import { LineBatch } from '../engine/lines';
import { clamp, hash, lerp, TAU } from '../engine/util';
import { lin } from '../theme';
import { drawCursor, drawCursorWidth, type CursorState } from './cursor';
import { glowDraw } from './lyric-moves';
import type { GroundKind } from './ground';
import type { SceneCtx } from '../engine/scene';
import type * as THREE from 'three';

export type Point = { x: number; y: number };
export type SparkCursor = CursorState & { w?: number };
export type ParticleOptions = {
  rate?: number | ((birth: number) => number); rateMax?: number;
  life?: number; speed?: number; gravity?: number; seed?: number; width?: number;
  on?: GroundKind; alpha?: number;
};
const HOT = lin('hot'), CLAY = lin('clay'), PAPER = lin('paper');
export function trailColor(age: number, cool = 0.4): [number, number, number] {
  const k = 1 - clamp(age / Math.max(1e-9, cool));
  return CLAY.map((v, i) => lerp(v, HOT[i]!, k * k)) as [number, number, number];
}

export function sparkParticles(lb: LineBatch, t: number, headAt: (birth: number) => Point | null, o: ParticleOptions = {}) {
  const life = o.life ?? 0.35, speed = o.speed ?? 260, gravity = o.gravity ?? 520, seed = o.seed ?? 1;
  const rateAt = typeof o.rate === 'function' ? o.rate : null;
  const clock = rateAt ? o.rateMax : typeof o.rate === 'number' ? o.rate : 90;
  if (rateAt && !(clock && clock > 0)) throw new Error('variable spark rate requires a positive rateMax');
  if (!(clock && clock > 0) || (o.alpha ?? 1) <= 0) return;
  for (let n = Math.ceil((t - life) * clock); n <= Math.floor(t * clock); n++) {
    const birth = n / clock, age = t - birth;
    if (rateAt && hash(n, seed + 3) * clock >= clamp(rateAt(birth), 0, clock)) continue;
    const h = headAt(birth); if (!h) continue;
    const lifetime = life * (0.35 + 0.65 * hash(n, seed + 2));
    if (age < 0 || age >= lifetime) continue;
    const angle = hash(n, seed) * TAU, sp = speed * (0.25 + hash(n, seed + 1) ** 2 * 1.2);
    const vx = Math.cos(angle) * sp, vy = Math.sin(angle) * sp - speed * 0.3;
    const prevAge = Math.max(0, age - 0.018), k = 1 - age / lifetime;
    const color = o.on === 'paper' ? CLAY : o.on === 'clay' ? PAPER : trailColor(age, lifetime);
    lb.seg2(h.x + vx * prevAge, h.y + vy * prevAge + 0.5 * gravity * prevAge ** 2,
      h.x + vx * age, h.y + vy * age + 0.5 * gravity * age ** 2,
      (o.width ?? 1.6) * (0.5 + 0.7 * k), [...color], Math.min(1, k * 1.4) * (o.alpha ?? 1));
  }
}

/** Fixed temporal grid plus exact endpoints/knots; null breaks paths rather than connecting gaps. */
export function heatTrail(lb: LineBatch, t: number, pathAt: (written: number) => Point | null,
  o: { from: number; width?: number; cool?: number; to?: number; alpha?: number; cold?: boolean; knots?: readonly number[] }) {
  const end = Math.min(t, o.to ?? t); if (end <= o.from) return;
  const times = [o.from];
  for (let n = Math.floor(o.from * 120) + 1; n / 120 < end; n++) times.push(n / 120);
  times.push(...(o.knots ?? []).filter(x => x > o.from && x < end), end);
  times.sort((a, b) => a - b);
  let prev = pathAt(times[0]!);
  for (const written of times.slice(1)) {
    const p = pathAt(written);
    if (prev && p && Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-6)
      lb.seg2(prev.x, prev.y, p.x, p.y, o.width ?? 2, trailColor(o.cold ? Infinity : t - written, o.cool), o.alpha ?? 1);
    prev = p;
  }
}

export function cursorSpeed(t: number, at: (time: number) => SparkCursor | null) {
  const a = at(t), b = at(t - 1 / 60);
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) * 60 : 0;
}
/** Zero by the last handoff frame; fade is continuous across the export shutter. */
export function sparkFade(t: number, end: number) { return clamp((end - 1 / 60 - t) / 0.1); }

export function cursorSpark(c: CanvasRenderingContext2D, glow: CanvasRenderingContext2D | undefined, lb: LineBatch,
  t: number, at: (time: number) => SparkCursor | null,
  o: { on: GroundKind; from?: number; to?: number; end?: number; seed?: number; boost?: (birth: number) => number }) {
  const position = at(t); if (!position) return;
  const head = { ...position };
  const draw = (ctx: CanvasRenderingContext2D) => {
    if (head.w === undefined) drawCursor(ctx, head);
    else drawCursorWidth(ctx, head, head.w);
  };
  const speed = cursorSpeed(t, at), moving = speed > 120;
  const original = head.on;
  head.on = moving ? 1 : original; // Local copy: never mutate the result of at().
  draw(c); if (o.on === 'ink' && glow) glowDraw(c, glow, draw);
  const rate = (birth: number) => {
    if (birth < (o.from ?? -Infinity) || birth >= (o.to ?? Infinity)) return 0;
    const v = cursorSpeed(birth, at);
    if (v <= 120) return 0;
    return Math.min(140, Math.min(o.boost ? 110 : 140, 20 + (v - 120) * 0.12) + (o.boost?.(birth) ?? 0)) * (o.on === 'paper' ? 0.5 : 1);
  };
  sparkParticles(lb, t, birth => {
    const h = at(birth); return h ? { x: h.x, y: h.y } : null;
  }, { rate, rateMax: 140, on: o.on, seed: o.seed, alpha: o.end === undefined ? 1 : sparkFade(t, o.end) });
}

const rgbCss = (rgb: readonly number[]) => 'rgb(' + rgb.map(v => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055))).join(',') + ')';
/** A fresh drawing batch per render, not a particle simulation. INK uses additive GPU lines
 * and mirrors only hot/clay into the scene's existing GlowLayer; light grounds use printed strokes.
 * Capture the original Canvas CTM so lines and particles share the unchanged scene/lens transform. */
export class SparkLines extends LineBatch {
  private canvas?: CanvasRenderingContext2D;
  private glow?: CanvasRenderingContext2D;
  private ground: GroundKind = 'ink';
  private transform?: DOMMatrix;
  private alpha = 1;
  constructor() { super(8192, { screen2D: true, blend: 'add' }); }
  begin(c: CanvasRenderingContext2D, glow: CanvasRenderingContext2D | undefined, on: GroundKind) {
    this.clear(); this.canvas = c; this.glow = glow; this.ground = on;
    this.transform = c.getTransform(); this.alpha = c.globalAlpha;
  }
  override seg2(ax: number, ay: number, bx: number, by: number, width: number, rgb: [number, number, number], alpha = 1) {
    const m = this.transform;
    const stroke = (ctx: CanvasRenderingContext2D) => {
      ctx.save(); if (m) ctx.setTransform(m); ctx.globalAlpha = alpha * this.alpha;
      ctx.strokeStyle = rgbCss(rgb); ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore();
    };
    if (this.ground !== 'ink') { if (this.canvas) stroke(this.canvas); return; }
    if (this.glow) stroke(this.glow);
    const point = (x: number, y: number) => m ? [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f] : [x, y];
    const a = point(ax, ay), b = point(bx, by);
    super.seg2(a[0]!, a[1]!, b[0]!, b[1]!, width * (m ? Math.hypot(m.a, m.b) : 1), rgb, alpha * this.alpha);
  }
  finish(ctx: Pick<SceneCtx, 'renderer'>, out: THREE.WebGLRenderTarget) { if (this.ground === 'ink' && this.count) this.render(ctx.renderer, out); }
  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
