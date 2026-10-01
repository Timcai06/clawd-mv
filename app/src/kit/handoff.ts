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
