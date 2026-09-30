// Shared X9 timing and lyric overlay. The z suffix keeps this helper after s09-terminal
// in timeline.ts's scene-module lookup; it is not a timeline entry.
import type * as THREE from 'three';
import boardJSON from '../../../storyboard/shots.json';
import type { AudioData } from '../engine/audio';
import type { SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { ease, lerp } from '../engine/util';
import { normalizeAnchor, resolveStoryboard, type Storyboard } from '../storyboard';
import { afterBeats, beatsSince, hitAfter, onBeats, span, typed, wordTime } from '../kit/time';
import { drawLyricsLine, lyricsTypeState } from '../kit/lyrics-type';
import type { CameraView } from '../kit/stage';

const board = boardJSON as Storyboard;
type TimingCtx = Pick<SceneCtx, 'lyrics' | 'audio'>;

export function resolveX9Times(ctx: TimingCtx) {
  const shots = resolveStoryboard(board, ctx.lyrics, ctx.audio).shots;
  const shot = (id: string) => shots.find((s) => s.id === id)!;
  const word = (id: string, query?: string, sub?: number) => {
    const s = shot(id), a = s.anchor, text = query ?? a.word!;
    const occurrence = sub ?? a.sub ?? 1;
    if (occurrence === 1) return wordTime(ctx.lyrics, a.line!, text, a.occ) ?? s.t;
    // wordTime selects line occurrences, not repeated tokens within a line.
    const line = ctx.lyrics.lines.filter((l) => normalizeAnchor(l.text) === normalizeAnchor(a.line!))[(a.occ ?? 1) - 1];
    return line?.words.filter((w) => normalizeAnchor(w.w) === normalizeAnchor(text))[occurrence - 1]?.start ?? s.t;
  };
  const count = word('S12-5'), ten = word('S12-5', 'ten'), end = shot('S12-5').end;
  // Count on measured subdivisions, then reserve at least 1.5 beats for the extra digit.
  const eleven = Math.min(afterBeats(ctx.audio, ten, 0.75), afterBeats(ctx.audio, end, -1.5));
  return {
    terminal: shot('S09-1').start, waiting: word('S09-2'), terminalEnd: shot('S09-2').end,
    nineteen: word('S10-1'), shatter: word('S10-2'), wallEnd: shot('S10-2').end,
    stack: word('S11-1'), sky: word('S11-2'),
    impacts: [word('S11-3'), word('S11-3', 'undefined', 2)] as const,
    why: word('S11-4'), rainEnd: shot('S11-4').end,
    runs: [word('S12-1'), word('S12-2'), word('S12-3')] as const,
    clear: word('S12-4'), cache: word('S12-4', 'cache'), count, ten, eleven, end,
  };
}
export type X9Times = ReturnType<typeof resolveX9Times>;

/** Beat-relative easing and impulses, including on the accelerating part of the song. */
export const beatSpan = (audio: AudioData, t: number, at: number, beats: number) => span(t, at, afterBeats(audio, at, beats));
export const beatHit = (audio: AudioData, t: number, at: number, half = 0.2) => hitAfter(t, at, afterBeats(audio, at, half) - at);

export function terminalState(audio: AudioData, t: number, T: X9Times) {
  return {
    rise: ease.outCubic(beatSpan(audio, t, T.terminal, 1.5)),
    chars: typed('npm test', t, afterBeats(audio, T.terminal, 0.75), afterBeats(audio, T.terminal, 3.25)),
    dots: t < T.waiting ? 0 : 1 + onBeats(audio, t, T.waiting),
    push: ease.inOutCubic(span(t, T.waiting, T.terminalEnd)),
  };
}

export function redwallState(audio: AudioData, t: number, T: X9Times) {
  return {
    rows: t < T.nineteen ? 0 : Math.min(19, 1 + Math.floor(18 * beatSpan(audio, t, T.nineteen, 0.75))),
    fracture: beatSpan(audio, t, T.shatter, 2.5),
    impact: beatHit(audio, t, T.nineteen),
  };
}

export function rainState(audio: AudioData, t: number, T: X9Times) {
  return {
    phase: Math.max(0, beatsSince(audio, t, T.stack)) / 6,
    density: 0.7 * beatSpan(audio, t, T.stack, 1),
    impacts: T.impacts.map((at) => ({
      visible: t >= afterBeats(audio, at, -0.75),
      fall: span(t, afterBeats(audio, at, -0.75), at),
      squash: beatHit(audio, t, at, 0.12),
    })),
    pull: ease.outCubic(span(t, T.why, T.rainEnd)),
  };
}

export function rerunState(audio: AudioData, t: number, T: X9Times) {
  const run = T.runs.reduce((last, at, i) => t >= at ? i : last, -1);
  const at = T.runs[Math.max(0, run)];
  const clearing = t >= T.clear;
  const countPhase = span(audio.beatAt(t), audio.beatAt(T.count), audio.beatAt(T.eleven));
  return {
    run, clearing,
    chars: typed('npm test', t, at, afterBeats(audio, at, 0.45)),
    result: run >= 0 && t >= afterBeats(audio, at, 0.45) && !clearing,
    clear: ease.inOutCubic(span(t, T.clear, T.cache)),
    number: t < T.count ? 0 : Math.min(11, 1 + Math.floor(countPhase * 10 + 1e-6)),
    countPhase,
    zoom: run < 0 ? 1 : [1.05, 1.48, 2.35][run],
    red: run < 0 ? 0 : [0.12, 0.45, 1][run],
  };
}

export function mixView(a: CameraView, b: CameraView, p: number): CameraView {
  return { x: lerp(a.x!, b.x!, p), y: lerp(a.y!, b.y!, p), zoom: lerp(a.zoom ?? 1, b.zoom ?? 1, p),
    yaw: lerp(a.yaw ?? 0, b.yaw ?? 0, p), pitch: lerp(a.pitch ?? 0, b.pitch ?? 0, p) };
}

/** Keep the official small lyric on the screen grid during extreme camera moves. */
export class X9Lyrics {
  private layer = new Layer2D(1920, 112);
  draw(ctx: SceneCtx, t: number, out: THREE.WebGLRenderTarget) {
    this.layer.clear();
    drawLyricsLine(this.layer.ctx, { x: 80, y: 32, width: 1760, height: 64 }, lyricsTypeState(ctx.lyrics, t, ctx.audio));
    ctx.comp.draw(ctx.renderer, this.layer.upload(), out, { scale: [1, 1080 / 112], offset: [0, -(1080 / 112 - 1) / 2] });
  }
  dispose() { this.layer.texture.dispose(); }
}
