// The front-on device stencil, graph and diff occupy the measured kf-S17 bands.
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import { ease } from '../../engine/util';
import { HANDOFF, type Rect } from '../../kit/handoff';
import { afterBeats, span, wordTime } from '../../kit/time';
import { mixRect } from './s16-green-state';
import { WALL_CELLS, type ReleaseTimes } from './s17-release-state';

export const WALL_BOX: Rect = { x: 30, y: 36, w: 1860, h: 480 };
export const DIFF_BOXES: readonly Rect[] = [
  { x: 46, y: 550, w: 1790, h: 282 }, { x: 46, y: 798, w: 1570, h: 274 },
];

export function wallCells() {
  return WALL_CELLS.map((cell, i) => ({ ...cell, i,
    x: WALL_BOX.x + cell.x * WALL_BOX.w / 16, y: WALL_BOX.y + cell.y * WALL_BOX.h / 5,
    w: WALL_BOX.w / 16 - 4, h: WALL_BOX.h / 5 - 4 }));
}

/** Face-to-flood matching occurs only in the first measured beat. */
export function handoffIn(t: number, audio: AudioData, T: ReleaseTimes): Rect {
  const at = T.release[0]!.start;
  return mixRect(HANDOFF.domino16, { x: 0, y: 0, w: 1920, h: 1080 },
    ease.inOutCubic(span(t, at, afterBeats(audio, at, 1))));
}

/** These nodes are already registered to the following star positions; no late snap. */
export function handoffOut(t: number, audio: AudioData, T: ReleaseTimes) {
  return HANDOFF.nodes17.map(p => ({ ...p }));
}

export function releaseLayout(audio: AudioData, lyrics: Lyrics, t: number, T: ReleaseTimes) {
  const review = lyrics.get('Then you wrote, “Looks good to me”');
  const mergeLine = lyrics.get('Merged to main, and now we’re free');
  const machineLine = lyrics.get('And it works on every machine');
  const main = mergeLine.words[2]!;
  const join = ease.inOutCubic(span(t, wordTime(lyrics, mergeLine.text, 'main')!, afterBeats(audio, main.end, 1)));
  const every = wordTime(lyrics, machineLine.text, 'every')!;
  return {
    review: t >= review.words[3]!.start && t < review.end,
    merge: t >= mergeLine.start && t < machineLine.start,
    join, wall: t >= every,
    wallOpacity: ease.outCubic(span(t, every, afterBeats(audio, every, 0.65))),
    clawd: { x: 1207, y: 477, px: 11.5 }, nodes: handoffOut(t, audio, T),
    incoming: handoffIn(t, audio, T),
  };
}
