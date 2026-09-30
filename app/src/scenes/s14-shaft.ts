// S14: inside the machine. A plumb cursor follows a call stack down an engraved shaft.
// The final camera approach ends on near; seeks and shutter samples never integrate state.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { GLSL_COMMON } from '../engine/glsl/common';
import { F, font } from '../engine/type';
import { ease, lerp } from '../engine/util';
import { css, lin } from '../theme';
import { GlowLayer, postFor } from '../kit/ground';
import { drawCursor, drawTrail, blink } from '../kit/cursor';
import { afterBeats, span } from '../kit/time';
import { CALL_STACK, MONTH_SOURCE } from '../kit/content';
import * as Clawd from '../kit/clawd';
import { label, inscribe, machineLine } from './parts/s13-score';
import { diveScore, diveState, type DiveScore } from './parts/s14-score';

const PITCH = 5.5;
const HALF_X = 7.2;
const HALF_Z = 2.1;
const COUNT = 22;
const PAPER = lin('paper');
const CLAY = lin('clay');
const INK = lin('ink');
const ATLAS_W = 1536, ATLAS_H = 768;
const PX = 11;

const SHAFT_BG = /* glsl */ `
uniform float t, fall, entrance, hush, speed, kick;
uniform vec3 ink, paper;
float rule(float x, float pitch) {
  float d = abs(fract(x / pitch + 0.5) - 0.5) * pitch;
  return 1.0 - smoothstep(0.45, 0.45 + 1.0 / PX_SCALE, d);
}
void main() {
  vec2 p = FRAG_PX;
  vec2 q = p + vec2(fall * 8.0, -fall * 29.0);
  // A second, distant grid drifts at half speed. Depth fog is blue, never black.
  float grid = max(rule(q.x, 96.0), rule(q.y, 96.0));
  float major = max(rule(q.x, 384.0), rule(q.y, 384.0));
  float mist = smoothstep(0.9, 0.05, vUv.y) * 0.04 * entrance * (1.0 - hush * 0.55);
  float a = grid * 0.025 + major * (0.035 + 0.025 * kick) + mist;
  // Perspective construction lines point into the mouth of the vertical shaft.
  vec2 centre = vec2(0.57, 0.44);
  vec2 r = (vUv - centre) * vec2(1.77778, 1.0);
  float angle = atan(r.y, r.x);
  float rays = pxLine(abs(sin(angle * 12.0)) * length(r), 0.0, 1.0);
  a += rays * 0.06 * entrance * (1.0 - hush * 0.7);
  // Motion columns disappear at the dead stop; slow fog texture stays alive.
  float n = hash12(vec2(floor(p.x / 9.0), 14.0));
  float streak = step(0.981, n) * smoothstep(0.55, 1.0, fract(p.y / 710.0 + fall * 0.6 + n));
  a += streak * min(speed * 0.07, 0.2) * entrance;
  float fogGrain = snoise(vec3(p * 0.003, t * 0.07));
  a += max(0.0, fogGrain) * 0.007;
  fragColor = vec4(mix(ink, paper, clamp(a, 0.0, 0.2)), 1.0);
}`;

const BODY_VERT = /* glsl */ `
out vec3 vPos;
void main() {
  vec4 p = instanceMatrix * vec4(position, 1.0);
  vPos = p.xyz;
  gl_Position = projectionMatrix * modelViewMatrix * p;
}`;

const BODY_FRAG = /* glsl */ `
in vec3 vPos;
out vec4 fragColor;
uniform vec3 ink, paper;
uniform float cameraY, entrance, hush;
void main() {
  float dist = abs(vPos.y - cameraY);
  float fog = exp(-dist * (0.028 + hush * 0.04));
  float grooves = engrave(vPos.xz * 0.14, 0.23, 72.0, 0.7);
  vec3 c = mix(ink, paper, (0.022 + grooves * 0.038) * fog);
  fragColor = vec4(c, entrance);
}`;

const TEXT_VERT = /* glsl */ `
out vec2 vUv;
out float worldY;
void main() {
  vUv = uv;
  vec4 p = modelMatrix * vec4(position, 1.0);
  worldY = p.y;
  gl_Position = projectionMatrix * viewMatrix * p;
}`;

const TEXT_FRAG = /* glsl */ `
in vec2 vUv;
in float worldY;
out vec4 fragColor;
uniform sampler2D atlas;
uniform float cameraY, entrance, hush;
void main() {
  vec4 tx = texture(atlas, vUv);
  float fog = exp(-abs(worldY - cameraY) * (0.03 + hush * 0.045));
  fragColor = vec4(tx.rgb, tx.a * fog * entrance);
}`;

