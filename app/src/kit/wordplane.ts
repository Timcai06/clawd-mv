// A high-resolution R-fill/G-outline texture with a letter-timed, linear-HDR shader.
import * as THREE from 'three';
import type { Word } from '../engine/lyrics';
import { SCALE } from '../engine/scale';
import { GLSL_COMMON } from '../engine/glsl/common';
import { clamp } from '../engine/util';
import { lin } from '../theme';
import { letterTimes, runInkBounds } from './pathtext';
import { fillRun, runPath, varRun, type Axes, type VarRun } from './vartype';

export type RGB = [number, number, number];
export interface WordPlaneOpts {
  capH: number; axes?: Axes; tracking?: number; texCap?: number; ax?: number; ay?: number; outline?: number; engrave?: boolean;
}
type State = {
  prog: number; dir: 1 | -1; feather: number; cDim: RGB; cSung: RGB; cDone: RGB; aDim: number;
  done: number; heat: number; opacity: number; tone: number; hatchAngle: number; hatchPx: number;
};
const FRAG = /* glsl */ `
precision highp float;
${GLSL_COMMON}
const vec3 C_HOT = vec3(${lin('hot').join(',')});
in vec2 vUv; out vec4 fragColor;
uniform sampler2D map;
uniform float prog, dir, feather, u0, u1, aDim, done, uHeat, opacity, tone, hatchAngle, hatchPx;
uniform vec3 cDim, cSung, cDone;
uniform bool engraved;
void main() {
  vec2 tx = texture(map, vUv).rg;
  float u = clamp((vUv.x-u0)/max(1e-5,u1-u0),0.0,1.0);
  if (dir < 0.0) u = 1.0-u;
  float f = max(feather,1e-5), e = prog*(1.0+f);
  float sung = prog <= 0.0 ? 0.0 : 1.0-smoothstep(e-f,e,u);
  float age = prog-u;
  float hot = sung * step(0.0,age) * (1.0-smoothstep(0.0,0.08,age));
  vec3 cs = mix(cSung + C_HOT*(hot+uHeat),cDone,done);
  float cov = 1.0;
  if (engraved) {
    vec2 px = FRAG_PX;
    float v = dot(px,vec2(-sin(hatchAngle),cos(hatchAngle)))/max(1.0,hatchPx);
    float dist = abs(fract(v)-0.5), fw = max(fwidth(v),1e-5);
    float halfWidth = mix(0.45,0.06,clamp(tone,0.0,1.0));
    cov = pxLine(dist/fw,halfWidth/(fw*PX_SCALE)-0.5,halfWidth/(fw*PX_SCALE)+0.5);
  }
  float cover = max(tx.r*cov,tx.g);
  float a = cover * mix(aDim,1.0,sung) * opacity;
  vec3 cold = mix(cDim,cDone,done);
  vec3 rgb = cover * mix(cold*aDim,cs,sung) * opacity;
  fragColor = vec4(rgb,a);
}`;
export class WordPlane {
  readonly mesh: THREE.Mesh; readonly w: number; readonly h: number;
  readonly glyphU: { u0: number; u1: number }[];
  private readonly run: VarRun;
  private readonly ink: ReturnType<typeof runInkBounds>;
  private readonly scale: number;
  private readonly tex: THREE.CanvasTexture;
  private readonly mat: THREE.RawShaderMaterial;
  private readonly o: WordPlaneOpts;
  private disposed = false;
  constructor(private readonly text: string, o: WordPlaneOpts) {
    this.o = { ...o, axes: { ...(o.axes ?? { wdth: 87.5, wght: 900 }) } };
    const ref = varRun('H',100,this.o.axes!), size = (o.texCap ?? 160)*100/ref.capH;
    this.run = varRun(text,size,this.o.axes!,(o.tracking ?? 0)*size);
    this.ink = runInkBounds(this.run);
    const ink = this.ink, run = this.run, ol = (o.outline ?? 0.018)*size;
    const pad = Math.ceil(ol*2+size*0.04), asc = Math.max(run.capH,-ink.y0), desc = Math.max(0,ink.y1);
    const W = Math.max(1,Math.ceil(ink.x1-ink.x0+2*pad)), H = Math.max(1,Math.ceil(asc+desc+2*pad));
    const cv = document.createElement('canvas'); cv.width = W*SCALE; cv.height = H*SCALE;
    const c = cv.getContext('2d')!; c.scale(SCALE,SCALE);
    const bx = pad-ink.x0, by = pad+asc;
    c.fillStyle = '#000'; c.fillRect(0,0,W,H); c.globalCompositeOperation = 'lighter';
    c.fillStyle = '#f00'; fillRun(c,run,bx,by);
    if (ol > 0) { c.strokeStyle = '#0f0'; c.lineJoin = 'round'; c.lineWidth = ol; c.stroke(runPath(run,bx,by)); }
    this.tex = new THREE.CanvasTexture(cv); this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.generateMipmaps = true; this.tex.minFilter = THREE.LinearMipmapLinearFilter; this.tex.magFilter = THREE.LinearFilter; this.tex.anisotropy = 8;
    this.scale = o.capH/run.capH; this.w = (ink.x1-ink.x0)*this.scale; this.h = o.capH;
    // Texture coordinates (including padding); shader normalizes these into the ink extent.
    this.glyphU = run.glyphs.map(g => {
      const b = runInkBounds({ ...run, glyphs: [{ ...g, x: 0 }] });
      return { u0: clamp((bx+g.x+b.x0)/W), u1: clamp((bx+g.x+b.x1)/W) };
    });
    const axPx = pad+(ink.x1-ink.x0)*(o.ax ?? 0), ayPx = by-run.capH*(o.ay ?? 0.5);
    const geo = new THREE.PlaneGeometry(W*this.scale,H*this.scale);
    geo.translate((W/2-axPx)*this.scale,(ayPx-H/2)*this.scale,0);
    this.mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3,
      vertexShader: 'precision highp float; in vec3 position; in vec2 uv; uniform mat4 projectionMatrix, modelViewMatrix; out vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: FRAG,
      uniforms: {
        map: { value: this.tex }, u0: { value: pad/W }, u1: { value: (pad+ink.x1-ink.x0)/W }, engraved: { value: o.engrave ?? false },
        prog: { value: 0 }, dir: { value: 1 }, feather: { value: 0.04 }, aDim: { value: 0.35 }, done: { value: 0 }, uHeat: { value: 0 }, opacity: { value: 1 }, tone: { value: 0.5 }, hatchAngle: { value: 0.6 }, hatchPx: { value: 5 },
        cDim: { value: new THREE.Vector3(...lin('paper')) }, cSung: { value: new THREE.Vector3(...lin('clay')) }, cDone: { value: new THREE.Vector3(...lin('paper')) },
      }, transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(geo,this.mat); this.mesh.frustumCulled = false;
  }
  set(u: Partial<State>): void {
    for (const [key,value] of Object.entries(u)) if (value !== undefined) {
      const uniform = this.mat.uniforms[key === 'heat' ? 'uHeat' : key]!;
      if (Array.isArray(value)) (uniform.value as THREE.Vector3).set(...value as RGB);
      else uniform.value = value;
    }
  }
  karaoke(word: Word, t: number): number {
    const times = letterTimes(word);
    if (times.length !== this.glyphU.length) throw new Error('karaoke word must match the displayed character count');
    if (!times.length || t < word.start) return 0;
    const u = this.mat.uniforms, left = u.u0!.value as number, span = Math.max(1e-12,(u.u1!.value as number)-left);
    const reverse = u.dir!.value < 0;
    const groups: { time: (typeof times)[number]; lo: number; hi: number }[] = [];
    for (let j = 0; j < times.length;) {
      const time = times[j]!, begin = j;
      while (j < times.length && times[j]!.t0 === time.t0 && times[j]!.t1 === time.t1) j++;
      const ranges = this.glyphU.slice(begin,j);
      groups.push({ time,lo: Math.min(...ranges.map(r => r.u0)),hi: Math.max(...ranges.map(r => r.u1)) });
    }
    let head = 0;
    for (let j = 0; j < groups.length; j++) {
      const time = groups[j]!.time;
      if (t < time.t0) continue;
      // Punctuation and its letter share one interval and one continuous wipe.
      const { lo,hi } = groups[reverse ? groups.length-1-j : j]!;
      const a = reverse ? 1-(hi-left)/span : (lo-left)/span;
      const b = reverse ? 1-(lo-left)/span : (hi-left)/span;
      const k = time.t1 <= time.t0 ? 1 : clamp((t-time.t0)/(time.t1-time.t0));
      head = Math.max(head,a+(b-a)*k);
    }
    return clamp(head);
  }
  letters(): WordPlane[] {
    const parentX = this.ink.x0 + (this.ink.x1-this.ink.x0)*(this.o.ax ?? 0);
    return this.run.glyphs.map(g => {
      const p = new WordPlane(g.ch,{ ...this.o, ax: 0 });
      const x = (g.x+p.ink.x0-parentX)*this.scale;
      p.mesh.geometry.translate(x,0,0);
      p.mesh.position.copy(this.mesh.position); p.mesh.quaternion.copy(this.mesh.quaternion); p.mesh.scale.copy(this.mesh.scale);
      for (const key of ['prog','dir','feather','cDim','cSung','cDone','aDim','done','heat','opacity','tone','hatchAngle','hatchPx']) {
        const name = key === 'heat' ? 'uHeat' : key, value = this.mat.uniforms[name]!.value;
        p.mat.uniforms[name]!.value = value instanceof THREE.Vector3 ? value.clone() : value;
      }
      return p;
    });
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.mesh.geometry.dispose(); this.mat.dispose(); this.tex.dispose();
  }
}
