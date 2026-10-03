// World-attached, letter-timed Archivo. Geometry and caches never depend on render order.
import type { Word } from '../engine/lyrics';
import { clamp, ease } from '../engine/util';
import type { ThemeKey } from '../theme';
import { heatColor, type On } from './lyric-moves';
import { planeAffine, type P3, type Rig } from './rig';
import { tracePath, varRun, type Axes, type VarRun } from './vartype';

export interface GlyphTime { t0: number; t1: number }
const letter = (ch: string) => /[\p{L}\p{N}]/u.test(ch);
export function letterTimes(word: Word, opts: { spread?: number; maxSpan?: number } = {}): GlyphTime[] {
  const chars = Array.from(word.w), n = chars.filter(letter).length;
  const dur = Math.max(0, word.end - word.start);
  const span = dur <= 0.5 ? dur : Math.min(dur * Math.max(0, opts.spread ?? 0.8), Math.max(0, opts.maxSpan ?? 0.7));
  let j = -1;
  return chars.map(ch => {
    if (letter(ch)) j++;
    const k = Math.max(0, j);
    return n ? { t0: word.start + span * k / n, t1: word.start + span * (k + 1) / n }
      : { t0: word.start, t1: word.start + span };
  });
}

export interface Path3 { pts: P3[]; cum: Float64Array; length: number }
export function path3(pts: P3[]): Path3 {
  if (!pts.length) throw new Error('path3 requires at least one point');
  const copy = pts.map(p => ({ ...p })), cum = new Float64Array(pts.length);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!, b = pts[i]!;
    cum[i] = cum[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  }
  return { pts: copy, cum, length: cum[cum.length - 1]! };
}
export function pathAt(p: Path3, s: number): P3 {
  s = clamp(s, 0, p.length);
  if (s === p.length) return { ...p.pts.at(-1)! };
  let lo = 0, hi = p.pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (p.cum[m]! <= s) lo = m; else hi = m; }
  const a = p.pts[lo]!, b = p.pts[hi]!, k = (s - p.cum[lo]!) / Math.max(1e-12, p.cum[hi]! - p.cum[lo]!);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k };
}
const unit = (p: P3): P3 => { const n = Math.hypot(p.x, p.y, p.z); return n > 1e-12 ? { x: p.x / n, y: p.y / n, z: p.z / n } : { x: 1, y: 0, z: 0 }; };
export function tangentAt(p: Path3, s: number, h = 0.05): P3 {
  const a = pathAt(p, s - Math.max(1e-6, h)), b = pathAt(p, s + Math.max(1e-6, h));
  return unit({ x: b.x - a.x, y: b.y - a.y, z: b.z - a.z });
}
export function samplePath(f: (u: number) => P3, n: number): Path3 {
  if (!Number.isInteger(n) || n < 1) throw new Error('samplePath n must be a positive integer');
  return path3(Array.from({ length: n + 1 }, (_, i) => f(i / n)));
}

export interface PathGlyph {
  ch: string; word: Word; wi: number; s: number; w: number; t0: number; t1: number; i: number;
}
export interface PathLayout { glyphs: PathGlyph[]; s0: number; s1: number; capH: number }
// Keep the specified public layout shape; retain the original font metrics for animated axes.
const layoutMetrics = new WeakMap<PathLayout, { axes: Axes; cap: number; adv: number[] }>();
export function layoutPath(words: Word[], o: {
  capH: number; s0?: number; axes?: Axes; space?: number; tracking?: number; upper?: boolean; notBefore?: (s: number) => number;
}): PathLayout {
  const axes = { ...(o.axes ?? { wdth: 100, wght: 800 }) }, cap = varRun('H', 100, axes).capH;
  const m = o.capH / cap, glyphs: PathGlyph[] = [], adv: number[] = [], s0 = o.s0 ?? 0;
  let s = s0;
  words.forEach((word, wi) => {
    const display = o.upper ? word.w.toUpperCase() : word.w;
    const run = varRun(display, 100, axes, (o.tracking ?? 0) * 100);
    const times = letterTimes({ ...word, w: display });
    for (const g of run.glyphs) {
      const gs = s + g.x * m, time = times[g.i]!;
      const t0 = Math.max(word.start, time.t0, o.notBefore?.(gs) ?? -Infinity);
      glyphs.push({ ch: g.ch, word, wi, s: gs, w: g.adv * m, t0, t1: time.t1 + t0 - time.t0, i: glyphs.length });
      adv.push(g.adv);
    }
    s += run.width * m + (wi < words.length - 1 ? (o.space ?? 0.32) * 100 * m : 0);
  });
  const lay = { glyphs, s0, s1: s, capH: o.capH };
  layoutMetrics.set(lay, { axes, cap, adv });
  return lay;
}
export function writeHead(glyphs: PathGlyph[], t: number, s0?: number): number {
  let head = s0 ?? glyphs[0]?.s ?? 0;
  for (const g of glyphs) if (letter(g.ch) && t >= g.t0)
    head = Math.max(head, g.s + g.w * clamp((t - g.t0) / Math.max(0.01, g.t1 - g.t0)));
  return head;
}

