// S07 — the keys are a real, engraved 3D terrain. Clawd drops onto Enter,
// waves travel through the field, then the camera dives into Enter's ink aperture.
// The final cursor is deliberately parked for the following chorus pickup.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { GLSL_COMMON } from '../engine/glsl/common';
import { LineBatch } from '../engine/lines';
import { strokeText, type StrokeText } from '../engine/stroke';
import { F, font, layout } from '../engine/type';
import { Lyrics } from '../engine/lyrics';
import { ease, lerp, frameIdx, hash } from '../engine/util';
import { css, lin } from '../theme';
import { postFor } from '../kit/ground';
import { blink, drawCursor } from '../kit/cursor';
import { afterBeats, beatsSince, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { resolveCTimes, keyboardState, type CTimes } from './parts/s06-timing';
import { TERRAIN_KEYS, ENTER, keyHeight, terrainOpacity } from './parts/s07-terrain';

const PAPER = lin('paper'), INK = lin('ink'), CLAY = lin('clay');
const Y_TOP = 0.515;
const CURSOR = new THREE.Vector3(ENTER.x, Y_TOP, ENTER.z);

const KEY_VERT = /* glsl */ `
attribute vec4 keyMeta;
uniform float beat, kick, landing;
varying vec3 vWorld, vNormal;
varying float vEnter;
void main() {
  float x = keyMeta.x, z = keyMeta.y;
  float height = 0.48 + sin(beat * 3.14159265359 - x * 0.62 - z * 0.85) * 0.16
    + sin(beat * 3.14159265359 * 0.5 + x * 0.22) * 0.055
    + kick * 0.13 * cos(x * 0.34 + z * 0.5);
  if (keyMeta.w > 0.5) height = 0.5 - landing * 0.22;
  vec4 p = instanceMatrix * vec4(position, 1.0);
  p.y += height;
  vWorld = p.xyz;
  vNormal = normalize(mat3(instanceMatrix) * normal);
  vEnter = keyMeta.w;
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;

const KEY_FRAG = /* glsl */ `
uniform vec3 paper, ink, clay;
uniform float opacity;
varying vec3 vWorld, vNormal;
varying float vEnter;
void main() {
  float top = step(0.8, vNormal.y);
  float side = 1.0 - top;
  // Flat colour fields and cut hatch lines convey volume; no light or reflection.
  float engraved = engrave(vWorld.xz + vec2(vWorld.y * 0.7), 0.25 + side * 0.4, 35.0, 0.65);
  float cross = hatch((vWorld.x + vWorld.y * 0.75) * 22.0, side * 0.3);
  vec3 base = mix(ink, paper, top * 0.35 + side * 0.10);
  base = mix(base, ink, clamp(engraved * 0.72 + cross * 0.35, 0.0, 1.0));
  // The hero key carries clay ink, below the bloom threshold.
  base = mix(base, clay * 0.65, vEnter * top * 0.28);
  gl_FragColor = vec4(base, opacity);
}`;

const TOPOGRAPHY = /* glsl */ `
uniform vec3 ink, paper;
uniform float beat, kick, dive, t;
uniform vec2 camera;
void main() {
  vec2 px = FRAG_PX;
  vec2 q = (px - vec2(960.0, 540.0)) * vec2(0.0014, 0.0024) + camera * 0.09;
  float field = sin(q.x * 2.6 - beat * 0.17) * cos(q.y * 2.3 + beat * 0.21)
    + sin(q.x * 1.3 + q.y * 1.8 - beat * 0.28) * 0.6;
  float contours = hatch(field * 5.0, 0.10);
  float dots = step(0.94, sin(q.x * 70.0) * sin(q.y * 70.0));
  vec3 c = mix(ink, paper, (contours * (0.042 + 0.025 * kick) + dots * 0.012) * (1.0 - dive));
  // Drafting lines and travel marks emerge continuously during the rush.
  vec2 grid = (px - vec2(960.0, 540.0)) / (1.0 + dive) + camera * 80.0;
  float minor = max(hatch(grid.x / 60.0, 0.04), hatch(grid.y / 60.0, 0.04));
  float dash = step(0.97, hash12(vec2(floor(grid.x / 6.0), 7.0)))
    * smoothstep(0.55, 1.0, fract(grid.y / 900.0 + dive * 6.0));
  c = mix(c, paper, minor * dive * 0.028 + dash * sin(dive * 3.14159265359) * 0.13);
  fragColor = vec4(c, 1.0);
}`;

/** A flat-sided, bevelled keycap with no rounded toy-like silhouette. */
function keycapGeometry() {
  const pos: number[] = [], uv: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    for (const p of [a, b, d, b, c, d]) { pos.push(...p); uv.push(p[0]! + 0.5, p[2]! + 0.5); }
  };
  const corners = (s: number, y: number) => [[-s, y, -s], [-s, y, s], [s, y, s], [s, y, -s]];
  const lower = corners(0.5, -1), shoulder = corners(0.5, -0.09), top = corners(0.45, 0);
  quad(top[0]!, top[1]!, top[2]!, top[3]!);
  quad(lower[3]!, lower[2]!, lower[1]!, lower[0]!);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(lower[i]!, lower[j]!, shoulder[j]!, shoulder[i]!);
    quad(shoulder[i]!, shoulder[j]!, top[j]!, top[i]!);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}

interface KeyLegend { text: StrokeText; x: number; z: number; scale: number; enter: boolean }

class KeyboardWorld {
  users = 0;
  times: CTimes;
  bg = new FSPass(TOPOGRAPHY, {
    ink: { value: new THREE.Vector3(...INK) }, paper: { value: new THREE.Vector3(...PAPER) },
    beat: { value: 0 }, kick: { value: 0 }, dive: { value: 0 }, t: { value: 0 },
    camera: { value: new THREE.Vector2() },
  });
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, W / H, 0.035, 100);
  caps: THREE.InstancedMesh;
  mat: THREE.ShaderMaterial;
  deck: THREE.Mesh;
  rail: THREE.Mesh;
  aperture: THREE.Mesh;
  lines = new LineBatch(12000, { screen2D: false, blend: 'normal', depthTest: true });
  clayLines = new LineBatch(1000, { screen2D: false, blend: 'add', depthTest: true });
  hud = new Layer2D();
  legends: KeyLegend[];
  lyricWords: StrokeText[];
  // Clawd uses the canonical drawer on a small scale-aware texture.
  sprite = new Layer2D(256, 160);
  clawd: THREE.Mesh;

  constructor(ctx: SceneCtx) {
    this.times = resolveCTimes(ctx.audio, ctx.lyrics);
    const geo = keycapGeometry();
    geo.setAttribute('keyMeta', new THREE.InstancedBufferAttribute(new Float32Array(TERRAIN_KEYS.flatMap((k) =>
      [k.x, k.z, k.index, k.enter ? 1 : 0])), 4));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: KEY_VERT, fragmentShader: GLSL_COMMON + KEY_FRAG,
      uniforms: {
        beat: { value: 0 }, kick: { value: 0 }, landing: { value: 0 }, opacity: { value: 1 },
        ink: { value: new THREE.Vector3(...INK) }, paper: { value: new THREE.Vector3(...PAPER) },
        clay: { value: new THREE.Vector3(...CLAY) },
      }, transparent: true, depthWrite: true,
    });
    this.caps = new THREE.InstancedMesh(geo, this.mat, TERRAIN_KEYS.length);
    const m = new THREE.Matrix4();
    TERRAIN_KEYS.forEach((k, i) => {
      m.makeScale(k.width, 0.42, k.depth); m.setPosition(k.x, 0, k.z); this.caps.setMatrixAt(i, m);
    });
    this.caps.instanceMatrix.needsUpdate = true;
    this.caps.frustumCulled = false;
    this.scene.add(this.caps);

    const inkMat = () => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...INK), transparent: true });
    this.deck = new THREE.Mesh(new THREE.BoxGeometry(15.55, 0.12, 5.7), inkMat());
    this.deck.position.set(0, -0.21, 0); this.scene.add(this.deck);
    this.rail = new THREE.Mesh(new THREE.BoxGeometry(15.55, 0.16, 0.8), inkMat());
    this.rail.position.set(0, 0.03, -3.05); this.scene.add(this.rail);
    this.aperture = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 0.63), inkMat());
    this.aperture.rotation.x = -Math.PI / 2;
    this.aperture.position.set(ENTER.x, Y_TOP, ENTER.z);
    this.scene.add(this.aperture);

    this.sprite.texture.magFilter = THREE.NearestFilter;
    this.sprite.texture.minFilter = THREE.NearestFilter;
    const cm = new THREE.MeshBasicMaterial({ map: this.sprite.texture, transparent: true, depthWrite: false,
      side: THREE.DoubleSide, toneMapped: false });
    this.clawd = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 1.28), cm);
    this.scene.add(this.clawd);
    this.legends = TERRAIN_KEYS.map((k) => {
      const text = strokeText(k.label, 'tech', 100);
      const scale = Math.min(0.0038, (k.width * 0.7) / text.width);
      return { text, x: k.x, z: k.z, scale, enter: k.enter };
    });
    this.lyricWords = this.times.claws.words.map((w) => strokeText(w.w, 'readable', 100));
  }

  dispose() {
    this.bg.mat.dispose(); this.hud.texture.dispose(); this.sprite.texture.dispose();
    this.mat.dispose(); this.caps.geometry.dispose();
    for (const mesh of [this.deck, this.rail, this.aperture, this.clawd]) { mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose(); }
    for (const lb of [this.lines, this.clayLines]) { lb.mat.dispose(); lb.geo.dispose(); }
  }
}

let world: KeyboardWorld | undefined;

export default class S07Keyboard extends Scene {
  private w!: KeyboardWorld;
  override init() { this.w = world ??= new KeyboardWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  private cameraAt(t: number) {
    const state = keyboardState(this.ctx.audio, t, this.w.times), v = state.camera;
    const cam = this.w.camera;
    // The pure helper describes camera offsets; adapt them to the actual Enter layout.
    const delta = ENTER.x - 6.05;
    cam.position.set(v.x + delta * state.dive, v.y, v.z);
    cam.up.set(0, 1, 0);
    cam.lookAt(v.targetX + delta * state.dive, v.targetY + (Y_TOP - 0.48) * state.dive, v.targetZ + 0.85 * state.dive);
    cam.fov = v.fov; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    return state;
  }

  private legends(t: number, opacity: number, kick: number, landing: number) {
    const { lines } = this.w;
    const beat = this.ctx.audio.beatAt(t);
    for (const legend of this.w.legends) {
      if (legend.enter) continue; // Enter's cap is the aperture, not a printed button.
      const y = keyHeight(legend.x, legend.z, legend.enter, beat, kick, landing) + 0.015;
      const ox = legend.x - legend.text.width * legend.scale / 2;
      for (const stroke of legend.text.strokes) for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1]!, b = stroke[i]!;
        lines.seg(ox + a.x * legend.scale, y, legend.z + a.y * legend.scale + 0.11,
          ox + b.x * legend.scale, y, legend.z + b.y * legend.scale + 0.11,
          1.1, ...PAPER, opacity * 0.9);
      }
    }
  }

  private engravedLyrics(t: number, opacity: number) {
    const { lines } = this.w, line = this.w.times.claws;
    // The sung words occupy the rear rail of the keyboard itself.
    // The camera leaves the rail on "looking"; the same words move onto its fly-through path.
    let x = -6.9;
    for (let wi = 0; wi < line.words.length; wi++) {
      const text = this.w.lyricWords[wi]!, w = line.words[wi]!;
      const scale = 0.0036;
      const progress = Lyrics.wordProgress(w, t);
      let drawn = 0;
      for (let si = 0; si < text.strokes.length; si++) {
        const stroke = text.strokes[si]!;
        for (let i = 1; i < stroke.length; i++) {
          const a = stroke[i - 1]!, b = stroke[i]!;
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          const hot = drawn + d * 0.5 <= text.total * progress && t >= w.start;
          lines.seg(x + a.x * scale, 0.12, -2.8 + a.y * scale,
            x + b.x * scale, 0.12, -2.8 + b.y * scale,
            hot ? 1.6 : 1, ...(hot ? PAPER : INK.map((v, j) => lerp(v, PAPER[j]!, 0.4)) as [number, number, number]), opacity);
          drawn += d;
        }
      }
      x += text.width * scale + 0.14;
    }
  }

  private draftingRails(t: number, opacity: number) {
    const lb = this.w.lines, beat = this.ctx.audio.beatAt(t);
    // Receding bare conductors connect key columns. The travelling clay marks
    // are functional timing traces rather than decorative particles.
    for (let col = 0; col <= 15; col++) {
      const x = col - 7.5;
      lb.seg(x, -0.12, -3, x, -0.12, 3.0, 0.8, ...PAPER, 0.16 * opacity);
      const z = ((beat * 0.85 + col * 0.43) % 6) - 3;
      this.w.clayLines.seg(x, -0.11, z, x, -0.11, z + 0.18, 1.2, ...CLAY, opacity * 0.8);
    }
    // Engineering dimension marks: simple rulers, not outlines around the objects.
    lb.seg(-7.5, -0.12, 3.22, 7.5, -0.12, 3.22, 0.9, ...PAPER, opacity * 0.45);
    for (let i = 0; i <= 30; i++) {
      const x = -7.5 + i * 0.5;
      lb.seg(x, -0.12, 3.22, x, -0.12, 3.22 + (i % 2 ? 0.10 : 0.18), 0.9, ...PAPER, opacity * 0.45);
    }
  }

  private clawd(t: number, opacity: number, height: number) {
    const { sprite, clawd, times: T } = this.w, au = this.ctx.audio;
    const state = keyboardState(au, t, T);
    sprite.clear();
    const beat = au.beatAt(t), landingBeat = au.beatAt(T.land);
    // A6 is sampled at its canonical landing phase to retain the one-row squash.
    const action: Clawd.Action = state.typing ? 'A4' : 'A6';
    const pose = Clawd.pose(action, { beat, beat0: landingBeat - 1, p: 0, jumpBeats: 1 });
    Clawd.draw(sprite.ctx, 32, 56, pose, { px: 12 });
    sprite.upload();
    clawd.position.set(ENTER.x, height + 0.34 + state.altitude, ENTER.z);
    clawd.quaternion.copy(this.w.camera.quaternion);
    (clawd.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  private cursor(t: number, opacity: number) {
    const { clayLines: lb, aperture } = this.w;
    const st = keyboardState(this.ctx.audio, t, this.w.times);
    const keyY = keyHeight(ENTER.x, ENTER.z, true, st.wave, this.ctx.audio.hit('kick', t), st.landing);
    aperture.position.y = keyY + 0.015;
    const y = keyY + 0.021;
    // Filled cursor assembled from parallel world-space capsules; only clay is HDR.
    const on = blink(st.wave, !st.cursorOnly);
    for (let x = -0.11; x <= 0.11; x += 0.018)
      lb.seg(ENTER.x + x, y, ENTER.z - 0.22, ENTER.x + x, y, ENTER.z + 0.22,
        2.1, CLAY[0] * 2.7, CLAY[1] * 2.7, CLAY[2] * 2.7, opacity * on);
    // A short pen trace on Enter suggests the move from checkmarks to typing.
    lb.seg(ENTER.x - 0.72, y, ENTER.z + 0.28, ENTER.x - 0.15, y, ENTER.z + 0.28,
      1.2, ...CLAY, opacity * 0.65);
  }

  private overlay(t: number, dive: number) {
    const L = this.w.hud, c = L.ctx, T = this.w.times;
    L.clear();
    const railFade = 1 - span(dive, 0.2, 0.72);
    c.fillStyle = css('paper', railFade * 0.65); c.font = font(F.mono(400), 17);
    c.fillText('CLAW / KEY / ENTER', 110, 116);
    c.fillText('calendar / month.ts', 1410, 116);

    // A world-space rail becomes a screen-space flight path, with the actual
    // per-word highlight preserved. This keeps the long "looking" note readable.
    if (t >= T.dive) {
      const line = T.claws, text = line.words.map((w) => w.w).join(' ');
      const fam = F.archivo(dive > 0.55 ? 75 : 100, 600);
      const size = 48, lay = layout(text, fam, size), x0 = 110;
      c.font = font(fam, size);
      let gi = 0;
      for (const w of line.words) {
        const x = x0 + lay.glyphs[gi]!.x;
        const visible = w.end >= t ? 1 : 1 - dive;
        c.fillStyle = css('paper', 0.33 * visible); c.fillText(w.w, x, 941);
        const progress = Lyrics.wordProgress(w, t);
        if (progress > 0) {
          c.save(); c.beginPath(); c.rect(x - 2, 888, c.measureText(w.w).width * progress + 2, 62); c.clip();
          c.fillStyle = css('paper', visible); c.fillText(w.w, x, 941); c.restore();
        }
        gi += Array.from(w.w).length + 1;
      }
    }

    // Match the projected aperture cursor to a centered screen cursor continuously.
    const reveal = ease.inOutCubic(span(dive, 0.7, 0.98));
    if (reveal > 0) {
      const projected = CURSOR.clone().project(this.w.camera);
      const x = lerp((projected.x * 0.5 + 0.5) * W, 960 - 19.8, reveal);
      const y = lerp((0.5 - projected.y * 0.5) * H, 576, reveal);
      c.globalAlpha = reveal;
      drawCursor(c, { x, y, h: lerp(112, 72, reveal), on: blink(this.ctx.audio.beatAt(t), t < T.arrive) });
      c.globalAlpha = 1;
    }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx, t = f.t;
    const state = this.cameraAt(t), { camera, mat, scene } = this.w;
    const opacity = terrainOpacity(state.dive);
    const u = this.w.bg.u;
    u.t!.value = t; u.beat!.value = f.beat; u.kick!.value = f.a.kick; u.dive!.value = state.dive;
    (u.camera!.value as THREE.Vector2).set(camera.position.x, camera.position.z);
    this.w.bg.render(renderer, out);
    renderer.setRenderTarget(out); renderer.clearDepth();
    mat.uniforms.beat!.value = f.beat; mat.uniforms.kick!.value = f.a.kick;
    mat.uniforms.landing!.value = state.landing; mat.uniforms.opacity!.value = opacity;
    (this.w.deck.material as THREE.MeshBasicMaterial).opacity = opacity;
    (this.w.rail.material as THREE.MeshBasicMaterial).opacity = opacity;
    (this.w.aperture.material as THREE.MeshBasicMaterial).opacity = opacity;
    this.clawd(t, opacity, keyHeight(ENTER.x, ENTER.z, true, f.beat, f.a.kick, state.landing));
    renderer.render(scene, camera);

    this.w.lines.clear(); this.w.clayLines.clear();
    this.legends(t, opacity, f.a.kick, state.landing);
    this.engravedLyrics(t, opacity);
    this.draftingRails(t, opacity);
    this.cursor(t, opacity);
    this.w.lines.render(renderer, out, camera);
    this.w.clayLines.render(renderer, out, camera);
    this.overlay(t, state.dive);
    comp.draw(renderer, this.w.hud.upload(), out);
    const shake = state.landing * 4.5 * (1 - state.dive), fi = frameIdx(t);
    return { ...postFor('ink'), hud: 0, frame: 0, bloom: 0.45, bloomKnee: 0.1,
      vignette: 0.1, grain: 0.028, shoulder: 0,
      shake: [shake * (hash(fi, 7) - 0.5), shake * (hash(fi, 8) - 0.5)] as [number, number] };
  }
}
