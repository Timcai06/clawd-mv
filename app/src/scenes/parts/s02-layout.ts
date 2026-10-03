import type { AudioData } from '../../engine/audio';
import { ease, lerp } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { HANDOFF, lensRect, type Prim } from '../../kit/handoff';
import type { LensView } from '../../kit/lens';
import { beatsSince } from '../../kit/time';
import { CURSOR01_C } from './s01-timing';
import type { Voice } from '../../kit/lyric-moves';
import { affine, drawInscription, headX, inscribe } from '../../kit/inscribe';
import { drawCursor } from '../../kit/cursor';
import { F, font } from '../../engine/type';
import { css } from '../../theme';
import type { Rect } from '../../kit/handoff';
import type { OpeningTimes } from './s01-timing';
import { mixRect } from './s01-print';
export const PING_BOX = { x: -70, y: 170, w: 2060, h: 625 };
// Stage 9 ②: one size up, so the sung "on my screen" is typed into it at the lyric level.
export const NOTIFY_BOX = { x: 1100, y: 780, w: 720, h: 140 };
export const WAKE_CLAWD = { x: 768, y: 851, px: 15.5 };
export function handoffIn(t: number, audio: AudioData, T: OpeningTimes) {
  const k = ease.outCubic(span(t, T.ping, afterBeats(audio, T.ping, 0.65)));
  return { ...HANDOFF.cursor01, edge: lerp(HANDOFF.cursor01.x, 624, k) };
}
// Stage 9 ②: the card holds still while "on my scr" is typed into it at the lyric level, then
// snaps to the form's top bar in the last half beat (it used to fly for a whole beat, shrinking
// "my screen" to a 23 px caption while it was sung).
const fly = (t: number, audio: AudioData, T: OpeningTimes) =>
  ease.inOutCubic(span(t, afterBeats(audio, T.issue, -0.55), T.issue - 0.1));
export function handoffOut(t: number, audio: AudioData, T: OpeningTimes) {
  return mixRect(NOTIFY_BOX, HANDOFF.card02, fly(t, audio, T));
}
export function notifyLayout(t: number, audio: AudioData, T: OpeningTimes) {
  const exit = fly(t, audio, T);
  return { dominant: { x: 0, y: PING_BOX.y, w: 1920, h: PING_BOX.h },
    clawd: { x: WAKE_CLAWD.x, y: WAKE_CLAWD.y, w: WAKE_CLAWD.px * 16, h: WAKE_CLAWD.px * 5 },
    edge: handoffIn(t, audio, T).edge, card: handoffOut(t, audio, T), exit };
}

/** S02's lens: PING lands as a sprung hit about the shared cursor (so the cursor is the fixed point
 *  of the hit and C1 is seamless), each word of "on my screen" nudges, identity by the S03 cut. */
export function view02(t: number, audio: AudioData, T: OpeningTimes, nudges: { start: number; index: number }[]): LensView {
  const b = Math.max(0, beatsSince(audio, t, T.ping));
  let zoom = 1 + 0.14 * Math.exp(-b * 5) * Math.cos(b * 8), rot = t >= T.ping ? 0.03 * Math.exp(-b * 4) * Math.sin(b * 10) : 0;
  for (const wd of nudges) if (t >= wd.start) { const k = Math.pow(0.5, (t - wd.start) / 0.08); zoom += 0.02 * k; rot += (wd.index % 2 ? 0.006 : -0.006) * k; }
  const settle = ease.inOutCubic(span(t, afterBeats(audio, T.issue, -0.5), T.issue - 0.1));
  return { zoom: lerp(zoom, 1, settle), fx: CURSOR01_C.x, fy: CURSOR01_C.y, rot: rot * (1 - settle) };
}
/** C1: the cursor S02 inherits, through S02's lens. */
export function entryPrim02(t: number, audio: AudioData, T: OpeningTimes, nudges: { start: number; index: number }[]): Prim {
  const c = HANDOFF.cursor01;
  return { kind: 'rect', ...lensRect(view02(t, audio, T, nudges), { x: c.x, y: c.y, w: c.h * 0.55, h: c.h }) };
}
/** C2: the notification card on its way to the form's top bar, through S02's lens. */
export function exitPrim02(t: number, audio: AudioData, T: OpeningTimes, nudges: { start: number; index: number }[]): Prim {
  return { kind: 'rect', ...lensRect(view02(t, audio, T, nudges), handoffOut(t, audio, T)) };
}
/**
 * The notification card's content, all in card units so it rides the card when the card flies to
 * the form's top bar: the machine label on the top row, and "on my screen" typed into the bottom
 * row (stage 9 ②), right-aligned, with the card's cursor as the typing head. Positions come from
 * the words' final shapes (nothing reflows while typing); heat and stress from the live voice.
 * S03 draws the same card at its top bar until "screen" ends (C2).
 */
export function drawCardContent(c: CanvasRenderingContext2D, v: Voice, t: number, card: Rect, label = true) {
  const sc = card.h / NOTIFY_BOX.h;
  if (label) {
    c.save(); c.font = font(F.mono(), 20 * sc); c.fillStyle = css('ink', 0.6);
    c.fillText('Issue #1031 · calendar', card.x + 24 * sc, card.y + 0.3 * card.h); c.restore();
  }
  const words = v.line(0).words.slice(4);
  const size = 46 * sc * 100 / inscribe([], 100).capH;
  const fin = inscribe(words.map((w) => ({ ...v.form(w, w.end), born: 1, age: 0 })), size, { space: 0.24 });
  const ins = { ...fin, glyphs: fin.glyphs.map((g) => ({ ...g, form: v.form(g.form.word, t) })) };
  const x0 = card.x + card.w - 40 * sc - fin.width, base = card.y + 0.8 * card.h;
  drawInscription(c, ins, t, { on: 'paper', head: 'type', place: (_g, x) => affine(x0 + x, base), seed: 23 });
  const head = t < fin.glyphs[0]!.t ? x0 + fin.width : x0 + headX(fin, t);
  drawCursor(c, { x: head + 4 * sc, y: base, h: fin.capH });
}
