// S10 v5 — "Nineteen red, and they're shattering like glass".
// Nineteen test reports stand in a row as real glass slabs (parts/s10-world.ts). A low tracking shot
// runs down the row while each report's red X is stamped; on "shattering" every slab breaks into
// the eight shards of its storyboard pattern, each a rigid prism thrown out and falling under
// gravity, carrying its piece of the printed report and of the lyric strip that runs across the
// faces. The camera is thrown wide (the storyboard frame), then rolls and tips down after the falling
// glass on the last beat — the motion S11's rain continues. Light is real (one key light, Lambert),
// rendered as engraving: lines on the faces thicken where the glass turns away from the light.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, SCALE, scaleContext2D } from '../engine/gl';
import { GLSL_COMMON } from '../engine/glsl/common';
import { F, font } from '../engine/type';
import { afterBeats, span } from '../kit/time';
import { ease } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { Voice, setLine, drawSet, odometer } from '../kit/lyric-moves';
import * as Clawd from '../kit/clawd';
import { CALENDAR_TESTS } from '../kit/content';
import { PrintOverlay } from '../kit/print-overlay';
import { drawNote } from '../kit/note';
import { Rig, type P3 } from '../kit/rig';
import { VoxelClawd } from '../kit/clawd3d';
import { resolveX9Times, type X9Times } from './s09-z-shared';
import { handoffIn } from './parts/s10-glass';
import { carry, counter19 } from './parts/s09-type';
import { PLATES, PW, PH, TH, ROW_DIR, ROW_STEP, plateToWorld, shardTri, shardMotion, rot, cameraAt, stampAt, CLAWD_AT, CLAWD_VOX, CLAWD_YAW } from './parts/s10-world';
// Archivo levels are cap heights; Plex label=18 is its CSS font size.
export const TYPE_LEVELS = { giant: null, lyric: 65.856, label: 18 };

const SHARDS = 8, VERTS = 24; // a prism: 2 triangles + 3 quads (as triangles)
const STRIP_W = 2048, STRIP_H = 400, STRIP_LEN = ROW_STEP * (PLATES - 1) + PW * 1.4;

const VERT = /* glsl */ `
precision highp float;
in vec3 position, normal, aRest, aBary, aInfo; in vec2 uv; // aInfo: (plate, face, red)
uniform mat4 modelViewMatrix, projectionMatrix;
out vec3 vN, vRest, vBary, vInfo; out vec2 vUv;
void main() {
  vN = normal; vRest = aRest; vBary = aBary; vInfo = aInfo; vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const FRAG = /* glsl */ `
