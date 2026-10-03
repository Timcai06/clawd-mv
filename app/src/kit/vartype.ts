// Continuous Archivo: interpolates glyph outlines between the 24 static instances
// (widths 62–125 × weights 300–900) so width and weight animate smoothly, not in 6 / 4 steps.
// The instances come from one variable font, so every glyph has the same command structure in all
// of them (verified for A–Z a–z 0–9 and lyric punctuation); a glyph that does not match falls back
// to the nearest instance. Pure functions of (text, axes, size): deterministic, no time reads.
import { ARCHIVO_WEIGHTS, ARCHIVO_WIDTHS, ot } from '../engine/type';

export interface Axes { wdth: number; wght: number }
type Outline = { types: string; xy: Float32Array; adv: number };

const WD = ARCHIVO_WIDTHS.map((w) => w / 10); // 62, 75, 87.5, 100, 112.5, 125
const WT = [...ARCHIVO_WEIGHTS] as number[];
const cache = new Map<string, Outline>(); // `${w}-${wt}|${ch}`
let UPM = 1000;

function outline(wi: number, gi: number, ch: string): Outline {
  const key = `${wi}-${gi}|${ch}`;
  let o = cache.get(key);
  if (o) return o;
  const f = ot(`Archivo-${ARCHIVO_WIDTHS[wi]}-${WT[gi]}`);
  UPM = f.unitsPerEm;
  const g = f.charToGlyph(ch);
  const p = g.getPath(0, 0, UPM); // font units, y down, baseline at 0
  let types = '';
  const xy: number[] = [];
  for (const c of p.commands as any[]) {
    types += c.type;
    if (c.type === 'C') xy.push(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
    else if (c.type === 'Q') xy.push(c.x1, c.y1, c.x, c.y);
    else if (c.type !== 'Z') xy.push(c.x, c.y);
  }
  o = { types, xy: Float32Array.from(xy), adv: g.advanceWidth ?? UPM * 0.5 };
  cache.set(key, o);
  return o;
}

function bracket(list: number[], v: number): [number, number, number] {
  if (v <= list[0]!) return [0, 0, 0];
  for (let i = 1; i < list.length; i++) if (v <= list[i]!) return [i - 1, i, (v - list[i - 1]!) / (list[i]! - list[i - 1]!)];
  const n = list.length - 1;
  return [n, n, 0];
}

/** Interpolated outline of one character in font units (y down). */
export function varGlyph(ch: string, a: Axes): Outline {
  const [w0, w1, tw] = bracket(WD, a.wdth), [g0, g1, tg] = bracket(WT, a.wght);
  const o00 = outline(w0, g0, ch), o10 = outline(w1, g0, ch), o01 = outline(w0, g1, ch), o11 = outline(w1, g1, ch);
  if (o00.types !== o10.types || o00.types !== o01.types || o00.types !== o11.types) {
    return outline(tw < 0.5 ? w0 : w1, tg < 0.5 ? g0 : g1, ch);
  }
  const n = o00.xy.length, xy = new Float32Array(n);
  const k00 = (1 - tw) * (1 - tg), k10 = tw * (1 - tg), k01 = (1 - tw) * tg, k11 = tw * tg;
  for (let i = 0; i < n; i++) xy[i] = o00.xy[i]! * k00 + o10.xy[i]! * k10 + o01.xy[i]! * k01 + o11.xy[i]! * k11;
  return { types: o00.types, xy, adv: o00.adv * k00 + o10.adv * k10 + o01.adv * k01 + o11.adv * k11 };
}

let M: { cap: number; x: number; upm: number } | null = null;
function metrics() {
  if (!M) {
    const f = ot('Archivo-1000-700'), os2 = (f.tables as any).os2;
    M = { cap: os2?.sCapHeight || 0.7 * f.unitsPerEm, x: os2?.sxHeight || 0.53 * f.unitsPerEm, upm: f.unitsPerEm };
  }
  return M;
}

function kern(a: string, b: string, ax: Axes): number {
  const [w0] = bracket(WD, ax.wdth), [g0] = bracket(WT, ax.wght);
  const f = ot(`Archivo-${ARCHIVO_WIDTHS[w0]}-${WT[g0]}`);
  try { return f.getKerningValue(f.charToGlyph(a), f.charToGlyph(b)) || 0; } catch { return 0; }
}

/** Append a glyph outline to a path, scaled by `s` (px per font unit) at (x, y). */
export function tracePath(path: Path2D | CanvasRenderingContext2D, o: Outline, x: number, y: number, s: number) {
  const { types, xy } = o;
  let j = 0;
  for (let i = 0; i < types.length; i++) {
    const t = types[i];
    if (t === 'M') { path.moveTo(x + xy[j]! * s, y + xy[j + 1]! * s); j += 2; }
    else if (t === 'L') { path.lineTo(x + xy[j]! * s, y + xy[j + 1]! * s); j += 2; }
    else if (t === 'Q') { path.quadraticCurveTo(x + xy[j]! * s, y + xy[j + 1]! * s, x + xy[j + 2]! * s, y + xy[j + 3]! * s); j += 4; }
    else if (t === 'C') {
      path.bezierCurveTo(x + xy[j]! * s, y + xy[j + 1]! * s, x + xy[j + 2]! * s, y + xy[j + 3]! * s, x + xy[j + 4]! * s, y + xy[j + 5]! * s);
      j += 6;
    } else if (t === 'Z') path.closePath();
  }
}

export interface VarGlyph { ch: string; i: number; x: number; adv: number; axes: Axes; o: Outline }
export interface VarRun { text: string; size: number; glyphs: VarGlyph[]; width: number; capH: number; xH: number }

/**
 * Lay out `text` at `size` px. `axes` may be one value or a per-glyph function (a word can stretch
 * while its neighbours do not). `tracking` in px. Kerning comes from the nearest instance.
 */
/**
 * Default tracking for display sizes (TREATMENT.md Typography: big type sets tight): 0 up to 300 px,
 * then −1 % of the size, tightening to −3 % at 900 px and above.
 */
export const displayTracking = (size: number) => size <= 300 ? 0 : -size * (0.01 + 0.02 * Math.min(1, (size - 300) / 600));
export function varRun(text: string, size: number, axes: Axes | ((i: number, ch: string) => Axes), tracking = displayTracking(size)): VarRun {
  const chars = Array.from(text);
  const s = size / (UPM || 1000);
  const glyphs: VarGlyph[] = [];
  let x = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!, ax = typeof axes === 'function' ? axes(i, ch) : axes;
    const o = varGlyph(ch, ax);
    if (i > 0) x += kern(chars[i - 1]!, ch, ax) * s;
    glyphs.push({ ch, i, x, adv: o.adv * s, axes: ax, o });
    x += o.adv * s + tracking;
  }
  const m = metrics();
  return { text, size, glyphs, width: Math.max(0, x - (chars.length ? tracking : 0)), capH: m.cap * size / m.upm, xH: m.x * size / m.upm };
}

/** Path of the whole run with its origin (left, baseline) at (x, y). */
export function runPath(run: VarRun, x = 0, y = 0, only?: (g: VarGlyph) => boolean): Path2D {
  const p = new Path2D(), s = run.size / (UPM || 1000);
  for (const g of run.glyphs) if (!only || only(g)) tracePath(p, g.o, x + g.x, y, s);
  return p;
}

/** Fill a run (non-zero winding, like the font). */
export function fillRun(c: CanvasRenderingContext2D, run: VarRun, x = 0, y = 0, only?: (g: VarGlyph) => boolean) {
  c.fill(runPath(run, x, y, only));
}

/** Path of a single glyph at its own origin (left, baseline). */
export function glyphPath(run: VarRun, g: VarGlyph): Path2D {
  const p = new Path2D();
  tracePath(p, g.o, 0, 0, run.size / (UPM || 1000));
  return p;
}

/** Size that makes `text` exactly `width` px wide at the given axes. */
export function fitVar(text: string, width: number, axes: Axes, tracking = 0): number {
  const r = varRun(text, 100, axes, tracking * 100 / Math.max(1, width));
  return r.width > 0 ? 100 * width / r.width : 100;
}
