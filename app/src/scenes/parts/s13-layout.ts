import type { AudioData } from "../../engine/audio";
import type { Lyrics } from "../../engine/lyrics";
import { ease, lerp } from "../../engine/util";
import { HANDOFF, type Prim } from "../../kit/handoff";
import { stackScore } from "./s14-stack";
import { shaftCursorRect } from "./s14-camera";
import { Voice } from "../../kit/lyric-moves";
import { afterBeats, beatsSince, span } from "../../kit/time";
import { varRun } from "../../kit/vartype";
import * as Clawd from "../../kit/clawd";
import { chorusState, type ChorusScore } from "./s13-score";
import {
  bounds,
  mappedInk,
  spritePoints,
  visibleBox,
  type Quad,
  type Sprite,
} from "./s08-print";

export function handoffIn(t: number, audio: AudioData, T: ChorusScore) {
  const p = ease.outCubic(span(t, T.start, afterBeats(audio, T.start, 1)));
  return {
    x: lerp(HANDOFF.eleven12.x, 0, p),
    y: lerp(HANDOFF.eleven12.y, 0, p),
    w: lerp(HANDOFF.eleven12.w, 1096, p),
    h: lerp(HANDOFF.eleven12.h, 1080, p),
  };
}
export function handoffOut(t: number, audio: AudioData, T: ChorusScore) {
  const p = span(t, afterBeats(audio, T.end, -1), T.end - 1 / 60);
  return {
    pitch: lerp(42, HANDOFF.fall13.pitch, p),
    pxPerBeat: lerp(96, HANDOFF.fall13.pxPerBeat, p),
  };
}
/** Integrate the last-beat speed ramp analytically; the river never changes travel history. */
export function logTravel(t: number, audio: AudioData, T: ChorusScore) {
  const start = afterBeats(audio, T.end, -1),
    stop = T.end - 1 / 60;
  const b = beatsSince(audio, t, T.start),
    a = beatsSince(audio, start, T.start);
  const length = beatsSince(audio, stop, start),
    u = Math.max(0, beatsSince(audio, Math.min(t, stop), start));
  return t < start
    ? b * 96
    : a * 96 +
        96 * u +
        (22 * u * u) / length +
        Math.max(0, beatsSince(audio, t, stop)) * 140;
}
export function gitfallLayout(
  audio: AudioData,
  lyrics: Lyrics,
  t: number,
  T: ChorusScore,
  voice = new Voice(lyrics, audio),
) {
  const s = chorusState(audio, t, T);
  const b = beatsSince(audio, t, T.split),
    arrive = ease.outCubic(span(b, 0, 0.6));
  const title = lyrics
    .find("I need one more commit")
    [s.second ? 3 : 2]!.words.at(-1)!;
  const form = voice.form(title, t, {
    minWidth: 62,
    maxWidth: 87.5,
    rest: 900,
  });
  // Bilinear print surface: perspective cap height contracts from 930 px to 395 px.
  const giant: Quad = [
    [0, 22],
    [972, 355],
    [1028, 750],
    [0, 952],
  ];
  const local: Quad = [
    [580 - (1 - arrive) * 900, 550],
    [1045 - (1 - arrive) * 900, 674],
    [1056 - (1 - arrive) * 900, 836],
    [626 - (1 - arrive) * 900, 900],
  ];
  const ci: Quad = [
    [1045 + (1 - arrive) * 900, 674],
    [1444 + (1 - arrive) * 900, 550],
    [1475 + (1 - arrive) * 900, 890],
    [1056 + (1 - arrive) * 900, 836],
  ];
  const eject = s.eject;
  const pose = Clawd.pose(s.split ? "A7" : s.testMode ? "A8" : "A4", {
    beat: audio.beatAt(s.frozen ? s.clock : t),
    beat0: audio.beatAt(T.hit1),
    p: 0,
  });
  const clawd: Sprite = {
    x: 1120 + eject * 550,
    y: 245 - eject * 620,
    px: 14.3,
    angle: 0.17 + eject * 1.5,
    pose,
  };
  return {
    ...s,
    giant,
    local,
    ci,
    clawd,
    form,
    arrive,
    travel: logTravel(s.clock, audio, T),
    handoff: handoffOut(t, audio, T),
  };
}
export function gitfallBounds(
  audio: AudioData,
  lyrics: Lyrics,
  t: number,
  T: ChorusScore,
) {
  const s = gitfallLayout(audio, lyrics, t, T),
    run = varRun("COMMIT", 100, {
      ...s.form.axes,
      wght: Math.max(800, s.form.axes.wght),
    });
  return {
    giant: visibleBox(bounds(mappedInk(run, s.giant))),
    clawd: bounds(spritePoints(s.clawd)),
    panels: bounds([...s.local, ...s.ci]),
  };
}

/** C13 (docs/CUTS.md): the whole COMMIT page implodes into S14's first cursor over the last half
 *  beat (inCubic, like pdoom's hook1 numbers shrinking into the spark), done 0.1 s before the cut. */
export function implode(t: number, audio: AudioData, T: ChorusScore) {
  return ease.inCubic(span(t, afterBeats(audio, T.end, -0.5), T.end - 0.1));
}
/** The point everything implodes into: S14's cursor block on S14's first frame. */
export function implodeTarget(audio: AudioData, lyrics: Lyrics, T: ChorusScore) {
  const S = stackScore(audio, lyrics);
  return shaftCursorRect(S, T.end);
}
export function exitPrim13(t: number, audio: AudioData, lyrics: Lyrics, T: ChorusScore): Prim {
  const r = implodeTarget(audio, lyrics, T), k = implode(t, audio, T);
  return k > 0 ? { kind: 'rect', ...r } : { kind: 'rect', x: 0, y: 0, w: 1920, h: 1080 };
}
/** C12: the clay 11 that S13's clay half grows from (identity camera while frozen). */
export function entryPrim13(t: number, audio: AudioData, T: ChorusScore): Prim { return { kind: 'rect', ...handoffIn(t, audio, T) }; }
