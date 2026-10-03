import board from '../../../../storyboard/shots.json';
import { resolveStoryboard, type Storyboard, type ResolvedShot } from '../../storyboard';
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Line, Word } from '../../engine/lyrics';
import { Voice } from '../../kit/lyric-moves';
import { HANDOFF } from '../../kit/handoff';
import { CREDIT_LINES, type CreditsState } from '../../kit/credits';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { ease, lerp } from '../../engine/util';

// Coordinates measured on the 1672×941 reference, scaled to logical 1920×1080.
const sx = 1920 / 1672, sy = 1080 / 941;
const pt = (x: number, y: number) => ({ x: x * sx, y: y * sy });
export const STAR_TARGETS = [
  [83, 417, 4], [95, 392, 6], [129, 374, 4], [184, 330, 7], [247, 251, 7],
  [343, 234, 4], [417, 196, 7], [413, 264, 7], [495, 146, 4], [559, 142, 4],
  [650, 105, 5], [764, 103, 8], [818, 153, 6], [877, 146, 6], [938, 172, 4],
  [984, 170, 4], [1012, 206, 4], [1065, 247, 8], [1069, 299, 5],
  [1140, 330, 4], [1179, 387, 5],
].map(([x, y, r]) => ({ ...pt(x!, y!), r: r! * sx }));

const trunk = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
export const CONSTELLATION_EDGES = [
  ...trunk.slice(1).map((id, i) => [trunk[i]!, id] as const), [5, 7] as const, [7, 6] as const,
];

export const S18_LAYOUT = {
  horizon: 967,
  clawd: { x: 582, y: 902.5, px: 12.9 },
  calendar: { x: 927, y: 806, w: 338, h: 166 },
  notification: { x: 1652, y: 409, w: 300, h: 143 },
} as const;

export interface OutroTimes {
  shots: ResolvedShot[];
  start: number;
  end: number;
  dawn: number;
  ohs: Word[];
  carried: Line[];
}

export function resolveOutroTimes(audio: AudioData, lyrics: Lyrics): OutroTimes {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots.filter(s => s.scene === 'S18');
  const start = shots[0]!.start, end = shots.at(-1)!.end;
  // No guessed vocal times: current alignment contains no outro "oh" tokens. If C supplies
  // them, Voice drives one star per word. Until then, the instrumental measured grid is used.
  const ohs = lyrics.lines.flatMap(l => l.words).filter(w =>
    /^oh[.!?,]*$/i.test(w.w) && w.start >= start && w.start < end);
  const carried = lyrics.lines.filter(l => l.start < start && afterBeats(audio, l.end + 0.6, 1) > start);
  return { shots, start, end, dawn: afterBeats(audio, shots[4]!.start, 8), ohs, carried };
}

/** Incoming git nodes move only during the first measured beat; at the cut all six are exact. */
export function handoffIn(t: number, audio: AudioData, T: OutroTimes) {
  const p = ease.inOutCubic(span(t, T.start, afterBeats(audio, T.start, 1)));
  if (p === 1) return STAR_TARGETS.slice(0, HANDOFF.nodes17.length).map(({ x, y }) => ({ x, y }));
  return HANDOFF.nodes17.map((a, i) => ({
    x: lerp(a.x, STAR_TARGETS[i]!.x, p), y: lerp(a.y, STAR_TARGETS[i]!.y, p),
  }));
}

export function starState(audio: AudioData, voice: Voice, t: number, T: OutroTimes) {
  const incoming = handoffIn(t, audio, T);
  const b = Math.max(0, beatsSince(audio, t, T.start));
  return STAR_TARGETS.map((point, i) => {
    const word = T.ohs[i - HANDOFF.nodes17.length];
    const alpha = i < HANDOFF.nodes17.length ? 1 : T.ohs.length
      ? (word ? voice.form(word, t).born : 0)
      : ease.outCubic(Math.min(1, Math.max(0, (b - (i - HANDOFF.nodes17.length)) / 0.8)));
    return { ...point, ...(incoming[i] ?? {}), alpha };
  });
}

export function outroState(audio: AudioData, t: number, T: OutroTimes) {
  let shot = 0;
  for (let i = 1; i < T.shots.length; i++) if (t >= T.shots[i]!.start) shot = i;
  const b = Math.max(0, beatsSince(audio, t, T.shots[shot]!.start));
  return {
    shot, b,
    dawn: ease.inOutCubic(span(t, afterBeats(audio, T.dawn, -4), afterBeats(audio, T.dawn, 4))),
    flip: ease.inOutCubic(span(t, afterBeats(audio, T.dawn, -1), afterBeats(audio, T.dawn, 1))),
    notification: ease.outCubic(span(t, T.shots[5]!.start, afterBeats(audio, T.shots[5]!.start, 1))),
    wave: shot === 3 && b < 2 ? 1 : 0,
    fade: ease.inOutCubic(span(t, afterBeats(audio, T.shots[6]!.start, 13), T.end)),
  };
}

/** Six credit rows arrive on six measured beats; all finish before the beat-13 fade. */
export function outroCredits(audio: AudioData, t: number, T: OutroTimes): CreditsState {
  const at = T.shots[6]!.start;
  return { color: 'paper', lines: CREDIT_LINES.map((text, i) => ({ text,
    progress: Math.min(1, Math.max(0, beatsSince(audio, t, afterBeats(audio, at, i)) / 1.2)),
  })) };
}

export function compositionAt(audio: AudioData, voice: Voice, t: number, T: OutroTimes) {
  const points = starState(audio, voice, t, T).filter(p => p.alpha > 0);
  const left = Math.min(...points.map(p => p.x - p.r)), right = Math.max(...points.map(p => p.x + p.r));
  const top = Math.min(...points.map(p => p.y - p.r)), bottom = Math.max(...points.map(p => p.y + p.r));
  const q = S18_LAYOUT.clawd;
  return { dominant: { x: left, y: top, w: right - left, h: bottom - top },
    clawd: { x: q.x, y: q.y, w: 16 * q.px + 0.35, h: 5 * q.px + 0.35 } };
}
