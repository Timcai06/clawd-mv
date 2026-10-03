// V6 G7: immutable formations, deterministic flights, and instanced hardware.
import * as THREE from 'three';
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import { W, H } from '../../engine/gl';
import { clamp, ease, frameIdx, hash, lerp } from '../../engine/util';
import { F, font } from '../../engine/type';
import { lin } from '../../theme';
import { engraveMaterial, setEngrave } from '../../kit/engrave-mat';
import { exitEnvelope, HANDOFF, type Prim } from '../../kit/handoff';
import { Rig, mixCam, orbitCam, p3, type Cam, type P3 } from '../../kit/rig';
import { afterBeats, span } from '../../kit/time';
import { fillRun, glyphPath, varRun } from '../../kit/vartype';
import { letterTimes, layoutPath, writeHead, type PathLayout } from '../../kit/pathtext';
import { Voice } from '../../kit/lyric-moves';
import { wallCam, wallDevices } from './s17-world';
import type { ReleaseTimes } from './s17-release-state';

export const PUNCH = { shakePx: 24, flipFrames: 4 } as const;
export const N = 1400, IMPACT_PX = PUNCH.shakePx, PITCH = 0.6;
export const DIFF_ROW_OFFSET = 4.6;
export type FormationName = 'SCREEN' | 'COMMIT' | 'DIFF' | 'DIFF_FIXED' | 'CHECK' | 'TWO_ROWS' | 'ONE_ROW' | 'SCATTER' | 'CLAWD';
export interface Device extends P3 { w: number; h: number; d: number; yaw: number; lit: number; color: 'clay' | 'pass' | 'fail'; pixel?: number; char?: string; warm?: number }
export interface Raster { width: number; height: number; alpha: number[]; mask: number[]; changed?: number[]; replacement?: number[] }
export type Rasters = Record<'COMMIT' | 'DIFF' | 'CHECK' | 'HASH', Raster>;
const unitDevice = (p: P3, lit = 0, color: Device['color'] = 'clay'): Device => ({ ...p, w: 0.48, h: 0.38, d: 0.55, yaw: 0, lit, color });

