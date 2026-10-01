import type { AudioData } from '../../engine/audio';
import { ease, lerp } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { HANDOFF } from '../../kit/handoff';
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
  return mixRect(NOTIFY_BOX, HANDOFF.card02, ease.inOutCubic(span(t, afterBeats(audio, T.issue, -1), T.issue - 1 / 60)));
}
export function notifyLayout(t: number, audio: AudioData, T: OpeningTimes) {
  const exit = ease.inOutCubic(span(t, afterBeats(audio, T.issue, -1), T.issue - 1 / 60));
  return { dominant: { x: 0, y: PING_BOX.y, w: 1920, h: PING_BOX.h },
    clawd: { x: WAKE_CLAWD.x, y: WAKE_CLAWD.y, w: WAKE_CLAWD.px * 16, h: WAKE_CLAWD.px * 5 },
    edge: handoffIn(t, audio, T).edge, card: handoffOut(t, audio, T), exit };
}
