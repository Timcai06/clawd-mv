import * as THREE from 'three';
import { SCALE } from '../engine/scale';

export type RGB = readonly [number, number, number];
export interface EngraveOpts {
  ink: RGB; paper: RGB;
  angle?: number;
  pitch?: number;
  faceAngles?: boolean;
  gamma?: number;
  emissive?: RGB; emissiveK?: number;
  minCov?: number;
}

type Uniforms = Record<'engraveInk' | 'engravePaper', THREE.IUniform<THREE.Vector3>> &
  Record<'engraveAngle' | 'engravePitch' | 'engraveFaceAngles' | 'engraveGamma' | 'engraveMinCov', THREE.IUniform<number>>;
const uniforms = new WeakMap<THREE.MeshLambertMaterial, Uniforms>();

// Same hatch footprint and 4K ink preservation as engine/glsl/common.ts; names are
// scoped to this injection to avoid collisions with three's standard chunks.
const HEAD = /* glsl */ `
const float PX_SCALE = ${SCALE.toFixed(1)};
uniform vec3 engraveInk, engravePaper;
uniform float engraveAngle, engravePitch, engraveFaceAngles, engraveGamma, engraveMinCov;
float engraveSat(float x) { return clamp(x, 0.0, 1.0); }
float engraveIntegral(float t) { return t*t*t*(1.0-0.5*t); }
float engraveInkWidth(float L, float R, float X) {
  float k = max(R-L, 1e-6), x = min(X, R);
  return x-k*(engraveIntegral(engraveSat((x-L)/k))-engraveIntegral(engraveSat(-L/k)));
}
float engraveBox(float x, float m, float r) {
  r = max(r, 1e-6);
  return engraveSat((min(x+r,m)-max(x-r,-m))/(2.0*r));
}
float engraveHatch(float u, float coverage) {
  float x = 0.5-abs(fract(u)-0.5);
  float hw = 0.5*engraveSat(coverage), aa = max(fwidth(u), 1e-4);
${SCALE === 1 ? '  return 1.0-smoothstep(hw-aa,hw+aa,x);' : `
  float aaL = aa*PX_SCALE;
  float m = engraveInkWidth(hw-aaL,hw+aaL,0.5);
  return min(engraveBox(x,m,aa)+engraveBox(1.0-x,m,aa),1.0);`}
}
float engraveTone(float u, float tone) {
  float dark = engraveSat(1.0-tone);
  float a = engraveHatch(u,max(engraveMinCov,pow(dark,engraveGamma)*0.95));
  float b = engraveHatch(u+0.5,engraveSat(dark*1.8-1.15));
  return max(a,b);
}
`;
const SHADE = /* glsl */ `
// Lighting, AO and standard shadow maps have already been evaluated. Emission
// is excluded from the tone and added once, after converting light to ink.
float engraveL = dot(outgoingLight-totalEmissiveRadiance,vec3(0.2126,0.7152,0.0722));
float engraveFace = length(normal.xy)>1e-5 ? atan(normal.y,normal.x)/3.14159265359*0.5 : 0.0;
float engraveA = engraveAngle+engraveFaceAngles*engraveFace;
vec2 engravePx = gl_FragCoord.xy/PX_SCALE;
float engraveU = dot(engravePx,vec2(-sin(engraveA),cos(engraveA)))/engravePitch;
float engraveCov = engraveTone(engraveU,engraveSat(engraveL));
outgoingLight = mix(engravePaper,engraveInk,engraveCov)+totalEmissiveRadiance;
`;

/** White Lambert albedo measures illumination independently of the print palette. */
export function engraveMaterial(o: EngraveOpts): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const u: Uniforms = {
    engraveInk: { value: new THREE.Vector3() }, engravePaper: { value: new THREE.Vector3() },
    engraveAngle: { value: 0.6 }, engravePitch: { value: 5 }, engraveFaceAngles: { value: 1 },
    engraveGamma: { value: 1.25 }, engraveMinCov: { value: 0.02 },
  };
  uniforms.set(m, u);
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n'+HEAD)
      .replace('#include <opaque_fragment>', SHADE+'\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey = () => `engrave-lambert-v1-scale-${SCALE}`;
  setEngrave(m, o);
  return m;
}

/** Updates shared uniform objects, including shaders already compiled by three. */
export function setEngrave(m: THREE.MeshLambertMaterial, o: Partial<EngraveOpts>): void {
  const u = uniforms.get(m);
  if (!u) throw new TypeError('setEngrave requires an engraveMaterial');
  if (o.ink) u.engraveInk.value.set(...o.ink);
  if (o.paper) u.engravePaper.value.set(...o.paper);
  if (o.angle !== undefined) u.engraveAngle.value = o.angle;
  if (o.pitch !== undefined) u.engravePitch.value = Math.max(o.pitch, 1e-4);
  if (o.faceAngles !== undefined) u.engraveFaceAngles.value = o.faceAngles ? 1 : 0;
  if (o.gamma !== undefined) u.engraveGamma.value = Math.max(o.gamma, 1e-4);
  if (o.minCov !== undefined) u.engraveMinCov.value = THREE.MathUtils.clamp(o.minCov, 0, 1);
  if (o.emissive) m.emissive.setRGB(...o.emissive, THREE.LinearSRGBColorSpace);
  if (o.emissiveK !== undefined) m.emissiveIntensity = o.emissiveK;
}
