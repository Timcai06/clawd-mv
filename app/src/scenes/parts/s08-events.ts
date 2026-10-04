// S08's verse-chorus lines as events (stage 9 ③, docs/reference/event-tables.md "S08"):
//   bracket's (two syllables) / gonna  a big "{ }", "( )", "[ ]" fly in and click into the gaps of a
//       three-line function block (shrinking to the code's own size, a clay flash on the click);
//   fit  the finished block drops like a Tetris piece into the gap in the code column and lands;
//   Tap-tap-tapping  a key goes down on every 16th, spitting the glyph it typed up off the keyboard;
//       Clawd hops onto each pressed key;   never  the whole board flashes once;
//   works  the calendar preview rises into a laptop bezel with a pass tick;  on  its days fill in;
//   my  "my machine · localhost:5173" under the bezel;  machine  a 32nd day quietly pops in after 31.
// Pure functions of t. Cameras are canvas transforms inside the scene's own.
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import { ease, hash, lerp } from '../../engine/util';
import { F, font } from '../../engine/type';
import { css } from '../../theme';
import { span, hitAfter, beatsSince } from '../../kit/time';
import type { Cam2 } from '../../kit/handoff';

export interface S08Events {
  every: number; bracket: number; gonna: number; fit: number; fitEnd: number;
  tap: number; never: number; quit: number;
  works: number; on: number; my: number; machine: number; end: number;
}
export function s08Events(lyrics: Lyrics, end: number): S08Events {
  const b = lyrics.get('Every bracket’s gonna fit').words, k = lyrics.get('Tap-tap-tapping, never quit').words;
  const m = lyrics.get('’Cause it works on my machine').words;
  return { every: b[0]!.start, bracket: b[1]!.start, gonna: b[2]!.start, fit: b[3]!.start, fitEnd: b[3]!.end,
    tap: k[0]!.start, never: k[1]!.start, quit: k[2]!.start,
    works: m[2]!.start, on: m[3]!.start, my: m[4]!.start, machine: m[5]!.start, end };
}

// ── the function block and the code column ─────────────────────────────────────────────────────
const MONO = 34, ADV = MONO * 0.6, LH = 50;
const BLOCK = ['for (let d = 1; d <= days; d++) {', '  cells[d - 1] = cell(d);', '}'];
/** Bracket slots in the block: [line, column] per pair, and the word that clicks them in. */
const PAIRS: { open: [number, number]; close: [number, number]; ch: [string, string]; at: (E: S08Events) => number }[] = [
  { open: [0, 32], close: [2, 0], ch: ['{', '}'], at: (E) => E.bracket },
  { open: [0, 4], close: [0, 30], ch: ['(', ')'], at: (E) => E.bracket + 0.45 },
  { open: [1, 7], close: [1, 13], ch: ['[', ']'], at: (E) => E.gonna },
];
const COLUMN = [
  'export function buildMonth(year: number, month: number) {',
  '  const days = daysIn(year, month);',
  '  const cells: Cell[] = [];',
  '', '', '',
  '  return cells;',
  '}',
];
const COL_X = 330, COL_Y = 600, GAP_ROW = 3;
const FLOAT_Y = 390;
const blockY = (t: number, E: S08Events) => {
  const drop = ease.inExpo(span(t, E.fit, E.fit + 0.14));
  return lerp(FLOAT_Y, COL_Y + GAP_ROW * LH, drop);
};
const FLY = 0.2;
/** Where a bracket glyph is: flying in large from off-frame, shrinking into its slot. */
function bracketAt(t: number, at: number, slot: [number, number], side: number, i: number, by: number) {
  const k = ease.outBack(span(t, at, at + FLY), 1.4);
  const sx = COL_X + slot[1] * ADV, sy = by + slot[0] * LH;
  const from = i === 0 ? { x: side < 0 ? -260 : 2180, y: sy } : i === 1 ? { x: sx, y: -240 } : { x: sx + side * 500, y: 1300 };
  return { x: lerp(from.x, sx, k), y: lerp(from.y, sy, k), size: lerp(190, MONO, Math.min(1, k)), k };
}
export function drawBracketWorld(c: CanvasRenderingContext2D, t: number, E: S08Events) {
  if (t < E.bracket - 0.02 || t >= E.tap) return;
  // the code column rises in on "bracket's" (the COMMIT print holds through "Every") and waits with its gap
  const rise = ease.outExpo(span(t, E.bracket, E.bracket + 0.3)), dy = 600 * (1 - rise);
  c.save(); c.translate(0, dy);
  c.font = font(F.mono(400), MONO);
  COLUMN.forEach((line, r) => { c.fillStyle = css('ink', 0.5); c.fillText(line, COL_X, COL_Y + r * LH); });
  c.fillStyle = css('ink', 0.35); c.font = font(F.mono(400), 18);
  for (let r = 0; r < COLUMN.length; r++) c.fillText(String(19 + r), COL_X - 60, COL_Y + r * LH - 6);
  if (t < E.fit + 0.14) { // the dashed slot the block will fill
    c.strokeStyle = css('ink', 0.35); c.lineWidth = 2; c.setLineDash([10, 8]);
    c.strokeRect(COL_X - 12, COL_Y + (GAP_ROW - 1) * LH + 14, 760, 3 * LH); c.setLineDash([]);
  }
  c.restore();
  // the block: its text with the bracket slots blank until each pair clicks in
  const by = blockY(t, E) + dy, landed = t >= E.fit + 0.14;
  const flash = hitAfter(t, E.fit + 0.14, 0.1);
  if (landed) { c.fillStyle = css('clay', 0.18 + 0.5 * flash); c.fillRect(COL_X - 12, by - LH + 14, 760, 3 * LH); }
  else { c.fillStyle = css('paper'); c.fillRect(COL_X - 16, by - LH + 8, 768, 3 * LH + 8); c.strokeStyle = css('ink', 0.7); c.lineWidth = 2; c.strokeRect(COL_X - 16, by - LH + 8, 768, 3 * LH + 8); }
  c.font = font(F.mono(500), MONO);
  const hidden = new Set(PAIRS.flatMap((p) => [p.open, p.close].map(([l, col]) => `${l}:${col}`)));
  BLOCK.forEach((line, l) => Array.from(line).forEach((ch, col) => {
    if (hidden.has(`${l}:${col}`)) return;
    c.fillStyle = css('ink', 0.9); c.fillText(ch, COL_X + col * ADV, by + l * LH);
  }));
  PAIRS.forEach((p, i) => {
    const at = p.at(E);
    if (t < at) return;
    [p.open, p.close].forEach((slot, j) => {
      const b = bracketAt(t, at, slot, j === 0 ? -1 : 1, i, by);
      const hot = hitAfter(t, at + FLY, 0.08);
      c.font = font(F.mono(500), b.size); c.fillStyle = css(b.k < 1 || hot > 0.3 ? 'clay' : 'ink', 0.95);
      c.fillText(p.ch[j]!, b.x, b.y);
    });
  });
}
/** Clawd rides the top of the block (and down with it). */
export function blockClawd(t: number, E: S08Events) {
  const rise = ease.outExpo(span(t, E.bracket, E.bracket + 0.3)), dy = 600 * (1 - rise);
  return { x: COL_X + 560, y: blockY(t, E) + dy - LH - 50, px: 10 };
}

