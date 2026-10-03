// S17's PR page (stage 9 ③, docs/reference/event-tables.md "S17 中段"): every keyword makes the
// page do something, and the camera keys on the words (pdoom bureau.ts camB / room.ts buildShots):
//   Pull      the PR card is yanked up from below, its top edge hooked on Clawd's reaching arm;
//   request   Clawd drops onto "Create pull request" and the landing presses it;
//   that / is the diff rows slam in; "<=" is boxed;          it   the "=" falls out of the code;
//   Then      the page scrolls to a reply box (Clawd hops down to it);
//   Looks good to me  typed by the reviewer's ink cursor; ✓ on "good"; APPROVED on "me";
//   Merged    the whole card squashes into the line MERGED slams onto.
// The lyric is the PR's title. Pure functions of t; the camera is a canvas transform (crisp type).
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Word } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { F, font } from '../../engine/type';
import { css } from '../../theme';
import { span, hitAfter } from '../../kit/time';
import { typeWords } from '../../kit/inscribe';
import { stamp, type Voice } from '../../kit/lyric-moves';
import { varRun, fillRun, glyphPath, type VarRun } from '../../kit/vartype';
import { drawNote } from '../../kit/note';
import { drawCursor } from '../../kit/cursor';
import { applyCam2, type Cam2 } from '../../kit/handoff';
import type { Hit } from '../../kit/impact';
import * as Clawd from '../../kit/clawd';

export interface PRTimes {
  pull: number; request: number; that: number; is: number; it: number;
  then: number; looks: number; good: number; me: number; merged: number;
  title: Word[]; review: Word[];
}
export function prTimes(lyrics: Lyrics): PRTimes {
  const a = lyrics.get('Pull request, and that is it').words, r = lyrics.get('Then you wrote, “Looks good to me”').words;
  const m = lyrics.get('Merged to main, and now we’re free').words;
  return { pull: a[0]!.start, request: a[1]!.start, that: a[3]!.start, is: a[4]!.start, it: a[5]!.start,
    then: r[0]!.start, looks: r[3]!.start, good: r[4]!.start, me: r[6]!.start, merged: m[0]!.start, title: a, review: r };
}
/** The PR page is on screen from "Pull" until the card has squashed into MERGED. */
export const SQUASH = 0.22;
export const prActive = (t: number, P: PRTimes) => t >= P.pull && t < P.merged + SQUASH;

// Card geometry (card-local px; the card's left edge is at CARD_X, its top at cardTop(t)).
const CARD_X = 96, CW = 1728, CH = 1400, TOP = 110, SCROLL = 330;
const LABEL_Y = 54, TITLE_Y = 178, RULE_Y = 214;
const BUTTON = { x: CW - 460, y: 248, w: 412, h: 76 };
const ROW1 = 520, ROW2 = 735, DIFF = 200;
const BOX = { x: 48, y: 860, w: CW - 96, h: 330 };
const PX = 11.5, CLAWD_W = 16 * PX, CLAWD_H = 5 * PX;

export function cardTop(t: number, P: PRTimes) {
  const rise = ease.outBack(span(t, P.pull, P.pull + 0.36), 1.3);
  return lerp(1140, TOP, rise) - SCROLL * ease.outExpo(span(t, P.then, P.then + 0.28));
}
/** How far the button is pressed (px): a hard press on Clawd's landing that springs half back. */
const press = (t: number, P: PRTimes) => (t < P.request ? 0 : 3 + 5 * hitAfter(t, P.request, 0.08));

const rows = new Map<string, VarRun>();
const row = (text: string) => { let r = rows.get(text); if (!r) { r = varRun(text, DIFF, { wdth: 100, wght: 900 }); rows.set(text, r); } return r; };
const ROW1_TEXT = '- d <= days', ROW2_TEXT = '+ d < days';

/** The "=" of row 1 (the whole fix), and the box around "<=". */
function eqGlyph() {
  const r = row(ROW1_TEXT), lt = r.glyphs.find((g) => g.ch === '<')!, eq = r.glyphs.find((g) => g.ch === '=')!;
  return { r, lt, eq };
}
/** Screen point of a card-local point (before the camera). */
const at = (t: number, P: PRTimes, x: number, y: number) => ({ x: CARD_X + x, y: cardTop(t, P) + y });

