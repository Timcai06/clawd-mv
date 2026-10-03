// One mathematical world: displaced wall, physical lamination, camera, actors and exit.
import * as THREE from 'three';
import type { AudioData } from '../../engine/audio';
import { clamp, ease, hash, springStep, lerp } from '../../engine/util';
import { CUT, HANDOFF, type Prim, type Pt } from '../../kit/handoff';
import { afterBeats, span } from '../../kit/time';
import { Rig, mixCam, orbitCam, p3, type Cam, type P3 } from '../../kit/rig';
import { collisionAt, implosionAt, type ChorusScore } from './s13-score';
import { lin } from '../../theme';

export const SLAB = { w: 7.2, h: 0.42, d: 2.4 } as const;
export const TOWER_X = 4.2, TOWER_Z = 3, BASE_SLABS = 20, CLAWD_VOX = 0.3;
export const LIGHT = p3(0.5, 0.7, 0.5);
// three's Lambert BRDF divides directional irradiance by PI.
export const KEY_INTENSITY = 0.88 * Math.PI * Math.hypot(LIGHT.x, LIGHT.y, LIGHT.z) / LIGHT.z;
export const BOUNCE_DIRECTION = p3(-1, 0.1, 0.22), BOUNCE_INTENSITY = 0.25;
export const CLAWD_FILL = 0.035;
export function lightTone(normal: P3, keyVisibility = 1): number {
  const dot = (a: P3, b: P3) => Math.max(0, (a.x*b.x+a.y*b.y+a.z*b.z)/Math.hypot(b.x,b.y,b.z));
  const clay = lin('clay'), luminance = clay[0]*0.2126+clay[1]*0.7152+clay[2]*0.0722;
  return clamp((KEY_INTENSITY * dot(normal, LIGHT) * keyVisibility + BOUNCE_INTENSITY * luminance * dot(normal, BOUNCE_DIRECTION)) / Math.PI);
}
export const WALL_SIZE = { w: 90, h: 80 };
export const WALLS = { w: 30, h: 40, d: 1.5 };
export const COMMIT_INSET = 0.18;
/** Lambert tone for the text planes, whose shader accepts a tone rather than three lights. */
export function frontLight(yaw: number): number {
  return lightTone(p3(Math.sin(yaw), 0, Math.cos(yaw)));
}
export function wallTone(x: number, y: number, t: number, T: ChorusScore, shadow = false): number {
  const g = T.lines[0]!.words.slice(0, 4).reduce((v, w, i) => {
    const q = wallRippleGradient(x, y, t-w.start, WORD_SLOTS[i]!); return p3(v.x+q.x,v.y+q.y,0);
  }, p3());
  const d = Math.hypot(g.x,g.y,1), n = p3(-g.x/d,-g.y/d,1/d);
  // Same shadow-floor irradiance used by the wall shader, after PCF visibility.
  return Math.max(0.18, lightTone(n, shadow ? 0 : 1));
}
export interface SlabPose { center: P3; height: number; yaw: number; scaleX: number; visible: boolean; index: number }
export function slabDistance(p: P3, h: P3): number {
  const x = Math.abs(p.x) - h.x, y = Math.abs(p.y) - h.y, z = Math.abs(p.z) - h.z;
  return Math.hypot(Math.max(x, 0), Math.max(y, 0), Math.max(z, 0)) + Math.min(Math.max(x, y, z), 0);
}
export function wallRipple(x: number, y: number, age: number, hit: P3): number {
  if (age < 0 || age >= 0.3) return 0;
  const r = Math.hypot(x - hit.x, y - hit.y);
  return -0.15 * Math.exp(-r * r) * Math.sin(Math.PI * age / 0.3) * Math.sin(8 * r - 28 * age);
}
export function wallRippleGradient(x: number, y: number, age: number, hit: P3): P3 {
  const h = 0.002;
  return p3((wallRipple(x + h, y, age, hit) - wallRipple(x - h, y, age, hit)) / (2 * h),
    (wallRipple(x, y + h, age, hit) - wallRipple(x, y - h, age, hit)) / (2 * h), 0);
}
// These functions are also injected into the actual wall displacement shader.
export const S13_GLSL = /* glsl */ `
const vec3 SLAB_HALF = vec3(3.6, 0.21, 1.2);
float slabDistance(vec3 p, vec3 h) {
  vec3 q = abs(p)-h;
  return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);
}
float wallRipple(vec2 p, float age, vec2 hit) {
  if (age < 0.0 || age >= 0.3) return 0.0;
  float r = length(p-hit);
  return -0.15*exp(-r*r)*sin(3.141592653589793*age/0.3)*sin(8.0*r-28.0*age);
}
vec2 wallRippleGradient(vec2 p, float age, vec2 hit) {
  float h = 0.002;
  return vec2(wallRipple(p+vec2(h,0.0),age,hit)-wallRipple(p-vec2(h,0.0),age,hit),
              wallRipple(p+vec2(0.0,h),age,hit)-wallRipple(p-vec2(0.0,h),age,hit))/(2.0*h);
}
vec3 onSlab(vec3 p, vec3 center, float yaw, float scaleX) {
  p.x *= scaleX;
  float c = cos(yaw), s = sin(yaw);
  return center+vec3(c*p.x+s*p.z,p.y,-s*p.x+c*p.z);
}
`;
export function onSlab(pose: SlabPose, p: P3): P3 {
  const x = p.x * pose.scaleX, c = Math.cos(pose.yaw), s = Math.sin(pose.yaw);
  return p3(pose.center.x + c * x + s * p.z, pose.center.y + p.y, pose.center.z - s * x + c * p.z);
}
export function sinkAt(t: number, T: ChorusScore): number {
  return T.slabs.reduce((sum, s) => sum + SLAB.h * ease.outCubic(span(t, s.at, s.at + s.duration)), 0);
}
export function settledTop(t: number, T: ChorusScore): number {
  return T.slabs.reduce((sum, s) => sum + (s.height - SLAB.h) * ease.outCubic(span(t, s.at, s.at + s.duration)), 0);
}
export function riseAt(t: number, T: ChorusScore): number {
  return -24 * (1 - ease.outCubic(span(t, T.commit1.start, T.hit1)));
}
export function TOP(t: number, T: ChorusScore): number {
  return riseAt(t, T) + T.slabs.filter(s => s.at <= t).reduce((sum, s) => sum + s.height, 0) - sinkAt(t, T);
}
export function slabJitter(audio: AudioData, t: number, i: number, T: ChorusScore) {
  if (t < T.throwing.start || t >= T.pickup2) return { x: 0, yaw: 0 };
  let x = 0, yaw = 0;
  for (const b of audio.beats) {
    if (b < T.throwing.start || b > t || t - b >= 0.3) continue;
    const k = 1 - springStep((t - b) / 0.3, 1.4, 0.82), n = Math.round(audio.beatAt(b));
    x += 0.25 * (hash(i, n) - 0.5) * k; yaw += 0.06 * (hash(i, n, 2) - 0.5) * k;
  }
  return { x, yaw };
}
export function fitsJump(audio: AudioData, t: number, letter: number, T: ChorusScore): number {
  return t < T.fits.start || t >= T.fits.end ? 0 : 0.3 * (hash(letter, Math.floor(audio.beatAt(t) * 8), 213) - 0.5);
}
export function cameraAt(audio: AudioData, time: number, T: ChorusScore): Cam {
  const t = Math.min(time, T.end - 0.1), top = settledTop(t, T);
  const a = orbitCam(p3(0, 1, 0), 0, -0.18, 25, 34);
  const b = orbitCam(p3(TOWER_X - 4.5, 0.7, TOWER_Z), 0, -0.18, 23, 34);
  const c = orbitCam(p3(TOWER_X, top + 1.0, TOWER_Z + 0.6), 0.05, 0.55, 9.15, 34);
  const d = orbitCam(p3(TOWER_X, top - 5.85, TOWER_Z), 0, 1.0, 21, 38);
  const e = orbitCam(p3(TOWER_X, top - 1.5, TOWER_Z), 0, -0.18, 21, 34);
  const fallDistance = 540 / (Math.tan(38 * Math.PI / 360) * (HANDOFF.fall13.pitch / SLAB.h));
  const f = orbitCam(p3(TOWER_X, top + 0.5, TOWER_Z + SLAB.d / 2), 0, 0, fallDistance, 38);
  let cam: Cam;
  if (t < T.commit1.start) cam = a;
  else if (t < T.fixes) cam = mixCam(a, b, ease.outCubic(span(t, T.commit1.start, T.hit1)));
  else if (t < T.tests) cam = mixCam(b, c, ease.inOutCubic(span(t, T.fixes, afterBeats(audio, T.fixes, 0.5))));
  else if (t < T.pickup2) cam = mixCam(c, d, ease.inOutCubic(span(t, T.tests, afterBeats(audio, T.tests, 1))));
  else if (t < T.split) cam = mixCam(d, e, ease.inOutCubic(span(t, T.pickup2, afterBeats(audio, T.pickup2, 0.5))));
  else cam = mixCam(e, f, ease.inOutCubic(span(t, T.split, afterBeats(audio, T.split, 0.5))));
  // Fix's first onset precedes the editorial cut by 22 ms; bit ends after the
  // next shot anchor. Solve the front-view hold over the actual sung interval.
  const fixStart = T.lines[1]!.words[0]!.start, fixEnd = T.lines[1]!.words.at(-1)!.end;
  if(t >= fixStart - 0.2 && t < fixEnd) cam = mixCam(b,c,ease.inOutCubic(span(t,fixStart-0.2,fixStart)));
  else if(t >= fixEnd && t < T.pickup2) cam = mixCam(c,d,ease.inOutCubic(span(t,fixEnd,afterBeats(audio,fixEnd,0.5))));
  // The four wall/body strikes push 3% toward the target and decay in 100 ms.
  let push = 0;
  for (const l of [T.lines[0]!, T.lines[3]!]) for (const w of l.words.slice(0, 4))
    if (t >= w.start) push = Math.max(push, 0.03 * Math.exp(-(t - w.start) / 0.1));
  if (time < T.end - 0.1) cam = { ...cam, pos: p3(cam.tgt.x + (cam.pos.x - cam.tgt.x) * (1 - push),
    cam.tgt.y + (cam.pos.y - cam.tgt.y) * (1 - push), cam.tgt.z + (cam.pos.z - cam.tgt.z) * (1 - push)) };
  return cam;
}
/** Ray/plane intersection, also used to tie the entry edge and implosion to measured screen positions. */
export function screenOnPlane(rig: Rig, x: number, y: number, z: number): P3 {
  const q = new THREE.Vector3(x / 960 - 1, 1 - y / 540, 0.5).unproject(rig.cam);
  const c = rig.cam.position, k = (z - c.z) / (q.z - c.z);
  return p3(c.x + (q.x - c.x) * k, c.y + (q.y - c.y) * k, z);
}
export function wallEdge(rig: Rig, t: number, audio: AudioData, T: ChorusScore) {
  const k = ease.outCubic(span(t, T.start + 1 / 60, afterBeats(audio, T.start, 0.75)));
  const a = screenOnPlane(rig, lerp(CUT.diag13.x0, 2600, k), 0, 0);
  const b = screenOnPlane(rig, lerp(CUT.diag13.x1, 2600, k), 1080, 0);
  const slope = (b.x - a.x) / (b.y - a.y);
  return { intercept: a.x - slope * a.y, slope };
}
export const WORD_SLOTS = [p3(-8.5, 3.7, 0), p3(0.5, 3.7, 0), p3(-8.5, -0.3, 0), p3(0.5, -0.3, 0)];
export function wallRecoil(t: number, T: ChorusScore): number {
  return t < T.hit2 ? 0 : -0.5 * (1 - clamp(springStep((t - T.hit2) / 0.3, 1.6, 0.72)));
}
export function wallDepth(x: number, y: number, t: number, T: ChorusScore): number {
  return wallRecoil(t, T) + T.lines[0]!.words.slice(0, 4).reduce((s, w, i) => s + wallRipple(x, y, t - w.start, WORD_SLOTS[i]!), 0);
}
/** Exact screen displacement along world y; keeps 140 px/beat under perspective rather than guessing a 2D speed. */
export function dropY(rig: Rig, p: P3, px: number): number {
  const q = rig.proj(p.x, p.y, p.z)!;
  const v = rig.vp.elements, ndc = 1 - 2 * (q.y + px) / 1080;
  const cy = v[1]! * p.x + v[9]! * p.z + v[13]!, cw = v[3]! * p.x + v[11]! * p.z + v[15]!;
  return (ndc * cw - cy) / (v[5]! - ndc * v[7]!);
}
export function tailTravel(audio: AudioData, t: number, T: ChorusScore): number {
  return Math.max(0, audio.beatAt(t) - audio.beatAt(afterBeats(audio, T.end, -1))) * HANDOFF.fall13.pxPerBeat;
}
export function slabPose(audio: AudioData, t: number, i: number, T: ChorusScore, rig?: Rig): SlabPose {
  const e = i < BASE_SLABS ? undefined : T.slabs[i - BASE_SLABS];
  const below = e ? T.slabs.slice(0, i - BASE_SLABS).reduce((sum, s) => sum + s.height, 0) : (i - BASE_SLABS) * SLAB.h;
  const height = e?.height ?? SLAB.h;
  const descent = e && t < e.at ? 8 * (1 - ease.inQuad(span(t, e.at - 0.1, e.at))) : 0;
  const j = slabJitter(audio, t, i, T);
  const center = p3(TOWER_X + j.x, below + height / 2 + riseAt(t, T) - sinkAt(t, T) + descent, TOWER_Z);
  if (rig && tailTravel(audio, t, T) > 0) center.y = dropY(rig, center, tailTravel(audio, t, T));
  return { center, height, yaw: j.yaw, scaleX: 1 - 0.7 * collisionAt(t, T),
    visible: !e || t >= (i === BASE_SLABS ? T.commit1.start : e.at - 0.1), index: i };
}
export function topIndex(t: number, T: ChorusScore): number {
  return BASE_SLABS - 1 + T.slabs.filter(s => s.at <= t).length;
}
export function clawdAt(audio: AudioData, t: number, T: ChorusScore, rig: Rig): P3 {
  const slab = slabPose(audio, t, topIndex(t, T), T, rig), p = onSlab(slab, p3(0, slab.height / 2, 0.25));
  const flight = Math.max(0, (t - T.machine.start - 0.12) / 0.08);
  return p3(p.x + flight * 1.2, p.y + 20 * flight + 9 * flight * flight, p.z);
}
/** Undefined actor yaw is chosen to keep the fixed 0.3-unit voxels below the C width limit. */
export function clawdYaw(audio: AudioData, t: number, T: ChorusScore): number {
  const start = T.lines[1]!.words[0]!.start, end = T.lines[1]!.words.at(-1)!.end;
  return 84*Math.PI/180 * ease.inOutCubic(span(t,start-.2,start)) * (1-ease.inOutCubic(span(t,end,afterBeats(audio,end,.5))));
}
/** On contact the full Voice sculpture is large; after settling it fits its 7.2-unit lamination. */
export function commitScale(t: number, event: number, width: number, T: ChorusScore): number {
  const s=T.slabs[event]!, fit=Math.min(1,SLAB.w/width);
  const start=Math.max(s.at+.1,s.words[0]!.end);
  return lerp(1,fit,ease.outCubic(span(t,start,start+s.duration)));
}
export function sideWallAt(t: number, local: boolean, T: ChorusScore): P3 {
  const onset = T.lines[4]!.words[0]!.start - 0.3;
  const arrive = ease.outCubic(span(t, onset, onset + 0.5)), crush = collisionAt(t, T);
  const sign = local ? -1 : 1;
  return p3(TOWER_X + sign * (19 + (1 - arrive) * 42 - crush * 2.92), settledTop(t, T) - 2, 4.5);
}
export function implosionPoint(rig: Rig, P14: Pt): P3 { return screenOnPlane(rig, P14.x, P14.y, 3); }
export function collapsePoint(p: P3, t: number, T: ChorusScore, anchor: P3): P3 {
  const k = 1 - implosionAt(t, T);
  return p3(anchor.x + (p.x - anchor.x) * k, anchor.y + (p.y - anchor.y) * k, anchor.z + (p.z - anchor.z) * k);
}
export function entryPrim(t: number, audio: AudioData, T: ChorusScore): Prim {
  const rig = new Rig(); rig.set(cameraAt(audio, t, T));
  const edge = wallEdge(rig, t, audio, T);
  const a = screenOnPlane(rig, CUT.diag13.x0, 0, 0), b = screenOnPlane(rig, CUT.diag13.x1, 1080, 0);
  const A = rig.proj(edge.intercept + edge.slope * a.y, a.y, 0)!, B = rig.proj(edge.intercept + edge.slope * b.y, b.y, 0)!;
  return { kind: 'line', x0: A.x, y0: A.y, x1: B.x, y1: B.y, w: 2 };
}
export function exitPrim(_t: number, P14: Pt): Prim { return { kind: 'point', ...P14, r: 8 }; }
