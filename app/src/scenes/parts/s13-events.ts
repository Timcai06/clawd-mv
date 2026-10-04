// S13's middle (stage 9 ③, docs/reference/event-tables.md "S13"): the two lines between the
// COMMIT hits stop being captions over a still print.
//   "Fix," / "fix," / "fix a bit"  each fix slaps a strip of tape onto the giant COMMIT (a patch on
//       the print) and the camera snaps to the new record; "bit" gets a tiny strip and a hard push.
//   Every  the 19 failures stamp in, one per letter;   test  the grid slams;   is  they tremble;
//   throwing  every other failure is thrown into the git log, turning the row it hits red;
//   fits  the rest convulse and the camera kicks on every half beat.
// Pure functions of t. The camera is a canvas transform inside the scene's own (identity outside
// 70.5-77.3 s, so the C12/C13 hand-offs and the second pickup are untouched).
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Word } from '../../engine/lyrics';
import { ease, hash, lerp, frameIdx } from '../../engine/util';
import { F, font } from '../../engine/type';
import { css } from '../../theme';
import { span, hitAfter, beatsSince } from '../../kit/time';
import type { Cam2 } from '../../kit/handoff';

export interface S13Events {
  fix: [number, number, number]; bit: number; end: number;
  every: number; test: number; is: number; throwing: number; fits: number;
  /** The second pickup (S13-5): the camera is back at identity by here. */
  hold: number;
  testWords: Word[];
}
export function s13Events(lyrics: Lyrics, hold: number): S13Events {
  const f = lyrics.get('“Fix,” and “fix,” and “fix a bit”').words, e = lyrics.get('Every test is throwing fits').words;
  return { fix: [f[0]!.start, f[2]!.start, f[4]!.start], bit: f[6]!.start, end: f[6]!.end,
    every: e[0]!.start, test: e[1]!.start, is: e[2]!.start, throwing: e[3]!.start, fits: e[4]!.start, hold, testWords: e };
}

// ── tape: one strip per fix, on the print ───────────────────────────────────────────────────────
interface Tape { t: number; x: number; y: number; w: number; h: number; rot: number; label: string }
export const tapes = (E: S13Events): Tape[] => [
  { t: E.fix[0], x: 230, y: 860, w: 330, h: 70, rot: -0.12, label: 'fix' },
  { t: E.fix[1], x: 600, y: 800, w: 300, h: 64, rot: 0.09, label: 'fix' },
  { t: E.bit, x: 905, y: 545, w: 72, h: 18, rot: -0.2, label: '' },
];
/** Strips are slapped on (scale 1.5 → 1 in 0.1 s) and stay until the line after next. */
export function drawTapes(c: CanvasRenderingContext2D, t: number, E: S13Events) {
  if (t >= E.hold) return;
  for (const [i, s] of tapes(E).entries()) {
    if (t < s.t) continue;
    const k = 1 + 0.5 * (1 - ease.outExpo(span(t, s.t, s.t + 0.1)));
    c.save(); c.translate(s.x, s.y); c.rotate(s.rot); c.scale(k, k);
    // torn ends: a zigzag on both short edges
    const n = 5, hw = s.w / 2, hh = s.h / 2;
    c.beginPath(); c.moveTo(-hw, -hh);
    c.lineTo(hw, -hh);
    for (let j = 1; j <= n; j++) c.lineTo(hw + (j % 2 ? 6 : 0) * (s.h / 64), -hh + (2 * hh * j) / n);
    c.lineTo(-hw, hh);
    for (let j = n - 1; j >= 0; j--) c.lineTo(-hw - (j % 2 ? 6 : 0) * (s.h / 64), -hh + (2 * hh * j) / n);
    c.closePath();
    c.fillStyle = css('ink', 0.25); c.save(); c.translate(5, 6); c.fill(); c.restore();
    c.fillStyle = css('paper', 0.94); c.fill();
    if (s.label) {
      c.font = font(F.mono(600), s.h * 0.5); c.fillStyle = css('ink', 0.7); c.textAlign = 'center';
      c.fillText(`${s.label} #${i + 1}`, 0, s.h * 0.17); c.textAlign = 'left';
    }
    c.restore();
  }
}