/** Where the "=" is, card-local, as it falls out of the code after "it". */
function eqFall(t: number, P: PRTimes) {
  const { r, eq } = eqGlyph(), u = Math.max(0, t - P.it);
  return { x: 48 + eq.x + 140 * u, y: ROW1 + 0.5 * 3600 * u * u, rot: 2.4 * u, w: eq.adv, capH: r.capH };
}

/** The camera: one key per keyword, each snapping in (outExpo, 0.22 s) and then holding. */
export function prCam(t: number, P: PRTimes): Cam2 {
  const { r, lt, eq } = eqGlyph();
  const lteq = at(t, P, 48 + (lt.x + eq.x + eq.adv) / 2, ROW1 - r.capH * 0.5);
  const fall = eqFall(t, P);
  type K = { t: number; zoom: number; x: number; y: number };
  const keys: K[] = [
    { t: P.pull, zoom: 1, x: 960, y: 540 },
    { t: P.request, zoom: 1.08, ...at(t, P, CW / 2, (TITLE_Y + BUTTON.y + BUTTON.h) / 2 + 120) }, // title + button, whole card width
    { t: P.that, zoom: 1.05, ...at(t, P, CW / 2, (ROW1 + ROW2) / 2 - 90) },
    { t: P.is, zoom: 1.85, ...lteq },
    { t: P.it, zoom: 1.7, x: lteq.x, y: lteq.y + 0.35 * (fall.y - ROW1) },
    { t: P.then, zoom: 1, x: 960, y: 540 },
    { t: P.review[2]!.start, zoom: 1.06, ...at(t, P, CW / 2 - 200, BOX.y + 60) },
    { t: P.looks, zoom: 1.16, ...at(t, P, CW / 2, BOX.y + BOX.h / 2 - 30) },
    { t: P.merged, zoom: 1, x: 960, y: 540 },
  ];
  let k = keys[0]!;
  for (const n of keys.slice(1)) {
    const e = ease.outExpo(span(t, n.t - 0.02, n.t + 0.22));
    if (e <= 0) break;
    k = { t: n.t, zoom: lerp(k.zoom, n.zoom, e), x: lerp(k.x, n.x, e), y: lerp(k.y, n.y, e) };
  }
  const zoom = k.zoom * (1 + 0.06 * hitAfter(t, P.me, 0.1) + 0.04 * hitAfter(t, P.that, 0.08) + 0.05 * hitAfter(t, P.is, 0.08));
  return { zoom, rot: 0, fx: k.x, fy: k.y, ax: 960, ay: 540 };
}

/** The page's hits for kit/impact (screen shake), stillness owned by the scene. */
export const prHits = (P: PRTimes): Hit[] => [
  { t: P.request, shake: 6, half: 0.06 }, { t: P.that, shake: 8 }, { t: P.is, shake: 8 },
  { t: P.it, shake: 4 }, { t: P.me, shake: 12, kick: 0.02 },
];

/** Clawd: hooked arm at the top edge → drops onto the button → hops to the reply box. */
function clawdAt(t: number, P: PRTimes, audio: AudioData) {
  const beat = audio.beatAt(t);
  const onButton = (tt: number) => {
    const p = at(tt, P, BUTTON.x + BUTTON.w / 2 - CLAWD_W / 2, BUTTON.y - CLAWD_H + press(tt, P));
    return p;
  };
  const top = { x: CARD_X + BUTTON.x + BUTTON.w / 2 - CLAWD_W / 2, y: TOP - CLAWD_H };
  const onBox = (tt: number) => at(tt, P, BOX.x + BOX.w - 520, BOX.y - CLAWD_H);
  const arc = (a: { x: number; y: number }, b: { x: number; y: number }, k: number, h: number) =>
    ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) - h * Math.sin(Math.PI * k) });
  const j0 = P.request - 0.24, j1 = P.then, j2 = P.then + 0.3;
  let pos: { x: number; y: number }, action: Clawd.Action = 'A3', b0 = beat;
  if (t < j0) { pos = top; action = 'A10'; b0 = audio.beatAt(P.pull); }
  else if (t < P.request) pos = arc(top, onButton(P.request), ease.inQuad(span(t, j0, P.request)), 70);
  else if (t < j1) pos = onButton(t);
  else if (t < j2) pos = arc(onButton(t), onBox(t), ease.inOutQuad(span(t, j1, j2)), 90);
  else pos = onBox(t);
  if (t >= P.it && t < P.then) action = 'A14';
  if (t >= P.me) { action = 'A12'; b0 = audio.beatAt(P.me); }
  const fall = eqFall(t, P), eqScreen = at(t, P, fall.x, fall.y);
  const look = action === 'A14' ? Clawd.gaze(pos.x, pos.y, PX, eqScreen) : undefined;
  return { pos, pose: Clawd.pose(action, { beat, beat0: b0, p: 0, look }) };
}

