// Screen-space instrument geometry, measured against kf-S09 (1672×941 → 1920×1080).
import type { AudioData } from '../../engine/audio';
import { HANDOFF } from '../../kit/handoff';
import * as Clawd from '../../kit/clawd';
import { lerp } from '../../engine/util';
import { enterBeat, exitBeat, spriteBox, union } from './s09-type';
import type { X9Times } from '../s09-z-shared';
import { rideHead } from './s09-ride';

export const SCOPE = { x0: 16, x1: 1904, y: 575, traceX: 108, period: 208 };
export function scopeY(local: number) {
  const phase = ((local % 1) + 1) % 1;
  return SCOPE.y - 145 * Math.exp(-(((phase - 0.83) / 0.07) ** 2))
    + 70 * Math.exp(-(((phase - 0.4) / 0.15) ** 2));
}
export function scopeState(audio: AudioData, t: number, T: X9Times) {
  const head = scopeHead(t, T);
  const traces = [-60, -30, 0, 30, 60].map((offset, e) => {
    const points: [number, number][] = [];
    for (let x = SCOPE.traceX; x <= head; x += 2) {
      const local = ((x - SCOPE.traceX - e * 13) / SCOPE.period % 1 + 1) % 1;
      points.push([x, scopeY(local) + offset]);
    }
    return points;
  });
  const pose = Clawd.pose('A4', { beat: audio.beatAt(t), beat0: audio.beatAt(T.terminal), p: 0 });
  return { head, traces, clawd: { x: 90, y: 842, px: 17.2, pose },
    dominant: union([[16, SCOPE.y], [1904, SCOPE.y], ...traces.flat()]),
    clawdBox: spriteBox(90, 842, 17.2, pose) };
}
export function handoffIn(t: number, audio: AudioData, T: X9Times) {
  const p = enterBeat(audio, t, T.terminal);
  return { ...HANDOFF.base08, y: lerp(HANDOFF.base08.y, SCOPE.y, p) };
}
export function handoffOut(t: number, audio: AudioData, T: X9Times) {
  const p = exitBeat(audio, t, T.terminalEnd);
  return { x: HANDOFF.nineteen09.x, baseline: lerp(232, HANDOFF.nineteen09.baseline, p),
    capH: lerp(140, HANDOFF.nineteen09.capH, p) };
}

/** Pure head-only query for birth-time sampling, without allocating echo traces. The scan head is
 *  the writing head (stage 9 ②): it advances only as far as the letters already sung. */
export function scopeHead(t: number, T: X9Times) {
  return rideHead(T.ride, t);
}
