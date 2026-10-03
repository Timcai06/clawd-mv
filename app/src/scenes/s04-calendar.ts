import { SparkLines, cursorSpark, heatTrail, sparkFade } from '../kit/spark';
import { drawNote } from '../kit/note';
import { PrintOverlay } from '../kit/print-overlay';
import { NIGHT, NightSky } from '../kit/night';
// S04 — October as an engraved city (storyboard v2 kf-S04, lyric typography v3).
// The sung "thirty-second" is a day counter that runs 1 → 31 over the city: the cursor and Clawd
// follow it street by street and each roof lights clay as it is counted. On the S04-2 downbeat the
// counter overflows to 32 and the impossible block erupts; on the held "October" the month's name
// slams in as a giant cropped headline whose width stretches with the note and whose weight follows
// the voice. Two timeline entries share one world; everything is a function of t (seek-safe).
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { GLSL_COMMON } from '../engine/glsl/common';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { clamp, ease, hash, lerp } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { blink, drawCursor } from '../kit/cursor';
import { span, afterBeats } from '../kit/time';
import { heatColor, Voice, drawSet, odometer, setLine } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { BLOCK, TOWER_BLOCK, CAM_YAW, DATES, STREETS, cameraAt, cityState, cityTimes, projectionCamera, clawdRect, handoffIn, type CityTimes, type Point3 } from './parts/s04-city-model';
import { drawPathText } from '../kit/pathtext';
import { WordPlane } from '../kit/wordplane';
import { exitEnvelope } from '../kit/handoff';
import { cityLyrics, cityRig, blockHeight, streetVisible, CELL } from './parts/s04-city-model';
import { DateLabels } from './parts/s04-city-labels';
import { drawCalendar } from './parts/s03-form';
import { printInBox } from './parts/s01-print';
export const TYPE_LEVELS = { giant: 212, lyric: 50.8, label: 20 }; // cap heights in logical px

const PAPER = lin('paper'), INK = lin('ink'), CLAY = lin('clay'), NIGHTC = lin('night');
const UP = new THREE.Vector3(0, 1, 0);
/** Shared light and occluders (one uniform object for both materials, updated per frame). */
const BOXES = { value: Array.from({ length: 32 }, () => new THREE.Vector4()) };
const N_BOXES = { value: 0 };
const KEY_L = { value: new THREE.Vector3(0.62, 0.5, -0.6).normalize() }; // low, from behind the 32nd: its shadow falls across the month

const BLOCK_VERT = /* glsl */ `
precision highp float;
in vec3 position, normal; in mat4 instanceMatrix; in float date;
uniform mat4 modelMatrix, modelViewMatrix, projectionMatrix;
out vec3 vWorld, vNormal; out float vDate;
void main() {
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vWorld = (modelMatrix * wp).xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vDate = date;
  gl_Position = projectionMatrix * modelViewMatrix * wp;
}`;

