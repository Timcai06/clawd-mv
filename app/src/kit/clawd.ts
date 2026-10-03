// Clawd, the 16x5 pixel sprite from the Claude Code welcome screen (reference/clawd/clawd.json,
// terminal_welcome), and its action library A1-A13 (docs/STORYBOARD.md).
//
// Rules: the sprite never gains detail or changes proportions. Inside the sprite only whole
// pixels move (a leg lifts, an arm rises, an eye closes); the body as a whole may translate
// continuously (`quantize` snaps that too). Everything is a pure function of the inputs.
import clawd from '../../../reference/clawd/clawd.json';
import { css } from '../theme';

export const W = 16;
export const H = 5;
const BASE: readonly string[] = clawd.terminal_welcome.pixels;

/** Pixel kinds: body, eye. */
export type Kind = 'O' | 'D';
export interface Cell { x: number; y: number; k: Kind }

export type Action = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'A8' | 'A9' | 'A10' | 'A11' | 'A12' | 'A13' | 'A14';

/** Gaze: -1 left, 0 centre, 1 right, 'down'. */
export type Look = -1 | 0 | 1 | 'down';

/** Anatomy of the base grid (see clawd.json): eyes on row 1, arms on row 2, legs on row 4. */
export const EYES = [{ x: 4, y: 1 }, { x: 11, y: 1 }] as const;
export const LEFT_ARM = [0, 1];
export const RIGHT_ARM = [14, 15];
export const LEGS = [3, 5, 10, 12];

export interface PoseInput {
  /** Continuous beat index at the current time (Frame.beat or AudioData.beatAt(t)). */
  beat: number;
  /** Continuous beat index at which the action started (the shot's anchor). */
  beat0: number;
  /** 0..1 progress through the action's window (e.g. the shot). */
  p: number;
  /** A6 jump: beats from take-off to landing (default 1). */
  jumpBeats?: number;
  /** A5 / A11: travel over the whole window in sprite pixels (default A5: 24, A11: 6). */
  travel?: number;
  /** A10: how far the right arm extends, in sprite pixels (default 4). */
  reach?: number;
  /** Eye direction: -1 left, 0 centre, 1 right; 'down' for A11 by default. */
  look?: Look;
  /** A14: continuous beat index of a startle (whole-body one-pixel hop for a quarter beat). */
  startle?: number;
}

export interface Pose {
  cells: Cell[];
  /** Whole-body offset in sprite pixels (y down). */
  dx: number;
  dy: number;
}

const frac = (x: number) => x - Math.floor(x);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function baseCells(): Cell[] {
  const out: Cell[] = [];
  BASE.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'O' || c === 'D') out.push({ x, y, k: c }); }));
  return out;
}

const isArm = (c: Cell, side: 'L' | 'R' | 'both') =>
  c.y === 2 && ((side !== 'R' && LEFT_ARM.includes(c.x)) || (side !== 'L' && RIGHT_ARM.includes(c.x)));

/** Close eyes (fill them with body), or move each eye one pixel sideways/down. */
function eyes(cells: Cell[], mode: 'open' | 'closed' | 'leftOnly' | -1 | 1 | 'down'): Cell[] {
  if (mode === 'open') return cells;
  return cells.map((c) => {
    const eye = EYES.findIndex((e) => e.x === c.x && e.y === c.y);
    if (mode === 'closed' || (mode === 'leftOnly' && eye === 1)) return eye >= 0 ? { ...c, k: 'O' } : c;
    if (mode === 'leftOnly') return c;
    // shifted gaze: the eye pixel becomes body, its neighbour becomes the eye
    const d = mode === 'down' ? { x: 0, y: 1 } : { x: mode, y: 0 };
    if (eye >= 0) return { ...c, k: 'O' };
    if (EYES.some((e) => e.x + d.x === c.x && e.y + d.y === c.y)) return { ...c, k: 'D' };
    return c;
  });
}

/** Lift the given legs (a lifted leg's foot pixel disappears into the body line). */
const liftLegs = (cells: Cell[], lifted: number[]) => cells.filter((c) => !(c.y === 4 && lifted.includes(c.x)));

/** Raise an arm by one row. */
const raiseArm = (cells: Cell[], side: 'L' | 'R' | 'both', rows = 1) => cells.map((c) => (isArm(c, side) ? { ...c, y: c.y - rows } : c));

/** Landing squash: drop the top body row and shift the rest down by one. */
const squash = (cells: Cell[]) => cells.filter((c) => c.y !== 0).map((c) => (c.y < 3 ? { ...c, y: c.y + 1 } : c));