type Bounds = { x0: number; y0: number; x1: number; y1: number };
// Exact curve extrema, also used by carry and word textures to anchor the ink rather than advance.
export function runInkBounds(run: VarRun): Bounds {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const put = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
  for (const g of run.glyphs) {
    const m = g.o.adv ? g.adv / g.o.adv : run.size / 1000;
    let j = 0, px = 0, py = 0, sx = 0, sy = 0;
    for (const type of g.o.types) {
      if (type === 'Z') { px = sx; py = sy; continue; }
      const count = type === 'C' ? 6 : type === 'Q' ? 4 : 2;
      const v = Array.from(g.o.xy.subarray(j, j + count)); j += count;
      const ex = v[count - 2]!, ey = v[count - 1]!;
      put(g.x + ex * m, ey * m);
      if (type === 'M') { sx = ex; sy = ey; }
      if (type === 'C' || type === 'Q') {
        const roots = (p: number, a: number, b: number, e: number) => {
          if (type === 'Q') return Math.abs(p - 2 * a + e) > 1e-12 ? [(p - a) / (p - 2 * a + e)] : [];
          const A = -p + 3 * a - 3 * b + e, B = 2 * (p - 2 * a + b), C = a - p;
          if (Math.abs(A) < 1e-12) return Math.abs(B) > 1e-12 ? [-C / B] : [];
          const d = B * B - 4 * A * C;
          return d < 0 ? [] : [(-B + Math.sqrt(d)) / (2 * A), (-B - Math.sqrt(d)) / (2 * A)];
        };
        const evalAt = (p: number, a: number, b: number, e: number, t: number) => type === 'Q'
          ? (1 - t) ** 2 * p + 2 * (1 - t) * t * a + t * t * e
          : (1 - t) ** 3 * p + 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t * t * b + t ** 3 * e;
        for (const t of [...roots(px, v[0]!, v[2]!, ex), ...roots(py, v[1]!, v[3]!, ey)]) if (t > 0 && t < 1)
          put(g.x + evalAt(px, v[0]!, v[2]!, ex, t) * m, evalAt(py, v[1]!, v[3]!, ey, t) * m);
      }
      px = ex; py = ey;
    }
  }
  return x0 === Infinity ? { x0: 0, y0: 0, x1: 0, y1: 0 } : { x0, y0, x1, y1 };
}

