// S15 v5: the ≤ as a real solid (raymarched SDF), one world shared by the GPU (shape, light,
// engraving) and the CPU (camera, carved words, Clawd, sparks, composition tests) — pdoom loss.ts's
// "JS + GLSL twins" method. World units ≈ metres, y up, the monument faces +z (the camera side).
import type { AudioData } from '../../engine/audio';
import { clamp, ease, lerp } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { Rig, orbitCam, mixCam, p3, type Cam, type P3 } from '../../kit/rig';
import type { FTimes } from './s15-f-timing';

// ---- geometry (twins in GLSL below) ----
export const TIP = p3(-4.8, 3.05, 0);
export const UPPER_END = p3(7.4, 8.2, 0);
export const LOWER_END = p3(6.6, 1.55, 0);
export const BEAM_HW = 0.62; // half width of a stroke (in the xy plane, across the stroke)
export const DEPTH_HZ = 0.62; // half depth (z)
export const BAR_C = p3(0.6, 0.48, 0); // the equal stroke (lying on the ground)
export const BAR_H = p3(6.7, 0.48, 0.95);
export const CUT_X = -1.6; // where Clawd snips the bar

const f = (n: number) => n.toFixed(4);
export const S15_GLSL = /* glsl */ `
const vec3 TIP = vec3(${f(TIP.x)}, ${f(TIP.y)}, 0.0);
const vec3 UEND = vec3(${f(UPPER_END.x)}, ${f(UPPER_END.y)}, 0.0);
const vec3 LEND = vec3(${f(LOWER_END.x)}, ${f(LOWER_END.y)}, 0.0);
const float HW = ${f(BEAM_HW)}, HZ = ${f(DEPTH_HZ)};
const vec3 BARC = vec3(${f(BAR_C.x)}, ${f(BAR_C.y)}, 0.0), BARH = vec3(${f(BAR_H.x)}, ${f(BAR_H.y)}, ${f(BAR_H.z)});
const float CUTX = ${f(CUT_X)};
uniform vec3 barT; uniform float barRoll, gap, scale;
float sdBoxW(vec3 p, vec3 b) { vec3 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0); }
// a stroke from a to b (in xy), square-ended, width 2*HW, depth 2*HZ
float sdStroke(vec3 p, vec3 a, vec3 b) {
  vec2 d = b.xy - a.xy; float L = length(d); vec2 u = d / L, n = vec2(-u.y, u.x);
  vec2 q = p.xy - a.xy;
  return sdBoxW(vec3(dot(q, u) - 0.5 * L, dot(q, n), p.z), vec3(0.5 * L, HW, HZ));
}
float sdChevron(vec3 p) {
  // the two strokes share the tip; a mitre cap fills the outer corner
  float a = sdStroke(p, TIP + normalize(TIP - UEND) * HW * 0.9, UEND);
  float b = sdStroke(p, TIP + normalize(TIP - LEND) * HW * 0.9, LEND);
  return min(a, b);
}
float sdBar(vec3 p) {
  vec3 q = p - barT;
  float c = cos(-barRoll), s = sin(-barRoll);
  q.yz = vec2(c * q.y - s * q.z, s * q.y + c * q.z);
  float d = sdBoxW(q - BARC, BARH);
  // the snip: a jagged slot through the stone at CUTX
  float jag = 0.09 * sin(q.y * 9.0) + 0.05 * sin(q.z * 13.0 + 1.3);
  float slot = abs(q.x - CUTX - jag) - gap;
  return max(d, -slot);
}
float map(vec3 p, out float id) {
  p /= scale;
  float c = sdChevron(p), b = sdBar(p), g = p.y;
  id = 1.0; float d = c;
  if (b < d) { d = b; id = 2.0; }
  if (g < d) { d = g; id = 0.0; }
  return d * scale;
}`;

// ---- CPU twins ----
export interface BarPose { t: P3; roll: number; gap: number }
export function barPose(audio: AudioData, t: number, T: FTimes): BarPose {
  const fracture = ease.outExpo(span(t, T.snip, afterBeats(audio, T.snip, 0.65)));
  // "set October free": the cut stone slides forward off the plinth and drops out of the world
  const r = span(t, T.s15[5]!, afterBeats(audio, T.free, 0.9));
  const slide = ease.inOutCubic(clamp(r * 1.6));
  const fall = clamp(r * 1.6 - 0.35);
  return { t: p3(0, -9 * fall * fall, 2.6 * slide + 1.5 * fall), roll: 1.1 * fall * fall, gap: 0.16 * fracture };
}
/** Apply the bar pose to a point given in the bar's rest frame (for carved words and Clawd). */
export function onBar(b: BarPose, q: P3): P3 {
  const c = Math.cos(b.roll), s = Math.sin(b.roll);
  return p3(q.x + b.t.x, c * q.y - s * q.z + b.t.y, s * q.y + c * q.z + b.t.z);
}