/** Actual Canvas coverage of shipped continuous Archivo; no approximate font metrics. */
export function rasterize(text: string, width: number, height: number, mono = false): Raster {
  const cv = document.createElement('canvas'); cv.width = width; cv.height = height;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  c.fillStyle = 'white';
  const rows = text.split('\n'), rh = height / rows.length;
  rows.forEach((row, i) => {
    if (mono) {
      c.font = font(F.mono(600), 100);
      const m = c.measureText(row), scale = Math.min((width - 2) / m.width, (rh - 2) / 75);
      c.save(); c.translate((width - m.width * scale) / 2, i * rh + rh - 1); c.scale(scale, scale); c.fillText(row, 0, 0); c.restore();
    } else {
      const run = varRun(row, 100, { wdth: 100, wght: 900 });
      const k = Math.min((width - 2) / run.width, (rh - 2) / run.capH);
      c.save(); c.translate((width - run.width * k) / 2, i * rh + (rh + run.capH * k) / 2); c.scale(k, k); fillRun(c, run, 0, 0); c.restore();
    }
  });
  const data = c.getImageData(0, 0, width, height).data;
  const alpha = Array.from({ length: width * height }, (_, i) => data[i * 4 + 3]! / 255);
  return { width, height, alpha, mask: alpha.flatMap((a, i) => a > 0.5 ? [i] : []) };
}
export function makeRasters(): Rasters {
  const diff = rasterize('- d <= days\n+ d < days', 90, 26);
  // Isolate exactly the '=' glyph in the original raster; same metrics, same baseline.
  const run = varRun('- d <= days', 100, { wdth: 100, wght: 900 });
  const k = Math.min(88 / run.width, 11 / run.capH), g = run.glyphs.find(g => g.ch === '=')!;
  const x0 = (90 - run.width * k) / 2 + g.x * k, x1 = x0 + g.adv * k;
  diff.changed = diff.mask.filter(i => i < 90 * 13 && i % 90 >= x0 && i % 90 < x1);
  const less = run.glyphs.find(g => g.ch === '<')!, lx = (90-run.width*k)/2 + less.x*k;
  diff.replacement = diff.mask.filter(i => i < 90*13 && i%90 >= lx && i%90 < lx+less.adv*k);
  // Archivo has no U+2713; the shipped Plex Mono has the actual check glyph.
  return { COMMIT: rasterize('COMMIT', 96, 20), DIFF: diff, CHECK: rasterize('✓', 40, 30, true), HASH: rasterize('f1x0c31', 56, 7, true) };
}
function grid(r: Raster, diff = false): Device[] {
  const lit = new Set(r.mask);
  // Sparse raster: every lit pixel has hardware; fill remaining budget with nearest dark pixels.
  const dark = r.alpha.map((_, i) => i).filter(i => !lit.has(i)).sort((a, b) => {
    const radius = (i: number) => Math.hypot(i % r.width - r.width / 2, Math.floor(i / r.width) - r.height / 2);
    return radius(a) - radius(b) || a - b;
  });
  if (r.mask.length > N) throw new Error('formation exceeds 1400 lit devices');
  const ds = [...r.mask, ...dark.slice(0, N - r.mask.length)].map(i => ({
    ...unitDevice(p3((i % r.width - (r.width - 1) / 2) * PITCH, ((r.height - 1) / 2 - Math.floor(i / r.width)) * PITCH + (diff ? (i < r.width*r.height/2 ? DIFF_ROW_OFFSET : -DIFF_ROW_OFFSET) : 0), 0), lit.has(i) ? 1 : 0,
      diff ? (i < r.width * r.height / 2 ? 'fail' : 'pass') : 'clay'), pixel: i,
  }));
  while (ds.length < N) { const i = ds.length; ds.push({ ...unitDevice(p3((i % 70 - 34.5) * PITCH, -12 - Math.floor(i / 70) * PITCH, -2)), pixel: -i - 1 }); }
  return ds;
}
const sort = (a: Device[]) => a.sort((a, b) => a.x - b.x || a.y - b.y || a.z - b.z);
export interface Swarm { formations: Record<FormationName, Device[]>; rasters: Rasters; zipper: number[]; free: number[]; pairs: Record<string, number[]> }
export function screenDevice(): Device {
  const s = 540 / Math.tan(34 * Math.PI / 360) / (5 - 0.275), b = HANDOFF.domino16;
  return { ...unitDevice(p3((b.x+b.w/2-960)/s,(540-b.y-b.h/2)/s,0),1,'pass'), w:b.w/s/0.86,h:b.h/s/0.82,d:0.55 };
}
export function buildSwarm(rasters: Rasters): Swarm {
  const screen = Array.from({ length: N }, (_, i) => i === 0
    ? screenDevice()
    : unitDevice(p3((i % 70 - 34.5) * PITCH, (Math.floor(i / 70) - 10) * PITCH, -2 - hash(i, 3) * 7)));
  // Each newly sung word owns a different nearby screen in the expanding rings.
  for(let i=1;i<4;i++) screen[i] = { ...screenDevice(), x:screen[0]!.x-i*1.5,y:screen[0]!.y+i*0.5,color:'clay' };
  const commit = sort(grid(rasters.COMMIT));
  const diff = sort(grid(rasters.DIFF, true));
  const changed = new Set(rasters.DIFF.changed);
  let replacement = 0;
  const fixed = diff.map(d => {
    if (!changed.has(d.pixel!)) return { ...d };
    const pixels = rasters.DIFF.replacement ?? [], p = pixels[replacement++ % pixels.length];
    return p === undefined ? { ...d, lit:0 } : { ...d, x:(p%90-44.5)*PITCH,y:(12.5-Math.floor(p/90))*PITCH+DIFF_ROW_OFFSET,z:0.002,lit:1 };
  });
  const check = sort(grid(rasters.CHECK).map(d => ({ ...d, color: 'pass' as const })));
  const text = Array.from('Merged to main,');
  const two = Array.from({ length: N }, (_, i) => {
    if (i < 80) return { ...unitDevice(p3((i % 40 - 19.5) * PITCH, i < 40 ? 1.2 : 0, 0), 1), char: undefined };
    return unitDevice(p3((i % 70 - 34.5) * PITCH, -4 - Math.floor(i / 70) * PITCH, -2));
  });
  const zipper = text.map((ch, i) => i < 6 ? i : i === 6 ? 40 : 41 + i - 7);
  zipper.forEach((id, i) => Object.assign(two[id]!, { x: (i - 7) * PITCH, y: i < 6 ? 1.2 : i === 6 ? -1.2 : 0, char: text[i], lit: text[i] === ' ' ? 0 : 1 }));
  const one = two.map(d => ({ ...d }));
  for (let i = 0; i < 80; i++) { one[i]!.x = (i - 39.5) * PITCH; one[i]!.y = 0; }
  zipper.forEach((id, i) => Object.assign(one[id]!, { x: (i - 7) * PITCH, char: text[i], lit: text[i] === ' ' ? 0 : 1 }));
  // Unused row devices keep the 80-device band without occupying the 15 text slots.
  const used = new Set(zipper); let extra = 0;
  for (let i = 0; i < 80; i++) if (!used.has(i)) one[i]!.x = (extra++ < 33 ? -8 - extra : 7 + extra - 33) * PITCH;
  for (const ds of [two, one]) for (let i=0;i<N;i++) if (!used.has(i)) { ds[i]!.y=-35-Math.floor(i/70)*PITCH; ds[i]!.lit=0; }
  const scatter = Array.from({ length: N }, (_, i) => {
    const y = 2 * hash(i, 31) - 1, a = hash(i, 32) * Math.PI * 2, r = 30 * Math.sqrt(1 - y * y);
    return unitDevice(p3(r * Math.cos(a), y * 30, r * Math.sin(a)), 1);
  });
  const free = scatter.map((d, i) => ({ i, z: d.z })).sort((a, b) => b.z - a.z).slice(0, 4).map(d => d.i);
  const wall = wallDevices().slice(0, N).map(d => ({ ...d, lit: d.lit ? 1 : 0, color: 'clay' as const }));
  const formations = { SCREEN: screen, COMMIT: commit, DIFF: diff, DIFF_FIXED: fixed, CHECK: check, TWO_ROWS: two, ONE_ROW: one, SCATTER: scatter, CLAWD: wall };
  const pairs: Record<string, number[]> = {};
  const order = (ds: Device[]) => ds.map((d, i) => ({ d, i })).sort((a,b) => a.d.x-b.d.x || a.d.y-b.d.y || a.i-b.i).map(p => p.i);
  for (const [a, b] of [['SCREEN','COMMIT'],['COMMIT','DIFF'],['DIFF_FIXED','CHECK'],['CHECK','TWO_ROWS'],['ONE_ROW','SCATTER'],['SCATTER','CLAWD']] as [FormationName,FormationName][]) {
    const A = order(formations[a]), B = order(formations[b]), pair: number[] = [];
    B.forEach((id, k) => { pair[id] = A[k]!; }); pairs[a+'>'+b] = pair;
  }
  return { rasters, zipper, free, formations, pairs };
}
export const formation = (sw: Swarm, name: FormationName) => sw.formations[name];
export function commitWidth(sw: Swarm): number {
  const ds=formation(sw,'COMMIT').filter(d=>d.lit);
  return Math.max(...ds.map(d=>d.x+d.w*0.43))-Math.min(...ds.map(d=>d.x-d.w*0.43));
}

