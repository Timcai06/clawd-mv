// S10 v5: nineteen test reports as real glass slabs standing in a row, shattered into the same eight
// shards each that the 2D version used (glassTriangles), as rigid 3D prisms on ballistic paths — a
// pure function of t. One world for the GPU (geometry, light, print) and the CPU (camera, Clawd,
// composition tests). World units ≈ metres; ground y = 0; the row recedes to the right.
import type { AudioData } from '../../engine/audio';
import { clamp, ease, hash, lerp } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { Rig, orbitCam, mixCam, p3, type Cam, type P3 } from '../../kit/rig';
import type { X9Times } from '../s09-z-shared';
import { HANDOFF } from '../../kit/handoff';
import { glassTriangles, GLASS } from './s10-glass';

export const PLATES = 19;
export const PW = 1.7, PH = 6.2, TH = 0.07;
export const ROW_DIR = (() => { const x = 1.0, z = -1.2, L = Math.hypot(x, z); return p3(x / L, 0, z / L); })();
export const ROW_STEP = 1.45;
export const YAW = -0.15; // every plate turned toward the camera side
export const plateOrigin = (i: number): P3 => p3(ROW_DIR.x * ROW_STEP * i, 0, ROW_DIR.z * ROW_STEP * i);

/** Plate-local (x right, y up, z out of the face) → world. */
export function plateToWorld(i: number, l: P3): P3 {
  const o = plateOrigin(i), c = Math.cos(YAW), s = Math.sin(YAW);
  return p3(o.x + c * l.x + s * l.z, o.y + l.y, o.z - s * l.x + c * l.z);
}

/** Shard j of plate i: its triangle in plate-local units and its centroid. */
export function shardTri(i: number, j: number) {
  const tri = glassTriangles(i)[j]!;
  const pts = tri.map(([x, y]) => p3((x / GLASS.width - 0.5) * PW, (1 - y / GLASS.height) * PH, 0));
  const c = p3((pts[0]!.x + pts[1]!.x + pts[2]!.x) / 3, (pts[0]!.y + pts[1]!.y + pts[2]!.y) / 3, 0);
  return { pts, c };
}

/** Release time of plate i: the shattering runs down the row from the nearest plate. */
export const releaseAt = (T: X9Times, i: number) => T.shatter + i * 0.028;

/** Rigid motion of shard (i, j) at t: translation (world) and rotation (axis, angle) about its centroid. */
export function shardMotion(T: X9Times, i: number, j: number, t: number) {
  const age = t - releaseAt(T, i);
  if (age <= 0) return { d: p3(0, 0, 0), axis: p3(0, 0, 1), angle: 0, age: 0 };
  const id = i * 8 + j, { c } = shardTri(i, j);
  // outward from the impact point on the plate, up a little, and toward the camera
  const ox = c.x, oy = c.y - PH * 0.42, ol = Math.hypot(ox, oy) + 1e-3;
  const sp = 1.1 + 1.5 * hash(id, 3);
  const lv = p3((ox / ol) * sp, (oy / ol) * sp * 0.5 + 1.2 + 1.0 * hash(id, 4), 1.2 + 2.2 * hash(id, 5));
  const wv = plateToWorld(i, lv), o = plateToWorld(i, p3(0, 0, 0));
  const v = p3(wv.x - o.x, wv.y - o.y, wv.z - o.z);
  // gravity grows on the last beat: the glass drops out of the world into the rain (S11)
  const g = 13;
  const late = Math.max(0, t - (T.wallEnd - 0.75));
  const d = p3(v.x * age, v.y * age - 0.5 * g * age * age - 0.5 * 60 * late * late, v.z * age);
  const ax = p3(hash(id, 6) - 0.5, hash(id, 7) - 0.5, hash(id, 8) - 0.5), al = Math.hypot(ax.x, ax.y, ax.z) + 1e-4;
  return { d, axis: p3(ax.x / al, ax.y / al, ax.z / al), angle: (2 + 4 * hash(id, 9)) * age, age };
}

/** Rotate p about axis by angle (Rodrigues). */
export function rot(p: P3, a: P3, ang: number): P3 {
  const c = Math.cos(ang), s = Math.sin(ang), d = a.x * p.x + a.y * p.y + a.z * p.z;
  return p3(p.x * c + (a.y * p.z - a.z * p.y) * s + a.x * d * (1 - c),
    p.y * c + (a.z * p.x - a.x * p.z) * s + a.y * d * (1 - c),
    p.z * c + (a.x * p.y - a.y * p.x) * s + a.z * d * (1 - c));
}

