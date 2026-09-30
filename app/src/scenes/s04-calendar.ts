// S04 — October as an engraved city. Calendar cells rise into architectural blocks,
// the clay cursor surveys the streets, and an impossible 32nd building erupts on the cut.
// The two timeline entries share resources, never motion state. Arbitrary seeks are safe.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { GLSL_COMMON } from '../engine/glsl/common';
import { LineBatch } from '../engine/lines';
import { Lyrics } from '../engine/lyrics';
import { F, font, layout } from '../engine/type';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { blink, drawCursor } from '../kit/cursor';
import { beatsSince, hitAfter, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { BLOCK, CELL, DATES, STREETS, cityState, cityTimes, type CityTimes, type Point3 } from './parts/s04-city-model';
import { DateLabels } from './parts/s04-city-labels';

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

const BLOCK_FRAG = /* glsl */ `
precision highp float;
in vec3 vWorld, vNormal; in float vDate; out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 paper, ink, clay;
uniform float accented, visited, kick, t;
void main() {
  // Discrete print values, not lambert lighting. The dark side is made of ink strokes.
  float top = step(0.5, vNormal.y);
  float side = abs(vNormal.x);
  float darkness = mix(0.23 + side * 0.17, 0.018, top);
  vec2 uv = vec2(vWorld.x + vWorld.z * 0.32, vWorld.y + vWorld.z * 0.22);
  float printInk = engrave(uv, darkness, 12.0, 0.72);
  vec3 c = mix(paper, ink, printInk * 0.76);
  float focus = float(abs(vDate - accented) < 0.1);
  float read = step(vDate, visited);
  // Rooftops breathe on the kick; paper remains below the bloom threshold.
  c = mix(c, clay, top * focus * (0.22 + kick * 0.18));
  c = mix(c, ink, top * (1.0 - read) * 0.045);
  if (vDate > 31.5) {
    float bands = hatch((vWorld.y + vWorld.x * 0.20) * 5.0, 0.10);
    c = mix(c, clay, bands * (1.0 - top) * 0.75);
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
  vec2 p = vUv * vec2(36.0, 32.0);
  float grid = max(rule(p.x / 3.6, 1.0), rule(p.y / 3.6, 1.0));
  float minor = max(rule(p.x / 0.9, 0.55), rule(p.y / 0.9, 0.55));
  float sweep = 1.0 - smoothstep(0.0, 0.12, abs(fract(p.x * 0.03 - t * 0.11) - 0.5));
  float a = grid * (0.10 + kick * 0.04) + minor * 0.024 + sweep * grid * 0.045;
  vec3 c = mix(paper, ink, a);
  c *= 1.0 - 0.008 * fbm(p * 1.1 + vec2(t * 0.04, 0.0), 2);
  fragColor = vec4(c, 1.0);
}`;

class CityWorld {
  users = 0;
  ground = new Ground();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 200);
  blocks: THREE.InstancedMesh;
  blockMaterial: THREE.RawShaderMaterial;
  floor: THREE.Mesh;
  floorMaterial: THREE.RawShaderMaterial;
  labels: DateLabels;
  streets = new LineBatch(2400, { screen2D: false, blend: 'normal', depthTest: true });
  overlay = new Layer2D();
  sprite = new Layer2D(256, 144);
  clawd: THREE.Mesh;
  heights = new Float32Array(32);
  times: CityTimes;
  matrix = new THREE.Matrix4();
  position = new THREE.Vector3();
  scale = new THREE.Vector3();
  roofRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  identity = new THREE.Quaternion();
  projectScratch = new THREE.Vector3();

  constructor(ctx: SceneCtx) {
    this.times = cityTimes(ctx.audio, ctx.lyrics);
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
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(36, 32), this.floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.set(0, -0.015, -8);
    this.scene.add(this.floor);
    this.labels = new DateLabels(ctx.renderer);
    const spriteMat = new THREE.MeshBasicMaterial({
      map: this.sprite.texture, transparent: true, depthWrite: false, toneMapped: false,
    });
    this.sprite.texture.magFilter = THREE.NearestFilter;
    this.sprite.texture.minFilter = THREE.NearestFilter;
    this.clawd = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 2.59), spriteMat);
    this.clawd.frustumCulled = false;
    this.scene.add(this.clawd);
  }

  project(p: Point3) {
    const v = this.projectScratch.set(...p).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, visible: v.z > -1 && v.z < 1 };
  }

  dispose() {
    this.blocks.geometry.dispose(); this.blockMaterial.dispose();
    this.floor.geometry.dispose(); this.floorMaterial.dispose();
    this.labels.dispose(); this.streets.geo.dispose(); this.streets.mat.dispose();
    this.clawd.geometry.dispose(); (this.clawd.material as THREE.Material).dispose();
    this.sprite.texture.dispose(); this.overlay.texture.dispose(); this.ground.pass.mat.dispose();
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
    const { camera: cam, times: T } = this.w;
    let x: number, y: number, z: number, dx: number, dy: number, dz: number;
    if (s.rising) {
      const d = DATES[31]!;
      // Hard reframe on the resolved October beat, then the street flight stops dead.
      const approach = ease.outExpo(span(beatsSince(this.ctx.audio, f.t, T.rise), 0, 0.75));
      x = d.x + 0.7; y = lerp(1.1, 3.1, approach); z = d.z;
      dx = lerp(9.4, 7.8, approach); dy = lerp(8.1, 5.1, approach); dz = lerp(15.2, 13.8, approach);
      cam.fov = lerp(38, 32, s.settle);
    } else {
      // One forceful move per measured beat; the city opens as a flat month before extrusion.
      const row = s.travel * 4.7;
      const pan = Math.sin(s.travel * Math.PI * 2) * 3.6;
      x = lerp(5.8, -0.6, s.travel) + pan;
      y = 0.6; z = -row * CELL;
      dx = lerp(10.6, 7.2, s.extrude); dy = lerp(25.8, 12.8, s.extrude); dz = lerp(13.2, 12.6, s.extrude);
      cam.fov = lerp(42, 34, s.extrude);
    }
    cam.position.set(x + dx, y + dy, z + dz);
    cam.up.copy(UP); cam.lookAt(x, y, z);
    cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  }

  private buildings(f: Frame, s: ReturnType<typeof cityState>) {
    const w = this.w;
    for (let i = 0; i < 32; i++) {
      const d = DATES[i]!;
      const roofPulse = f.a.kick * (0.055 + 0.04 * (d.column % 3));
      const h = i === 31 ? s.roof32 : Math.max(0.025, d.height * s.extrude + roofPulse * s.extrude);
      w.heights[i] = h;
      w.position.set(d.x, h / 2, d.z); w.scale.set(BLOCK, h, BLOCK);
      w.matrix.compose(w.position, w.identity, w.scale);
      w.blocks.setMatrixAt(i, w.matrix);
      w.position.set(d.x, h + 0.008, d.z); w.scale.set(1, 1, 1);
      w.matrix.compose(w.position, w.roofRotation, w.scale);
      w.labels.mesh.setMatrixAt(i, w.matrix);
    }
    w.blocks.instanceMatrix.needsUpdate = true;
    w.labels.mesh.instanceMatrix.needsUpdate = true;
    w.labels.mesh.count = s.rising ? 32 : 31;
    const d32 = DATES[31]!;
    w.labels.facade.visible = s.rising && s.lift > 0.25;
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
    // Scale ticks and small survey crosses, separate from the date blocks.
    for (let r = 0; r < 6; r++) {
      const z = -r * CELL;
      for (let c = 0; c < 7; c++) {
        const x = (c - 3) * CELL;
        seg([x - 0.15, 0.018, z - CELL / 2], [x + 0.15, 0.018, z - CELL / 2], 0.8, INK, 0.25);
        seg([x, 0.018, z - CELL / 2 - 0.15], [x, 0.018, z - CELL / 2 + 0.15], 0.8, INK, 0.25);
      }
    }
    // A single clay stroke traverses real streets; redraw the full history from t every time.
    const dist = s.travel * STREETS.total;
    for (let i = 1; i < STREETS.points.length; i++) {
      const a = STREETS.points[i - 1]!, b = STREETS.points[i]!;
      seg(a, b, 0.7, INK, 0.08);
      if (STREETS.lengths[i - 1]! >= dist) continue;
      const k = Math.min(1, (dist - STREETS.lengths[i - 1]!) / (STREETS.lengths[i]! - STREETS.lengths[i - 1]!));
      seg(a, [lerp(a[0], b[0], k), a[1], lerp(a[2], b[2], k)], 2.4, CLAY, 0.95);
    }
    if (s.rising) {
      const d = DATES[31]!, h = s.roof32;
      const x = d.x - BLOCK / 2 - 0.65;
      seg([x, 0.04, d.z], [x, h, d.z], 1.1, CLAY, 0.8);
      for (let k = 0; k <= 8; k++) {
        const y = h * k / 8;
        seg([x - 0.12, y, d.z], [x + (k % 4 === 0 ? 0.25 : 0.1), y, d.z], 1, INK, 0.55);
      }
    }
    lb.render(this.ctx.renderer, out, this.w.camera);
  }

  private character(f: Frame, s: ReturnType<typeof cityState>) {
    const w = this.w, c = w.sprite.ctx;
    w.sprite.clear();
    const action = s.rising ? 'A3' : 'A5';
    const p = Clawd.pose(action, {
      beat: f.beat, beat0: this.ctx.audio.beatAt(s.rising ? w.times.rise : w.times.start),
      p: s.travel, travel: 0, look: s.rising ? 1 : 0,
    });
    Clawd.draw(c, 48, 48, p, { px: 10, eye: css('ink') });
    w.sprite.upload();
    const d32 = DATES[31]!;
    const head = s.rising ? [d32.x - 3.0, 0.06, d32.z + 2.4] as Point3 : s.head;
    w.clawd.position.set(head[0], 0.92, head[2]);
    w.clawd.quaternion.copy(w.camera.quaternion);
    w.clawd.scale.setScalar(s.rising ? 0.83 : 0.67);
  }

  private lyrics(f: Frame, c: CanvasRenderingContext2D) {
    const ly = this.ctx.lyrics;
    const line = ly.lineAt(f.t) ?? ly.lastLine(f.t);
    if (!line || f.t > line.end + 0.7) return;
    // An architectural street-name register, not the default lower-third lyric layer.
    const held = line.words.find((w) => w.w.toLowerCase() === 'october');
    const width = held ? lerp(75, 112.5, Lyrics.wordProgress(held, f.t)) : 87.5;
    const family = F.archivo(width, 700);
    const size = line.text.includes('thirty-second') ? 62 : 46;
    const lay = layout(line.text, family, size);
    c.font = font(family, size); c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink', 0.30); c.fillText(line.text, 100, 204);
    let char = 0;
    for (const word of line.words) {
      const idx = line.text.indexOf(word.w, char);
      if (idx < 0) continue;
      const gx = lay.glyphs[idx]?.x ?? 0;
      const right = lay.glyphs[idx + word.w.length]?.x ?? lay.width;
      const p = Lyrics.wordProgress(word, f.t);
      if (p > 0) {
        c.save(); c.beginPath(); c.rect(100 + gx - 1, 140, (right - gx + 2) * p, 80); c.clip();
        c.fillStyle = css('ink'); c.fillText(line.text, 100, 204); c.restore();
      }
      char = idx + word.w.length;
    }
    const tail = 100 + Math.min(1620, lay.width) + 22;
    drawCursor(c, { x: tail, y: 202, h: 40, on: blink(f.beat) });
  }

  private annotations(f: Frame, s: ReturnType<typeof cityState>, out: THREE.WebGLRenderTarget) {
    const w = this.w, c = w.overlay.ctx;
    w.overlay.clear();
    c.fillStyle = css('ink'); c.font = font(F.mono(500), 22);
    c.fillText('OCTOBER / 2026', 100, 112);
    c.fillStyle = css('ink', 0.52); c.font = font(F.mono(400), 15);
    c.fillText(s.rising ? 'MONTH BOUNDARY / ONE CELL TOO FAR' : 'DATE GRID / STREET SURVEY', 100, 139);
    this.lyrics(f, c);
    const head = w.project(s.head);
    if (head.visible && head.x > 20 && head.x < W - 30 && head.y > 230 && head.y < H - 20) {
      drawCursor(c, { x: head.x, y: head.y, h: s.rising ? 30 : 24, on: blink(f.beat, !s.rising) });
    }
    // The arrival callout sits inside the title-safe margin regardless of projection.
    if (s.rising) {
      const k = ease.outExpo(span(beatsSince(this.ctx.audio, f.t, w.times.rise), 0.40, 1.10));
      const d = DATES[31]!, roof = w.project([d.x, s.roof32, d.z]);
      c.globalAlpha = k;
      c.font = font(F.archivo(62, 900), 170); c.fillStyle = css('clay');
      c.fillText('32', 1450, 650);
      c.fillStyle = css('ink'); c.font = font(F.mono(500), 22);
      c.fillText('OCTOBER', 1455, 698);
      c.fillStyle = css('ink', 0.60); c.font = font(F.mono(400), 15);
      c.fillText('EXPECTED 31 / FOUND 32', 1455, 728);
      if (roof.visible) {
        c.strokeStyle = css('clay', 0.8); c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(roof.x, roof.y); c.lineTo(1380, 672); c.lineTo(1430, 672); c.stroke();
      }
      c.globalAlpha = 1;
    }
    c.font = font(F.mono(400), 16); c.fillStyle = css('ink', 0.48);
    c.fillText('SUN    MON    TUE    WED    THU    FRI    SAT', 100, 958);
    c.fillText('31 DAYS IN OCTOBER', 100, 990);
    this.ctx.comp.draw(this.ctx.renderer, w.overlay.upload(), out);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, s = cityState(this.ctx.audio, f.t, w.times);
    this.camera(f, s); this.buildings(f, s); this.character(f, s);
    w.ground.render(this.ctx.renderer, out, {
      kind: 'paper', t: f.t, camX: w.camera.position.x * 34, camY: w.camera.position.z * 30,
      zoom: s.rising ? 1.15 : 1, cell: 76, grid: 0.6, kick: f.a.kick,
      halftone: s.rising ? 0.65 : 0.4, pitch: 12, haze: 0,
    });
    const r = this.ctx.renderer;
    r.setRenderTarget(out); r.clearDepth();
    r.render(w.scene, w.camera);
    r.render(w.labels.scene, w.camera);
    this.survey(s, out); this.annotations(f, s, out);
    const impact = hitAfter(f.t, w.times.rise, 0.09) * 4;
    return {
      ...postFor('paper'), hud: 0, grain: 0.025,
      shake: [impact * (hash(frameIdx(f.t), 41) - 0.5), impact * (hash(frameIdx(f.t), 42) - 0.5)] as [number, number],
    };
  }
}