// ── the camera ─────────────────────────────────────────────────────────────────────────────────
/** One key per keyword, each snapping in (outExpo 0.2 s) and then holding (pdoom bureau camB). */
export function s13Cam(t: number, E: S13Events, audio: AudioData): Cam2 {
  const I = { zoom: 1, x: 960, y: 540, rot: 0 };
  type K = { t: number; zoom: number; x: number; y: number; rot: number };
  const keys: K[] = [
    { t: E.fix[0], zoom: 1.14, x: 470, y: 640, rot: -0.018 },
    { t: E.fix[1], zoom: 1.22, x: 560, y: 650, rot: 0.022 },
    { t: E.fix[2], zoom: 1.3, x: 620, y: 640, rot: -0.02 },
    { t: E.bit, zoom: 1.6, x: 720, y: 600, rot: 0.035 },
    { t: E.every, ...I },
    { t: E.test, zoom: 1.16, x: 440, y: 560, rot: 0 },
    { t: E.throwing, zoom: 1.05, x: 1100, y: 520, rot: -0.01 },
    { t: E.fits, zoom: 1.1, x: 520, y: 720, rot: 0.012 },
    { t: E.hold - 0.16, ...I },
  ];
  if (t < keys[0]!.t - 0.02 || t >= E.hold) return { zoom: 1, rot: 0, fx: 960, fy: 540, ax: 960, ay: 540 };
  let k: K = { t: 0, ...I };
  for (const n of keys) {
    const e = ease.outExpo(span(t, n.t - 0.02, n.t + 0.2));
    if (e <= 0) break;
    k = { t: n.t, zoom: lerp(k.zoom, n.zoom, e), x: lerp(k.x, n.x, e), y: lerp(k.y, n.y, e), rot: lerp(k.rot, n.rot, e) };
  }
  // fits: a kick on every half beat (decaying), plus the slaps of the tapes
  let kick = 0;
  if (t >= E.fits && t < E.hold - 0.16) kick += 0.05 * Math.pow(0.5, ((beatsSince(audio, t, E.fits) * 2) % 1) / 0.12);
  for (const s of tapes(E)) kick += 0.035 * hitAfter(t, s.t, 0.06);
  kick += 0.04 * hitAfter(t, E.test, 0.07);
  // Never show past the print's edges: keep the focus where the zoomed, rotated frame still covers it.
  const z = k.zoom * (1 + kick), m = 1 + 1.9 * Math.abs(k.rot), hx = Math.min(960, 960 * m / z), hy = Math.min(540, 540 * m / z);
  const fx = Math.min(1920 - hx, Math.max(hx, k.x)), fy = Math.min(1080 - hy, Math.max(hy, k.y));
  return { zoom: Math.max(z, m), rot: k.rot, fx, fy, ax: 960, ay: 540 };
}
/** Screen shake for the event layer (px): fits convulse, the slams knock. */
export function s13Shake(t: number, E: S13Events): [number, number] {
  let a = 0;
  for (const s of tapes(E)) a += 9 * hitAfter(t, s.t, 0.05);
  a += 10 * hitAfter(t, E.test, 0.06);
  if (t >= E.fits && t < E.hold - 0.1) a += 9;
  const fi = frameIdx(t);
  return [(hash(fi, 171) - 0.5) * 2 * a, (hash(fi, 172) - 0.5) * 2 * a];
}

// ── the 19 failures ────────────────────────────────────────────────────────────────────────────
const CELL = (i: number) => ({ x: 110 + (i % 5) * 140, y: 640 + Math.floor(i / 5) * 67 });
/** The river row (log y, before the river's skew) a thrown marker lands in, and when. */
const thrown = (i: number) => i % 2 === 1;
const flight = 0.42;
const throwAt = (E: S13Events, i: number) => E.throwing + 0.03 * i;
export function failMarker(t: number, E: S13Events, i: number, audio: AudioData) {
  const born = E.every + (0.62 * i) / 19;
  if (t < born) return null;
  const home = CELL(i);
  let x = home.x, y = home.y, rot = 0, s = 1 + 1.4 * (1 - ease.outExpo(span(t, born, born + 0.09)));
  s *= 1 + 0.35 * hitAfter(t, E.test, 0.07);
  const fi = frameIdx(t);
  if (t >= E.is) { x += (hash(fi, i, 3) - 0.5) * 5; y += (hash(fi, i, 4) - 0.5) * 5; }
  if (thrown(i) && t >= throwAt(E, i)) {
    const u = (t - throwAt(E, i)) / flight;
    if (u >= 1) return null;
    const tx = 1500 + hash(i, 8) * 330, ty = 140 + hash(i, 9) * 780;
    x = lerp(home.x, tx, u); y = lerp(home.y, ty, u) - 360 * Math.sin(Math.PI * u); rot = u * (hash(i, 10) > 0.5 ? 9 : -9);
    s *= 1 + 0.8 * Math.sin(Math.PI * u);
  } else if (t >= E.fits) {
    // convulsions: a hop per half beat, alternating cells
    const hb = beatsSince(audio, t, E.fits) * 2, ph = hb - Math.floor(hb), up = (Math.floor(hb) + i) % 2 === 0;
    y -= (up ? 18 : 6) * Math.sin(Math.PI * ph); rot = (hash(Math.floor(hb), i) - 0.5) * 0.9;
  }
  return { x, y, rot, s };
}
/** A thrown failure hits the git log: that row flashes red and stays scorched (fail, 0.5). */
export function riverHits(t: number, E: S13Events) {
  const out: { y: number; k: number }[] = [];
  if (t >= E.hold) return out;
  for (let i = 0; i < 19; i++) {
    if (!thrown(i)) continue;
    const ta = throwAt(E, i) + flight;
    if (t < ta) continue;
    out.push({ y: 140 + hash(i, 9) * 780, k: 0.45 + 0.55 * hitAfter(t, ta, 0.08) });
  }
  return out;
}
export function drawFailures(c: CanvasRenderingContext2D, t: number, E: S13Events, audio: AudioData) {
  c.font = font(F.mono(400), 20);
  c.fillStyle = css('ink', 0.55);
  c.fillText('calendar / month.test.ts', 96, 590);
  for (let i = 0; i < 19; i++) {
    const m = failMarker(t, E, i, audio), home = CELL(i);
    c.fillStyle = css('ink', 0.4);
    c.fillText(String(i + 1).padStart(2, '0'), home.x + 26, home.y + 14);
    if (thrown(i) && t >= throwAt(E, i)) { // an empty socket where it was
      c.strokeStyle = css('ink', 0.5); c.lineWidth = 1.5; c.strokeRect(home.x, home.y, 12, 12);
    }
    if (!m) continue;
    c.save(); c.translate(m.x + 6, m.y + 6); c.rotate(m.rot); c.scale(m.s, m.s);
    c.fillStyle = css('fail'); c.fillRect(-11, -11, 22, 22); c.restore();
  }
}
