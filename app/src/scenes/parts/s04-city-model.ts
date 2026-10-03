// Calendar geometry and musical cues; kept independent of DOM / GL for validation.
// v3 (2026-10-01): the sung "thirty-second" drives a day counter that runs 1 → 31 across the city
// (the cursor and Clawd follow it street by street, each roof lighting as the count passes);
// on the S04-2 downbeat the counter overflows to 32 and the impossible block erupts.
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import * as THREE from 'three';
import { ease, lerp } from '../../engine/util';
import { afterBeats, beatsSince, span, wordTime } from '../../kit/time';
import { CALENDAR_MONTHS } from '../../kit/content';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import board from '../../../../storyboard/shots.json';
import { HANDOFF, type Prim, type Rect } from '../../kit/handoff';
import { clawdScreen05, platformTimes } from './s05-platform-model';

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
  /** C4 (docs/CUTS.md): Clawd's screen rect on S05's first frame; S04 parks its Clawd here. */
  clawdOut: Rect;
}

const LINE = 'There’s a thirty-second day in October';

export function cityTimes(audio: AudioData, lyrics: Lyrics): CityTimes {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
  const cut = (id: string) => shots.find((s) => s.id === id)!.start;
  const line = lyrics.get('thirty-second day');
  const thirty = line.words.find((w) => w.w.toLowerCase().startsWith('thirty'))!;
  const october = wordTime(lyrics, LINE, 'October') ?? line.words.at(-1)!.start;
  const P = platformTimes(audio, lyrics);
  return { start: cut('S04-1'), rise: cut('S04-2'), end: cut('S05-1'), countEnd: thirty.end, october,
    clawdOut: clawdScreen05(audio, lyrics, P.start, P) };
}