type Shape = { path: Path2D; adv: number; cap: number; bounds: Bounds };
const cache = new Map<string, Shape>();
function shape(ch: string, axes: Axes): Shape {
  const a = { wdth: Math.round(clamp(axes.wdth, 62, 125) * 2) / 2, wght: Math.round(clamp(axes.wght, 300, 900) / 5) * 5 };
  const key = `${ch}|${a.wdth}|${a.wght}`;
  let s = cache.get(key);
  if (!s) {
    if (cache.size >= 4096) cache.clear();
    const run = varRun(ch, 100, a), g = run.glyphs[0]!, path = new Path2D();
    // adv/font-unit advance is the same conversion used by varRun/glyphPath.
    tracePath(path, g.o, 0, 0, g.adv / g.o.adv);
    s = { path, adv: g.adv, cap: run.capH, bounds: runInkBounds(run) }; cache.set(key, s);
  }
  return s;
}
export interface PathTextStyle {
  mode: 'stand' | 'lie'; up?: P3; normal?: (s: number) => P3; lift?: number; maxAngle?: number; minPx?: number; maxPx?: number;
  base: ThemeKey; on: On; axes?: (g: PathGlyph, t: number) => Axes; outline?: { color: string; px: number }; pop?: number;
  offset?: (g: PathGlyph, t: number) => { d?: P3; spin?: number; alpha?: number; scale?: number } | null;
  visible?: (p: P3) => boolean;
}
export interface PathTextFrame {
  bbox: { x: number; y: number; w: number; h: number } | null;
  head: { x: number; y: number; s: number } | null; drawn: number;
}
export function drawPathText(c: CanvasRenderingContext2D, rig: Rig, path: Path3, lay: PathLayout, t: number, st: PathTextStyle): PathTextFrame {
  if (st.mode === 'lie' && !st.normal) throw new Error('lie path text requires normal(s)');
  const meta = layoutMetrics.get(lay), axes = meta?.axes ?? { wdth: 100, wght: 800 };
  const up = unit(st.up ?? { x: 0, y: 1, z: 0 }), lift = st.lift ?? 0;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, drawn = 0;
  const displaced = (p: P3, n: P3, d?: P3): P3 => ({ x: p.x + lift * n.x + (d?.x ?? 0), y: p.y + lift * n.y + (d?.y ?? 0), z: p.z + lift * n.z + (d?.z ?? 0) });
  c.save();
  try {
    const alpha = c.globalAlpha;
    for (const g of lay.glyphs) {
      if (t < g.t0) continue;
      const off = st.offset?.(g, t); if (off === null || (off?.alpha ?? 1) <= 0 || (off?.scale ?? 1) <= 0) continue;
      const n = st.mode === 'stand' ? up : unit(st.normal!(g.s));
      const a = displaced(pathAt(path, g.s), n, off?.d);
      if (st.visible && !st.visible(a)) continue;
      const q = shape(g.ch, st.axes?.(g, t) ?? axes);
      const pop = st.pop ?? 0.16, popY = pop <= 0 ? 1 : 0.3 + 0.7 * ease.outBack(clamp((t - g.t0) / pop));
      let aff: { a: number; b: number; c: number; d: number; e: number; f: number };
      const layoutAdv = meta?.adv[g.i] ?? varRun(g.ch, 100, axes).glyphs[0]!.adv;
      if (st.mode === 'stand') {
        const b = displaced(pathAt(path, g.s + g.w), n, off?.d), qa = rig.proj(a.x, a.y, a.z), qb = rig.proj(b.x, b.y, b.z);
        if (!qa || !qb || qb.x < qa.x || layoutAdv <= 0) continue;
        const ang = clamp(Math.atan2(qb.y - qa.y, qb.x - qa.x), -(st.maxAngle ?? 0.7), st.maxAngle ?? 0.7);
        const sx = Math.hypot(qb.x - qa.x, qb.y - qa.y) / layoutAdv;
        const sy = clamp(0.5 * (qa.s + qb.s) * lay.capH, st.minPx ?? 10, st.maxPx ?? 400) / q.cap * popY;
        aff = { a: Math.cos(ang) * sx, b: Math.sin(ang) * sx, c: -Math.sin(ang) * sy, d: Math.cos(ang) * sy, e: qa.x, f: qa.y };
      } else {
        const ux = tangentAt(path, g.s);
        // World text-up is normal × tangent. Canvas +y is text-down.
        const uy = unit({ x: n.y * ux.z - n.z * ux.y, y: n.z * ux.x - n.x * ux.z, z: n.x * ux.y - n.y * ux.x });
        const plane = planeAffine(rig, a, ux, { x: -uy.x, y: -uy.y, z: -uy.z }, lay.capH / q.cap);
        if (!plane || plane.a * plane.d - plane.b * plane.c <= 0) continue;
        aff = { ...plane, c: plane.c * popY, d: plane.d * popY };
      }
      const spin = off?.spin ?? 0, scale = off?.scale ?? 1;
      if (spin || scale !== 1) {
        const cx = q.adv / 2, cy = -q.cap / 2, X = aff.e + aff.a * cx + aff.c * cy, Y = aff.f + aff.b * cx + aff.d * cy;
        const cs = Math.cos(spin) * scale, sn = Math.sin(spin) * scale;
        const a0 = aff.a, b0 = aff.b, c0 = aff.c, d0 = aff.d;
        aff.a = cs * a0 - sn * b0; aff.b = sn * a0 + cs * b0;
        aff.c = cs * c0 - sn * d0; aff.d = sn * c0 + cs * d0;
        aff.e = X - aff.a * cx - aff.c * cy; aff.f = Y - aff.b * cx - aff.d * cy;
      }
      c.setTransform(aff.a, aff.b, aff.c, aff.d, aff.e, aff.f);
      c.globalAlpha = alpha * clamp(off?.alpha ?? 1); c.fillStyle = heatColor(st.base, st.on, t - g.t0);
      if (st.outline && st.outline.px > 0) {
        c.strokeStyle = st.outline.color; c.lineJoin = 'round';
        c.lineWidth = st.outline.px / Math.max(1e-8, Math.sqrt(Math.abs(aff.a * aff.d - aff.b * aff.c)));
        c.stroke(q.path);
      }
      c.fill(q.path); drawn++;
      const pad = st.outline && st.outline.px > 0 ? c.lineWidth / 2 : 0, b = q.bounds;
      for (const x of [b.x0 - pad, b.x1 + pad]) for (const y of [b.y0 - pad, b.y1 + pad]) {
        const X = aff.a * x + aff.c * y + aff.e, Y = aff.b * x + aff.d * y + aff.f;
        x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
      }
    }
  } finally { c.restore(); }
  const s = writeHead(lay.glyphs, t, lay.s0), n = st.mode === 'stand' ? up : unit(st.normal!(s));
  const p = displaced(pathAt(path, s), n), q = st.visible && !st.visible(p) ? null : rig.proj(p.x, p.y, p.z);
  return { bbox: drawn ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null, head: q ? { x: q.x, y: q.y, s } : null, drawn };
}
