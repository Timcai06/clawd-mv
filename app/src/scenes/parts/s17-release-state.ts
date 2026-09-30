// Editorial cuts and musical events shared by the release and its outro.
import board from '../../../../storyboard/shots.json';
import { resolveStoryboard, type Storyboard, type ResolvedShot } from '../../storyboard';
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import { clamp, ease, lerp } from '../../engine/util';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { pose } from '../../kit/clawd';

export interface ReleaseTimes {
  release: ResolvedShot[];
  tomorrow: ResolvedShot[];
  hit: number;
  dawn: number;
  end: number;
}

export function resolveReleaseTimes(audio: AudioData, lyrics: Lyrics): ReleaseTimes {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
  const release = shots.filter(s => s.scene === 'S17');
  const tomorrow = shots.filter(s => s.scene === 'S18');
  // Dawn is an editorial page turn, exactly eight measured beats into the calendar shot.
  const dawn = afterBeats(audio, tomorrow[4]!.start, 8);
  return { release, tomorrow, hit: release[1]!.start, dawn, end: tomorrow.at(-1)!.end };
}

export function currentShot(shots: readonly ResolvedShot[], t: number): number {
  let index = 0;
  for (let i = 1; i < shots.length; i++) if (t >= shots[i]!.start) index = i;
  return index;
}

/** The device geometry is derived from the supplied mascot, never redrawn by the scene. */
export const WALL_CELLS = pose(null, { beat: 0, beat0: 0, p: 0 }).cells;

export function releaseState(audio: AudioData, t: number, times: ReleaseTimes) {
  const shot = currentShot(times.release, t), at = times.release[shot]!;
  const b = Math.max(0, beatsSince(audio, t, at.start));
  const mergeAt = times.release[5]!.start;
  const merge = ease.inOutCubic(clamp(beatsSince(audio, t, mergeAt) / 2));
  const wallAt = times.release[7]!.start;
  const wallBeats = Math.max(0, beatsSince(audio, t, wallAt));
  const revealAt = times.release[8]!.start;
  // The final shot is only one beat: begin the crane in the preceding three-beat shot.
  const wallPull = ease.inOutCubic(span(t, wallAt, afterBeats(audio, revealAt, 0.8)));
  return {
    shot, b, p: span(t, at.start, at.end),
    ground: shot === 1 ? 'clay' as const : 'paper' as const,
    impact: shot === 1 ? Math.pow(0.5, Math.max(0, beatsSince(audio, t, times.hit)) / 0.17) : 0,
    merge,
    wallLit: shot < 7 ? 0 : Math.min(WALL_CELLS.length, Math.floor(wallBeats * WALL_CELLS.length / 2.5) + 1),
    wallZoom: lerp(3.8, 0.82, wallPull), wallPull,
  };
}

export function tomorrowState(audio: AudioData, t: number, times: ReleaseTimes) {
  const shot = currentShot(times.tomorrow, t), at = times.tomorrow[shot]!;
  const b = Math.max(0, beatsSince(audio, t, at.start));
  const dawn = t >= times.dawn;
  const creditsAt = times.tomorrow[6]!.start;
  const fadeStart = afterBeats(audio, creditsAt, 13);
  return {
    shot, b, p: span(t, at.start, at.end), ground: dawn ? 'paper' as const : 'ink' as const,
    dawn, calendarFlip: ease.inOutCubic(span(t, afterBeats(audio, times.dawn, -1), afterBeats(audio, times.dawn, 1))),
    wallLit: shot === 0 ? Math.max(0, WALL_CELLS.length - Math.floor(b * WALL_CELLS.length / 3)) : 0,
    creditsOpacity: 1 - ease.inOutCubic(span(t, fadeStart, times.end)),
    starOpacity: dawn ? 0 : shot < 2 ? 0.28 : shot === 4 ? 0.72 : 1,
  };
}
