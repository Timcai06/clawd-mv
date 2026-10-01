// Calendar geometry and musical cues; kept independent of DOM / GL for validation.
// v3 (2026-10-01): the sung "thirty-second" drives a day counter that runs 1 → 31 across the city
// (the cursor and Clawd follow it street by street, each roof lighting as the count passes);
// on the S04-2 downbeat the counter overflows to 32 and the impossible block erupts.
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import * as THREE from 'three';
import { ease, lerp } from '../../engine/util';
import { beatsSince, span, wordTime } from '../../kit/time';
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
  /** End of the sung "thirty-second": the counter reaches 31 here. */
  countEnd: number;
  /** Onset of the sung "October". */
  october: number;
}

const LINE = 'There’s a thirty-second day in October';

export function cityTimes(audio: AudioData, lyrics: Lyrics): CityTimes {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
  const cut = (id: string) => shots.find((s) => s.id === id)!.start;
  const line = lyrics.get('thirty-second day');
  const thirty = line.words.find((w) => w.w.toLowerCase().startsWith('thirty'))!;
  const october = wordTime(lyrics, LINE, 'October') ?? line.words.at(-1)!.start;
  return { start: cut('S04-1'), rise: cut('S04-2'), end: cut('S05-1'), countEnd: thirty.end, october };
}

export function dateBlock(day: number) {
  const slot = OCTOBER.firstWeekday + day - 1;
  const column = slot % 7, row = Math.floor(slot / 7);
  return {
    day, column, row,
    x: (column - 3) * CELL,
    z: -row * CELL,
    // Near-uniform blocks (the storyboard city); 32 towers over them.
    height: day === 32 ? 9.4 : 2.3 + (day % 3) * 0.16 + ((day * 7) % 5) * 0.06,
  };
}

export const DATES = Array.from({ length: 32 }, (_, i) => dateBlock(i + 1));
export type Point3 = [number, number, number];

// The cursor uses the streets, including the return lane at the end of each week.
// Every date is visited in order; no diagonal shortcut passes through a building.
export function makeStreets(): { points: Point3[]; lengths: number[]; total: number; dayAt: number[] } {
  const points: Point3[] = [];
  const dayIdx: number[] = [];
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
    dayIdx.push(points.length - 1);
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
  return { points, lengths, total: lengths.at(-1)!, dayAt: dayIdx.map((i) => lengths[i]!) };
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

/** Route progress (0..1 of the street length) at day `count` (1..31, fractional between days). */
export function travelAtCount(count: number): number {
  const c = Math.min(31, Math.max(1, count)), i = Math.floor(c) - 1, k = c - Math.floor(c);
  const a = STREETS.dayAt[i]!, b = STREETS.dayAt[Math.min(30, i + 1)]!;
  return lerp(a, b, k) / STREETS.total;
}

export function cityState(audio: AudioData, t: number, T: CityTimes) {
  const b = Math.max(0, beatsSince(audio, t, T.start));
  const rising = t >= T.rise;
  const riseB = Math.max(0, beatsSince(audio, t, T.rise));
  // The sung "thirty-second" counts the city: 1 → 31 between the cut and the end of the word.
  const count = 1 + 30 * ease.inOutCubic(span(t, T.start, T.countEnd));
  // Overflow: on the cut the counter clunks over to 32.
  const counter = rising ? 31 + ease.outBack(span(riseB, 0, 0.35), 2.2) : count;
  const lift = rising ? ease.outBack(span(riseB, 0, 0.80), 1.4) : 0;
  // After the overflow the cursor leaves the month along the return lane to the 32nd block.
  const travel = rising ? lerp(travelAtCount(31), 1, ease.inOutCubic(span(riseB, 0.2, 1.4))) : travelAtCount(count);
  return {
    travel, head: streetAt(travel), count, counter,
    extrude: ease.outExpo(span(b, 0, 0.6)),
    accented: Math.min(31, Math.floor(count + 1e-6)),
    visited: Math.min(31, Math.floor(count + 1e-6)),
    rising, lift,
    settle: ease.inOutCubic(span(riseB, 0, 4)),
    roof32: Math.max(0.025, dateBlock(32).height * lift),
  };
}

/** Camera yaw around the target (deg): the city is seen along its diagonal from the +x side. */
export const CAM_YAW = 90;

function orbit(target: THREE.Vector3, yaw: number, el: number, dist: number) {
  const y = Math.sin(el * Math.PI / 180) * dist, h = Math.cos(el * Math.PI / 180) * dist;
  return new THREE.Vector3(target.x + Math.sin(yaw * Math.PI / 180) * h, target.y + y, target.z + Math.cos(yaw * Math.PI / 180) * h);
}

/** Camera as a pure function of the state (seek-safe). Framing solved numerically against kf-S04. */
export function cameraAt(audio: AudioData, t: number, T: CityTimes, s: ReturnType<typeof cityState>) {
  if (s.rising) {
    // The storyboard frame: tower 32 right of centre at the end of the street, the month in front.
    const k = ease.outExpo(span(beatsSince(audio, t, T.rise), 0, 0.5));
    const target = new THREE.Vector3(-8.5, 1.5, -10);
    const dist = lerp(46, lerp(38, 34, s.settle), k);
    return { pos: orbit(target, CAM_YAW, 33, dist), target, fov: 38, roll: 0, shiftX: 0 };
  }
  // S04-1: the whole month from above on the right of the frame (lens shifted, the counter and the
  // line own the left), held for half a beat, then tipping down to an oblique while the count runs.
  // Poses solved numerically: every roof and the route stay inside x 780–1860, y 70–1030.
  const b = beatsSince(audio, t, T.start);
  const dive = ease.inOutCubic(span(b, 0.5, 2.8));
  const target = new THREE.Vector3(-1, 0, -7.2);
  return { pos: orbit(target, lerp(106, 100, dive), lerp(82, 44, dive), lerp(64, 54, dive)), target, fov: 32, roll: 0, shiftX: lerp(-575, -550, dive) };
}
