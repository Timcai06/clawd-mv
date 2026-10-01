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
import { span } from '../kit/time';
import { Voice, drawSet, odometer, setLine } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { BLOCK, TOWER_BLOCK, CAM_YAW, DATES, STREETS, cameraAt, cityState, cityTimes, clawdRect, handoffIn, type CityTimes, type Point3 } from './parts/s04-city-model';
import { DateLabels } from './parts/s04-city-labels';
import { drawCalendar } from './parts/s03-form';
import { printInBox } from './parts/s01-print';
export const TYPE_LEVELS = { giant: 212, lyric: 50.8, label: 20 }; // cap heights in logical px

const PAPER = lin('paper'), INK = lin('ink'), CLAY = lin('clay');
const UP = new THREE.Vector3(0, 1, 0);

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

// Print values, not lighting: paper roofs, sides cut in dense vertical engraving (the storyboard's
// woodblock city), the two visible side orientations at different densities.
const BLOCK_FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld, vNormal; in float vDate; out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 paper, ink, clay;
uniform float accented, visited, kick, t;
void main() {
  float top = step(0.5, vNormal.y);
  float xSide = step(0.5, abs(vNormal.x));
  float along = mix(vWorld.x, vWorld.z, xSide);
  // vertical rules: hatch across the horizontal coordinate; darker towards the ground
  float darkness = mix(0.30, 0.52, xSide) + 0.16 * (1.0 - smoothstep(0.0, 1.4, vWorld.y));
  float rules = hatch(along * 7.5 + hash12(vec2(floor(vWorld.y * 1.3), vDate)) * 0.0, darkness);
  float cross = hatch((vWorld.y + along * 0.18) * 9.0, sat(darkness * 1.6 - 0.62));
  float printInk = max(rules, cross) * (1.0 - top);
  // roof edge: a hairline frame
  vec3 c = mix(paper, ink, printInk * 0.86);
  float focus = float(abs(vDate - accented) < 0.1);
  float read = step(vDate, visited);
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

class CityWorld {
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
  streets = new LineBatch(2400, { screen2D: false, blend: 'normal', depthTest: true });
  overlay = new Layer2D();
  times: CityTimes;
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
    this.voice = new Voice(ctx.lyrics, ctx.audio);
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute('date', new THREE.InstancedBufferAttribute(Float32Array.from({ length: 32 }, (_, i) => i + 1), 1));
    this.blockMaterial = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: BLOCK_FRAG,
      uniforms: {
        paper: { value: new THREE.Vector3(...PAPER) }, ink: { value: new THREE.Vector3(...INK) }, clay: { value: new THREE.Vector3(...CLAY) },
        accented: { value: 1 }, visited: { value: 1 }, kick: { value: 0 }, t: { value: 0 },
      }, toneMapped: false,
    });
    this.blocks = new THREE.InstancedMesh(geometry, this.blockMaterial, 32);
    this.blocks.frustumCulled = false;
    this.blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.blocks);
    const shadowGeo = new THREE.PlaneGeometry(1, 1);
    shadowGeo.setAttribute('date', new THREE.InstancedBufferAttribute(Float32Array.from({ length: 32 }, (_, i) => i + 1), 1));
    this.shadows = new THREE.InstancedMesh(shadowGeo, new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BLOCK_VERT, fragmentShader: SHADOW_FRAG,
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
      fragmentShader: FLOOR_FRAG,
      uniforms: { paper: { value: new THREE.Vector3(...PAPER) }, ink: { value: new THREE.Vector3(...INK) }, t: { value: 0 }, kick: { value: 0 } },
      toneMapped: false,
    });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), this.floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0.0, -0.015, -8.1);
    this.scene.add(this.floor);
    this.labels = new DateLabels(ctx.renderer);

  }

  project(p: Point3) {
    const v = this.projectScratch.set(...p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, visible: v.z > -1 && v.z < 1 };
  }

  dispose() {
    this.blocks.geometry.dispose(); this.blockMaterial.dispose();
    this.shadows.geometry.dispose(); (this.shadows.material as THREE.Material).dispose();
    this.floor.geometry.dispose(); this.floorMaterial.dispose();
    this.labels.dispose(); this.streets.geo.dispose(); this.streets.mat.dispose();
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
    const cam = this.w.camera, c = cameraAt(this.ctx.audio, f.t, this.w.times, s);
    cam.position.copy(c.pos); cam.fov = c.fov;
    cam.up.set(Math.sin(c.roll), Math.cos(c.roll), 0);
    cam.lookAt(c.target);
    if (c.shiftX) cam.setViewOffset(W, H, c.shiftX, 0, W, H); else cam.clearViewOffset();
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  private buildings(f: Frame, s: ReturnType<typeof cityState>) {
    const w = this.w;
    for (let i = 0; i < 32; i++) {
      const d = DATES[i]!;
      // Each block springs up in its own instant across the first beat (a ripple from day 1).
      const own = clamp(s.extrude * 1.6 - (i / 31) * 0.6);
      const roofPulse = 0; // Printed roofs stay fixed while the kick breathes the lyric layer.
      const h = i === 31 ? s.roof32 : Math.max(0.025, d.height * ease.outBack(own, 1.3) + roofPulse);
      const bw = i === 31 ? TOWER_BLOCK : BLOCK;
      w.position.set(d.x, h / 2, d.z); w.scale.set(bw, h, bw);
      w.matrix.compose(w.position, w.identity, w.scale);
      w.blocks.setMatrixAt(i, w.matrix);
      // Shadow: a sheared floor quad from the block's foot towards the lower left (light upper right).
      const len = h * 0.55;
      w.position.set(d.x - len * 0.5, 0.004, d.z + len * 0.35);
      w.scale.set(BLOCK + len, BLOCK, 1);
      w.matrix.compose(w.position, w.roofRotation, w.scale);
      w.shadows.setMatrixAt(i, w.matrix);
      w.position.set(d.x, h + 0.008, d.z); w.scale.set(1, 1, 1);
      w.matrix.compose(w.position, w.labelRotation, w.scale);
      w.labels.mesh.setMatrixAt(i, w.matrix);
    }
    w.blocks.instanceMatrix.needsUpdate = true;
    w.shadows.instanceMatrix.needsUpdate = true;
    w.labels.mesh.instanceMatrix.needsUpdate = true;
    w.labels.mesh.count = s.rising ? 32 : 31;
    w.shadows.count = s.rising ? 32 : 31;
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
  }

  private survey(s: ReturnType<typeof cityState>, out: THREE.WebGLRenderTarget) {
    const lb = this.w.streets;
    lb.clear();
    const seg = (a: Point3, b: Point3, width: number, color: [number, number, number], alpha = 1) =>
      lb.seg(...a, ...b, width, ...color, alpha);
    // The clay route: drawn from t (the whole history) every frame, up to the counted day.
    const dist = s.travel * STREETS.total;
    for (let i = 1; i < STREETS.points.length; i++) {
      const a = STREETS.points[i - 1]!, b = STREETS.points[i]!;
      seg(a, b, 0.7, INK, 0.07);
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
        seg([x, y0, z], [x, y1, z], 0.9, INK, 0.55 * k);
      }
    }
    lb.render(this.ctx.renderer, out, this.w.camera);
  }

  private character(f: Frame, s: ReturnType<typeof cityState>, c: CanvasRenderingContext2D) {
    const b=clawdRect(this.ctx.audio,f.t,this.w.times);
    c.save();c.translate(b.x,b.y);c.scale(b.w/160,b.h/50);
    Clawd.draw(c,0,0,Clawd.pose(s.rising?null:'A5',{beat:f.beat,beat0:this.ctx.audio.beatAt(this.w.times.start),p:s.travel,travel:0}),{px:10});c.restore();
  }

  /** Lyrics v3: the counter, the line under it, the OCTOBER headline, then "So I…" in the grid. */
  private lyrics(f: Frame, s: ReturnType<typeof cityState>, c: CanvasRenderingContext2D) {
    const v = this.w.voice, T = this.w.times, t = f.t;
    const line = v.line('There’s a thirty-second day in October');
    const forms = v.forms(line, t);
    const october = forms.at(-1)!;
    const slam = october.born > 0;
    const breath = v.breath(f.a.kick);

    // The counter (the sung "thirty-second" made numeric): huge at top-left, then it overflows to 32
    // and, when "October" lands, flies to the right margin as the "32" annotation.
    const fly = ease.inOutCubic(span(t, T.october, T.october + 0.32));
    const cx = lerp(96, 1752, fly), cy = lerp(312, 196, fly), size = lerp(300, 28, fly);
    const over = s.rising;
    c.save(); c.translate(cx, cy); c.scale(breath, breath);
    if (forms[2]!.born > 0) odometer(c, s.counter, 0, 0, size, { digits: 2, color: over ? 'clay' : 'ink', axes: { wdth: 75, wght: 900 } });
    c.restore();
    if (fly > 0.98) {
      c.strokeStyle = css('ink', 0.85); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(1752, 214); c.lineTo(1888, 214); c.stroke();
      c.beginPath(); c.moveTo(1560, 150); c.lineTo(1560, 420); c.stroke();

    }

    // "thirty-second day in": the line, set under the counter, each word born on its onset.
    const pre = forms.slice(0, -1);
    const lead = setLine(pre, 74, { space: 0.24 });
    const leadAlpha = slam ? Math.max(0, 1 - ease.outCubic(span(t, T.october, T.october + 0.18))) : 1;
    if (leadAlpha > 0) drawSet(c, lead, 92, 420, { on: 'paper', alpha: leadAlpha });

    // OCTOBER: slams down cropped by the frame on the onset, then stretches with the held note.
    if (slam) {
      const ox = v.form(october.word, t, { minWidth: 62, maxWidth: 84, rest: 880 });
      const k = t - october.t0;
      const drop = k < 0.1 ? lerp(-150, 10, ease.inQuad(k / 0.1)) : lerp(10, 0, ease.outCubic(clamp((k - 0.1) / 0.14)));
      const run = varRun('OCTOBER', 286, { wdth: ox.axes.wdth, wght: Math.max(760, ox.axes.wght) });
      const pres = Math.max(0.6, v.presence(line, t));
      c.save(); c.globalAlpha = pres; c.fillStyle = css('ink');
      c.translate(-26, 212 + drop); c.scale(breath, breath);
      printInBox(c, run, {x:0,y:-242,w:1215,h:242});
      c.restore();
      const lab = ease.outExpo(span(t, october.t0 + 0.12, october.t0 + 0.5));
      if (lab > 0) {
        c.globalAlpha = lab;
        c.strokeStyle = css('ink', 0.8); c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(72, 300); c.lineTo(72 + 620 * lab, 300); c.stroke();
        c.font = font(F.mono(), 20); c.fillStyle = css('ink',0.6);
        c.fillText('01—31', 72, 282);
        c.globalAlpha = 1;
      }
    }

    // "So I crack…": the next line takes the focus in the grid at the foot of the frame.
    const next = v.line('So I crack my claws and read it all over');
    if (t >= next.start) drawSet(c, setLine(v.forms(next, t), 74, { space: 0.24 }), 92, 420, { on: 'paper' });
  }

  private annotations(f: Frame, s: ReturnType<typeof cityState>, out: THREE.WebGLRenderTarget) {
    const w = this.w, c = w.overlay.ctx;
    w.overlay.clear();
    const incoming = handoffIn(f.t,this.ctx.audio,w.times);
    if(incoming.alpha>0){c.fillStyle=css('paper',incoming.alpha);c.fillRect(0,0,W,H);c.save();c.globalAlpha=incoming.alpha;drawCalendar(c,incoming);c.restore();}
    this.character(f,s,c);
    this.lyrics(f, s, c);
    const head = w.project([s.head[0], s.head[1], s.head[2]]);
    if (head.visible && head.x > 20 && head.x < W - 30 && head.y > 20 && head.y < H - 20) {
      drawCursor(c, { x: head.x - 7, y: head.y + 6, h: 24, on: blink(f.beat, !s.rising) });
    }
    this.ctx.comp.draw(this.ctx.renderer, w.overlay.upload(), out);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, s = cityState(this.ctx.audio, f.t, w.times);
    this.camera(f, s); this.buildings(f, s);
    w.ground.render(this.ctx.renderer, out, {
      kind: 'paper', t: f.t, camX: w.camera.position.x * 34, camY: w.camera.position.z * 30,
      zoom: 1, cell: 76, grid: 0.5, kick: f.a.kick, halftone: 0.3, pitch: 12, haze: 0,
    });
    const r = this.ctx.renderer;
    r.setRenderTarget(out); r.clearDepth();
    r.render(w.scene, w.camera);
    r.render(w.labels.scene, w.camera);
    this.survey(s, out); this.annotations(f, s, out);
    return {
      ...postFor('paper'), hud: 0, grain: 0.03,
    };
  }
}

