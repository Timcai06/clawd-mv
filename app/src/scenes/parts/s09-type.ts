// D-group print helpers. All sung forms come from Voice; labels alone use Plex.
import { F, font } from '../../engine/type';
import { css, type ThemeKey } from '../../theme';
import { Voice, drawSet, wrap } from '../../kit/lyric-moves';
import { varRun, fillRun, type VarRun } from '../../kit/vartype';
import { afterBeats, span } from '../../kit/time';
import type { AudioData } from '../../engine/audio';
import { hash, ease } from '../../engine/util';
import type { Rect } from '../../kit/handoff';
import type { Pose } from '../../kit/clawd';

export function mono(c: CanvasRenderingContext2D, text: string, x: number, y: number,
  size = 18, color: ThemeKey = 'ink', alpha = 0.6) {
  c.save(); c.font = font(F.mono(500), size); c.fillStyle = css(color, alpha);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(text, x, y); c.restore();
}
/** Cut animations reach their endpoint before the last output frame, and stay within one beat. */
export function exitBeat(audio: AudioData, t: number, end: number) {
  return ease.inOutCubic(span(t, afterBeats(audio, end, -1), afterBeats(audio, end, -0.1)));
}
export function enterBeat(audio: AudioData, t: number, start: number) {
  return ease.inOutCubic(span(t, start, afterBeats(audio, start, 1)));
}
export function union(points: readonly (readonly [number, number])[]): Rect {
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function spriteBox(x: number, y: number, px: number, pose: Pose): Rect {
  return union(pose.cells.flatMap(p => [[x + (p.x + pose.dx) * px, y + (p.y + pose.dy) * px],
    [x + (p.x + pose.dx + 1) * px + 0.35, y + (p.y + pose.dy + 1) * px + 0.35]] as [number, number][]));
}
/** Bounding box of actual interpolated outline points, after the same Canvas transform. */
export function runBox(run: VarRun, x: number, y: number, sx = 1, sy = 1, roll = 0): Rect {
  const co = Math.cos(roll), si = Math.sin(roll), pts: [number, number][] = [];
  for (const g of run.glyphs) for (let i = 0; i < g.o.xy.length; i += 2) {
    const px = (g.x + g.o.xy[i]! * run.size / 1000) * sx;
    const py = g.o.xy[i + 1]! * run.size / 1000 * sy;
    pts.push([x + co * px - si * py, y + si * px + co * py]);
  }
  return union(pts);
}
/** A crossing line retains all already sung words, including before the new scene's first onset. */
export function carry(c: CanvasRenderingContext2D, v: Voice, t: number, start: number,
  x: number, y: number, on: 'ink' | 'paper', size = 96, glow?: CanvasRenderingContext2D) {
  const line = v.lyrics.lines.find(l => l.start < start && l.end > start);
  if (!line || t >= Math.min(v.lyrics.lines[line.i + 1]?.start ?? Infinity, afterBeats(v.audio, line.end, 1))) return;
  wrap(v.forms(line, t), size, 1920 - 96 - x).forEach((set, row) => drawSet(c, set, x, y + row * 110, { on, glow }));
}
/** Knock static toner voids out of a printed layer; never erases the live Ground. */
export function toner(c: CanvasRenderingContext2D, box: Rect, seed: number, count = 1400) {
  c.save(); c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < count; i++) {
    c.globalAlpha = 0.25 + hash(seed, i, 3) * 0.6;
    const r = 0.5 + 2 * hash(seed, i, 4) ** 4;
    c.fillRect(box.x + hash(seed, i, 1) * box.w, box.y + hash(seed, i, 2) * box.h, r, r);
  }
  c.restore();
}
export function counter19(c: CanvasRenderingContext2D, x: number, baseline: number, capH: number,
  color: ThemeKey) {
  const r = varRun('19', 100, { wdth: 100, wght: 900 });
  const run = varRun('19', 100 * capH / r.capH, { wdth: 100, wght: 900 });
  c.fillStyle = css(color); fillRun(c, run, x, baseline);
}

/** Outer box geometry, including stroke: the full nine-box silhouette is exactly the cut width. */
export function handoffBoxes(h: { cx: number; cy: number; w: number; n: number }) {
  const pitch = (h.w + 16) / h.n;
  return Array.from({ length: h.n }, (_, i) => ({ x: h.cx - h.w / 2 + i * pitch, y: h.cy - 40, w: pitch - 16, h: 80 }));
}

// V6 affine projection helpers, shared only inside the owned scene group.
import { Rig, planeAffine, type P3 } from '../../kit/rig';
import { pathAt, runInkBounds, type Path3, type PathLayout } from '../../kit/pathtext';
import type { GlyphAffine } from '../../kit/carry';
export function pathAffines(rig: Rig, path: Path3, lay: PathLayout, axes: { wdth: number; wght: number }, normal: P3): GlyphAffine[] {
  const ref = varRun('H', 100, axes), m = lay.capH / ref.capH;
  return lay.glyphs.map((g, i) => {
    const a = planeAffine(rig, pathAt(path, g.s), { x: 1, y: 0, z: 0 },
      { x: 0, y: -normal.z, z: normal.y }, m);
    return { ...(a ?? { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }), ch: g.ch, i };
  });
}
export function affineBounds(text: string, axes: { wdth: number; wght: number }, aff: GlyphAffine[]): Rect {
  const run = varRun(text, 100, axes), pts: [number, number][] = [];
  for (const g of aff) {
    const b = runInkBounds({ ...run, glyphs: [{ ...run.glyphs[g.i]!, x: 0 }] });
    for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) pts.push([g.a*x+g.c*y+g.e,g.b*x+g.d*y+g.f]);
  }
  return union(pts);
}
