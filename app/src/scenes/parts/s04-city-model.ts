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
import { HANDOFF, CUT, type Prim, type Rect } from '../../kit/handoff';

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
    extrude: span(b, 0, 2),
    accented: rising ? 32 : Math.min(31, Math.floor(count + 1e-6)),
    visited: Math.min(31, Math.floor(count + 1e-6)),
    rising, lift,
    settle: ease.inOutCubic(span(riseB, 0, 4)),
    roof32: dateBlock(32).height * lift,
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
function oldCameraAt(audio: AudioData, t: number, T: CityTimes, s: ReturnType<typeof cityState>): CamPose {
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

// V6 entry calibration: preserve the square city world, calibrate only the flat month projection.
import { Rig, mixCam, type Cam } from '../../kit/rig';
import { solvePoint, setCamera, projectedBounds } from './s05-print';
import { layoutPath, path3, writeHead, pathAt } from '../../kit/pathtext';
import { Voice } from '../../kit/lyric-moves';
export const GRID_CORNERS:Point3[]=[[-12.6,0,1.8],[12.6,0,1.8],[12.6,0,-16.2],[-12.6,0,-16.2]];
const plain=(c:CamPose):Cam=>({pos:{x:c.pos.x,y:c.pos.y,z:c.pos.z},tgt:{x:c.target.x,y:c.target.y,z:c.target.z},roll:c.roll,fov:c.fov});
export function cameraAt(audio:AudioData,t:number,T:CityTimes,s=cityState(audio,t,T)):CamPose & {shiftY:number;stretchX:number} {
  t=Math.min(t,T.end-1/60);s=cityState(audio,t,T);
  const old=oldCameraAt(audio,t,T,s),h=540/Math.tan(16*Math.PI/180)/(870/18),start:Cam={pos:{x:0,y:h,z:-7.2},tgt:{x:0,y:0,z:-7.2},roll:0,fov:32};
  const k=ease.inOutCubic(span(t,T.start,afterBeats(audio,T.start,2))),base=mixCam(start,plain(old),k);
  const end=T.end-1/60,last=afterBeats(audio,T.end,-1),u=span(t,last,end),d=DATES[31]!,roof=cityState(audio,t,T).roof32;
  const point={x:d.x,y:roof+.4,z:d.z};
  // A perspective solve moves the camera; Clawd's rectangle is its projected world size.
  const push=solvePoint(point,9/.16,{x:1204,y:440.5},KF.yaw*Math.PI/180,KF.el*Math.PI/180,KF.fov);
  const ex=ease.inCubic(u);
  if(t>=last){
    const pose=oldCameraAt(audio,last,T,cityState(audio,last,T)),r=new Rig();setCamera(r,{...plain(pose),offsetX:pose.shiftX});
    const d=DATES[31]!,roof=cityState(audio,last,T).roof32,q=r.proj(d.x,roof+.4,d.z)!;
    const c=solvePoint(point,lerp(6,9,ex)/.16,{x:lerp(q.x,1204,ex),y:lerp(q.y,440.5,ex)},KF.yaw*Math.PI/180,KF.el*Math.PI/180,KF.fov);
    return {pos:new THREE.Vector3(c.pos.x,c.pos.y,c.pos.z),target:new THREE.Vector3(c.tgt.x,c.tgt.y,c.tgt.z),fov:c.fov,roll:c.roll,shiftX:c.offsetX??0,shiftY:c.offsetY??0,stretchX:1};
  }
  return {pos:new THREE.Vector3(base.pos.x,base.pos.y,base.pos.z),target:new THREE.Vector3(base.tgt.x,base.tgt.y,base.tgt.z),fov:base.fov,roll:base.roll,
    shiftX:old.shiftX*k,shiftY:-45*(1-k),stretchX:lerp((1320/25.2)/(870/18),1,k)};
}
export function projectionCamera(audio: AudioData, t: number, T: CityTimes) {
  const p=cameraAt(audio,t,T),r=new Rig();setCamera(r,{...plain(p),offsetX:p.shiftX,offsetY:p.shiftY,stretchX:p.stretchX});const k=ease.inOutCubic(span(t,T.start,afterBeats(audio,T.start,2)));r.cam.up.set(0,k,-(1-k));r.cam.lookAt(p.target);r.cam.rotateZ(p.roll);r.cam.updateMatrixWorld(true);return r.cam;
}
export function cityRig(audio:AudioData,t:number,T:CityTimes){const r=new Rig();r.cam.copy(projectionCamera(audio,t,T));r.vp.multiplyMatrices(r.cam.projectionMatrix,r.cam.matrixWorldInverse);return r;}
export function projectCity(cam: THREE.Camera, p: Point3) {
  const v = new THREE.Vector3(...p).project(cam);return {x:(v.x*.5+.5)*1920,y:(.5-v.y*.5)*1080};
}
export function blockHeight(i:number,t:number,a:AudioData,T:CityTimes){const s=cityState(a,t,T);return i===31?s.roof32:(s.extrude===0?0:DATES[i]!.height*ease.outBack(Math.min(1,Math.max(0,s.extrude*1.6-i/31*.6)),1.3));}
export function cityBounds(audio: AudioData, t: number, T: CityTimes) {
  const r=cityRig(audio,t,T),buildings=DATES.map((d,i)=>{const h=blockHeight(i,t,audio,T),w=i===31?TOWER_BLOCK:BLOCK;return [-1,1].flatMap(x=>[-1,1].flatMap(z=>[0,h].map(y=>({x:d.x+x*w/2,y,z:d.z+z*w/2}))));});
  return {dominant:projectedBounds(r,buildings.flat(),true),tower:projectedBounds(r,buildings[31]!),clawd:clawdRect(audio,t,T)};
}
export function clawdRect(audio:AudioData,t:number,T:CityTimes):Rect {
  const s=cityState(audio,t,T),d=DATES[31]!,r=cityRig(audio,t,T),p=s.rising?{x:d.x,y:s.roof32+.4,z:d.z}:{x:s.head[0],y:.62,z:s.head[2]},q=r.proj(p.x,p.y,p.z)!;
  const px=.16*q.s;return {x:q.x-8*px,y:q.y-2.5*px,w:16*px,h:5*px};
}
export function handoffOut(t:number,a:AudioData,T:CityTimes){const b=clawdRect(a,t,T);return {x:b.x,y:b.y,px:b.w/16};}
export function handoffIn(t:number,a:AudioData,T:CityTimes){return {...entryPrim(t,a,T),alpha:0};}
export function entryPrim(t:number,a:AudioData,T:CityTimes):Prim {return {kind:'rect',...projectedBounds(cityRig(a,t,T),GRID_CORNERS.map(([x,y,z])=>({x,y,z})))};}
export function exitPrim(t:number,a:AudioData,T:CityTimes):Prim {return {kind:'rect',...clawdRect(a,t,T)};}
export function exitVelocity(t:number,a:AudioData,T:CityTimes){const h=1e-4,A=clawdRect(a,t-h,T),B=clawdRect(a,t+h,T);return {x:(B.x+B.w/2-A.x-A.w/2)/(2*h),y:(B.y+B.h/2-A.y-A.h/2)/(2*h),w:(B.w-A.w)/(2*h),h:(B.h-A.h)/(2*h)};}
export const CITY_GLSL=`vec3 dateCenter(float day) {float slot=4.0+day-1.0;return vec3(day==32.0?11.55268:(mod(slot,7.0)-3.0)*3.6,0.0,-floor(slot/7.0)*3.6);}`;
export function cursorAt(t:number,a:AudioData,T:CityTimes){const p=cityState(a,t,T).head,q=cityRig(a,t,T).proj(...p)!;return {x:q.x,y:q.y};}
export function streetVisible(P:{x:number;y:number;z:number},t:number,a:AudioData,T:CityTimes){
  const eye=cameraAt(a,t,T).pos,dir={x:eye.x-P.x,y:eye.y-P.y,z:eye.z-P.z};
  return !DATES.some((d,i)=>{const h=blockHeight(i,t,a,T),w=(i===31?TOWER_BLOCK:BLOCK)/2;if(h<=0)return false;
    let lo=0,hi=1;for(const [p,delta,min,max] of [[P.x,dir.x,d.x-w,d.x+w],[P.y,dir.y,0,h],[P.z,dir.z,d.z-w,d.z+w]]){if(Math.abs(delta!)<1e-12){if(p!<min!||p!>max!)return false;continue;}const A=(min!-p!)/delta!,B=(max!-p!)/delta!;lo=Math.max(lo,Math.min(A,B));hi=Math.min(hi,Math.max(A,B));if(hi<=lo)return false;}return hi>Math.max(lo,1e-4)&&lo<1;});
}
export function inverseTravel(a:AudioData,T:CityTimes){
  const table=Array.from({length:2049},(_,i)=>{const t=lerp(T.start,T.countEnd,i/2048);return {t,s:cityState(a,t,T).travel*STREETS.total};});
  return (s:number)=>{let lo=0,hi=table.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(table[m]!.s<s)lo=m;else hi=m;}const A=table[lo]!,B=table[hi]!;return lerp(A.t,B.t,Math.min(1,Math.max(0,(s-A.s)/Math.max(1e-12,B.s-A.s))));};
}
const lyricCache=new WeakMap<Lyrics,WeakMap<AudioData,WeakMap<CityTimes,ReturnType<typeof makeCityLyrics>>>>();
function makeCityLyrics(l:Lyrics,a:AudioData,T:CityTimes){const v=new Voice(l,a),words=l.get('thirty-second day').words,route=path3(STREETS.points.map(([x,y,z])=>({x,y,z}))),d=DATES[31]!;
  const lead=layoutPath(words.slice(0,2),{capH:.9,axes:w=>v.form(w,w.end).axes,upper:true});
  const count=layoutPath([words[2]!],{capH:1.1,axes:w=>v.form(w,w.end).axes,upper:true,notBefore:inverseTravel(a,T)});
  const day=layoutPath(words.slice(3,5),{capH:.75,axes:w=>v.form(w,w.end).axes,upper:true});
  return {lead,count,day,route,first:path3(route.pts.slice(0,3)),foot:path3([{x:d.x-TOWER_BLOCK/2,y:.02,z:d.z+TOWER_BLOCK/2+.08},{x:d.x+12,y:.02,z:d.z+TOWER_BLOCK/2+.08}]),october:words[5]!};
}
export function cityLyrics(l:Lyrics,a:AudioData,T:CityTimes){let audios=lyricCache.get(l);if(!audios){audios=new WeakMap();lyricCache.set(l,audios);}let times=audios.get(a);if(!times){times=new WeakMap();audios.set(a,times);}let hit=times.get(T);if(!hit){hit=makeCityLyrics(l,a,T);times.set(T,hit);}return hit;}
export function writeHeadAt(t:number,a:AudioData,l:Lyrics,T:CityTimes){const lay=cityLyrics(l,a,T),p=pathAt(lay.route,writeHead(lay.count.glyphs,t)),q=cityRig(a,t,T).proj(p.x,p.y,p.z)!;return {x:q.x,y:q.y};}