/** Camera: a low tracking shot down the row while the reds stamp in; thrown wide on "shattering";
 *  on the last beat it rolls and tips down after the falling glass (S11 picks up the roll). */
export function cameraAt(audio: AudioData, t: number, T: X9Times): Cam {
  const along = (s: number, side: number, h: number) => {
    const o = p3(ROW_DIR.x * s, h, ROW_DIR.z * s), n = p3(-ROW_DIR.z, 0, ROW_DIR.x); // n: toward the camera side
    return { o, n, side };
  };
  const track = span(t, T.wallStart, T.shatter);
  const a = along(lerp(4, 11, ease.inOutQuad(track)), 0, 2.7);
  const yaw0 = Math.atan2(a.n.x, a.n.z);
  const tracking = orbitCam(a.o, yaw0 - 0.3, 0.08, 15.5 - 2.5 * track, 38, 0.02);
  const wide = orbitCam(p3(ROW_DIR.x * 9.0, 2.6, ROW_DIR.z * 9.0), yaw0 - 0.25, 0.1, 18, 40, 0.0);
  const k = ease.outExpo(span(t, T.shatter, afterBeats(audio, T.shatter, 0.6)));
  let c = mixCam(tracking, wide, k);
  // last beat: roll into the rain and tip down after the glass
  const fall = ease.inCubic(span(t, afterBeats(audio, T.wallEnd, -1), T.wallEnd));
  const down = orbitCam(p3(ROW_DIR.x * 6, -1.5, ROW_DIR.z * 6 + 2), yaw0 - 0.62, 0.55, 16, 46, HANDOFF.fall10.roll);
  c = mixCam(c, down, fall);
  // the impact
  const hit = t >= T.shatter ? Math.pow(0.5, (t - T.shatter) / 0.09) : 0;
  c.tgt = p3(c.tgt.x + 0.25 * hit * (hash(Math.round(t * 60), 1) - 0.5), c.tgt.y + 0.25 * hit * (hash(Math.round(t * 60), 2) - 0.5), c.tgt.z);
  return c;
}

/** When plate i's red X is stamped: one per step from "Nineteen", near to far, over three quarters of a beat. */
export const stampAt = (audio: AudioData, T: X9Times, i: number) => afterBeats(audio, T.nineteen, (i / 18) * 0.75);

const _rig = new Rig();
/** Screen bounds of the standing row (composition test) and of Clawd. */
export function rowBounds(audio: AudioData, t: number, T: X9Times) {
  _rig.set(cameraAt(audio, t, T));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < PLATES; i++) for (const x of [-PW / 2, PW / 2]) for (const y of [0, PH]) for (const z of [-TH, TH]) {
    const p = plateToWorld(i, p3(x, y, z)), q = _rig.proj(p.x, p.y, p.z);
    if (q) pts.push(q);
  }
  return box(pts);
}
export const CLAWD_AT = p3(ROW_DIR.x * 5.5 - ROW_DIR.z * 6.0, 0, ROW_DIR.z * 5.5 + ROW_DIR.x * 6.0);
export const CLAWD_VOX = 0.11;
/** Clawd turns to face the wide shot (yaw about +y). */
export const CLAWD_YAW = 0.8;
export function clawdBounds(audio: AudioData, t: number, T: X9Times) {
  _rig.set(cameraAt(audio, t, T));
  const v = CLAWD_VOX, pts: { x: number; y: number }[] = [];
  const c = Math.cos(CLAWD_YAW), sn = Math.sin(CLAWD_YAW);
  for (const x of [-8 * v, 8 * v]) for (const y of [0, 5 * v]) for (const z of [2 * v]) { // the front silhouette (as the storyboard measures it)
    const q = _rig.proj(CLAWD_AT.x + c * x + sn * z, CLAWD_AT.y + y, CLAWD_AT.z - sn * x + c * z); if (q) pts.push(q);
  }
  return box(pts);
}
function box(pts: { x: number; y: number }[]) {
  const x0 = clamp(Math.min(...pts.map((p) => p.x)), 0, 1920), x1 = clamp(Math.max(...pts.map((p) => p.x)), 0, 1920);
  const y0 = clamp(Math.min(...pts.map((p) => p.y)), 0, 1080), y1 = clamp(Math.max(...pts.map((p) => p.y)), 0, 1080);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