/** The pose of an action at a moment. */
export function pose(action: Action | null, i: PoseInput): Pose {
  let cells = baseCells();
  let dx = 0, dy = 0;
  const b = i.beat - i.beat0; // beats since the action started
  const ph = frac(i.beat);
  switch (action) {
    case null:
      break;
    case 'A1': { // asleep: eyes closed, sinks one pixel every other beat (breathing)
      cells = eyes(cells, 'closed');
      dy = Math.floor(i.beat / 2) % 2;
      break;
    }
    case 'A2': { // waking: left eye opens first, the right one a beat later
      cells = eyes(cells, b < 1 ? 'closed' : b < 2 ? 'leftOnly' : 'open');
      break;
    }
    case 'A3': // idle: hop up one pixel on every beat
      dy = ph < 0.35 ? -1 : 0;
      break;
    case 'A4': { // typing: one leg up every 1/8 beat, arms alternate
      const k = Math.floor(i.beat * 8);
      cells = liftLegs(cells, [LEGS[k % 4]!]);
      cells = raiseArm(cells, k % 2 ? 'L' : 'R');
      break;
    }
    case 'A5': { // crab walk: travel sideways, legs alternate in pairs every half beat
      dx = (i.travel ?? 24) * i.p;
      cells = liftLegs(cells, Math.floor(i.beat * 2) % 2 ? [LEGS[0]!, LEGS[2]!] : [LEGS[1]!, LEGS[3]!]);
      break;
    }
    case 'A6': { // jump: take off at the anchor, land after jumpBeats; squash on landing
      const n = i.jumpBeats ?? 1;
      const u = b / n;
      if (u >= 0 && u < 1) dy = -4 * 4 * u * (1 - u); // parabola, apex 4 px
      else if (u >= 1 && u < 1 + 0.25 / n) cells = squash(cells);
      if (u >= 0 && u < 1) cells = raiseArm(cells, 'both');
      break;
    }
    case 'A7': // arms up (shield / cheer)
      cells = raiseArm(cells, 'both');
      break;
    case 'A8': // panic: horizontal jitter of one pixel, 16 steps per beat
      dx = Math.floor(i.beat * 16) % 2 ? 1 : -1;
      cells = eyes(cells, Math.floor(i.beat * 4) % 2 ? -1 : 1);
      break;
    case 'A9': { // counting: legs lift one by one, one per beat, then all down. Eyes stay open
      // (closed eyes are for sleep only, CONTEXT Clawd 的眼睛); pass `look` to watch the count.
      const k = Math.max(0, Math.floor(b)) % 5;
      cells = liftLegs(cells, LEGS.slice(0, k));
      break;
    }
    case 'A10': { // snip: the right arm reaches out and snaps back, once per beat
      const reach = Math.round((i.reach ?? 4) * Math.sin(Math.PI * clamp01(ph * 1.5)));
      for (let k = 1; k <= reach; k++) cells.push({ x: RIGHT_ARM[1]! + k, y: 2, k: 'O' });
      if (reach > 0) cells.push({ x: RIGHT_ARM[1]! + reach, y: 1, k: 'O' }); // the claw tip
      break;
    }
    case 'A11': // sinking: slow descent, eyes look down
      dy = (i.travel ?? 6) * i.p;
      cells = eyes(cells, 'down');
      break;
    case 'A12': { // celebrate: a small jump on every beat with arms up
      dy = -3 * Math.sin(Math.PI * ph);
      cells = raiseArm(cells, 'both');
      break;
    }
    case 'A13': { // wave: the right arm goes up and down twice per beat
      cells = raiseArm(cells, 'R', Math.floor(i.beat * 4) % 2 ? 2 : 1);
      break;
    }
    case 'A14': { // watch: the body holds still, the eyes follow `look`; one-pixel hop on a startle
      const s = i.startle === undefined ? -1 : i.beat - i.startle;
      if (s >= 0 && s < 0.25) dy = -1;
      break;
    }
  }
  if (i.look !== undefined && i.look !== 0 && action !== 'A1' && action !== 'A8') cells = eyes(cells, i.look);
  return { cells, dx, dy };
}

export interface DrawOpts {
  /** Screen size of one sprite pixel (logical px). */
  px: number;
  /** Snap the whole-body offset to whole sprite pixels (retro stepping). Default false. */
  quantize?: boolean;
  /** Override colours (defaults: body = clay, eyes = pit, the recessed dark that beats every ground). */
  body?: string;
  eye?: string;
  alpha?: number;
}

/**
 * Draw a pose with its top-left base corner at (x, y) in logical px. Pixels are hard squares;
 * adjacent cells overlap by a hair so no seams show at fractional positions.
 */
export function draw(c: CanvasRenderingContext2D, x: number, y: number, p: Pose, o: DrawOpts) {
  const q = o.quantize ? Math.round : (v: number) => v;
  const ox = x + q(p.dx) * o.px, oy = y + q(p.dy) * o.px;
  const body = o.body ?? css('clay', o.alpha ?? 1), eye = o.eye ?? css('pit', o.alpha ?? 1);
  const e = 0.35; // seam overlap
  c.save();
  c.imageSmoothingEnabled = false;
  for (const cell of p.cells) {
    c.fillStyle = cell.k === 'D' ? eye : body;
    c.fillRect(ox + cell.x * o.px, oy + cell.y * o.px, o.px + e, o.px + e);
  }
  c.restore();
}

/** Bounding size of the sprite in logical px at a given pixel size. */
export const size = (px: number) => ({ w: W * px, h: H * px });

/**
 * Where the eyes point to look at a screen point, for a sprite drawn with its top-left base corner
 * at (x, y): sideways once the target leaves the middle fifth of the body, down when it is centred
 * below the feet, otherwise straight ahead. Whole pixels only, so the eyes snap like the sprite.
 */
export function gaze(x: number, y: number, px: number, target: { x: number; y: number }): Look {
  const dx = target.x - (x + (W / 2) * px);
  if (Math.abs(dx) > W * px * 0.2) return dx < 0 ? -1 : 1;
  return target.y > y + H * px ? 'down' : 0;
}