/** Camera: born inside the "<=" of line 42, pulled back to the storyboard's low landscape view. */
export function cameraAt(audio: AudioData, t: number, T: FTimes): Cam {
  const t0 = T.s15[2]!;
  const tgt = p3(-1.4, 3.4, 0);
  const hold = span(t, t0, T.snip);
  const hero = orbitCam(tgt, -0.3 + 0.16 * hold, 0.05 + 0.03 * hold, 16.5 - 1.2 * hold, 38, 0.0);
  // birth: close on the tip of the "<", pulled out over a beat and a half
  const k = ease.outExpo(span(t, t0, afterBeats(audio, t0, 1.6)));
  const birth = orbitCam(p3(TIP.x + 1.4, TIP.y, 0), -0.02, 0.0, 2.6, 52, 0.0);
  let c = mixCam(birth, hero, k);
  // the snip: lean in toward the cut, a little higher
  const cutK = ease.inOutCubic(span(t, T.snip - 0.15, afterBeats(audio, T.snip, 0.5)));
  const cut = orbitCam(p3(-2.3, 2.6, 0.4), -0.2, 0.12, 15.0, 38, -0.01);
  c = mixCam(c, cut, cutK * (1 - span(t, T.s15[5]! - 0.1, T.s15[5]! + 0.25)));
  // "set October free": tip down after the falling stone, then hold for the S16 hand-off
  const freeK = ease.inOutCubic(span(t, T.s15[5]!, afterBeats(audio, T.s15[5]!, 1.5)));
  const after = orbitCam(p3(1.2, 2.2, 1.0), -0.12, 0.22, 17.5, 40, 0.0);
  c = mixCam(c, after, freeK);
  return c;
}

const _rig = new Rig();
/** Screen-space bounds of the solid (for the storyboard composition tests). */
export function solidBounds(audio: AudioData, t: number, T: FTimes) {
  _rig.set(cameraAt(audio, t, T));
  const b = barPose(audio, t, T);
  const pts: P3[] = [];
  const stroke = (a: P3, e: P3) => {
    const dx = e.x - a.x, dy = e.y - a.y, L = Math.hypot(dx, dy), nx = -dy / L * BEAM_HW, ny = dx / L * BEAM_HW;
    for (const q of [a, e]) for (const s of [-1, 1]) for (const z of [-DEPTH_HZ, DEPTH_HZ]) pts.push(p3(q.x + s * nx, q.y + s * ny, z));
  };
  stroke(TIP, UPPER_END); stroke(TIP, LOWER_END);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
    pts.push(onBar(b, p3(BAR_C.x + sx * BAR_H.x, BAR_C.y + sy * BAR_H.y, sz * BAR_H.z)));
  const ps = pts.map((p) => _rig.proj(p.x, p.y, p.z)).filter((p): p is NonNullable<typeof p> => !!p);
  const x0 = clamp(Math.min(...ps.map((p) => p.x)), 0, 1920), x1 = clamp(Math.max(...ps.map((p) => p.x)), 0, 1920);
  const y0 = clamp(Math.min(...ps.map((p) => p.y)), 0, 1080), y1 = clamp(Math.max(...ps.map((p) => p.y)), 0, 1080);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Clawd stands on the bar just left of the cut. Voxel size and base point (bar rest frame). */
export const CLAWD_VOX = 0.085;
export const CLAWD_AT = p3(CUT_X - 1.05, BAR_C.y + BAR_H.y, 0.15);
export function clawdBounds(audio: AudioData, t: number, T: FTimes) {
  _rig.set(cameraAt(audio, t, T));
  const b = barPose(audio, t, T), v = CLAWD_VOX;
  const pts: P3[] = [];
  // sprite extent with the snipping arm (16 + 3 reach) x 5, depth 4 voxels
  for (const x of [-8 * v, 11 * v]) for (const y of [0, 5 * v]) for (const z of [-2 * v, 2 * v])
    pts.push(onBar(b, p3(CLAWD_AT.x + x, CLAWD_AT.y + y, CLAWD_AT.z + z)));
  const ps = pts.map((p) => _rig.proj(p.x, p.y, p.z)!).filter(Boolean);
  const x0 = Math.min(...ps.map((p) => p.x)), x1 = Math.max(...ps.map((p) => p.x));
  const y0 = Math.min(...ps.map((p) => p.y)), y1 = Math.max(...ps.map((p) => p.y));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export type { P3 };
export const lerp3 = (a: P3, b: P3, k: number) => p3(lerp(a.x, b.x, k), lerp(a.y, b.y, k), lerp(a.z, b.z, k));