// ── the cameras ────────────────────────────────────────────────────────────────────────────────
type K = { t: number; zoom: number; x: number; y: number; rot: number };
function keyed(t: number, keys: K[], clampRot = true, keepLyric = false): Cam2 {
  let k: K = { t: 0, zoom: 1, x: 960, y: 540, rot: 0 };
  for (const n of keys) {
    const e = ease.outExpo(span(t, n.t - 0.02, n.t + 0.2));
    if (e <= 0) break;
    k = { t: n.t, zoom: lerp(k.zoom, n.zoom, e), x: lerp(k.x, n.x, e), y: lerp(k.y, n.y, e), rot: lerp(k.rot, n.rot, e) };
  }
  const m = clampRot ? 1 + 1.9 * Math.abs(k.rot) : 1, z = Math.max(k.zoom, m);
  const hx = 960 * m / z, hy = 540 * m / z;
  let fx = Math.min(1920 - hx, Math.max(hx, k.x)), fy = Math.min(1080 - hy, Math.max(hy, k.y));
  // the lyric grid starts at (96, ~98): keep its first letters in frame
  if (keepLyric) { fx = Math.min(fx, 80 + hx); fy = Math.min(fy, 80 + hy); }
  return { zoom: z, rot: k.rot, fx, fy, ax: 960, ay: 540 };
}
const I: Cam2 = { zoom: 1, rot: 0, fx: 960, fy: 540, ax: 960, ay: 540 };
export function s08Cam(t: number, E: S08Events, audio: AudioData): Cam2 {
  if (t >= E.bracket - 0.02 && t < E.tap) {
    const cam = keyed(t, [
      { t: E.bracket, zoom: 1.04, x: 900, y: 500, rot: 0 },
      { t: E.bracket + 0.45, zoom: 1.14, x: 760, y: 470, rot: -0.01 },
      { t: E.gonna, zoom: 1.12, x: 1000, y: 470, rot: 0.01 },
      { t: E.fit, zoom: 1.06, x: 860, y: 600, rot: 0 },
    ]);
    return { ...cam, zoom: cam.zoom * (1 + PAIRS.reduce((a, p) => a + 0.03 * hitAfter(t, p.at(E) + FLY, 0.06), 0) + 0.06 * hitAfter(t, E.fit + 0.14, 0.08)) };
  }
  if (t >= E.tap && t < E.quit) return { ...I, zoom: 1 + 0.025 * hitAfter(t, pressTime(t, E, audio).at, 0.05) };
  if (t >= E.works - 0.02 && t < E.end - 0.1) return keyed(t, [
    { t: E.works, zoom: 1.04, x: 1150, y: 600, rot: 0 },
    { t: E.on, zoom: 1.07, x: 1180, y: 640, rot: -0.006 },
    { t: E.machine, zoom: 1.1, x: 1150, y: 720, rot: 0.006 },
  ], true, true);
  return I;
}