/** CPU/GPU twin actually used by the front-face vertex shader (the body uses the same instance matrix). */
export function devicePoint(p: P3, center: P3, size: P3, yaw = 0): P3 {
  const x = p.x * size.x, z = p.z * size.z, c = Math.cos(yaw), s = Math.sin(yaw);
  return p3(center.x + c * x + s * z, center.y + p.y * size.y, center.z - s * x + c * z);
}
export const S17_WORLD_GLSL = `vec3 devicePoint(vec3 p, vec3 center, vec3 size, float yaw) {
  vec3 q=p*size; float c=cos(yaw), s=sin(yaw);
  return center+vec3(c*q.x+s*q.z,q.y,-s*q.x+c*q.z);
}`;
export function flight(a: Device, b: Device, i: number, k: number, arc = true): Device {
  if (k >= 1) return { ...b };
  if (k <= 0) return { ...a };
  return { ...b, x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) + (arc ? Math.sin(Math.PI * k) * (2 + 3 * hash(i, 8)) : 0),
    w: lerp(a.w, b.w, k), h: lerp(a.h, b.h, k), d: lerp(a.d, b.d, k), yaw: lerp(a.yaw, b.yaw, k) };
}
function transit(sw: Swarm, a: FormationName, b: FormationName, audio: AudioData, t: number, at: number, deadline?: number, scatter = false): Device[] {
  const A = formation(sw, a), B = formation(sw, b), beat = afterBeats(audio, at, 1) - at;
  const pair = sw.pairs[a+'>'+b];
  return B.map((target, i) => {
    const d = A[pair?.[i] ?? i]!;
    const dist = Math.min(1, Math.hypot(d.x, d.y) / 32), delay = (1 - dist) * 0.12 * beat;
    const start = at + delay, end = deadline ?? start + (0.5 + 0.4 * hash(i, 9)) * beat;
    const raw = span(t, start, end), k = scatter ? ease.outCubic(raw) : ease.inOutCubic(raw);
    const out = flight(d, target, i, k);
    out.lit = lerp(d.lit, target.lit, span(t, end - 0.08, end));
    return out;
  });
}
export function freezeWindow(audio: AudioData, T: ReleaseTimes) { const start = T.hit + 0.25; return { start, end: afterBeats(audio, start, 1) }; }
export function zipperShake(t:number,T:ReleaseTimes):number {
  let y=0;
  for(let slot=0;slot<=6;slot++){
    const age=t-(lerp(T.zipStart,T.zipEnd,slot/15)+0.15);
    if(age>=0 && age<0.12)y+=0.05*Math.exp(-32*age)*Math.cos(85*age);
  }
  return y;
}
export function devicesAt(sw: Swarm, audio: AudioData, lyrics: Lyrics, t: number, T: ReleaseTimes): Device[] {
  const R = T.release, hook = lyrics.get('I need one last commit'), merge = lyrics.get('Merged to main, and now we’re free');
  const at = (i: number) => R[i]!.start;
  if (t < hook.words[4]!.start) return formation(sw, 'SCREEN').map((d, i) => ({ ...d, lit: i < 4 && t >= hook.words[i]!.start ? 1 : 0, warm:span(t,at(0),afterBeats(audio,at(0),0.3)),color:'pass' }));
  if (t < at(2)) {
    const ds = transit(sw, 'SCREEN', 'COMMIT', audio, t, hook.words[4]!.start, T.hit);
    const ign = span(t, T.hit, T.hit + 2 / 60);
    return ds.map(d => ({ ...d, lit: d.lit * ign }));
  }
  if (t < at(4)) {
    const ds = transit(sw, 'COMMIT', 'DIFF', audio, t, at(2));
    if (t < at(3)) return ds;
    const A = formation(sw, 'DIFF'), B = formation(sw, 'DIFF_FIXED'), k = ease.inOutCubic(span(t, at(3), at(3) + 0.12));
    return A.map((d, i) => d.x === B[i]!.x ? { ...d } : { ...flight(d, B[i]!, i, k, false), lit: k < 0.5 ? d.lit * (1 - k * 2) : B[i]!.lit * (k * 2 - 1) });
  }
  if (t < at(5)) return transit(sw, 'DIFF_FIXED', 'CHECK', audio, t, at(4));
  if (t < at(6)) {
    const ds = transit(sw, 'CHECK', 'TWO_ROWS', audio, t, at(5));
    const from = merge.words[1]!.start, to = merge.words[2]!.end;
    const progress = span(t, from, to);
    // Lower main row stays fixed; zipper inserts branch letters exactly when its head passes.
    sw.zipper.forEach((id, slot) => {
      const start = lerp(from, to, slot / 15), k = ease.inQuad(span(t, start, start + 0.15));
      if (slot <= 6 && progress > 0) ds[id] = flight(formation(sw, 'TWO_ROWS')[id]!, formation(sw, 'ONE_ROW')[id]!, id, k, false);
    });
    const slots = new Set(sw.zipper);
    for(let id=0;id<80;id++) if(!slots.has(id) && t>=from) {
      const start=lerp(from,to,id/80), k=ease.inQuad(span(t,start,start+0.15));
      ds[id]=flight(formation(sw,'TWO_ROWS')[id]!,formation(sw,'ONE_ROW')[id]!,id,k,false);
    }
    const shake=zipperShake(t,T);
    for(let id=0;id<80;id++)if(Math.abs(ds[id]!.y)<0.2)ds[id]={...ds[id]!,y:ds[id]!.y+shake};
    if (t >= to + 0.15) return formation(sw, 'ONE_ROW').map(d => ({ ...d }));
    return ds;
  }
  if (t < lyrics.get('And it works on every machine').start) return transit(sw, 'ONE_ROW', 'SCATTER', audio, t, at(6), merge.words[6]!.end, true);
  return transit(sw, 'SCATTER', 'CLAWD', audio, t, lyrics.get('And it works on every machine').start, at(7));
}

