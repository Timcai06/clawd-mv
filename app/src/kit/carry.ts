// A single screen layout and motion function shared across both sides of a cut.
import { clamp, lerp } from '../engine/util';
import { css, type ThemeKey } from '../theme';
import { runInkBounds } from './pathtext';
import { glyphPath, varRun, type Axes } from './vartype';

export interface CarrySpec { text: string; size: number; axes: Axes; x: number; y: number; tracking?: number; color: ThemeKey }
export interface GlyphAffine { a: number; b: number; c: number; d: number; e: number; f: number; ch: string; i: number }
export function carryLayout(spec: CarrySpec, k = 1): GlyphAffine[] {
  const run = varRun(spec.text, 100, spec.axes, (spec.tracking ?? 0) * 100), ink = runInkBounds(run);
  const scale = spec.size * k / run.capH;
  return run.glyphs.map(g => ({ a: scale, b: 0, c: 0, d: scale, e: spec.x + (g.x - ink.x0) * scale, f: spec.y, ch: g.ch, i: g.i }));
}
export function carryDrift(spec: CarrySpec, t: number, d: number): GlyphAffine[] {
  const aff = carryLayout(spec), amt = clamp(d);
  if (!amt) return aff;
  const run = varRun(spec.text, 100, spec.axes), em = 100 * spec.size / run.capH;
  return aff.map((g, i) => {
    const ang = Math.sin(t * 5.1 + i * 2.7) * 0.05 * amt, cs = Math.cos(ang), sn = Math.sin(ang);
    const cx = run.glyphs[i]!.adv / 2, cy = -run.capH / 2;
    const X = g.e + g.a * cx, Y = g.f + g.d * cy - (0.5 + 0.5 * Math.sin(t * 4.4 + i * 0.9)) * em * 0.06 * amt;
    const a = cs * g.a, b = sn * g.a, c = -sn * g.d, dd = cs * g.d;
    return { ...g, a, b, c, d: dd, e: X - a * cx - c * cy, f: Y - b * cx - dd * cy };
  });
}
export function drawCarry(c: CanvasRenderingContext2D, spec: CarrySpec, aff: GlyphAffine[], alpha = 1): void {
  const run = varRun(spec.text, 100, spec.axes);
  c.save();
  try {
    c.fillStyle = css(spec.color); c.globalAlpha *= clamp(alpha);
    for (const g of aff) {
      const glyph = run.glyphs[g.i];
      if (!glyph || glyph.ch !== g.ch) throw new Error('carry affine does not match the text');
      c.setTransform(g.a, g.b, g.c, g.d, g.e, g.f); c.fill(glyphPath(run, glyph));
    }
  } finally { c.restore(); }
}
export function lerpAffines(a: GlyphAffine[], b: GlyphAffine[], k: number): GlyphAffine[] {
  if (a.length !== b.length || a.some((g, i) => g.ch !== b[i]!.ch || g.i !== b[i]!.i)) throw new Error('affine layouts must have corresponding glyphs');
  k = clamp(k);
  if (k === 0 || k === 1) return (k === 0 ? a : b).map(g => ({ ...g }));
  return a.map((g, i) => {
    const h = b[i]!;
    return { ch: g.ch, i: g.i, a: lerp(g.a, h.a, k), b: lerp(g.b, h.b, k), c: lerp(g.c, h.c, k), d: lerp(g.d, h.d, k), e: lerp(g.e, h.e, k), f: lerp(g.f, h.f, k) };
  });
}