// v5: real light. One key light (the storyboard's upper right); every pixel casts a ray toward it
// against the 32 blocks (analytic box intersection, no shadow maps), and the light is printed as
// engraving: lit faces carry thin sparse rules, shaded faces dense and crossed (pdoom shadeWireL).
const BOXES_GLSL = /* glsl */ `
uniform vec4 boxes[32]; uniform float nBoxes; uniform vec3 keyL;
float boxHit(vec3 ro, vec3 rd, vec4 b) { // ray vs block (x, z, half width, height): entry t or -1
  vec3 lo = vec3(b.x - b.z, 0.0, b.y - b.z), hi = vec3(b.x + b.z, b.w, b.y + b.z);
  vec3 inv = 1.0 / rd, t0 = (lo - ro) * inv, t1 = (hi - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  float a = max(max(tn.x, tn.y), tn.z), c = min(min(tf.x, tf.y), tf.z);
  return (c > max(a, 0.0)) ? a : -1.0;
}
float shadowAt(vec3 p) {
  for (int i = 0; i < 32; i++) {
    if (float(i) >= nBoxes) break;
    if (boxHit(p + keyL * 0.02, keyL, boxes[i]) > 0.0) return 0.0;
  }
  return 1.0;
}`;
const BLOCK_FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld, vNormal; in float vDate; out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 paper, ink, clay;
uniform float accented, visited, kick, t;
${BOXES_GLSL}
void main() {
  float top = step(0.5, vNormal.y);
  float xSide = step(0.5, abs(vNormal.x));
  float along = mix(vWorld.x, vWorld.z, xSide);
  float lit = max(dot(normalize(vNormal), keyL), 0.0) * shadowAt(vWorld);
  float occ = 0.16 * (1.0 - smoothstep(0.0, 1.4, vWorld.y)); // the street's ambient occlusion
  float darkness = clamp(0.62 - 0.5 * lit + occ, 0.08, 0.86);
  float rules = hatch(along * 7.5 + hash12(vec2(floor(vWorld.y * 1.3), vDate)) * 0.0, darkness);
  float cross = hatch((vWorld.y + along * 0.18) * 9.0, sat(darkness * 1.6 - 0.62));
  float printInk = max(rules, cross) * (1.0 - top);
  // roof edge: a hairline frame
  vec3 c = mix(paper, ink, printInk * 0.86);
  float focus = float(abs(vDate - accented) < 0.1);
  float read = step(vDate, visited);
  // roofs: paper, with fine rules only where a neighbour's shadow falls on them
  c = mix(c, mix(paper, ink, hatch((vWorld.x + vWorld.z) * 6.0, (1.0 - shadowAt(vWorld)) * 0.6) * 0.85), top);
  c = mix(c, clay, top * focus * (0.30 + kick * 0.2));
  c = mix(c, ink, top * (1.0 - read) * 0.05);
  if (vDate > 31.5) {
    float bands = hatch(along * 7.5, 0.34);
    c = mix(mix(paper, ink, bands * 0.86 * (1.0 - top)), clay, (1.0 - top) * 0.0);
  }
  fragColor = vec4(c, 1.0);
}`;

const FLOOR_FRAG = /* glsl */ `
precision highp float;
in vec2 vUv; out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 paper, ink;
uniform float t, kick;
${BOXES_GLSL}
float rule(float u, float width) {
  float d = abs(fract(u + 0.5) - 0.5);
  return pxLine(d / max(fwidth(u), 0.00001), 0.35 * width, 1.2 * width);
}
void main() {
  vec2 p = vUv * vec2(60.0, 60.0);
  float grid = max(rule(p.x / 3.6, 1.0), rule(p.y / 3.6, 1.0));
  float minor = max(rule(p.x / 0.9, 0.55), rule(p.y / 0.9, 0.55));
  float sweep = 1.0 - smoothstep(0.0, 0.12, abs(fract(p.y * 0.03 - t * 0.35) - 0.5));
  float a = grid * (0.13 + kick * 0.06) + minor * 0.03 + sweep * grid * 0.06;
  vec3 c = mix(paper, ink, a);
  // cast shadows: diagonal burin strokes where the key light is blocked
  vec3 wp = vec3((vUv.x - 0.5) * 60.0, 0.0, -(vUv.y - 0.5) * 60.0 - 8.1);
  float sh = 1.0 - shadowAt(wp);
  c = mix(c, ink, hatch((wp.x * 0.7 + wp.z) * 5.5, 0.42) * 0.75 * sh);
  c *= 1.0 - 0.01 * fbm(p * 1.1 + vec2(t * 0.04, 0.0), 2);
  fragColor = vec4(c, 1.0);
}`;

// Cast shadows: flat hatched parallelograms on the floor (light from the upper right).
const SHADOW_FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld; out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 ink;
void main() {
  float h = hatch((vWorld.x * 0.7 + vWorld.z) * 5.5, 0.32);
  fragColor = vec4(ink, h * 0.7);
}`;

