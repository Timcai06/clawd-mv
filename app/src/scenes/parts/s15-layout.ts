// S15 timing state, hand-offs and the FREE escape. The solid itself lives in s15-world.ts (v5).
import type { AudioData } from '../../engine/audio';
import { HANDOFF } from '../../kit/handoff';
import { afterBeats, span } from '../../kit/time';
import { ease, hash, lerp } from '../../engine/util';
import { solidBounds, clawdBounds } from './s15-world';
import type { FTimes } from './s15-f-timing';

export const LYRIC_SIZE = 98;
export const TYPE_LEVELS = { giant: null, lyric: 67.228, label: 20 } as const; // Archivo sCapHeight 686/1000.
export function monumentState(audio: AudioData, t: number, T: FTimes) {
  const reveal = ease.outExpo(span(t, T.s15[2]!, afterBeats(audio, T.s15[2]!, 1)));
  const fracture = ease.outExpo(span(t, T.snip, afterBeats(audio, T.snip, 0.65)));
  const removal = ease.inOutCubic(span(t, T.s15[5]!, afterBeats(audio, T.free, 0.6)));
  const paper = t >= T.s15[5]!;
  const scale = t < T.s15[3]! ? lerp(0.86, 1, reveal) : 1;
  return { reveal, fracture, removal, paper, scale,
    barY: removal * 520, barRoll: removal * 0.28,
    piece: handoffOut(t, audio, T),
  };
}

/** The solid's screen bounds (v5: projected from the 3D world, parts/s15-world.ts). */
export function monumentBounds(audio: AudioData, t: number, T: FTimes) { return solidBounds(audio, t, T); }

/** Clawd on the bar (v5: voxel sprite in the 3D world); `box` is its projected screen bounds. */
export function heroState(audio: AudioData, t: number, T: FTimes) {
  const cutting = t >= T.snip && t < T.s15[5]!;
  return { cutting, box: clawdBounds(audio, t, T) };
}

/** The incoming shaft rule is also the actual source-comment rule on the first frame. */
export function handoffIn(t: number, audio: AudioData, T: FTimes) {
  const fade = ease.outExpo(span(t, T.s15[0]!, afterBeats(audio, T.s15[0]!, 1)));
  return { ...HANDOFF.line14, clay: 1 - fade };
}

/** A rigid 70×210 stone rotates from a horizontal snip into the next scene's first domino. */
export function handoffOut(t: number, audio: AudioData, T: FTimes) {
  const start = afterBeats(audio, T.s16[0]!, -1);
  const k = ease.outExpo(span(t, start, T.s16[0]!));
  const angle = lerp(-Math.PI / 2, 0, k);
  const cx = lerp(1175, HANDOFF.domino15.x + HANDOFF.domino15.w / 2, k);
  const cy = lerp(395, HANDOFF.domino15.y + HANDOFF.domino15.h / 2, k);
  const w = Math.abs(Math.cos(angle)) * 70 + Math.abs(Math.sin(angle)) * 210;
  const h = Math.abs(Math.sin(angle)) * 70 + Math.abs(Math.cos(angle)) * 210;
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, angle, visible: t >= start };
}

export function freeState(audio: AudioData, t: number, T: FTimes) {
  const escape = ease.outExpo(span(t, T.free, afterBeats(audio, T.free, 0.75)));
  return { x: lerp(1300, 1815, escape), baseline: lerp(445, 220, escape), roll: lerp(0, -0.25, escape) };
}
