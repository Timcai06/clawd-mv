import type { AudioData } from '../../engine/audio';
import { ease, lerp } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { HANDOFF, lensRect, type Prim } from '../../kit/handoff';
import type { LensView } from '../../kit/lens';
import { beatsSince } from '../../kit/time';
import { CURSOR01_C } from './s01-timing';
import { gridSnap, type Voice } from '../../kit/lyric-moves';
import type { OpeningTimes } from './s01-timing';
import { mixRect } from './s01-print';
export const PING_BOX = { x: -70, y: 170, w: 2060, h: 625 };
export const NOTIFY_BOX = { x: 1200, y: 841, w: 614, h: 87 };
export const WAKE_CLAWD = { x: 768, y: 851, px: 15.5 };
export function handoffIn(t: number, audio: AudioData, T: OpeningTimes) {
  const k = ease.outCubic(span(t, T.ping, afterBeats(audio, T.ping, 0.65)));
  return { ...HANDOFF.cursor01, edge: lerp(HANDOFF.cursor01.x, 624, k) };
}
export function handoffOut(t: number, audio: AudioData, T: OpeningTimes) {
  return mixRect(NOTIFY_BOX, HANDOFF.card02, ease.inOutCubic(span(t, afterBeats(audio, T.issue, -1), T.issue - 0.1)));
}
export function notifyLayout(t: number, audio: AudioData, T: OpeningTimes) {
  const exit = ease.inOutCubic(span(t, afterBeats(audio, T.issue, -1), T.issue - 0.1));
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
/** "on my screen" on S02's word grid. With `onlyLast` (S03's first beat, R2) only "screen" is
 *  drawn: same slots, the other words left unborn, so the held word stays exactly where it was. */
export function drawScreenGrid(c: CanvasRenderingContext2D, v: Voice, t: number, onlyLast = false) {
  const line = v.line(0);
  let forms = v.forms(line, t).slice(4);
  if (onlyLast) forms = forms.map((f, i) => (i < forms.length - 1 ? { ...f, born: 0 } : f));
  gridSnap(c, forms, { x: 720, y: 948, colW: 160, rowH: 80, cols: 7, size: 74, on: 'paper', t, alpha: v.presence(line, t) });
}
