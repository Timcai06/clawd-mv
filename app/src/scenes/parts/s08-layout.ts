import type { AudioData } from "../../engine/audio";
import type { Lyrics } from "../../engine/lyrics";
import { ease, lerp } from "../../engine/util";
import { Voice } from "../../kit/lyric-moves";
import { HANDOFF, type Prim } from "../../kit/handoff";
import { afterBeats, beatsSince, span } from "../../kit/time";
import { varRun } from "../../kit/vartype";
import { resolveStoryboard, type Storyboard } from "../../storyboard";
import board from "../../../../storyboard/shots.json";
import * as Clawd from "../../kit/clawd";
import {
  bounds,
  mappedInk,
  rectQuad,
  spritePoints,
  visibleBox,
  type Sprite,
} from "./s08-print";

export function commitScore(audio: AudioData, lyrics: Lyrics) {
  const shots = resolveStoryboard(
    board as Storyboard,
    lyrics,
    audio,
  ).shots.filter((s) => s.scene === "S08");
  return {
    shots,
    start: shots[0]!.start,
    hit1: shots[1]!.start,
    brackets: shots[2]!.start,
    fit: shots[3]!.start,
    taps: shots.slice(4, 7).map((s) => s.start),
    quit: shots[7]!.start,
    pick2: shots[8]!.start,
    hit2: shots[9]!.start,
    works: shots[10]!.start,
    end: shots.at(-1)!.end,
  };
}
export type CommitScore = ReturnType<typeof commitScore>;
export function handoffIn(t: number, audio: AudioData, T: CommitScore) {
  const p = ease.inCubic(span(t, T.start, afterBeats(audio, T.start, 1))),
    h = lerp(72, 110, p);
  return { x: 960 - h * 0.275, y: 576 + (h - 72) / 2, h };
}
export function handoffOut(t: number, audio: AudioData, T: CommitScore) {
  // Reach the endpoint 0.1 s before the cut and hold it (R4, docs/CUTS.md).
  const p = ease.inOutCubic(
    span(t, afterBeats(audio, T.end, -1), T.end - 0.1),
  );
  return {
    x0: lerp(1138, HANDOFF.base08.x0, p),
    x1: lerp(1650, HANDOFF.base08.x1, p),
    y: lerp(940, HANDOFF.base08.y, p),
  };
}
export function commitLayout(
  audio: AudioData,
  lyrics: Lyrics,
  t: number,
  T: CommitScore,
  voice = new Voice(lyrics, audio),
) {
  const second = t >= T.pick2,
    hit = second ? T.hit2 : T.hit1;
  const frozen = t < T.hit1 || (t >= T.pick2 && t < T.hit2);
  const b = Math.max(0, beatsSince(audio, t, hit));
  const impact = frozen ? 0 : Math.pow(0.5, b / 0.18);
  const slam = frozen ? 0 : ease.outBack(span(b, 0, 0.55), 1.2);
  const line = lyrics.find("I need one more commit")[second ? 1 : 0]!;
  const word = line.words.at(-1)!;
  const form = voice.form(word, t, { minWidth: 62, maxWidth: 87.5, rest: 900 });
  // Cap area measured from kf-S08: y 303..853, intentional bilateral bleed.
  // Width changes with the held MIT, with the right/left crop retained.
  const stretch = lerp(0.94, 1, form.sung),
    w = 2070 * stretch * (1 + 0.14 * impact);
  const giant = rectQuad({
    x: 960 - w / 2,
    y: 303 - (1 - slam) * 200,
    w,
    h: 550,
  });
  const jumping = b < 0.8 && !frozen;
  const pose = Clawd.pose(jumping ? "A6" : "A7", {
    beat: audio.beatAt(t),
    beat0: audio.beatAt(hit),
    p: 0,
    jumpBeats: 0.8,
  });
  const clawd: Sprite = { x: 1015, y: 145, px: 13, angle: 0.2, pose };
  return {
    frozen,
    second,
    impact,
    giant,
    clawd,
    form,
    hook: t < T.brackets || (t >= T.pick2 && t < T.works),
    taps: t >= T.taps[0]! && t < T.quit,
    preview: t >= T.works,
  };
}
/** Framing uses the rendered interpolated outlines and every transformed sprite cell. */
export function commitBounds(
  audio: AudioData,
  lyrics: Lyrics,
  t: number,
  T: CommitScore,
) {
  const s = commitLayout(audio, lyrics, t, T),
    run = varRun("COMMIT", 100, {
      ...s.form.axes,
      wght: Math.max(800, s.form.axes.wght),
    });
  return {
    giant: visibleBox(bounds(mappedInk(run, s.giant))),
    clawd: bounds(spritePoints(s.clawd)),
  };
}
/** C7: the cursor S08 receives (identity camera while frozen at the start). */
export function entryPrim08(t: number, audio: AudioData, T: CommitScore): Prim {
  const p = handoffIn(t, audio, T);
  return { kind: "rect", x: p.x, y: p.y - p.h, w: p.h * 0.55, h: p.h };
}