interface Projected { x: number; y: number; visible: boolean }

class ShaftWorld {
  users = 0;
  T: DiveScore;
  bg = new FSPass(SHAFT_BG, {
    t: { value: 0 }, fall: { value: 0 }, entrance: { value: 0 }, hush: { value: 0 },
    speed: { value: 0 }, kick: { value: 0 },
    ink: { value: new THREE.Vector3(...INK) }, paper: { value: new THREE.Vector3(...PAPER) },
  });
  layer = new Layer2D();
  glow = new GlowLayer();
  lines = new LineBatch(12000, { screen2D: false, blend: 'normal', depthTest: true });
  cursorLines = new LineBatch(1000, { screen2D: false, blend: 'normal' });
  cam = new THREE.PerspectiveCamera(33, W / H, 0.1, 500);
  bodies = new THREE.Scene();
  textScene = new THREE.Scene();
  slabs: THREE.InstancedMesh;
  atlas = new Layer2D(ATLAS_W, ATLAS_H);
  namePlanes: THREE.Mesh[] = [];
  textMaterial: THREE.ShaderMaterial;
  matrix = new THREE.Matrix4();
  scratch = new THREE.Vector3();

  constructor(ctx: SceneCtx) {
    this.T = diveScore(ctx.audio, ctx.lyrics);
    const material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: BODY_VERT,
      fragmentShader: GLSL_COMMON + BODY_FRAG,
      uniforms: { ink: { value: new THREE.Vector3(...INK) }, paper: { value: new THREE.Vector3(...PAPER) },
        cameraY: { value: 0 }, entrance: { value: 0 }, hush: { value: 0 } },
      transparent: true, depthWrite: true, toneMapped: false,
    });
    this.slabs = new THREE.InstancedMesh(new THREE.BoxGeometry(HALF_X * 2, 2.4, HALF_Z * 2), material, COUNT);
    this.slabs.frustumCulled = false; this.bodies.add(this.slabs);
    this.paintAtlas();
    this.atlas.texture.generateMipmaps = true;
    this.atlas.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlas.texture.anisotropy = ctx.renderer.capabilities.getMaxAnisotropy();
    this.textMaterial = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3,
      vertexShader: TEXT_VERT, fragmentShader: TEXT_FRAG,
      uniforms: { atlas: { value: this.atlas.upload() }, cameraY: { value: 0 },
        entrance: { value: 0 }, hush: { value: 0 } },
      transparent: true, toneMapped: false, depthWrite: false, side: THREE.DoubleSide });
    for (let i = 0; i < COUNT; i++) {
      const geo = new THREE.PlaneGeometry(13.6, 2.25);
      const plane = new THREE.Mesh(geo, this.textMaterial);
      plane.frustumCulled = false; this.namePlanes.push(plane); this.textScene.add(plane);
    }
  }

  /** One scale-aware atlas contains the three actual stack frames; it is uploaded once. */
  paintAtlas() {
    const c = this.atlas.ctx; this.atlas.clear();
    for (let i = 0; i < CALL_STACK.length; i++) {
      const frame = CALL_STACK[i]!, y = i * 256;
      label(c, `src/calendar/month.ts:${frame.line}`, 68, y + 55, 30, 0.45);
      c.font = font(F.mono(600), 80); c.fillStyle = css('paper');
      c.fillText(`${frame.name}()`, 64, y + 150);
      label(c, i === 0 ? 'calendar.cells / output' : i === 1 ? 'month, year / frame' : 'month, year / bound', 66, y + 207, 27, 0.45);
      label(c, 'CALL', 1270, y + 144, 30, 0.45);
      c.fillStyle = css('paper', 0.14); c.fillRect(64, y + 227, 1392, 1);
    }
  }

  project(x: number, y: number, z: number): Projected {
    this.scratch.set(x, y, z).project(this.cam);
    return { x: (this.scratch.x * 0.5 + 0.5) * W, y: (0.5 - this.scratch.y * 0.5) * H,
      visible: this.scratch.z > -1 && this.scratch.z < 1 };
  }

  camera(f: Frame, ctx: SceneCtx, s: ReturnType<typeof diveState>) {
    const T = this.T;
    const elevator = ease.inOutCubic(span(f.t, T.frames, afterBeats(ctx.audio, T.frames, 1)));
    const pitch = lerp(0.74, 0.19, s.entrance);
    const yaw = lerp(-0.38, 0.25, elevator);
    const distance = lerp(24, 22, elevator);
    const focusY = -s.pos * PITCH;
    // A fast final turn starts before near and has zero travel after it.
    const approach = ease.inExpo(span(f.t, afterBeats(ctx.audio, T.near, -0.6), T.near));
    const finalYaw = lerp(yaw, 0.03, approach);
    const finalPitch = lerp(pitch, 0.03, approach);
    const finalDistance = lerp(distance, 21.5, approach);
    this.cam.fov = lerp(33, 30, approach);
    this.cam.position.set(Math.sin(finalYaw) * Math.cos(finalPitch) * finalDistance,
      focusY + Math.sin(finalPitch) * finalDistance, Math.cos(finalYaw) * Math.cos(finalPitch) * finalDistance);
    this.cam.up.set(0, 1, 0); this.cam.lookAt(0.8, focusY - 0.1, 0);
    this.cam.updateProjectionMatrix(); this.cam.updateMatrixWorld();
  }

  /** Complete overwrite of all instance matrices, UVs and visibility on every frame. */
  stack(f: Frame, s: ReturnType<typeof diveState>, ctx: SceneCtx, out: THREE.WebGLRenderTarget) {
    const target = s.target;
    const start = Math.floor(s.pos) - 3;
    const material = this.slabs.material as THREE.ShaderMaterial;
    material.uniforms.cameraY!.value = -s.pos * PITCH;
    material.uniforms.entrance!.value = s.entrance;
    material.uniforms.hush!.value = s.hush;
    const visibleCount = Math.round(lerp(COUNT, 11, s.hush));
    this.slabs.count = visibleCount;
    this.textMaterial.uniforms.cameraY!.value = -s.pos * PITCH;
    this.textMaterial.uniforms.entrance!.value = s.entrance;
    this.textMaterial.uniforms.hush!.value = s.hush;
    this.lines.clear(); this.cursorLines.clear();

    for (let i = 0; i < COUNT; i++) {
      // After the stop a special daysIn slab occupies the exact focal depth.
      let index = start + i;
      const targetIndex = Math.round(target);
      const isTarget = index === targetIndex;
      const depth = isTarget ? target : index;
      const y = -depth * PITCH;
      this.matrix.makeTranslation(0, y, 0); this.slabs.setMatrixAt(i, this.matrix);
      const plane = this.namePlanes[i]!;
      plane.visible = i < visibleCount && s.entrance > 0.001;
      plane.position.set(0, y, HALF_Z + 0.02);
      const frame = isTarget ? 2 : index < target * 0.33 ? 0 : index < target * 0.72 ? 1 : 2;
      const uv = plane.geometry.getAttribute('uv') as THREE.BufferAttribute;
      const top = 1 - frame / 3, bottom = 1 - (frame + 1) / 3;
      uv.setXY(0, 0, top); uv.setXY(1, 1, top); uv.setXY(2, 0, bottom); uv.setXY(3, 1, bottom);
      uv.needsUpdate = true;
      if (i >= visibleCount) continue;
      const fog = Math.exp(-Math.abs(depth - s.pos) * (0.19 + 0.24 * s.hush));
      const opacity = fog * s.entrance;
      this.frameLines(y, opacity, isTarget && s.stopped);
      // The clay conductor takes the cursor down the stack, not upward through it.
      this.cursorLines.seg(-5.9, y - 1.2, HALF_Z + 0.06, -5.9, y - PITCH + 1.2, HALF_Z + 0.06,
        1.25, ...CLAY, opacity * 0.4);
      // Floor labels are 2D annotations tied to projected world positions.
      const point = this.project(HALF_X + 0.9, y, HALF_Z);
      if (point.visible && point.x < 1790 && point.y > 180 && point.y < 890 && opacity > 0.13)
        label(this.layer.ctx, `F.${String(Math.max(0, Math.round(depth))).padStart(2, '0')}`, point.x, point.y, 17, opacity * 0.7);
    }
    this.slabs.instanceMatrix.needsUpdate = true;
    // Four load-bearing rails extend past the visible floors to suggest an unbounded stack.
    for (const x of [-HALF_X, HALF_X]) for (const z of [-HALF_Z, HALF_Z])
      this.lines.seg(x, -(start - 2) * PITCH, z, x, -(start + COUNT + 2) * PITCH, z, 0.9, ...PAPER, 0.14 * s.entrance);
    ctx.renderer.setRenderTarget(out); ctx.renderer.clearDepth();
    ctx.renderer.render(this.bodies, this.cam);
    this.lines.render(ctx.renderer, out, this.cam);
    ctx.renderer.render(this.textScene, this.cam);
    this.cursorLines.render(ctx.renderer, out, this.cam);
    void f;
  }

  frameLines(y: number, alpha: number, hot: boolean) {
    const l = this.lines;
    const segment = (a: [number, number, number], b: [number, number, number], width = 1, opacity = 1) =>
      l.seg(...a, ...b, width, ...PAPER, alpha * opacity);
    for (const z of [-HALF_Z, HALF_Z]) {
      segment([-HALF_X, y - 1.2, z], [HALF_X, y - 1.2, z], 1.2, 0.65);
      segment([-HALF_X, y + 1.2, z], [HALF_X, y + 1.2, z], 1.2, 0.65);
      segment([-HALF_X, y - 1.2, z], [-HALF_X, y + 1.2, z], 1, 0.7);
      segment([HALF_X, y - 1.2, z], [HALF_X, y + 1.2, z], 1, 0.7);
    }
    for (const x of [-HALF_X, HALF_X]) for (const dy of [-1.2, 1.2])
      segment([x, y + dy, -HALF_Z], [x, y + dy, HALF_Z], 0.8, 0.3);
    // Fine lamination on the side walls reads as engraved depth, not shiny material.
    for (let j = 0; j < 12; j++) {
      const z = lerp(-HALF_Z, HALF_Z, j / 11);
      for (const x of [-HALF_X, HALF_X])
        segment([x, y - 1.2, z], [x, y + 1.2, z], 0.6, 0.22);
    }
    for (const x of [-6.8, 6.8]) {
      segment([x - 0.12, y, HALF_Z + 0.04], [x + 0.12, y, HALF_Z + 0.04], 0.8, 0.6);
      segment([x, y - 0.12, HALF_Z + 0.04], [x, y + 0.12, HALF_Z + 0.04], 0.8, 0.6);
    }
    if (hot) this.cursorLines.seg(-6.1, y - 1.18, HALF_Z + 0.06, 6.1, y - 1.18, HALF_Z + 0.06,
      1.1, ...CLAY, 0.55);
  }

  breathe(f: Frame, s: ReturnType<typeof diveState>) {
    const c = this.layer.ctx;
    const fade = 1 - s.entrance;
    if (fade <= 0) return;
    const y = 586 + s.breath * 5;
    const pose = Clawd.pose(null, { beat: f.beat, beat0: f.beat, p: 0 });
    Clawd.draw(c, 872, y, pose, { px: PX, alpha: fade });
    Clawd.draw(this.glow.ctx, 872, y, pose, { px: PX, alpha: fade, eye: css('clay', 0) });
    // The residual rails of the collision recede, leaving room to breathe.
    for (let i = 0; i < 3; i++) {
      c.fillStyle = css('paper', 0.09 * fade * fade);
      c.fillRect(105 + i * 57, 374 + i * 104, 580 - i * 130, 1);
      c.fillRect(1310 + i * 47, 352 + i * 104, 360 - i * 60, 1);
    }
  }

  plumb(f: Frame, s: ReturnType<typeof diveState>, ctx: SceneCtx) {
    if (s.entrance <= 0) return;
    const y = -s.pos * PITCH - 0.35;
    const top = this.project(-5.9, y + 5.7, HALF_Z + 0.15);
    const head = this.project(-5.9, y - 0.48, HALF_Z + 0.15);
    if (!head.visible) return;
    const pts: [number, number][] = [[top.x, top.y], [head.x, head.y]];
    drawTrail(this.layer.ctx, pts, 1, { width: 1.4, alpha: s.entrance });
    drawTrail(this.glow.ctx, pts, 1, { width: 2.8, alpha: 0.4 * s.entrance });
    const cursor = { x: head.x - 8, y: head.y, h: 30,
      on: s.stopped ? blink(ctx.audio.beatAt(f.t), f.t < this.T.near + 0.2) : s.entrance };
    drawCursor(this.layer.ctx, cursor); drawCursor(this.glow.ctx, cursor);
    const hero = this.project(-3.9, y + 0.55, HALF_Z + 0.3);
    if (hero.visible) {
      const action = s.stopped ? 'A3' : 'A11';
      const pose = Clawd.pose(action, { beat: s.stopped ? f.beat / 3 : f.beat,
        beat0: ctx.audio.beatAt(this.T.down), p: span(f.t, this.T.down, this.T.near), travel: 1 });
      Clawd.draw(this.layer.ctx, hero.x - Clawd.W * PX / 2, hero.y - 5 * PX, pose, { px: PX, alpha: s.entrance });
      Clawd.draw(this.glow.ctx, hero.x - Clawd.W * PX / 2, hero.y - 5 * PX, pose,
        { px: PX, alpha: s.entrance, eye: css('clay', 0) });
    }
  }

  annotations(f: Frame, s: ReturnType<typeof diveState>, ctx: SceneCtx) {
    const c = this.layer.ctx, T = this.T;
    label(c, 'CALL STACK', 105, 118, 20, 0.62);
    label(c, s.stopped ? 'daysIn() / paused' : f.t < T.down ? 'pause / breathe' : 'step into / descend', 105, 158, 22, 0.85);
    label(c, `${String(s.floor).padStart(2, '0')} / depth`, 1540, 122, 27, 0.8);
    c.fillStyle = css('paper', 0.15); c.fillRect(105, 188, 370, 1);
    // Lyric is the shaft's inspection strip: plot each word against a moving depth rule.
    const line = machineLine(ctx.lyrics, f.t, T.down - 0.2, T.end);
    if (line) {
      c.save(); c.translate(108, 974);
      label(c, 'inspect >', 0, -58, 20, 0.55, 'clay');
      inscribe(c, line, f.t, 0, 0, 38, 100, 'paper', 'paper', true);
      c.fillStyle = css('paper', 0.18); c.fillRect(0, 22, 1688, 1);
      const p = span(f.t, line.start, line.end);
      drawCursor(c, { x: p * 1688, y: 26, h: 9 }); c.restore();
    }
    if (s.stopped) {
      const point = this.project(0, -s.target * PITCH - 1.8, HALF_Z + 0.1);
      const x = 362, y = Math.max(693, point.y + 88);
      c.save(); c.globalAlpha = s.reveal;
      // Only the clay marker glows; the actual source line stays crisp paper.
      const code = MONTH_SOURCE[41]!;
      label(c, '42', x, y, 33, 1, 'clay');
      label(c, code.trim(), x + 94, y, 28, 0.95);
      c.fillStyle = css('clay'); c.fillRect(x + 94, y + 16, 716, 2);
      label(c, 'month.ts / bound under inspection', x + 94, y + 53, 18, 0.45);
      drawCursor(c, { x: x + 825, y: y + 5, h: 34, on: blink(f.beat) });
      c.restore();
      // No paper glyph is copied into this layer: clay alone receives HDR amplification.
      const glow = this.glow.ctx;
      glow.fillStyle = css('clay', 0.45 * s.reveal); glow.fillRect(x + 94, y + 16, 716, 2);
      drawCursor(glow, { x: x + 825, y: y + 5, h: 34, on: blink(f.beat) * s.reveal });
    }
  }

  dispose() {
    this.bg.mat.dispose(); this.layer.texture.dispose(); this.glow.layer.texture.dispose();
    this.atlas.texture.dispose(); this.textMaterial.dispose();
    this.slabs.geometry.dispose(); (this.slabs.material as THREE.Material).dispose();
    for (const plane of this.namePlanes) plane.geometry.dispose();
    for (const l of [this.lines, this.cursorLines]) { l.geo.dispose(); l.mat.dispose(); }
  }
}

let world: ShaftWorld | undefined;

export default class S14Shaft extends Scene {
  private w!: ShaftWorld;
  override init() { this.w = world ??= new ShaftWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, s = diveState(this.ctx.audio, f.t, w.T);
    w.layer.clear(); w.glow.clear();
    w.camera(f, this.ctx, s);
    const u = w.bg.u;
    u.t!.value = f.t; u.fall!.value = s.pos; u.entrance!.value = s.entrance;
    u.hush!.value = s.hush; u.speed!.value = s.velocity; u.kick!.value = f.a.kick * 0.15;
    w.bg.render(this.ctx.renderer, out);
    w.stack(f, s, this.ctx, out);
    w.breathe(f, s); w.plumb(f, s, this.ctx); w.annotations(f, s, this.ctx);
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.glow.composite(this.ctx, out, 1.32);
    return { ...postFor('ink'), hud: 0, bloom: 0.32, vignette: 0.13, grain: 0.035,
      shake: [0, 0] as [number, number] };
  }
}