export function dateBlock(day: number) {
  const slot = OCTOBER.firstWeekday + day - 1;
  const column = slot % 7, row = Math.floor(slot / 7);
  return {
    day, column, row,
    x: day === 32 ? 11.55268 : (column - 3) * CELL,
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
    [extra.x, 0.06, extra.z + CELL * 0.7]);
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
export const CAM_YAW = -11.94314;
export const TOWER_BLOCK = 3.2;

function orbit(target: THREE.Vector3, yaw: number, el: number, dist: number) {
  const y = Math.sin(el * Math.PI / 180) * dist, h = Math.cos(el * Math.PI / 180) * dist;
  return new THREE.Vector3(target.x + Math.sin(yaw * Math.PI / 180) * h, target.y + y, target.z + Math.cos(yaw * Math.PI / 180) * h);
}

type CamPose = { pos: THREE.Vector3; target: THREE.Vector3; fov: number; roll: number; shiftX: number };

/** The storyboard frame (kf-S04): tower 32 right of centre at the end of the street, the month in front. */
const KF = { target: new THREE.Vector3(1.073035, 3.781747, -12.538682), yaw: CAM_YAW, el: 23.276285, dist: 27.081276, fov: 42.30002 };

/** Route head averaged over a short window of the count (a camera that follows without zigzagging). */
function smoothHead(t: number, T: CityTimes, audio: AudioData) {
  const acc = [0, 0, 0];
  for (let k = 0; k < 5; k++) {
    const h = streetAt(cityState(audio, t - k * 0.06, T).travel);
    acc[0] += h[0] / 5; acc[2] += h[2] / 5;
  }
  return new THREE.Vector3(acc[0], 0, acc[2]);
}

/** S04-1: the overhead plate (S03's calendar) tips and swings down over the city, chasing the count. */
function countCam(audio: AudioData, t: number, T: CityTimes): CamPose {
  const b = beatsSince(audio, t, T.start);
  const dive = ease.inOutCubic(span(b, 0.35, 1.9));
  const head = smoothHead(t, T, audio);
  const target = new THREE.Vector3(-1, 0, -7.2).lerp(new THREE.Vector3(head.x * 0.55 + 0.4, 0.6, head.z * 0.7 - 2.2), dive);
  // keeps drifting after the count lands (31): the city is never a still
  const drift = span(t, T.countEnd, T.rise);
  return {
    pos: orbit(target, lerp(106, CAM_YAW + 28 - 8 * drift, dive), lerp(82, 34 - 3 * drift, dive), lerp(64, 30 - 2 * drift, dive)),
    target, fov: lerp(32, 40, dive), roll: lerp(0, -0.04, dive), shiftX: lerp(-575, -380, dive),
  };
}

/** Camera as a pure function of time (seek-safe), continuous across the S04-1 → S04-2 cut. */
export function cameraAt(audio: AudioData, t: number, T: CityTimes, s: ReturnType<typeof cityState>): CamPose {
  if (!s.rising) return countCam(audio, t, T);
  // S04-2: the tower erupts and the camera is thrown up and back with it into the storyboard frame
  // (overshoot, spring settle), then a slow push toward the tower's foot through "October" and
  // "So I crack…", accelerating on the last beat into S05.
  const from = countCam(audio, T.rise, T);
  const rb = beatsSince(audio, t, T.rise);
  const k = ease.outBack(span(rb, 0, 1.1), 1.25);
  const last = ease.inCubic(span(t, afterBeats(audio, T.end, -1.5), T.end));
  const push = ease.inOutQuad(span(rb, 1.0, beatsSince(audio, T.end, T.rise))) ;
  const target = KF.target.clone().add(new THREE.Vector3(0.6 * push, -0.7 * push - 0.5 * last, 0.5 * push));
  const kfPos = orbit(target, KF.yaw + 5 * push, KF.el - 3 * push + 4 * last, KF.dist * (1 - 0.14 * push - 0.2 * last));
  const pos = from.pos.clone().lerp(kfPos, k);
  const tg = from.target.clone().lerp(target, Math.min(1, k));
  // the eruption kicks the camera upward for a moment
  pos.y += 1.6 * Math.exp(-rb * 3.2) * Math.sin(Math.min(rb, 1) * Math.PI);
  return { pos, target: tg, fov: lerp(from.fov, KF.fov, Math.min(1, k)), roll: lerp(from.roll, 0, Math.min(1, k)) + 0.012 * Math.sin(rb * 1.3), shiftX: lerp(from.shiftX, 0, Math.min(1, k)) };
}

export function projectionCamera(audio: AudioData, t: number, T: CityTimes) {
  const p = cameraAt(audio,t,T,cityState(audio,t,T)), cam = new THREE.PerspectiveCamera(p.fov,1920/1080,.1,300);
  cam.position.copy(p.pos); cam.up.set(Math.sin(p.roll),Math.cos(p.roll),0); cam.lookAt(p.target);
  if(p.shiftX)cam.setViewOffset(1920,1080,p.shiftX,0,1920,1080);
  cam.updateProjectionMatrix();cam.updateMatrixWorld();return cam;
}
export function projectCity(cam: THREE.Camera, p: Point3) {
  const v = new THREE.Vector3(...p).project(cam);return {x:(v.x*.5+.5)*1920,y:(.5-v.y*.5)*1080};
}
function bounds(points: {x:number;y:number}[], clip = true): Rect {
  const x = Math.max(clip?0:-Infinity,Math.min(...points.map(p=>p.x))),y=Math.max(clip?0:-Infinity,Math.min(...points.map(p=>p.y)));
  return {x,y,w:Math.min(clip?1920:Infinity,Math.max(...points.map(p=>p.x)))-x,h:Math.min(clip?1080:Infinity,Math.max(...points.map(p=>p.y)))-y};
}
export function cityBounds(audio: AudioData, t: number, T: CityTimes) {
  const cam=projectionCamera(audio,t,T),s=cityState(audio,t,T);
  const buildings=DATES.map((d,i)=>{
    const own=Math.min(1,Math.max(0,s.extrude*1.6-i/31*.6));
    const h=i===31?s.roof32:Math.max(.025,d.height*ease.outBack(own,1.3)),w=i===31?TOWER_BLOCK:BLOCK;
    return [-1,1].flatMap(x=>[-1,1].flatMap(z=>[0,h].map(y=>projectCity(cam,[d.x+x*w/2,y,d.z+z*w/2]))));
  });
  return {dominant:bounds(buildings.flat()),tower:bounds(buildings[31]!,false),clawd:clawdRect(audio,t,T)};
}
/** Incoming calendar is the same flat overhead plate for the cut's first beat. */
export function handoffIn(t: number, audio: AudioData, T: CityTimes) {
  return {...HANDOFF.month03,alpha:1-ease.inOutCubic(span(t,T.start,afterBeats(audio,T.start,1)))};
}
function stageClawd(audio: AudioData,t:number,T:CityTimes): Rect {
  const s=cityState(audio,t,T),cam=projectionCamera(audio,t,T);
  if(s.rising){
    const d=DATES[31]!,p=projectCity(cam,[d.x,0,d.z+TOWER_BLOCK/2]);
    return {x:p.x-70,y:p.y-60,w:102,h:60};
  }
  const p=projectCity(cam,[s.head[0],.62,s.head[2]]);return {x:p.x-48,y:p.y-30,w:96,h:30};
}
export function handoffOut(t: number,audio: AudioData,T:CityTimes) {
  const b=stageClawd(audio,t,T),k=ease.inOutCubic(span(t,afterBeats(audio,T.end,-1),T.end-0.1)),o=T.clawdOut;
  return {x:lerp(b.x,o.x,k),y:lerp(b.y,o.y,k),px:lerp(b.w/16,o.w/16,k)};
}
export function clawdRect(audio:AudioData,t:number,T:CityTimes):Rect {
  const b=stageClawd(audio,t,T),p=handoffOut(t,audio,T),k=ease.inOutCubic(span(t,afterBeats(audio,T.end,-1),T.end-0.1));
  return {x:p.x,y:p.y,w:p.px*16,h:lerp(b.h,T.clawdOut.h,k)};
}
/** C4: S04's Clawd (screen overlay, no camera). */
export function exitPrim04(audio: AudioData, t: number, T: CityTimes): Prim { return { kind: 'rect', ...clawdRect(audio, t, T) }; }
/** C3: the flat month S04 opens on (screen overlay), = S03's attachment. */
export function entryPrim04(): Prim { return { kind: 'rect', ...HANDOFF.month03 }; }