// ---- Night version (kit/night.ts): white-line engraving lit by the 32nd tower, which has its lights on.
const BLOCK_FRAG_NIGHT = /* glsl */ `
precision highp float;
in vec3 vWorld, vNormal; in float vDate; out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 paper, ink, clay, night, lightPos;
uniform float accented, visited, kick, t, lightK;
void main() {
  vec3 n = normalize(vNormal);
  float top = step(0.5, n.y);
  float xSide = step(0.5, abs(n.x));
  float along = mix(vWorld.x, vWorld.z, xSide);
  vec3 Lv = lightPos - vWorld; float d2 = dot(Lv, Lv);
  float tower = lightK * max(dot(n, Lv * inversesqrt(d2)), 0.0) * 70.0 / (d2 + 25.0);
  float moon = 0.012 + 0.05 * max(dot(n, normalize(vec3(-0.5, 0.8, 0.45))), 0.0);
  float lit = moon + tower;
  // white lines on black: the lit faces carry more and brighter lines
  float cov = clamp(0.05 + 0.6 * lit, 0.04, 0.6) * (1.0 - 0.35 * smoothstep(1.2, 0.0, vWorld.y));
  float rules = hatch(along * 7.5, cov);
  float cross = hatch((vWorld.y + along * 0.18) * 9.0, sat(cov * 1.4 - 0.45));
  float lines = max(rules, cross) * (1.0 - top);
  vec3 c = night * 1.5 + clay * tower * 0.18;
  c += paper * lines * min(1.0, 0.05 + 1.6 * lit) * 0.8;
  float focus = float(abs(vDate - accented) < 0.1);
  float read = step(vDate, visited);
  // roofs: dim paper, warmed by the tower; the counted roof burns
  float roofLines = hatch((vWorld.x + vWorld.z) * 6.0, clamp(0.04 + 0.4 * lit, 0.03, 0.4));
  c = mix(c, night * 1.3 + paper * roofLines * 0.12 * min(1.0, 0.05 + 1.5 * lit) + clay * (tower * 0.55 + 0.02 * read), top);
  c += clay * top * focus * (2.2 + kick * 0.6);
  if (vDate > 31.5) {
    // the impossible building: dark, its windows lit
    float wx = fract(along * 1.55), wy = fract(vWorld.y * 2.1);
    vec2 cell = floor(vec2(along * 1.55, vWorld.y * 2.1));
    float win = step(0.3, wx) * step(wx, 0.72) * step(0.28, wy) * step(wy, 0.74) * (1.0 - top);
    float on = step(0.3, hash12(cell + vec2(7.0, 3.0)));
    c = night * 1.3 + paper * hatch(along * 7.5, 0.08) * 0.12 * (1.0 - top);
    c += clay * win * on * lightK * (2.4 + 0.8 * hash12(cell));
    c += clay * top * lightK * 1.2;
  }
  fragColor = vec4(c, 1.0);
}`;

const FLOOR_FRAG_NIGHT = /* glsl */ `
precision highp float;
in vec2 vUv; out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 paper, ink, clay, night, lightPos;
uniform float t, kick, lightK;
float rule(float u, float width) {
  float d = abs(fract(u + 0.5) - 0.5);
  return pxLine(d / max(fwidth(u), 0.00001), 0.35 * width, 1.2 * width);
}
void main() {
  vec2 p = vUv * vec2(60.0, 60.0);
  vec2 xz = vec2((vUv.x - 0.5) * 60.0, -(vUv.y - 0.5) * 60.0 - 8.1);
  float grid = max(rule(p.x / 3.6, 1.0), rule(p.y / 3.6, 1.0));
  vec2 dl = xz - lightPos.xz;
  float pool = lightK * exp(-dot(dl, dl) / 55.0);
  float far = exp(-max(0.0, length(xz - vec2(0.0, -7.0)) - 10.0) / 14.0);
  vec3 c = night * 1.2 + ink * 0.12 * far;
  c += paper * grid * (0.045 + 0.02 * kick + 0.25 * pool) * far;
  c += clay * pool * 0.22;
  fragColor = vec4(c, 1.0);
}`;

const SHADOW_FRAG_NIGHT = /* glsl */ `
precision highp float;
in vec3 vWorld; out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 ink;
void main() { fragColor = vec4(vec3(0.0), 0.55); }`;

