import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { afterBeats, beatsSince, span, wordTime } from '../../kit/time';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import board from '../../../../storyboard/shots.json';

export interface DiveScore {
  start: number; down: number; quiet: number; frames: number; near: number; nearCut: number; end: number;
  steps: { at: number; from: number; to: number; end: number }[];
}

export function diveScore(audio: AudioData, lyrics: Lyrics): DiveScore {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots.filter(s => s.scene === 'S14');
  const [start, down, quiet, frames, nearCut] = shots.map((s) => s.start) as [number, number, number, number, number];
  const near = wordTime(lyrics, 'Frame by frame, and the bug is near', 'near') ?? nearCut;
  const beats = [down, ...audio.beats.filter((b) => b > down + 1e-5 && b < near - 1e-5), near];
  let position = 0;
  const steps = beats.map((at, i) => {
    const from = position;
    position += at < quiet ? 0.52 : at < frames ? 0.7 : 1.15;
    const next = beats[i + 1] ?? near;
    return { at, from, to: position, end: Math.min(afterBeats(audio, at, 0.65), next) };
  });
  // The final approach ends exactly at near. Nothing integrates across render calls.
  const final = steps.at(-1)!;
  final.at = afterBeats(audio, near, -0.48);
  final.end = near;
  return { start, down, quiet, frames, near, nearCut, end: shots.at(-1)!.end, steps };
}

export function divePosition(t: number, T: DiveScore): number {
  let pos = 0;
  for (const step of T.steps) {
    if (t < step.at) break;
    const last = step === T.steps.at(-1);
    pos = lerp(step.from, step.to, (last ? ease.inQuad : ease.outExpo)(span(t, step.at, step.end)));
  }
  return pos;
}

export function diveState(audio: AudioData, t: number, T: DiveScore) {
  const pos = divePosition(t, T);
  const stopped = t >= T.near;
  const entrance = ease.inOutCubic(span(t, T.down, afterBeats(audio, T.down, 1.5)));
  const hush = ease.inOutCubic(span(t, T.quiet, T.near));
  // A finite derivative is used only for motion streak intensity, never for simulation.
  const velocity = stopped ? 0 : Math.max(0, (pos - divePosition(t - 1 / 120, T)) * 120);
  return { pos, stopped, entrance, hush, velocity, floor: Math.floor(pos),
    target: T.steps.at(-1)!.to, reveal: stopped ? ease.outExpo(span(t, T.near, afterBeats(audio, T.near, 0.8))) : 0,
    breath: Math.sin(beatsSince(audio, t, T.start) * Math.PI / 3) };
}