/** Draw the page (already inside the scene's canvas; applies its own camera). */
export function drawPR(c: CanvasRenderingContext2D, v: Voice, audio: AudioData, t: number, P: PRTimes) {
  if (!prActive(t, P)) return;
  // "Merged": the card squashes into the line MERGED lands on (y 490), then is gone.
  const sq = ease.outExpo(span(t, P.merged, P.merged + SQUASH));
  c.save();
  if (sq > 0) { c.translate(960, 490); c.scale(1 - 0.3 * sq, Math.max(0.002, 1 - sq)); c.translate(-960, -490); }
  applyCam2(c, prCam(t, P));
  const top = cardTop(t, P);
  c.save(); c.translate(CARD_X, top);
  // the card: a paper sheet with a hairline frame and an offset shadow
  c.fillStyle = css('ink', 0.1); c.fillRect(14, 14, CW, CH);
  c.fillStyle = css('paper'); c.fillRect(0, 0, CW, CH);
  c.strokeStyle = css('ink', 0.6); c.lineWidth = 1.5; c.strokeRect(0, 0, CW, CH);
  // machine header: branch label, diff stat
  c.font = font(F.mono(500), 22); c.fillStyle = css('ink', 0.6); c.textAlign = 'left';
  c.fillText('#1031 · fix/october-32 → main', 48, LABEL_Y);
  c.textAlign = 'right'; c.font = font(F.mono(600), 26);
  c.fillStyle = css('fail'); c.fillText('−1', CW - 48, LABEL_Y);
  c.fillStyle = css('pass'); c.fillText('+1  ', CW - 48 - c.measureText('−1').width, LABEL_Y);
  c.textAlign = 'left';
  // the title field: the lyric, typed
  typeWords(c, v, P.title, t, { x: 48, y: TITLE_Y, size: 92, on: 'paper', cursor: t < P.that, seed: 171 });
  c.fillStyle = css('ink', 0.25); c.fillRect(48, RULE_Y, CW - 96, 1.5);
  // the button: Clawd's landing presses it; the press flashes clay, the label turns to "Opened"
  { const d = press(t, P), hot = t >= P.request && t < P.request + 0.14;
    c.fillStyle = css('ink', 0.18); c.fillRect(BUTTON.x, BUTTON.y + 8, BUTTON.w, BUTTON.h);
    c.fillStyle = css(hot ? 'clay' : 'ink'); c.fillRect(BUTTON.x, BUTTON.y + d, BUTTON.w, BUTTON.h);
    c.font = font(F.mono(600), 26); c.fillStyle = css('paper'); c.textAlign = 'center';
    c.fillText(t < P.request ? 'Create pull request' : 'Opened', BUTTON.x + BUTTON.w / 2, BUTTON.y + d + 48); c.textAlign = 'left'; }
  // the diff: two rows slam in on "that" / "is"; "<=" is boxed; on "it" the "=" falls out
  const slam = (t0: number) => 1 + 0.25 * (1 - ease.outExpo(span(t, t0, t0 + 0.16)));
  const { r: r1, lt, eq } = eqGlyph(), r2 = row(ROW2_TEXT);
  if (t >= P.that) {
    const s = slam(P.that);
    c.save(); c.translate(48, ROW1); c.scale(s, s); c.fillStyle = css('fail', 0.75);
    fillRun(c, r1, 0, 0, (g) => g !== eq || t < P.it); c.restore();
  }
  if (t >= P.is) {
    const s = slam(P.is);
    c.save(); c.translate(48, ROW2); c.scale(s, s); c.fillStyle = css('pass', 0.75); fillRun(c, r2, 0, 0); c.restore();
    if (t < P.then) { // the box around "<=", drawn on with the hit
      const k = ease.outExpo(span(t, P.is, P.is + 0.2)), pad = 18;
      const x0 = 48 + lt.x - pad, x1 = 48 + eq.x + eq.adv + pad, y0 = ROW1 - r1.capH - pad, y1 = ROW1 + pad;
      c.strokeStyle = css('clay'); c.lineWidth = 6;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(lerp(x0, x1, k), y0); c.lineTo(lerp(x0, x1, k), lerp(y0, y1, k)); c.stroke();
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(lerp(x1, x0, k), y1); c.lineTo(lerp(x1, x0, k), lerp(y1, y0, k)); c.stroke();
    }
  }
  if (t >= P.it) { // the "=" falls out of the code and off the card
    const f = eqFall(t, P);
    if (f.y < CH + 400) {
      c.save(); c.translate(f.x + f.w / 2, f.y - f.capH * 0.35); c.rotate(f.rot); c.translate(-f.w / 2, f.capH * 0.35);
      c.fillStyle = css('clay'); c.fill(glyphPath(r1, eq)); c.restore();
    }
    drawNote(c, { ax: 48 + eq.x + eq.adv / 2, ay: ROW1 - r1.capH * 0.5, x: 48 + eq.x + 200, y: ROW1 - r1.capH - 46, text: '1 character', sub: 'that is it', t0: P.it + 0.12, on: 'paper', size: 24 }, t);
  }
  if (t >= P.good) { // a ✓ for the + row, drawn on with the word
    const k = ease.outExpo(span(t, P.good, P.good + 0.16)), x = 48 + r2.width + 90, y = ROW2 - r2.capH * 0.45;
    const pts = [[x - 46, y], [x - 12, y + 38], [x + 62, y - 50]] as const;
    const L1 = Math.hypot(34, 38), L2 = Math.hypot(74, 88), d = k * (L1 + L2);
    c.strokeStyle = css('pass'); c.lineWidth = 18; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath();
    c.moveTo(pts[0][0], pts[0][1]);
    if (d <= L1) c.lineTo(lerp(pts[0][0], pts[1][0], d / L1), lerp(pts[0][1], pts[1][1], d / L1));
    else { c.lineTo(pts[1][0], pts[1][1]); c.lineTo(lerp(pts[1][0], pts[2][0], (d - L1) / L2), lerp(pts[1][1], pts[2][1], (d - L1) / L2)); }
    c.stroke(); c.lineCap = 'butt';
  }
  // the reply box (below the fold until "Then" scrolls the page up)
  c.strokeStyle = css('ink', 0.6); c.lineWidth = 1.5; c.strokeRect(BOX.x, BOX.y, BOX.w, BOX.h);
  // "you": the reviewer's avatar pops in (outBack); "wrote,": their ink cursor waits in the empty
  // body, blinking on the beat, until "Looks" starts the reply
  const you = P.review[1]!.start, wrote = P.review[2]!.start, pop = ease.outBack(span(t, you, you + 0.22), 2.2);
  if (pop > 0) {
    c.save(); c.translate(BOX.x + 62, BOX.y + 70); c.scale(pop, pop);
    c.fillStyle = css('ink'); c.beginPath(); c.arc(0, 0, 34, 0, Math.PI * 2); c.fill();
    c.font = font(F.mono(600), 30); c.fillStyle = css('paper'); c.textAlign = 'center'; c.fillText('you', 0, 10); c.textAlign = 'left';
    c.restore();
  }
  if (t >= wrote && t < P.looks && Math.floor(audio.beatAt(t) * 2) % 2 === 0) drawCursor(c, { x: BOX.x + 126, y: BOX.y + 252, h: 76, color: 'ink' });
  typeWords(c, v, P.review.slice(0, 3), t, { x: BOX.x + 120, y: BOX.y + 100, size: 92, on: 'paper', cursor: t < P.looks, seed: 172 });
  typeWords(c, v, P.review.slice(3), t, { x: BOX.x + 120, y: BOX.y + 252, size: 110, on: 'paper', cursor: true, cursorColor: 'ink', seed: 173 });
  stamp(c, 'APPROVED', BOX.x + BOX.w - 250, BOX.y + 92, 84, { t, at: P.me, rot: -0.09, color: 'pass', seed: 31 });
  c.restore();
  // Clawd, in screen space under the same camera
  const cl = clawdAt(t, P, audio);
  Clawd.draw(c, cl.pos.x, cl.pos.y, cl.pose, { px: PX });
  c.restore();
}