class CityWorld {
  print = new PrintOverlay();
  sky = new NightSky();
  sparks = new SparkLines();
  users = 0;
  ground = new Ground();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 300);
  blocks: THREE.InstancedMesh;
  blockMaterial: THREE.RawShaderMaterial;
  shadows: THREE.InstancedMesh;
  floor: THREE.Mesh;
  floorMaterial: THREE.RawShaderMaterial;
  labels: DateLabels;
  october: WordPlane;
  streets = new LineBatch(2400, { screen2D: false, blend: 'normal', depthTest: true });
  overlay = new Layer2D();
  times: CityTimes;
  streetKnots: number[];
  voice: Voice;
  matrix = new THREE.Matrix4();
  position = new THREE.Vector3();
  scale = new THREE.Vector3();
  roofRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  /** Roof numbers read upright from the camera's side of the city. */
  labelRotation = new THREE.Quaternion().setFromAxisAngle(UP, CAM_YAW * Math.PI / 180).multiply(this.roofRotation);
  identity = new THREE.Quaternion();
  projectScratch = new THREE.Vector3();

  constructor(ctx: SceneCtx) {
    this.times = cityTimes(ctx.audio, ctx.lyrics);
    // Exact street-corner birth times prevent a sampled trail shortcut through a block.
    this.streetKnots = STREETS.lengths.map(distance => {
      let lo=this.times.start, hi=this.times.end;
      for(let i=0;i<40;i++){const mid=(lo+hi)/2;
        if(cityState(ctx.audio,mid,this.times).travel*STREETS.total<distance) lo=mid; else hi=mid;}
      return (lo+hi)/2;
    });
    this.voice = new Voice(ctx.lyrics, ctx.audio);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute('date', new THREE.InstancedBufferAttribute(Float32Array.from({ length: 32 }, (_, i) => i + 1), 1));
    this.blockMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: NIGHT ? BLOCK_FRAG_NIGHT : BLOCK_FRAG,
      uniforms: {
        paper: { value: new THREE.Vector3(...PAPER) }, ink: { value: new THREE.Vector3(...INK) }, clay: { value: new THREE.Vector3(...CLAY) },
        accented: { value: 1 }, visited: { value: 1 }, kick: { value: 0 }, t: { value: 0 },
        night: { value: new THREE.Vector3(...NIGHTC) }, lightPos: { value: new THREE.Vector3() }, lightK: { value: 0 },
        boxes: BOXES, nBoxes: N_BOXES, keyL: KEY_L,
      }, toneMapped: false,
    });
    this.blocks = new THREE.InstancedMesh(geometry, this.blockMaterial, 32);
    this.blocks.frustumCulled = false;
    this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.blocks);
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.setAttribute('date', new THREE.InstancedBufferAttribute(Float32Array.from({ length: 32 }, (_, i) => i + 1), 1));
    this.shadows = new THREE.InstancedMesh(shadowGeo, new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: NIGHT ? SHADOW_FRAG_NIGHT : SHADOW_FRAG,
      uniforms: { ink: { value: new THREE.Vector3(...INK) } }, transparent: true, depthWrite: false, toneMapped: false,
    }), 32);
    this.shadows.frustumCulled = false;
    this.shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.shadows);
    this.floorMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: `precision highp float;
        in vec3 position; in vec2 uv; out vec2 vUv;
        uniform mat4 modelViewMatrix, projectionMatrix;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: NIGHT ? FLOOR_FRAG_NIGHT : FLOOR_FRAG,
      uniforms: { paper: { value: new THREE.Vector3(...PAPER) }, ink: { value: new THREE.Vector3(...INK) }, t: { value: 0 }, kick: { value: 0 },
        clay: { value: new THREE.Vector3(...CLAY) }, night: { value: new THREE.Vector3(...NIGHTC) }, lightPos: { value: new THREE.Vector3() }, lightK: { value: 0 },
        boxes: BOXES, nBoxes: N_BOXES, keyL: KEY_L },
      toneMapped: false,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0.0, -0.015, -8.1);
    this.scene.add(this.floor);
    this.labels = new DateLabels(ctx.renderer);
    this.october = new WordPlane('OCTOBER',{capH:6.5,engrave:true,axes:{wdth:87.5,wght:900},ay:0,outline:0});
    this.scene.add(this.october.mesh);
    cityLyrics(ctx.lyrics,ctx.audio,this.times);

  }

  project(p: Point3) {
    const v = this.projectScratch.set(...p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, visible: v.z > -1 && v.z < 1 };
  }

  dispose() { this.sky.dispose(); this.sparks.dispose(); this.print.dispose();
    this.blocks.geometry.dispose(); this.blockMaterial.dispose();
    this.shadows.geometry.dispose(); (this.shadows.material as THREE.Material).dispose();
    this.floor.geometry.dispose(); this.floorMaterial.dispose();
    this.october.dispose(); this.labels.dispose(); this.streets.geo.dispose(); this.streets.mat.dispose();
    this.overlay.texture.dispose(); this.ground.pass.mat.dispose();
  }
}

let world: CityWorld | undefined;

export default class S04Calendar extends Scene {
  private w!: CityWorld;

  override init() {
    this.w = world ??= new CityWorld(this.ctx);
    this.w.users++;
  }

  override dispose() {
    if (this.w && --this.w.users === 0) { this.w.dispose(); world = undefined; }
  }

  private camera(f: Frame, s: ReturnType<typeof cityState>) {
    this.w.camera.copy(projectionCamera(this.ctx.audio,f.t,this.w.times));
  }

  private buildings(f: Frame, s: ReturnType<typeof cityState>) {
    const w = this.w;
    for (let i = 0; i < 32; i++) {
      const d = DATES[i]!;
      // Each block springs up in its own instant across the first beat (a ripple from day 1).
      const own = clamp(s.extrude * 1.6 - (i / 31) * 0.6);
      const roofPulse = 0; // Printed roofs stay fixed while the kick breathes the lyric layer.
      const h = blockHeight(i,f.t,this.ctx.audio,w.times);
      const bw = i === 31 ? TOWER_BLOCK : BLOCK;
      w.position.set(d.x, h / 2, d.z); w.scale.set(bw, h, bw);
      w.matrix.compose(w.position, w.identity, w.scale);
      w.blocks.setMatrixAt(i, w.matrix);
      BOXES.value[i]!.set(d.x, d.z, bw / 2, h);
      // Shadow: a sheared floor quad from the block's foot towards the lower left (light upper right).
      const len = h * 0.55;
      w.position.set(d.x - len * 0.5, 0.004, d.z + len * 0.35);
      w.scale.set(BLOCK + len, BLOCK, 1);
      w.matrix.compose(w.position, w.roofRotation, w.scale);
      w.shadows.setMatrixAt(i, w.matrix);
      const peak=afterBeats(this.ctx.audio,w.times.rise,.2),rest=afterBeats(this.ctx.audio,w.times.rise,.7);
      const k32=i===31&&s.rising ? (f.t<peak?Math.min(1.6,lerp(1,1.6,ease.outBack(span(f.t,w.times.rise,peak),1.3))):lerp(1.6,1.2,ease.outBack(span(f.t,peak,rest),1.3))) : 1;
      w.position.set(d.x, h + 0.008, d.z); w.scale.set(k32,k32,k32);
      w.matrix.compose(w.position, w.labelRotation, w.scale);
      w.labels.mesh.setMatrixAt(i, w.matrix);
    }
    w.blocks.instanceMatrix.needsUpdate = true;
    w.shadows.instanceMatrix.needsUpdate = true;
    w.labels.mesh.instanceMatrix.needsUpdate = true;
    w.labels.mesh.count = 32;
    w.shadows.count = 32;
    w.shadows.visible = false; // v5: shadows are ray-tested in the block and floor shaders
    N_BOXES.value = 32;
    const d32 = DATES[31]!;
    w.labels.facade.visible = false;
    w.labels.facade.position.set(d32.x, s.roof32 * 0.64, d32.z + BLOCK / 2 + 0.008);
    for (const mat of [w.blockMaterial, w.labels.roofMaterial]) {
      mat.uniforms.accented!.value = s.accented;
      mat.uniforms.visited!.value = s.visited;
    }
    w.blockMaterial.uniforms.kick!.value = f.a.kick;
    w.blockMaterial.uniforms.t!.value = f.t;
    w.floorMaterial.uniforms.t!.value = f.t;
    w.floorMaterial.uniforms.kick!.value = f.a.kick;
    // night: the 32nd tower is the light source (it switches on as it erupts)
    const d32l = DATES[31]!;
    for (const mat of [w.blockMaterial, w.floorMaterial]) {
      (mat.uniforms.lightPos!.value as THREE.Vector3).set(d32l.x, s.roof32 * 0.55, d32l.z + TOWER_BLOCK * 0.5 + 0.6);
      mat.uniforms.lightK!.value = s.rising ? Math.min(1, s.lift) * (1 + 0.25 * f.a.kick) : 0;
    }
  }

  private survey(s: ReturnType<typeof cityState>, out: THREE.WebGLRenderTarget) {
    const lb = this.w.streets;
    lb.clear();
    const seg = (a: Point3, b: Point3, width: number, color: [number, number, number], alpha = 1) =>
      lb.seg(...a, ...b, width, ...color, alpha);
    // The received calendar is a real seven-by-five floor grid in the city world.
    // Its corners are exactly GRID_CORNERS, also measured by entryPrim.
    for(let col=0;col<=7;col++){
      const x=-3.5*CELL+col*CELL;seg([x,.001,CELL/2],[x,.001,-4.5*CELL],1.1,INK,.55);
    }
    for(let row=0;row<=5;row++){
      const z=CELL/2-row*CELL;seg([-3.5*CELL,.001,z],[3.5*CELL,.001,z],1.1,INK,.55);
    }
    // The clay route: drawn from t (the whole history) every frame, up to the counted day.
    const dist = s.travel * STREETS.total;
    for (let i = 1; i < STREETS.points.length; i++) {
      const a = STREETS.points[i - 1]!, b = STREETS.points[i]!;
      seg(a, b, 0.7, NIGHT ? PAPER : INK, NIGHT ? 0.05 : 0.07);
      if (STREETS.lengths[i - 1]! >= dist) continue;
      const k = Math.min(1, (dist - STREETS.lengths[i - 1]!) / (STREETS.lengths[i]! - STREETS.lengths[i - 1]!));
      seg(a, [lerp(a[0], b[0], k), a[1], lerp(a[2], b[2], k)], 3.2, CLAY, 1);
    }
    // Speed lines rising off block 32 as it erupts (the storyboard's vertical strokes).
    if (s.rising) {
      const d = DATES[31]!, h = s.roof32, k = 1 - span(s.lift, 0.6, 1.2) * 0.6;
      for (let j = 0; j < 9; j++) {
        const x = d.x - BLOCK * 0.65 + (j / 8) * BLOCK * 1.3, z = d.z - BLOCK * 0.55 - hash(j, 3) * 0.6;
        const y0 = h * (0.15 + 0.5 * hash(j, 5)), y1 = h + 1.2 + 2.6 * hash(j, 7);
        seg([x, y0, z], [x, y1, z], 0.9, NIGHT ? [CLAY[0] * 1.6, CLAY[1] * 1.6, CLAY[2] * 1.6] as [number, number, number] : INK, 0.55 * k);
      }
    }
    lb.render(this.ctx.renderer, out, this.w.camera);
  }

  private character(f: Frame, s: ReturnType<typeof cityState>, c: CanvasRenderingContext2D) {
    const b=clawdRect(this.ctx.audio,f.t,this.w.times);
    c.save();c.translate(b.x,b.y);c.scale(b.w/160,b.h/50);
    Clawd.draw(c,0,0,Clawd.pose(s.rising?null:'A5',{beat:f.beat,beat0:this.ctx.audio.beatAt(this.w.times.start),p:s.travel,travel:0}),{px:10,body:new THREE.Color(...CLAY).multiplyScalar(exitEnvelope(f.t,this.w.times.end).gain).getStyle()});c.restore();
  }

  private lyrics(f:Frame,s:ReturnType<typeof cityState>,c:CanvasRenderingContext2D) {
    const w=this.w,T=w.times,au=this.ctx.audio,lay=cityLyrics(this.ctx.lyrics,au,T),rig=cityRig(au,f.t,T);
    const visible=(p:{x:number;y:number;z:number})=>streetVisible(p,f.t,au,T);
    const common={base:'ink' as const,on:'paper' as const,axes:(g:any,t:number)=>w.voice.form(g.word,t).axes,visible,pop:0};
    drawPathText(c,rig,lay.first,lay.lead,f.t,{...common,mode:'lie',normal:()=>({x:0,y:1,z:0})});
    drawPathText(c,rig,lay.route,lay.count,f.t,{...common,mode:'lie',normal:()=>({x:0,y:1,z:0})});
    drawPathText(c,rig,lay.foot,lay.day,f.t,{...common,mode:'stand',minPx:0,maxPx:1000});
  }

  private annotations(f: Frame, s: ReturnType<typeof cityState>, out: THREE.WebGLRenderTarget) {
    const w = this.w, c = w.overlay.ctx;
    w.overlay.clear();
    this.character(f,s,c);
    if (s.rising) {
      const d = DATES[31]!, top = w.project([d.x + TOWER_BLOCK / 2, s.roof32, d.z]);
      drawNote(c, { ax: top.x, ay: top.y + 30, x: top.x + 70, y: top.y - 40, text: 'Oct 32 · not in spec', t0: w.times.october + 0.35, on: NIGHT ? 'ink' : 'paper' }, f.t);
    }
    this.lyrics(f, s, c);
    const head=w.project(s.head);
    if(head.visible)drawCursor(c,{x:head.x-3,y:head.y+3,h:6/.55,on:1});
    this.ctx.comp.draw(this.ctx.renderer, w.overlay.upload(), out);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, s = cityState(this.ctx.audio, f.t, w.times);
    this.camera(f, s); this.buildings(f, s);
    const lay=cityLyrics(this.ctx.lyrics,this.ctx.audio,w.times),o=w.october;
    const oz=-4*CELL-4*CELL,ox=-20;
    o.mesh.position.set(ox,0,oz);o.mesh.rotation.y=Math.atan2(w.camera.position.x-ox,w.camera.position.z-oz);
    o.mesh.scale.x=w.voice.form(lay.october,f.t).axes.wdth/87.5;
    const normal=new THREE.Vector3(0,0,1).applyQuaternion(o.mesh.quaternion);
    o.set({prog:o.karaoke({...lay.october,w:'OCTOBER'},f.t),aDim:0,cSung:CLAY,cDone:INK,done:f.t>=lay.october.end?1:0,tone:Math.max(0,normal.dot(KEY_L.value)),heat:0});
    o.mesh.visible=f.t>=lay.october.start;
    if (NIGHT) w.sky.render(this.ctx.renderer, out, 0.6, s.rising ? s.lift : 0);
    else w.ground.render(this.ctx.renderer, out, {
      kind: 'paper', t: f.t, camX: w.camera.position.x * 34, camY: w.camera.position.z * 30,
      zoom: 1, cell: 76, grid: 0.5, kick: f.a.kick, halftone: 0.3, pitch: 12, haze: 0,
    });
    const r = this.ctx.renderer;
    r.setRenderTarget(out); r.clearDepth();
    r.render(w.scene, w.camera);
    r.render(w.labels.scene, w.camera);
    this.survey(s, out); this.annotations(f, s, out);
    if (!NIGHT) w.print.render(this.ctx.renderer, out);
    return {
      ...postFor(NIGHT ? 'ink' : 'paper'), hud: 0, grain: 0.03, ...(NIGHT ? { vignette: 0.35, ca: 0.6 } : {}),
    };
  }
}