precision highp float;
in vec3 vN, vRest, vBary, vInfo; in vec2 vUv;
out vec4 fragColor;
${GLSL_COMMON}
uniform sampler2D labels, strip;
uniform vec3 paper, ink, fail, L, rowO, rowD;
uniform float stripLen, crack;
float xMark(vec2 p, float r) { // an X of half-size r
  vec2 a = abs(vec2(p.x + p.y, p.x - p.y)) * 0.7071;
  float d = min(a.x, a.y);
  return (1.0 - smoothstep(0.09 * r, 0.09 * r + fwidth(d) * 1.5, d)) * step(max(abs(p.x), abs(p.y)), r);
}
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  float face = vInfo.y, plate = vInfo.x, red = vInfo.z;
  float tone = 0.18 + 0.82 * max(dot(n, normalize(L)), 0.0);
  vec3 col;
  if (face > 1.5) {
    // the slab's thickness: dense engraving
    float c = hatch((vRest.y + vRest.x * 0.6) * 22.0, 0.55 + 0.35 * (1.0 - tone));
    col = mix(paper, ink, c * 0.9);
  } else {
    // the face: diagonal engraving that thickens away from the light
    float u = (vUv.x * ${PW.toFixed(2)} + vUv.y * ${PH.toFixed(2)} * 0.45) * 7.0;
    col = mix(paper, ink, hatch(u, pow(1.0 - tone, 1.6) * 0.75) * 0.55);
    if (face < 0.5) {
      vec2 lu = vec2((vUv.x - 0.1) / 0.8, (vUv.y - 0.7) / 0.07);
      if (lu.x > 0.0 && lu.x < 1.0 && lu.y > 0.0 && lu.y < 1.0)
        col = mix(col, ink, texture(labels, vec2(lu.x, (18.0 - plate + lu.y) / 19.0)).a * 0.8);
      float x = xMark((vUv - vec2(0.55, 0.86)) * vec2(${PW.toFixed(2)}, ${PH.toFixed(2)}), 0.32);
      col = mix(col, fail, x * red);
      for (int k = 0; k < 4; k++) {
        float y = 0.12 + 0.05 * float(k);
        col = mix(col, ink, 0.35 * (1.0 - smoothstep(0.0, fwidth(vUv.y) * 1.2, abs(vUv.y - y))) * step(0.1, vUv.x) * step(vUv.x, 0.9));
      }
      // the lyric strip, printed across the whole row (in rest-world coordinates)
      float s = dot(vRest - rowO, rowD) / stripLen, v = vRest.y / ${PH.toFixed(2)};
      if (s > 0.0 && s < 1.0 && v > 0.2 && v < 0.58) {
        vec4 lt = texture(strip, vec2(s, (v - 0.2) / 0.38));
        col = mix(col, lt.rgb / max(lt.a, 1e-3), lt.a);
      }
      vec2 e = min(vUv, 1.0 - vUv) * vec2(${PW.toFixed(2)}, ${PH.toFixed(2)});
      col = mix(col, ink, (1.0 - smoothstep(0.035, 0.035 + fwidth(e.x) * 1.5, min(e.x, e.y))) * 0.7);
    } else col *= 0.86;
    // cracks: the shard edges show just before the slab goes
    float b = min(vBary.x, min(vBary.y, vBary.z));
    col = mix(col, ink, (1.0 - smoothstep(0.0, fwidth(b) * 1.6, b)) * crack * 0.9);
  }
  fragColor = vec4(col, 1.0);
}`;

type Pt = P3;
class World {
  print = new PrintOverlay();
  ground = new Ground(); layer = new Layer2D(); times: X9Times; voice: Voice; users = 0;
  rig = new Rig();
  scene = new THREE.Scene();
  geo = new THREE.BufferGeometry();
  mat: THREE.RawShaderMaterial;
  labels: THREE.CanvasTexture;
  stripLayer = new Layer2D(STRIP_W, STRIP_H, 1);
  clawd = new VoxelClawd();
  pos = new Float32Array(PLATES * SHARDS * VERTS * 3);
  nrm = new Float32Array(PLATES * SHARDS * VERTS * 3);
  info = new Float32Array(PLATES * SHARDS * VERTS * 3);
  constructor(ctx: SceneCtx) {
    this.times = resolveX9Times(ctx); this.voice = new Voice(ctx.lyrics, ctx.audio);
    const cv = document.createElement('canvas'); cv.width = 512 * SCALE; cv.height = 64 * 19 * SCALE;
    const c = scaleContext2D(cv.getContext('2d')!, SCALE);
    c.font = font(F.mono(500), 34); c.fillStyle = '#fff'; c.textBaseline = 'middle';
    for (let i = 0; i < 19; i++) c.fillText(CALENDAR_TESTS[i % CALENDAR_TESTS.length]!, 8, 64 * i + 32);
    this.labels = new THREE.CanvasTexture(cv); this.labels.generateMipmaps = true;
    this.labels.minFilter = THREE.LinearMipmapLinearFilter; this.labels.anisotropy = 8;
    const uv = new Float32Array(PLATES * SHARDS * VERTS * 2), rest = new Float32Array(PLATES * SHARDS * VERTS * 3);
    const bary = new Float32Array(PLATES * SHARDS * VERTS * 3);
    let v = 0;
    for (let i = 0; i < PLATES; i++) for (let j = 0; j < SHARDS; j++) {
      for (const [q, face, b] of prism(shardTri(i, j).pts)) {
        uv[v * 2] = q.x / PW + 0.5; uv[v * 2 + 1] = q.y / PH;
        const w = plateToWorld(i, q);
        rest[v * 3] = w.x; rest[v * 3 + 1] = w.y; rest[v * 3 + 2] = w.z;
        bary.set(b, v * 3);
        this.info[v * 3] = i; this.info[v * 3 + 1] = face;
        v++;
      }
    }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aInfo', new THREE.BufferAttribute(this.info, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    this.geo.setAttribute('aRest', new THREE.BufferAttribute(rest, 3));
    this.geo.setAttribute('aBary', new THREE.BufferAttribute(bary, 3));
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        labels: { value: this.labels }, strip: { value: this.stripLayer.texture },
        paper: { value: new THREE.Vector3(...lin('paper')) }, ink: { value: new THREE.Vector3(...lin('ink')) },
        fail: { value: new THREE.Vector3(...lin('fail')) }, L: { value: new THREE.Vector3(-0.45, 0.8, 0.55) },
        rowO: { value: new THREE.Vector3(-PW * 0.7, 0, 0) }, rowD: { value: new THREE.Vector3(ROW_DIR.x, 0, ROW_DIR.z) },
        stripLen: { value: STRIP_LEN }, crack: { value: 0 },
      },
      side: THREE.DoubleSide, toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.geo, this.mat); mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.clawd.mesh.scale.setScalar(CLAWD_VOX); this.scene.add(this.clawd.mesh);
  }
  /** Rebuild world positions and normals of every shard for time t (pure: no history). */
  update(t: number, au: Parameters<typeof stampAt>[0]) {
    const T = this.times;
    let v = 0;
    for (let i = 0; i < PLATES; i++) {
      const red = t >= stampAt(au, T, i) ? 1 : 0;
      for (let j = 0; j < SHARDS; j++) {
        const { pts, c } = shardTri(i, j), m = shardMotion(T, i, j, t);
        const cw = plateToWorld(i, c);
        const P = prism(pts).map(([q]) => {
          const w = plateToWorld(i, q);
          const r = rot({ x: w.x - cw.x, y: w.y - cw.y, z: w.z - cw.z }, m.axis, m.angle);
          return { x: cw.x + r.x + m.d.x, y: Math.max(-40, cw.y + r.y + m.d.y), z: cw.z + r.z + m.d.z };
        });
        for (let tri = 0; tri < VERTS / 3; tri++) {
          const a = P[tri * 3]!, b = P[tri * 3 + 1]!, cc = P[tri * 3 + 2]!;
          const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = cc.x - a.x, vy = cc.y - a.y, vz = cc.z - a.z;
          let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
          const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
          for (const q of [a, b, cc]) {
            this.pos[v * 3] = q.x; this.pos[v * 3 + 1] = q.y; this.pos[v * 3 + 2] = q.z;
            this.nrm[v * 3] = nx; this.nrm[v * 3 + 1] = ny; this.nrm[v * 3 + 2] = nz;
            this.info[v * 3 + 2] = red; v++;
          }
        }
      }
    }
    for (const n of ['position', 'normal', 'aInfo']) this.geo.getAttribute(n).needsUpdate = true;
  }
  dispose() {
    this.print.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); this.stripLayer.texture.dispose();
    this.geo.dispose(); this.mat.dispose(); this.labels.dispose(); this.clawd.dispose();
  }
}

/** Prism of a plate-local triangle as 8 triangles: [point, face (0 front, 1 back, 2 side), barycentric]. */
function prism(p: Pt[]) {
  const f = (q: Pt, z: number): Pt => ({ x: q.x, y: q.y, z });
  const out: [Pt, number, [number, number, number]][] = [];
  const B: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let k = 0; k < 3; k++) out.push([f(p[k]!, TH), 0, B[k]!]);
  for (let k = 2; k >= 0; k--) out.push([f(p[k]!, -TH), 1, B[k]!]);
  for (let k = 0; k < 3; k++) {
    const a = p[k]!, b = p[(k + 1) % 3]!;
    for (const x of [f(a, TH), f(b, TH), f(b, -TH), f(a, TH), f(b, -TH), f(a, -TH)]) out.push([x, 2, [1, 1, 1]]);
  }
  return out;
}

let world: World | undefined;
export default class S10Redwall extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio, t = f.t, v = w.voice, r = this.ctx.renderer;
    // the last beat: the floor gives way to the dark the glass falls into (S11's rain)
    const dark = ease.inOutQuad(span(t, afterBeats(au, T.wallEnd, -1.6), afterBeats(au, T.wallEnd, -0.2)));
    w.ground.render(r, out, { kind: 'paper', t, grid: 0, haze: 0, halftone: 0.12, flipTo: 'ink', flip: dark });
    // the lyric strip across the row's faces (words born on their onsets; shards carry their pieces)
    const line = v.line('Nineteen red, and they’re shattering like glass');
    const sc = w.stripLayer.ctx; w.stripLayer.clear();
    { const set = setLine(v.forms(line, t).slice(1), 300, { space: 0.2 }); const k = Math.min(1, (STRIP_W - 80) / Math.max(1, set.width));
      sc.save(); sc.translate(40, 290); sc.scale(k, 1); drawSet(sc, set, 0, 0, { on: 'paper' }); sc.restore(); }
    w.stripLayer.upload();
    // the world
    w.rig.set(cameraAt(au, t, T));
    w.update(t, au);
    w.mat.uniforms.crack!.value = Math.min(1, Math.max(0, (t - (T.shatter - 0.12)) / 0.12));
    w.clawd.update(Clawd.pose('A8', { beat: au.beatAt(t), beat0: au.beatAt(T.nineteen), p: t >= T.shatter ? 1 : 0 }));
    w.clawd.mesh.position.set(CLAWD_AT.x, CLAWD_AT.y, CLAWD_AT.z); w.clawd.mesh.rotation.set(0, CLAWD_YAW, 0);
    w.clawd.light([-0.45, 0.8, 0.55], 0.45, 0);
    r.setRenderTarget(out); r.clearDepth(); r.render(w.scene, w.rig.cam);
    // HUD: the counter, "failed", a note, the carried line
    w.layer.clear(); const c = w.layer.ctx;
    const n = handoffIn(t, au, T), first = v.form(line.words[0]!, t);
    if (t < line.start) counter19(c, n.x, n.baseline, n.capH, 'fail');
    else if (first.born > 0) odometer(c, 19 * first.sung, n.x, n.baseline, 196,
      { digits: 2, color: first.stress ? 'clay' : 'fail', on: 'paper', age: first.age, axes: first.axes, pitch: 98 });
    c.font = font(F.mono(700), 180); c.fillStyle = css('fail', 0.6); c.fillText('failed', 386, 204);
    c.fillStyle = css('clay'); c.fillRect(974, 76, 58, 135);
    drawNote(c, { ax: 1040, ay: 150, x: 1100, y: 112, text: '19/19 failing', sub: 'consistent, at least', t0: afterBeats(au, T.nineteen, 1), on: 'paper' }, t);
    carry(c, v, t, T.wallStart, 96, 348, 'paper');
    this.ctx.comp.draw(r, w.layer.upload(), out, { opacity: 1 - dark });
    if (dark < 0.5) w.print.render(r, out);
    return dark > 0.5 ? { ...postFor('ink'), hud: 0, ca: 0.6 } : { ...postFor('paper'), hud: 0, bloom: 0 };
  }
}
