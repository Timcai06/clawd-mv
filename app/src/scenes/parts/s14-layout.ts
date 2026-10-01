// Calibrated pinhole projection of the open shaft, in logical 1920×1080 pixels.
// The nearest rectangle is measured from kf-S14; subsequent floors converge on VP.
import type { AudioData } from '../../engine/audio';
import type { Pose } from '../../kit/clawd';
import { HANDOFF } from '../../kit/handoff';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { clamp, ease, lerp } from '../../engine/util';
import { divePosition, type DiveScore } from './s14-score';

export type Point = { x: number; y: number };
export type Box = Point & { w: number; h: number };
export const LYRIC_SIZE = 98;
export const TYPE_LEVELS = { giant: null, lyric: 67.228, label: 20 } as const; // Archivo sCapHeight 686/1000.
export const VP: Point = { x: 956, y: 1100 };
const MOUTH: Point[] = [
  { x: 486, y: 87 }, { x: 1509, y: 277 },
  { x: 1455, y: 585 }, { x: 369, y: 321 },
];

export function bounds(points: readonly Point[], clip = false): Box {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = clip ? clamp(Math.min(...xs), 0, 1920) : Math.min(...xs);
  const y = clip ? clamp(Math.min(...ys), 0, 1080) : Math.min(...ys);
  const right = clip ? clamp(Math.max(...xs), 0, 1920) : Math.max(...xs);
  const bottom = clip ? clamp(Math.max(...ys), 0, 1080) : Math.max(...ys);
  return { x, y, w: right - x, h: bottom - y };
}

/** The actual square cells drawn by Clawd.draw, including its 0.35px seam overlap. */
export function spriteBounds(pose: Pose, cx: number, cy: number, px: number, roll = 0): Box {
  const co = Math.cos(roll), si = Math.sin(roll);
  const corners = pose.cells.flatMap(cell => [0, 1].flatMap(dx => [0, 1].map(dy => {
    const x = (cell.x + pose.dx - 8) * px + dx * (px + 0.35);
    const y = (cell.y + pose.dy - 2.5) * px + dy * (px + 0.35);
    return { x: cx + co * x - si * y, y: cy + si * x + co * y };
  })));
  return bounds(corners);
}

export function shaftState(audio: AudioData, t: number, T: DiveScore) {
  const reference = T.frames + (T.nearCut - T.frames) * 0.6;
  const travel = (divePosition(Math.min(t, T.near), T) - divePosition(reference, T)) * 0.18;
  const enter = ease.outExpo(span(t, T.start, afterBeats(audio, T.start, 1)));
  return { travel, enter, stopped: t >= T.near, cx: 978, cy: 368 + 8 * Math.sin(travel), px: 10.2, roll: 0.42 };
}

/** A plane at depth d under the same pinhole camera, no integration or modulo reset. */
export function frameAt(depth: number, travel = 0): Point[] {
  const scale = 1 / Math.max(0.14, 1 + 0.68 * (depth - travel));
  return MOUTH.map(p => ({ x: VP.x + (p.x - VP.x) * scale, y: VP.y + (p.y - VP.y) * scale }));
}

export function shaftBounds(audio: AudioData, t: number, T: DiveScore) {
  const s = shaftState(audio, t, T);
  return bounds(Array.from({ length: 24 }, (_, depth) => frameAt(depth, s.travel)).flat(), true);
}

export function handoffIn(t: number, audio: AudioData, T: DiveScore) {
  const k = ease.inOutCubic(span(t, T.start, afterBeats(audio, T.start, 1)));
  return { pitch: lerp(HANDOFF.fall13.pitch, 190, k), pxPerBeat: lerp(HANDOFF.fall13.pxPerBeat, 260, k),
    distance: Math.max(0, beatsSince(audio, Math.min(t, afterBeats(audio, T.start, 1)), T.start)) * HANDOFF.fall13.pxPerBeat,
    alpha: 1 - k };
}

export function handoffOut(t: number, audio: AudioData, T: DiveScore) {
  const k = ease.outExpo(span(t, afterBeats(audio, T.end, -1), T.end));
  return { x0: lerp(890, HANDOFF.line14.x0, k), x1: lerp(1012, HANDOFF.line14.x1, k),
    y: lerp(1040, HANDOFF.line14.y, k), roll: lerp(0.29, 0, k) };
}
