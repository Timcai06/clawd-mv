// S11 keyframe composition and cut contracts: actual Archivo outline + canonical sprite bounds.
import { HANDOFF } from '../../kit/handoff';
import { Voice } from '../../kit/lyric-moves';
import { varRun } from '../../kit/vartype';
import type { AudioData } from '../../engine/audio';
import type { X9Times } from '../s09-z-shared';
import { afterBeats, beatsSince, beatSteps } from '../../kit/time';
import { lerp } from '../../engine/util';
import { exitBeat, enterBeat, runBox, spriteBox } from './s09-type';
import * as Clawd from '../../kit/clawd';
export const ROLL = HANDOFF.fall10.roll;
export function handoffIn(t: number, audio: AudioData, T: X9Times) {
  const p = enterBeat(audio, t, T.rainStart);
  return { roll: HANDOFF.fall10.roll, pxPerBeat: lerp(HANDOFF.fall10.pxPerBeat, 240, p) };
}
export function handoffOut(t: number, audio: AudioData, T: X9Times) {
  const p = exitBeat(audio, t, T.rainEnd);
  return { cx: lerp(1060, HANDOFF.boxes11.cx, p), cy: lerp(358, HANDOFF.boxes11.cy, p),
    w: lerp(1850, HANDOFF.boxes11.w, p), n: HANDOFF.boxes11.n };
}
export function rainView(t: number, audio: AudioData, T: X9Times) {
  const b = Math.max(0, beatsSince(audio, t, T.rainStart));
  // G5: the dolly into the storm moves in beat steps (hold, snap) instead of a constant creep
  const z = lerp(14, 10, beatSteps(audio, t, afterBeats(audio, T.rainStart, 1), afterBeats(audio, T.rainStart, 14)));
  return { b, z, roll: handoffIn(t, audio, T).roll };
}
export function headlineState(v: Voice, t: number, T: X9Times) {
  const line = v.line('Undefined, undefined, and I don’t know why');
  const first = v.form(line.words[0]!, t, { minWidth: 87.5, maxWidth: 112.5, rest: 860 });
  const second = v.form(line.words[1]!, t, { minWidth: 87.5, maxWidth: 112.5, rest: 860 });
  const active = second.born > 0 ? second : first;
  const run = varRun('undefined', 480, { wdth: active.axes.wdth, wght: Math.max(800, active.axes.wght) });
  const out = exitBeat(v.audio, t, T.rainEnd), box = handoffOut(t, v.audio, T);
  const sx = box.w / run.width, sy = lerp(0.9, 0.5, out), roll = lerp(-ROLL, 0, out);
  const x = lerp(135, box.cx - box.w / 2, out), y = lerp(284, box.cy + run.capH * sy / 2, out);
  const pose = Clawd.pose('A7', { beat: v.audio.beatAt(t), beat0: v.audio.beatAt(T.rainStart), p: 0 });
  return { run, x, y, sx, sy, roll, first, second, out,
    dominant: clippedBox(runBox(run, x, y, sx, sy, roll)),
    clawd: { x: 865, y: 948, px: 11.8, pose }, clawdBox: spriteBox(865, 948, 11.8, pose) };
}

function clippedBox(b: { x: number; y: number; w: number; h: number }) {
  const x = Math.max(0, b.x), y = Math.max(0, b.y);
  return { x, y, w: Math.min(1920, b.x + b.w) - x, h: Math.min(1080, b.y + b.h) - y };
}