const distForWidth = (width: number, pixels: number, fov = 34) => width * 540 / (pixels * Math.tan(fov * Math.PI / 360));
const diffLayouts=new WeakMap<Lyrics,{audio:AudioData;branch:PathLayout;main:PathLayout}>();
export function diffHead(audio:AudioData,lyrics:Lyrics,t:number):P3 {
  let layouts=diffLayouts.get(lyrics);
  const words=lyrics.get('Pull request, and that is it').words;
  if(!layouts || layouts.audio!==audio) {
    const voice=new Voice(lyrics,audio),o={capH:1.7,axes:(w:(typeof words)[number])=>voice.form(w,w.end).axes};
    layouts={audio,branch:layoutPath(words.slice(0,2),o),main:layoutPath(words.slice(2),o)};diffLayouts.set(lyrics,layouts);
  }
  const main=t>=words[2]!.start,layout=main?layouts.main:layouts.branch;
  return p3(-layout.s1/2+writeHead(layout.glyphs,t),main?0.6-DIFF_ROW_OFFSET:8.4+DIFF_ROW_OFFSET,0.3);
}
export function cameraAt(audio: AudioData, lyrics: Lyrics, t: number, T: ReleaseTimes): Cam {
  const R = T.release, at = (i: number) => R[i]!.start, hook = lyrics.get('I need one last commit'), freeze = freezeWindow(audio, T);
  if (t >= freeze.start && t <= freeze.end) t = freeze.start;
  if (exitEnvelope(t, T.tomorrow[0]!.start).still) t = T.tomorrow[0]!.start - 0.1;
  if (t < at(0) + 1 / 60) t = at(0);
  // Four 2.2 pulls and a 90%-width raster require a narrower final fov; fov is unspecified.
  const finalDistance = 5 * 2.2 ** 4 + 2;
  const finalFov = 2 * Math.atan((T.commitWidth ?? 57.48) * 540 / (1728 * (finalDistance - 0.275))) * 180 / Math.PI;
  const front = orbitCam(p3(), 0, 0, finalDistance, finalFov);
  if (t < at(2)) {
    let distance = 5;
    hook.words.slice(0, 4).forEach((w,i) => { const start=i ? w.start : w.start+1/60; distance *= 1 + 1.2 * ease.outExpo(span(t, start, start + 0.25)); });
    // First cut is the source screen, before the first word's pull has begun.
    return mixCam(orbitCam(p3(), 0, 0, distance, 34), front, ease.inOutCubic(span(t, hook.words[4]!.start, T.hit)));
  }
  if (t < at(4)) {
    const b=T.framing?.DIFF ?? {x:-26,y:-12.2,w:52,h:24.4};
    const close=ease.outExpo(span(t,at(3),at(3)+0.25));
    const px=lerp(1536,1728,close), scale=px/b.w;
    const room=(1920-px)/2-60;
    const head=diffHead(audio,lyrics,t).x;
    return orbitCam(p3(b.x+b.w/2+clamp(head*(1-close)-5*close,-room/scale,room/scale),b.y+b.h/2,0),0,0,distForWidth(b.w,px)+0.275,34);
  }
  if (t < at(5)) return checkCamera(T);
  if (t < at(6)) {
    const b=T.framing?.TWO_ROWS ?? {x:-4.44,y:-0.19,w:8.88,h:1.58};
    const distance=distForWidth(b.w,1728)+0.275;
    const settle=ease.inOutCubic(span(t,T.zipEnd,T.zipEnd+0.15));
    return orbitCam(p3(b.x+b.w/2,lerp(b.y+b.h/2,0,settle),0),0,0,distance,34);
  }
  if (t < at(7)) return orbitCam(p3(), 0, 0, lerp(26, 92, ease.outCubic(span(t, at(6), at(7)))), 40);
  const every = lyrics.get('And it works on every machine').words[4]!.start;
  return wallCam(span(t, every, afterBeats(audio, R.at(-1)!.end, -0.4)));
}
export function impactAt(t: number, T: ReleaseTimes) {
  const age = Math.max(0, t - T.hit), active = t >= T.hit && t < T.hit + 0.25;
  const k = active ? Math.exp(-age * 20) : 0, frame = frameIdx(t);
  return { shake: [Math.cos(frame * 2.4) * IMPACT_PX * k, Math.sin(frame * 1.9) * IMPACT_PX * k] as [number, number], zoom: 1 + 0.06 * k, invert: 0 };
}
export const paletteFlipped = (t:number,T:ReleaseTimes) => t>=T.hit && t<T.hit+PUNCH.flipFrames/60;
export function deviceBounds(ds:Device[],cam?:Cam) {
  const rig=cam?new Rig():null;if(rig&&cam)rig.set(cam);
  const ps=ds.filter(d=>d.lit>0).flatMap(d=>[-0.5,0.5].flatMap(x=>[-0.5,0.5].flatMap(y=>[-0.5,0.5].map(z=>{
    const p=devicePoint(p3(x,y,z),d,p3(d.w,d.h,d.d),d.yaw);return rig?rig.proj(p.x,p.y,p.z)!:p;
  }))));
  const x=Math.min(...ps.map(p=>p.x)),y=Math.min(...ps.map(p=>p.y));
  return {x,y,w:Math.max(...ps.map(p=>p.x))-x,h:Math.max(...ps.map(p=>p.y))-y};
}
export function configureFraming(sw:Swarm,T:ReleaseTimes) {
  T.commitWidth=commitWidth(sw);
  T.framing=Object.fromEntries(['COMMIT','DIFF','CHECK','TWO_ROWS','ONE_ROW'].map(n=>[n,deviceBounds(formation(sw,n as FormationName))]));
  T.checkCorners=formation(sw,'CHECK').filter(d=>d.lit).flatMap(d=>[-.5,.5].flatMap(x=>[-.5,.5].flatMap(y=>[-.5,.5].map(z=>devicePoint(p3(x,y,z),d,p3(d.w,d.h,d.d),d.yaw)))));
}
const checkCameras=new WeakMap<ReleaseTimes,{points:ReleaseTimes['checkCorners'];cam:Cam}>();
export function checkCamera(T:ReleaseTimes):Cam {
  const cached=checkCameras.get(T);if(cached&&cached.points===T.checkCorners)return cached.cam;
  const b=T.framing?.CHECK ?? {x:-6.54,y:-8.29,w:13.08,h:16.58};
  const points=T.checkCorners??[b.x,b.x+b.w].flatMap(x=>[b.y,b.y+b.h].flatMap(y=>[-.275,.275].map(z=>p3(x,y,z))));
  const rig=new Rig(),pitch=.72;
  let distance=distForWidth(b.w,870),cx=b.x+b.w/2,cy=b.y+b.h/2,cam:Cam;
  for(let i=0;i<24;i++){
    cam=orbitCam(p3(cx,cy,0),0,pitch,distance,34);rig.set(cam);
    const ps=points.map(p=>rig.proj(p.x,p.y,p.z)!),x0=Math.min(...ps.map(p=>p.x)),x1=Math.max(...ps.map(p=>p.x)),
      y0=Math.min(...ps.map(p=>p.y)),y1=Math.max(...ps.map(p=>p.y));
    const scale=rig.proj(b.x+b.w/2,b.y+b.h/2,0)!.s;
    distance*=(x1-x0)/880;
    cx+=((x0+x1)/2-500)/scale;cy-=((y0+y1)/2-540)/(scale*Math.cos(pitch));
  }
  const result=orbitCam(p3(cx,cy,0),0,pitch,distance,34);
  checkCameras.set(T,{points:T.checkCorners,cam:result});return result;
}
export function commentPose(cam:Cam,tilt:number) {
  const rig=new Rig();rig.set(cam);
  const screenPoint=(x:number,y:number)=>{
    const q=new THREE.Vector3(x/960-1,1-y/540,.5).unproject(rig.cam),p=rig.cam.position,k=(.1-p.z)/(q.z-p.z);
    return p3(p.x+(q.x-p.x)*k,p.y+(q.y-p.y)*k,.1);
  };
  const center=screenPoint(1380,540),scale=rig.proj(center.x,center.y,.1)!.s;
  const height=Math.min(8,500/scale);
  let lo=1,hi=40;
  for(let i=0;i<30;i++){
    const width=(lo+hi)/2,ps=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>{
      const py=y*height/2,pz=z*.09;return rig.proj(center.x+x*width/2,center.y+py*Math.cos(tilt)-pz*Math.sin(tilt),.1+py*Math.sin(tilt)+pz*Math.cos(tilt))!;
    })));
    const min=Math.min(...ps.map(p=>p.x)),max=Math.max(...ps.map(p=>p.x));
    if(max-min<860)lo=width;else hi=width;
  }
  return {...center,width:(lo+hi)/2,height};
}
export function commentBounds(cam:Cam,tilt:number) {
  const rig=new Rig();rig.set(cam);const pose=commentPose(cam,tilt);
  const ps=[-1,1].flatMap(x=>[-1,1].flatMap(y=>[-1,1].map(z=>{
    const py=y*pose.height/2,pz=z*0.09;
    return rig.proj(pose.x+x*pose.width/2,pose.y+py*Math.cos(tilt)-pz*Math.sin(tilt),pose.z+py*Math.sin(tilt)+pz*Math.cos(tilt))!;
  })));
  const x=Math.min(...ps.map(p=>p.x)),y=Math.min(...ps.map(p=>p.y));
  return {x,y,w:Math.max(...ps.map(p=>p.x))-x,h:Math.max(...ps.map(p=>p.y))-y};
}
export function screenBounds(d: Device, cam: Cam) {
  const rig = new Rig(); rig.set(cam);
  const points = [-0.43, 0.43].flatMap(x => [-0.41, 0.41].map(y => {
    const p = devicePoint(p3(x, y, 0.5), d, p3(d.w, d.h, d.d), d.yaw); return rig.proj(p.x, p.y, p.z)!;
  }));
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, w: Math.max(...points.map(p => p.x)) - x, h: Math.max(...points.map(p => p.y)) - y };
}
export function commentWidth(cam: Cam, tilt: number): number {
  return commentPose(cam,tilt).width;
}
export function commentLine(widths:number[],panelWidth:number,center=17) {
  const gap=0.35,total=widths.reduce((a,b)=>a+b,0)+gap*(widths.length-1),scale=Math.min(1,panelWidth*0.8/total);
  let x=center-total*scale/2;
  return {scale,x:widths.map(w=>{const center=x+w*scale/2;x+=(w+gap)*scale;return center;})};
}
export function entryPrim(t: number, audio: AudioData, lyrics: Lyrics, T: ReleaseTimes): Prim {
  // Cut window is held for 1/60 s; the render uses the same held camera and screen.
  const at = T.release[0]!.start;
  return { kind: 'rect', ...screenBounds(screenDevice(), cameraAt(audio, lyrics, Math.min(t, at), T)) };
}
export function screenPoints(): { x: number; y: number }[] {
  const r = new Rig(); r.set(wallCam(1));
  return wallDevices().filter(d => d.echo === 0 && d.lit).map(d => r.proj(d.x, d.y, d.z + d.d / 2)!).map(p => ({ x: p.x, y: p.y }));
}
export const exitPrim = (_t: number): Prim => ({ kind: 'points', pts: screenPoints() });