// ── keyboard presses ───────────────────────────────────────────────────────────────────────────
/** The latest 16th-note press since "Tap": which key, when. */
export function pressTime(t: number, E: S08Events, audio: AudioData) {
  const q = Math.floor(beatsSince(audio, t, E.tap) * 4 + 1e-6);
  const at = audio.timeOfBeat(audio.beatAt(E.tap) + q / 4);
  return { q, at, key: Math.floor(hash(q, 5) * 30) };
}
/** How far key `i` is pressed now (px), and the glyphs flying up from recent presses. */
export function keyPress(t: number, E: S08Events, audio: AudioData, i: number) {
  if (t < E.tap || t >= E.never) return 0;
  const p = pressTime(t, E, audio);
  return p.key === i ? 12 * hitAfter(t, p.at, 0.07) + 4 : 0;
}
const TYPED = 'fix: calendar loop; d <= days';
export function drawKeyGlyphs(c: CanvasRenderingContext2D, t: number, E: S08Events, audio: AudioData, keyXY: (i: number) => { x: number; y: number }) {
  if (t < E.tap || t >= E.quit) return;
  const p = pressTime(t, E, audio);
  for (let q = Math.max(0, p.q - 6); q <= p.q; q++) {
    const at = audio.timeOfBeat(audio.beatAt(E.tap) + q / 4);
    if (at >= E.never) continue;
    const u = (t - at) / 0.5;
    if (u < 0 || u >= 1) continue;
    const key = Math.floor(hash(q, 5) * 30), xy = keyXY(key), ch = TYPED[q % TYPED.length]!;
    c.font = font(F.mono(600), 64 + 40 * (1 - u)); c.fillStyle = css(q % 4 === 0 ? 'clay' : 'ink', 1 - u);
    c.fillText(ch, xy.x + 40 + (hash(q, 6) - 0.5) * 80 * u, xy.y - 20 - 300 * ease.outCubic(u));
  }
}
/** "never": the whole board flashes once. */
export const boardFlash = (t: number, E: S08Events) => hitAfter(t, E.never, 0.1);

// ── my machine ─────────────────────────────────────────────────────────────────────────────────
export const PANEL = { x: 1000, y: 550, w: 650, h: 420 };
/** The preview's rise into the bezel on "works" (0..1) and how many days are drawn. */
export function previewState(t: number, E: S08Events, audio: AudioData) {
  const rise = ease.outExpo(span(t, E.works, E.works + 0.3));
  const days = t < E.on ? 0 : Math.min(31, 1 + Math.floor(beatsSince(audio, t, E.on) * 8));
  return { rise, days, dy: 520 * (1 - rise) };
}
export function drawBezel(c: CanvasRenderingContext2D, t: number, E: S08Events) {
  const p = PANEL, m = 26;
  c.strokeStyle = css('ink', 0.85); c.lineWidth = 6; c.strokeRect(p.x - m, p.y - m, p.w + 2 * m, p.h + 2 * m);
  c.fillStyle = css('ink', 0.85);
  c.beginPath(); c.moveTo(p.x - m - 70, p.y + p.h + m + 34); c.lineTo(p.x + p.w + m + 70, p.y + p.h + m + 34);
  c.lineTo(p.x + p.w + m, p.y + p.h + m); c.lineTo(p.x - m, p.y + p.h + m); c.closePath(); c.fill();
  // the pass tick on "works"
  const k = ease.outExpo(span(t, E.works + 0.05, E.works + 0.25));
  if (k > 0) {
    const x = p.x + p.w + m + 40, y = p.y + 40, pts = [[x, y + 30], [x + 30, y + 64], [x + 96, y - 20]];
    c.strokeStyle = css('pass'); c.lineWidth = 16; c.lineCap = 'round'; c.beginPath();
    c.moveTo(pts[0]![0]!, pts[0]![1]!);
    const L1 = Math.hypot(30, 34), L2 = Math.hypot(66, 84), d = k * (L1 + L2);
    if (d <= L1) c.lineTo(lerp(pts[0]![0]!, pts[1]![0]!, d / L1), lerp(pts[0]![1]!, pts[1]![1]!, d / L1));
    else { c.lineTo(pts[1]![0]!, pts[1]![1]!); c.lineTo(lerp(pts[1]![0]!, pts[2]![0]!, (d - L1) / L2), lerp(pts[1]![1]!, pts[2]![1]!, (d - L1) / L2)); }
    c.stroke(); c.lineCap = 'butt';
  }
  if (t >= E.my) {
    const n = Math.round(span(t, E.my, E.my + 0.5) * 27), s = 'my machine · localhost:5173'.slice(0, n);
    c.font = font(F.mono(500), 24); c.fillStyle = css('ink', 0.7); c.fillText(s, p.x - m, p.y + p.h + m + 76);
  }
}
/** "machine": day 32 pops in after 31 (clay), the bug nobody here notices. */
export function day32(t: number, E: S08Events) {
  if (t < E.machine) return null;
  return { pop: ease.outBack(span(t, E.machine, E.machine + 0.2), 2.4) };
}
