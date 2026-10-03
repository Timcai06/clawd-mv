// Scene handoffs (docs/TREATMENT.md, "歌词 v3 与分镜对齐：定稿", 三): the object one scene passes to
// the next across a cut, in logical screen px (1920×1080, y down). Both scenes import these values:
// the outgoing scene moves the object here during its last beat, the incoming scene starts from here
// on its first frame. One copy only (pdoom duplicated such constants and they drifted).
// Values derived from the storyboard keyframes (out/storyboard/v2). Owner: C. Scene groups: read-only.

import type { LensView } from './lens';

export type Rect = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };

export const HANDOFF = {
  /** S01→S02: the clay cursor (top-left of the block, height h); S02's ink→paper wipe starts at x. */
  cursor01: { x: 950, y: 610, h: 40 },
  /** S02→S03: the notification card lands on the issue form's top bar. */
  card02: { x: 60, y: 57, w: 1790, h: 58 } as Rect,
  /** S03→S04: the form's mini calendar = the outline of S04's opening top-down month. */
  month03: { x: 1355, y: 90, w: 511, h: 438 } as Rect,
  /** S04→S05: Clawd (sprite top-left and pixel size). */
  clawd04: { x: 1132, y: 418, px: 6 },
  /** S05→S06: the clay underline of the line being read = S06's first strike-through. */
  strike05: { x0: 588, x1: 1295, y: 538 },
  /** S06→S07: the pen-cursor tip = the first keycap that lights up in S07. */
  pen06: { x: 671, y: 809 } as Pt,
  /** S08→S09: the hash line's hairline collapses to the oscilloscope baseline. */
  base08: { x0: 0, x1: 1920, y: 540 },
  /** S09→S10: the numeral 19 (left, baseline, cap height). */
  nineteen09: { x: 96, baseline: 232, capH: 140 },
  /** S10→S11: shards keep falling along the storm's slant (radians, screen roll) at this speed. */
  fall10: { roll: -0.2, pxPerBeat: 220 },
  /** S11→S12: the row of empty .notdef boxes (centre, total width, count) = S12's row of copies. */
  boxes11: { cx: 960, cy: 520, w: 1000, n: 9 },
  /** S12→S13: the clay 11 (its bounding box) grows into S13's clay half. */
  eleven12: { x: 1676, y: 826, w: 244, h: 254 } as Rect,
  /** S13→S14: git log scroll (up) = shaft fall (down): line pitch and speed. */
  fall13: { pitch: 36, pxPerBeat: 140 },
  /** S14→S15: the glowing clay line at the bottom of the shaft = S15's rule above `line 42`. */
  line14: { x0: 46, x1: 1872, y: 990 },
  /** S15→S16: the snipped piece of the ≤ bar = S16's first domino (rect, before it tips). */
  domino15: { x: 1010, y: 600, w: 70, h: 210 } as Rect,
  /** S16→S17: the 19th domino's face = the rect S17's clay flood grows from. */
  domino16: { x: 1602, y: 580, w: 247, h: 430 } as Rect,
  /** S17→S18: git graph nodes = the first stars of S18's constellation. */
  nodes17: [{ x: 83, y: 434 }, { x: 282, y: 434 }, { x: 408, y: 434 }, { x: 1478, y: 546 }, { x: 1645, y: 546 }, { x: 1826, y: 546 }] as Pt[],
} as const;

// ── Stage 9 ① (docs/CUTS.md): hand-off primitives in final screen space ─────────────────────────
// Each cut hands over one primitive. The outgoing scene exports exitPrim(t), the incoming one
// entryPrim(t), both after their own camera (lens or 3D projection); tests/handoff.test.ts checks
// that the last frame before the cut and the first frame after it agree within 2 px / 2 %.
export type Prim =
  | { kind: 'point'; x: number; y: number; r: number }
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number; w: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | { kind: 'points'; pts: Pt[] };

/** Where a point of a lens target lands on screen (inverse of the lens shader's lookup). */
export function lensPoint(v: LensView, p: Pt): Pt {
  const ax = v.ax ?? v.fx, ay = v.ay ?? v.fy, r = v.rot ?? 0, c = Math.cos(r), s = Math.sin(r);
  const dx = p.x - v.fx, dy = p.y - v.fy;
  return { x: ax + v.zoom * (c * dx - s * dy), y: ay + v.zoom * (s * dx + c * dy) };
}
/** A target-space rect through the lens (axis-aligned bounds; exact when rot = 0). */
export function lensRect(v: LensView, r: Rect): Rect {
  const ps = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].map(([x, y]) => lensPoint(v, { x: x!, y: y! }));
  const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Position error (px) and relative size error between two primitives of the same kind. */
export function primError(a: Prim, b: Prim): { px: number; size: number } {
  const d = (x: number, y: number, X: number, Y: number) => Math.hypot(X - x, Y - y);
  const rel = (x: number, y: number) => Math.abs(x - y) / Math.max(1e-9, Math.abs(x), Math.abs(y));
  if (a.kind === 'point' && b.kind === 'point') return { px: d(a.x, a.y, b.x, b.y), size: rel(a.r, b.r) };
  if (a.kind === 'line' && b.kind === 'line') return {
    px: Math.min(Math.max(d(a.x0, a.y0, b.x0, b.y0), d(a.x1, a.y1, b.x1, b.y1)), Math.max(d(a.x0, a.y0, b.x1, b.y1), d(a.x1, a.y1, b.x0, b.y0))),
    size: rel(a.w, b.w),
  };
  if (a.kind === 'rect' && b.kind === 'rect') return {
    px: Math.max(d(a.x, a.y, b.x, b.y), d(a.x + a.w, a.y + a.h, b.x + b.w, b.y + b.h)),
    size: Math.max(rel(a.w, b.w), rel(a.h, b.h)),
  };
  if (a.kind === 'points' && b.kind === 'points') {
    if (a.pts.length !== b.pts.length) return { px: Infinity, size: Infinity };
    return { px: Math.max(0, ...a.pts.map((p, i) => d(p.x, p.y, b.pts[i]!.x, b.pts[i]!.y))), size: 0 };
  }
  throw new Error(`cannot compare ${a.kind} with ${b.kind}`);
}

/** A flat scene's camera as Canvas2D ops: translate(ax, ay) · scale(zoom) · rotate(rot) · translate(-fx, -fy). */
export interface Cam2 { zoom: number; rot: number; fx: number; fy: number; ax: number; ay: number }
export function applyCam2(c: CanvasRenderingContext2D, k: Cam2) {
  c.translate(k.ax, k.ay); c.scale(k.zoom, k.zoom); c.rotate(k.rot); c.translate(-k.fx, -k.fy);
}
export function cam2Point(k: Cam2, p: Pt): Pt {
  const dx = p.x - k.fx, dy = p.y - k.fy, cs = Math.cos(k.rot), sn = Math.sin(k.rot);
  return { x: k.ax + k.zoom * (cs * dx - sn * dy), y: k.ay + k.zoom * (sn * dx + cs * dy) };
}
export function cam2Rect(k: Cam2, r: Rect): Rect {
  const ps = [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]].map(([x, y]) => cam2Point(k, { x: x!, y: y! }));
  const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y), x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function mixCam2(a: Cam2, b: Cam2, k: number): Cam2 {
  const l = (x: number, y: number) => x + (y - x) * k;
  return { zoom: l(a.zoom, b.zoom), rot: l(a.rot, b.rot), fx: l(a.fx, b.fx), fy: l(a.fy, b.fy), ax: l(a.ax, b.ax), ay: l(a.ay, b.ay) };
}
