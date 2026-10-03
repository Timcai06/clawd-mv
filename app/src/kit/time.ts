// Shared timing helpers for scenes (docs/ARCHITECTURE.md). The song speeds up from ~133 to
// ~138 BPM, so everything musical goes through the measured per-beat grid, never BPM x time.
import type { AudioData } from '../engine/audio';
import { ease } from '../engine/util';
import type { SceneCtx } from '../engine/scene';
import type { ResolvedShot } from '../storyboard';

/** The current shot as resolved from the storyboard (timeline params), with progress helpers. */
export function shotOf(ctx: SceneCtx): ResolvedShot {
  return ctx.params.shot as ResolvedShot;
}

/** 0..1 progress through [a, b], clamped. */
export const span = (t: number, a: number, b: number) => (b <= a ? (t >= b ? 1 : 0) : Math.min(1, Math.max(0, (t - a) / (b - a))));

/** Beats elapsed since `t0` on the measured grid (negative before it). */
export function beatsSince(audio: AudioData, t: number, t0: number): number {
  return audio.beatAt(t) - audio.beatAt(t0);
}

/** Time `n` beats after `t0` on the measured grid (n may be fractional or negative). */
export function afterBeats(audio: AudioData, t0: number, n: number): number {
  return audio.timeOfBeat(audio.beatAt(t0) + n);
}

/**
 * Discrete count of beats reached since `t0` (0 at t0, 1 one beat later...), clamped to [0, max].
 * For "one more cell lights per beat" style effects.
 */
export function onBeats(audio: AudioData, t: number, t0: number, max = Infinity, per = 1): number {
  return Math.max(0, Math.min(max, Math.floor(beatsSince(audio, t, t0) * per + 1e-6)));
}

/** Typewriter: number of characters of `text` shown at t when typing runs from t0 to t1. */
export function typed(text: string, t: number, t0: number, t1: number): number {
  return Math.round(text.length * span(t, t0, t1));
}

/** Exponential decay pulse after an event time (1 at the event, halving every `half` seconds). */
export function hitAfter(t: number, t0: number, half = 0.12): number {
  return t < t0 ? 0 : Math.pow(0.5, (t - t0) / half);
}

/** Time of the n-th (1-based) matching word inside the given line occurrence, or undefined. */
export function wordTime(lyrics: { lines: { text: string; words: { w: string; start: number; syl?: [number, number][] }[] }[] },
  line: string, word: string, occ = 1, syl?: number): number | undefined {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const lines = lyrics.lines.filter((l) => norm(l.text) === norm(line));
  const w = lines[occ - 1]?.words.find((x) => norm(x.w) === norm(word));
  if (!w) return undefined;
  return syl ? w.syl?.[syl - 1]?.[0] : w.start;
}

/**
 * Stage 9 G5, "holds, then snaps" (TREATMENT.md Tone; pdoom room.ts cuts on the beat): progress
 * 0..1 from t0 to t1 in n equal beat segments (n = the beats in between, at least 1). Each segment
 * opens with a snap (outExpo over `snap` s) and then holds still. Exactly 0 at t0 and 1 at t1, so
 * it can replace a long inOutCubic drift without moving either end.
 */
export function beatSteps(audio: AudioData, t: number, t0: number, t1: number, snap = 0.14): number {
  if (t <= t0) return 0;
  if (t >= t1) return 1;
  const B0 = audio.beatAt(t0), B1 = audio.beatAt(t1), n = Math.max(1, Math.round(B1 - B0));
  const u = (audio.beatAt(t) - B0) / (B1 - B0) * n, k = Math.min(n - 1, Math.floor(u));
  const at = audio.timeOfBeat(B0 + k * (B1 - B0) / n);
  return Math.min(1, (k + ease.outExpo(Math.min(1, (t - at) / snap))) / n);
}
