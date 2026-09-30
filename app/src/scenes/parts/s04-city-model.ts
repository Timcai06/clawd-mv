// Calendar geometry and musical cues; kept independent of DOM / GL for validation.
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { beatsSince, span } from '../../kit/time';
import { CALENDAR_MONTHS } from '../../kit/content';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import board from '../../../../storyboard/shots.json';

export const CELL = 3.6;
export const BLOCK = 2.72;
export const OCTOBER = CALENDAR_MONTHS.october;

export interface CityTimes {
  start: number;
  rise: number;
  end: number;
}

export function cityTimes(audio: AudioData, lyrics: Lyrics): CityTimes {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
  const cut = (id: string) => shots.find((s) => s.id === id)!.start;
  return { start: cut('S04-1'), rise: cut('S04-2'), end: cut('S05-1') };
}

export function dateBlock(day: number) {
  const slot = OCTOBER.firstWeekday + day - 1;
  const column = slot % 7, row = Math.floor(slot / 7);
  return {
    day, column, row,
    x: (column - 3) * CELL,
    z: -row * CELL,
    height: day === 32 ? 7.8 : 0.9 + (day % 5) * 0.24 + row * 0.08,
  };
}

export const DATES = Array.from({ length: 32 }, (_, i) => dateBlock(i + 1));
export type Point3 = [number, number, number];

// The cursor uses the streets, including the return lane at the end of each week.
// Every date is visited in order; no diagonal shortcut passes through a building.
export function makeStreets(): { points: Point3[]; lengths: number[]; total: number } {
  const points: Point3[] = [];
  for (let day = 1; day <= 31; day++) {
    const d = dateBlock(day);
    const p: Point3 = [d.x, 0.06, d.z + CELL * 0.46];
    const prev = points.at(-1);
    if (prev && d.column === 0) {
      const outer = CELL * 4;
      points.push([outer, 0.06, prev[2]], [outer, 0.06, p[2] + CELL * 0.46],
        [-outer, 0.06, p[2] + CELL * 0.46], [-outer, 0.06, p[2]]);
    }
    points.push(p);
  }
  const last = points.at(-1)!;
  const extra = dateBlock(32);
  points.push([CELL * 4, 0.06, last[2]], [CELL * 4, 0.06, extra.z + CELL * 0.7],
    [extra.x - CELL * 0.8, 0.06, extra.z + CELL * 0.7]);
  const lengths = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  return { points, lengths, total: lengths.at(-1)! };
}

export const STREETS = makeStreets();

export function streetAt(p: number): Point3 {
  const dist = Math.min(1, Math.max(0, p)) * STREETS.total;
  for (let i = 1; i < STREETS.points.length; i++) {
    if (STREETS.lengths[i]! < dist) continue;
    const a = STREETS.points[i - 1]!, b = STREETS.points[i]!;
    const k = (dist - STREETS.lengths[i - 1]!) / (STREETS.lengths[i]! - STREETS.lengths[i - 1]!);
    return [lerp(a[0], b[0], k), 0.06, lerp(a[2], b[2], k)];
  }
  return [...STREETS.points.at(-1)!];
}

export function cityState(audio: AudioData, t: number, T: CityTimes) {
  const flightBeats = Math.max(1, beatsSince(audio, T.rise, T.start));
  const b = Math.max(0, beatsSince(audio, t, T.start));
  // Hold the start of each measured beat, then cover the next street segment quickly.
  const beat = Math.floor(b), phase = b - beat;
  const step = ease.inOutCubic(span(phase, 0.10, 0.88));
  const travel = Math.min(1, (beat + step) / flightBeats);
  const riseB = Math.max(0, beatsSince(audio, t, T.rise));
  const rising = t >= T.rise;
  const lift = rising ? ease.outBack(span(riseB, 0, 0.80), 1.4) : 0;
  return {
    travel, head: streetAt(travel),
    extrude: ease.outExpo(span(b, 0, 0.75)),
    // Exactly one fresh roof is accented on each beat; the route crosses all 31 dates.
    accented: Math.min(31, 1 + Math.floor(b + 1e-6)),
    visited: Math.min(31, 1 + Math.floor(travel * 30)),
    rising, lift,
    settle: ease.inOutCubic(span(riseB, 1, 2.4)),
    roof32: Math.max(0.025, dateBlock(32).height * lift),
  };
}