export class SwarmMesh {
  scene = new THREE.Scene(); rig = new Rig(); body: THREE.InstancedMesh; screens: THREE.InstancedMesh;
  private matrix = new THREE.Matrix4(); private pos = new THREE.Vector3(); private scale = new THREE.Vector3(); private q = new THREE.Quaternion();
  private bodyMaterial = engraveMaterial({ paper: lin('paper'), ink: lin('ink'), angle: 0.6, pitch: 5 });
  private atlas: THREE.CanvasTexture;
  private screenMaterial = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3,
    vertexShader: `precision highp float; in vec3 position; in vec2 uv; in mat4 instanceMatrix; in vec3 instanceColor;
      uniform mat4 projectionMatrix,modelViewMatrix; out vec3 vC; out vec2 vUv; ${S17_WORLD_GLSL}
      void main(){vC=instanceColor;vUv=uv;vec3 p=devicePoint(position,vec3(0),vec3(1),0.0);gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(p,1);}`,
    fragmentShader: `precision highp float; in vec3 vC; in vec2 vUv; out vec4 fragColor;
      uniform sampler2D atlas;uniform float flashWord,flashK,flashProg;uniform vec3 paper;
      void main(){vec4 tx=texture(atlas,vec2((vUv.x+flashWord)/4.0,vUv.y));
      float a=tx.a*step(tx.g,flashProg)*flashK;fragColor=vec4(mix(vC,paper,a),1);}`,
    uniforms:{atlas:{value:null},flashWord:{value:0},flashK:{value:0},flashProg:{value:0},paper:{value:new THREE.Vector3(...lin('paper'))}},toneMapped: false });
  constructor() {
    const cv=document.createElement('canvas');cv.width=1024;cv.height=192;const c=cv.getContext('2d')!;
    ['I','need','one','last'].forEach((word,i)=>{
      const run=varRun(word,100,{wdth:100,wght:900}),k=Math.min(200/run.width,80/run.capH);
      c.save();c.translate(i*256+(256-run.width*k)/2,(192+run.capH*k)/2);c.scale(k,k);
      for(const g of run.glyphs){c.fillStyle=`rgb(255,${Math.round(g.i/word.length*255)},0)`;c.save();c.translate(g.x,0);c.fill(glyphPath(run,g));c.restore();}c.restore();
    });
    this.atlas=new THREE.CanvasTexture(cv);this.atlas.colorSpace=THREE.NoColorSpace;this.screenMaterial.uniforms.atlas!.value=this.atlas;
    this.body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.bodyMaterial, N);
    this.screens = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.86, 0.82), this.screenMaterial, N);
    this.screens.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.body.frustumCulled = this.screens.frustumCulled = false;
    const L = new THREE.DirectionalLight(0xffffff, 1); L.position.set(-0.5, 0.6, 0.62);
    this.scene.add(this.body, this.screens, L, new THREE.AmbientLight(0xffffff, 0.12));
  }
  update(ds: Device[], cam: Cam, visible = N, flipped = false) {
    setEngrave(this.bodyMaterial,{paper:lin(flipped?'ink':'paper'),ink:lin(flipped?'paper':'ink')});
    (this.screenMaterial.uniforms.paper!.value as THREE.Vector3).set(...lin(flipped?'ink':'paper'));
    this.rig.set(cam); this.body.count = this.screens.count = visible;
    const color = new THREE.Color(), ink = lin(flipped?'paper':'ink');
    for (let i = 0; i < visible; i++) {
      const d = ds[i]!; this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw);
      if(flipped&&d.lit===0){this.matrix.makeScale(0,0,0);this.body.setMatrixAt(i,this.matrix);this.screens.setMatrixAt(i,this.matrix);continue;}
      this.pos.set(d.x, d.y, d.z); this.scale.set(d.w, d.h, d.d); this.matrix.compose(this.pos, this.q, this.scale); this.body.setMatrixAt(i, this.matrix);
      const p = devicePoint(p3(0, 0, 0.501), d, p3(d.w, d.h, d.d), d.yaw);
      this.pos.set(p.x, p.y, p.z); this.scale.set(d.w, d.h, 1); this.matrix.compose(this.pos, this.q, this.scale); this.screens.setMatrixAt(i, this.matrix);
      const rgb = lin(flipped?'paper':d.color).map((c,i)=>d.warm===undefined?c:lerp(c,lin('clay')[i]!,d.warm)) as [number,number,number]; color.setRGB(...rgb, THREE.LinearSRGBColorSpace).multiplyScalar(d.lit).add(new THREE.Color().setRGB(...lin('ink')).multiplyScalar(1 - d.lit)); this.screens.setColorAt(i, color);
    }
    this.body.instanceMatrix.needsUpdate = this.screens.instanceMatrix.needsUpdate = true; this.screens.instanceColor!.needsUpdate = true;
  }
  flash(words: ReturnType<Lyrics['get']>['words'], t:number) {
    let i=0;words.slice(0,4).forEach((w,j)=>{if(t>=w.start)i=j;});const w=words[i]!,times=letterTimes(w),u=this.screenMaterial.uniforms;
    u.flashWord!.value=i;u.flashK!.value=t>=w.start && t<words[4]!.start?Math.max(0,1-(t-w.start)/0.25):0;
    u.flashProg!.value=span(t,w.start,times.at(-1)!.t1);
  }
  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget) { r.setRenderTarget(out); r.clearDepth(); r.render(this.scene, this.rig.cam); }
  dispose() { this.body.geometry.dispose(); this.screens.geometry.dispose(); this.bodyMaterial.dispose(); this.screenMaterial.dispose(); this.atlas.dispose(); }
}
