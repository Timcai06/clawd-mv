// Scene handoffs (docs/TREATMENT.md, "歌词 v3 与分镜对齐：定稿", 三): the object one scene passes to
// the next across a cut, in logical screen px (1920×1080, y down). Both scenes import these values:
// the outgoing scene moves the object here during its last beat, the incoming scene starts from here
// on its first frame. One copy only (pdoom duplicated such constants and they drifted).
// Values derived from the storyboard keyframes (out/storyboard/v2). Owner: C. Scene groups: read-only.

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

// v2: pure screen-space geometry. The v3 HANDOFF values above remain byte-for-byte intact.
import type { AudioData } from '../engine/audio';
import { clamp, lerp } from '../engine/util';
import { carryLayout, type CarrySpec } from './carry';
import { varRun } from './vartype';

export type Prim =
  | { kind: 'point'; x: number; y: number; r: number }
  | { kind: 'line'; x0: number; y0: number; x1: number; y1: number; w: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; roll?: number }
  | { kind: 'carry'; spec: CarrySpec };
export interface Cut { id: string; out: string; in: string }
export function primError(a: Prim, b: Prim): { px: number; size: number } {
  if (a.kind !== b.kind) throw new Error('cannot compare different primitive kinds');
  const dist = (x: number, y: number, X: number, Y: number) => Math.hypot(X-x,Y-y);
  const relative = (x: number,y: number) => Math.abs(x-y)/Math.max(1e-12,Math.abs(x),Math.abs(y));
  if (a.kind === 'point' && b.kind === 'point') return { px: dist(a.x,a.y,b.x,b.y), size: relative(a.r,b.r) };
  if (a.kind === 'line' && b.kind === 'line') return {
    px: Math.min(Math.max(dist(a.x0,a.y0,b.x0,b.y0),dist(a.x1,a.y1,b.x1,b.y1)),Math.max(dist(a.x0,a.y0,b.x1,b.y1),dist(a.x1,a.y1,b.x0,b.y0))),
    size: relative(a.w,b.w),
  };
  if (a.kind === 'rect' && b.kind === 'rect') {
    const corners = (p: typeof a) => {
      const cs = Math.cos(p.roll ?? 0), sn = Math.sin(p.roll ?? 0);
      return [[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5]].map(([x,y]) => ({ x: p.x+p.w/2+cs*x!*p.w-sn*y!*p.h, y: p.y+p.h/2+sn*x!*p.w+cs*y!*p.h }));
    };
    const A = corners(a), B = corners(b);
    return { px: Math.max(...A.map((p,i) => dist(p.x,p.y,B[i]!.x,B[i]!.y))), size: Math.max(relative(a.w,b.w),relative(a.h,b.h)) };
  }
  if (a.kind === 'carry' && b.kind === 'carry') {
    const A = carryLayout(a.spec), B = carryLayout(b.spec);
    if (A.length !== B.length || A.some((g,i) => g.ch !== B[i]!.ch)) return { px: Infinity, size: Infinity };
    const ra = varRun(a.spec.text,100,a.spec.axes), rb = varRun(b.spec.text,100,b.spec.axes);
    let px = 0, size = 0;
    A.forEach((g,i) => {
      const h = B[i]!, ga = ra.glyphs[i]!, gb = rb.glyphs[i]!;
      for (const [x,y,X,Y] of [[0,0,0,0],[ga.adv,0,gb.adv,0],[0,-ra.capH,0,-rb.capH]])
        px = Math.max(px,dist(g.a*x!+g.c*y!+g.e,g.b*x!+g.d*y!+g.f,h.a*X!+h.c*Y!+h.e,h.b*X!+h.d*Y!+h.f));
      size = Math.max(size,relative(Math.hypot(g.a,g.b)*ga.adv,Math.hypot(h.a,h.b)*gb.adv),relative(Math.hypot(g.c,g.d)*ra.capH,Math.hypot(h.c,h.d)*rb.capH));
    });
    return { px,size };
  }
  throw new Error('unsupported primitive');
}
export function exitEnvelope(t: number, end: number, peak = 1.9): { still: number; gain: number } {
  return { still: t >= end-0.1 ? 1 : 0, gain: t >= end ? peak : lerp(1,peak,clamp((t-(end-0.09))/0.09)) };
}
export function accelerando(audio: AudioData, t0: number, tSwitch: number, end: number): number[] {
  if (end <= t0) return [];
  const out: number[] = [], sw = clamp(tSwitch,t0,end);
  const add = (start: number, stop: number, step: number) => {
    const b0 = audio.beatAt(start), b1 = audio.beatAt(stop);
    for (let n = 0; b0+n*step < b1-1e-9; n++) {
      // Use the supplied anchor exactly; all later pulses follow the measured variable grid.
      const t = n ? audio.timeOfBeat(b0+n*step) : start;
      if (t >= start-1e-9 && t < stop-1e-9) out.push(t);
    }
  };
  add(t0,sw,0.5); add(sw,end,0.25);
  return out;
}
