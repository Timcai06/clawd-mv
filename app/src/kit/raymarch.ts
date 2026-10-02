// Fullscreen SDF raymarching (v5 tools, docs/reference/pdoom-source-techniques.md §2.2 B), after
// pdoom's paperclips / ilya / shoggoth shaders: a camera ray per pixel (4 rotated-grid taps, cycled
// over motion-blur sub-frames via SS_TAP), sphere tracing against a scene-provided `map`, normals,
// soft shadows and ambient occlusion, and `engraveTone` — light turned into engraving-line coverage
// (pdoom shadeWireL: the form is real, the look is a print).
//
// A scene supplies GLSL defining:
//   float map(vec3 p, out float id);          // signed distance, material id
//   vec3 shade(vec3 p, vec3 n, vec3 rd, float id, float t);   // colour of a hit (linear)
//   vec3 background(vec3 rd, vec2 px);       // colour of a miss
// and may use the helpers below (softShadow, ao, engraveTone, faceU).
import * as THREE from 'three';
import { FSPass, SS_TAP, SS_TAP_GLSL, W, H } from '../engine/gl';
import type { Cam } from './rig';

export const RAYMARCH_HEAD = /* glsl */ `
${SS_TAP_GLSL}
uniform vec3 camPos, camR, camU, camF; uniform float focal; uniform float maxDist;
uniform vec3 outlineC; uniform float outlineW; // silhouette ink (outlineW = width in px; 0 = off)
float map(vec3 p, out float id);
float mapD(vec3 p) { float id; return map(p, id); }
vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * mapD(p + e.xyy) + e.yyx * mapD(p + e.yyx) + e.yxy * mapD(p + e.yxy) + e.xxx * mapD(p + e.xxx));
}
float softShadow(vec3 ro, vec3 rd, float k) {
  float res = 1.0, t = 0.03;
  for (int i = 0; i < 48; i++) {
    float h = mapD(ro + rd * t);
    res = min(res, k * h / t);
    t += clamp(h, 0.02, 0.5);
    if (res < 0.002 || t > 30.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
float ao(vec3 p, vec3 n) {
  float o = 0.0, w = 1.0;
  for (int i = 1; i <= 4; i++) { float h = 0.08 * float(i); o += w * (h - mapD(p + n * h)); w *= 0.6; }
  return clamp(1.0 - 2.2 * o, 0.0, 1.0);
}
/** Engraving: light tone (0 dark .. 1 lit) -> ink coverage of parallel lines along u (lines at integer u). */
float engraveTone(float u, float tone) {
  float dark = clamp(1.0 - tone, 0.0, 1.0);
  float a = hatch(u, pow(dark, 1.25) * 0.95);
  float b = hatch(u + 0.5, clamp(dark * 1.8 - 1.15, 0.0, 1.0)); // interleaved lines only in deep shade
  return max(a, b);
}
/** A planar coordinate for engraving lines that follows the face: chooses an in-plane axis by the normal. */
float faceU(vec3 p, vec3 n, float freq, float slope) {
  vec3 a = abs(n);
  if (a.y > a.x && a.y > a.z) return (p.x + slope * p.z) * freq;  // tops: lines across
  if (a.z > a.x) return (p.x * slope - p.y) * freq;                 // fronts: slanted
  return (p.z * slope - p.y) * freq;                                // ends
}
vec3 shade(vec3 p, vec3 n, vec3 rd, float id, float t);
vec3 background(vec3 rd, vec2 px);
vec3 render(vec2 px) {
  vec3 rd = normalize(camF * focal + camR * px.x + camU * px.y);
  float t = 0.0, id = -1.0, dMin = 1e9, tMin = 0.0;
  for (int i = 0; i < 160; i++) {
    float tid; float d = map(camPos + rd * t, tid);
    if (tid > 0.5 && d < dMin) { dMin = d; tMin = t; } // ground (id 0) draws no silhouette
    if (d < 0.0008 * (1.0 + t)) { id = tid; break; }
    t += d * 0.9;
    if (t > maxDist) break;
  }
  // silhouette: a ray that grazed a solid (missed it, or hit something behind it) gets an ink edge
  float px1 = tMin / focal; // world size of one px at the grazing depth
  float edge = outlineW > 0.0 && (id < 0.5 || t > tMin + 0.3) ? 1.0 - smoothstep(outlineW * 0.5 * px1, (outlineW * 0.5 + 1.0) * px1, dMin) : 0.0;
  if (id < 0.0) return mix(background(rd, px), outlineC, edge);
  vec3 p = camPos + rd * t;
  return mix(shade(p, calcNormal(p), rd, id, t), outlineC, edge);
}
void main() {
  vec2 c = FRAG_PX - 0.5 * vec2(${W.toFixed(1)}, ${H.toFixed(1)});
  vec3 col = vec3(0.0);
  for (int k = ssK0(); k < ssK1(); k++) col += render(c + rgss(k) / PX_SCALE);
  fragColor = vec4(col * ssWeight(), 1.0);
}`;

/** A raymarched pass: scene GLSL (map/shade/background + uniforms) is appended after the helpers. */
export class RaymarchPass {
  pass: FSPass;
  private cam = new THREE.PerspectiveCamera(34, W / H, 0.05, 500);
  constructor(sceneGlsl: string, uniforms: Record<string, THREE.IUniform> = {}) {
    this.pass = new FSPass(RAYMARCH_HEAD + '\n' + sceneGlsl, {
      camPos: { value: new THREE.Vector3() }, camR: { value: new THREE.Vector3() }, camU: { value: new THREE.Vector3() },
      camF: { value: new THREE.Vector3() }, focal: { value: 1 }, maxDist: { value: 80 }, ssTap: SS_TAP,
      outlineC: { value: new THREE.Vector3() }, outlineW: { value: 0 }, ...uniforms,
    });
  }
  get u() { return this.pass.u; }
  /** Same convention as kit/rig.ts (so overlays projected with a Rig line up exactly). */
  setCam(c: Cam) {
    const k = this.cam;
    k.position.set(c.pos.x, c.pos.y, c.pos.z); k.up.set(0, 1, 0);
    k.lookAt(c.tgt.x, c.tgt.y, c.tgt.z); k.rotateZ(c.roll); k.updateMatrixWorld(true);
    const e = k.matrixWorld.elements;
    (this.u.camR!.value as THREE.Vector3).set(e[0]!, e[1]!, e[2]!);
    (this.u.camU!.value as THREE.Vector3).set(e[4]!, e[5]!, e[6]!);
    (this.u.camF!.value as THREE.Vector3).set(-e[8]!, -e[9]!, -e[10]!);
    (this.u.camPos!.value as THREE.Vector3).set(c.pos.x, c.pos.y, c.pos.z);
    this.u.focal!.value = 0.5 * H / Math.tan((c.fov * Math.PI) / 360);
  }
  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget) { this.pass.render(r, out); }
  dispose() { this.pass.mat.dispose(); }
}
