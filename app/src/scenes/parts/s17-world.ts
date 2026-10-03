// S17 v5: "And it works on every machine" — the device wall as real hardware. Every occupied pixel of
// Clawd's 16x5 sprite is a device (a slab with a lit clay screen); the eyes are two dark screens.
// Behind it, in fog, stand more device-Clawds — every machine. The camera is born close on one
// screen (the phrase on it) and pulls back through depth until the wall is front-on exactly where the
// storyboard frame (parts/s17-release-layout.ts WALL_BOX) puts it: 1 world unit = 100 logical px on
// the wall plane z = 0 at the final camera distance (as in S09 v5).
import * as THREE from 'three';
import { GLSL_COMMON } from '../../engine/glsl/common';
import { W, H, SCALE, scaleContext2D } from '../../engine/gl';
import { clamp, ease, hash, lerp } from '../../engine/util';
import { lin } from '../../theme';
import { orbitCam, mixCam, p3, type Cam } from '../../kit/rig';
import { wallCells } from './s17-release-layout';

export const FRONT_DIST = 0.5 * 1080 / Math.tan((34 * Math.PI) / 360) / 100;
const wx = (sx: number) => (sx - 960) / 100, wy = (sy: number) => (540 - sy) / 100;
export const ECHOES = 26; // further walls

/** Front-on at k = 1 (the storyboard frame); born close on one screen at k = 0. */
export function wallCam(k: number): Cam {
  const cells = wallCells(), hero = cells.find((c) => c.x > 1150 && c.k !== 'D')!;
  const hx = wx(hero.x + hero.w / 2), hy = wy(hero.y + hero.h / 2);
  const close = orbitCam(p3(hx, hy, 0), 0.22, -0.05, 2.3, 40, 0.03);
  const front = orbitCam(p3(0, 0, 0), 0, 0, FRONT_DIST, 34, 0);
  const e = ease.inOutCubic(clamp(k));
  // pull back along a slight arc (the far walls slide past in parallax)
  const mid = orbitCam(p3(lerp(hx, 0, 0.6), lerp(hy, 0, 0.6), -2), 0.35, 0.08, 16, 38, 0.0);
  return e < 0.5 ? mixCam(close, mid, ease.inOutQuad(e * 2)) : mixCam(mid, front, ease.inOutQuad(e * 2 - 1));
}

const VERT = /* glsl */ `
precision highp float;
in vec3 position, normal; in vec2 uv; in mat4 instanceMatrix; in vec3 aDev; // (eye, fog seed, echo)
uniform mat4 modelViewMatrix, projectionMatrix, viewMatrix;
out vec3 vN, vW; out vec2 vUv; out vec3 vDev; out float vDepth;
void main() {
  vec4 wp = instanceMatrix * vec4(position, 1.0);
  vW = wp.xyz; vN = normalize(mat3(instanceMatrix) * normal); vUv = uv; vDev = aDev;
  vec4 vp = modelViewMatrix * wp; vDepth = -vp.z;
  gl_Position = projectionMatrix * vp;
}`;
const FRAG = /* glsl */ `
precision highp float;
in vec3 vN, vW; in vec2 vUv; in vec3 vDev; in float vDepth;
out vec4 fragColor;
${GLSL_COMMON}
uniform vec3 paper, ink, clay, L; uniform sampler2D screen; uniform float glowK;
void main() {
  vec3 n = normalize(vN);
  float tone = 0.15 + 0.85 * max(dot(n, normalize(L)), 0.0);
  vec3 col;
  if (n.z > 0.5) {
    // the screen inside a bezel
    vec2 e = min(vUv, 1.0 - vUv);
    float bezel = step(min(e.x, e.y * 1.25), 0.07);
    vec3 scr = vDev.x > 0.5 ? ink * 0.55 : clay * (0.9 + 0.25 * glowK);
    if (vDev.x < 0.5 && vDev.z < 0.5) {
      vec4 tx = texture(screen, vec2((vUv.x - 0.07) / 0.86, (vUv.y - 0.09) / 0.82));
      scr = mix(scr, tx.rgb / max(tx.a, 1e-3), tx.a);
    }
    vec3 bz = mix(paper, ink, hatch((vW.x + vW.y) * 40.0, 0.35) * 0.8);
    col = mix(scr, bz, bezel);
  } else {
    float u = (abs(n.x) > 0.5 ? vW.z : vW.x) * 46.0 + vW.y * 6.0;
    col = mix(paper, ink, hatch(u, clamp(0.85 - 0.75 * tone, 0.12, 0.85)) * 0.9);
  }
  // fog toward paper: the further walls dissolve into the page
  float fog = 1.0 - exp(-max(0.0, vDepth - 25.0) / 45.0);
  col = mix(col, paper, clamp(fog, 0.0, 0.94));
  fragColor = vec4(col, 1.0);
}`;

export class DeviceWall3D {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(34, W / H, 0.05, 900);
  mesh: THREE.InstancedMesh;
  mat: THREE.RawShaderMaterial;
  screenCanvas = document.createElement('canvas');
  screenCtx: CanvasRenderingContext2D;
  screenTex: THREE.CanvasTexture;
  constructor() {
    this.screenCanvas.width = 512 * SCALE; this.screenCanvas.height = 384 * SCALE;
    this.screenCtx = scaleContext2D(this.screenCanvas.getContext('2d')!, SCALE);
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace; this.screenTex.generateMipmaps = true;
    this.screenTex.minFilter = THREE.LinearMipmapLinearFilter; this.screenTex.anisotropy = 8;
    const cells = wallCells();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const n = cells.length * (1 + ECHOES);
    const dev = new Float32Array(n * 3);
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        paper: { value: new THREE.Vector3(...lin('paper')) }, ink: { value: new THREE.Vector3(...lin('ink')) },
        clay: { value: new THREE.Vector3(...lin('clay')) }, L: { value: new THREE.Vector3(-0.5, 0.6, 0.62) },
        screen: { value: this.screenTex }, glowK: { value: 0 },
      }, toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    let i = 0;
    for (let e = 0; e <= ECHOES; e++) {
      // echo walls: a field of device-Clawds receding behind, scattered left and right
      const ox = e === 0 ? 0 : (hash(e, 1) - 0.5) * 120, oz = e === 0 ? 0 : -45 - hash(e, 2) * 220;
      const oy = e === 0 ? 0 : 3 + hash(e, 3) * 16; // above the horizon line of the page
      const yaw = e === 0 ? 0 : (hash(e, 4) - 0.5) * 0.6;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      for (const c of cells) {
        const lx = wx(c.x + c.w / 2), ly = wy(c.y + c.h / 2);
        pos.set(lx, ly, 0).applyQuaternion(q).add(new THREE.Vector3(ox, oy, oz));
        s.set(c.w / 100, c.h / 100, 0.55);
        m.compose(pos, q, s);
        this.mesh.setMatrixAt(i, m);
        dev[i * 3] = c.k === 'D' ? 1 : 0; dev[i * 3 + 1] = hash(i, 7); dev[i * 3 + 2] = e > 0 ? 1 : 0;
        i++;
      }
    }
    geo.setAttribute('aDev', new THREE.InstancedBufferAttribute(dev, 3));
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }
  setCam(c: Cam) {
    const k = this.cam; k.fov = c.fov; k.updateProjectionMatrix();
    k.position.set(c.pos.x, c.pos.y, c.pos.z); k.up.set(0, 1, 0); k.lookAt(c.tgt.x, c.tgt.y, c.tgt.z); k.rotateZ(c.roll);
    k.updateMatrixWorld(true);
  }
  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, glowK: number) {
    this.mat.uniforms.glowK!.value = glowK; this.screenTex.needsUpdate = true;
    r.setRenderTarget(out); r.clearDepth(); r.render(this.scene, this.cam);
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); this.screenTex.dispose(); }
}

/** Read-only CPU description of the existing instance transforms. Geometry above is unchanged. */
export function wallDevices() {
  const q = new THREE.Quaternion(), pos = new THREE.Vector3();
  return Array.from({ length: ECHOES + 1 }, (_, e) => {
    const ox = e === 0 ? 0 : (hash(e, 1) - 0.5) * 120;
    const oz = e === 0 ? 0 : -45 - hash(e, 2) * 220;
    const oy = e === 0 ? 0 : 3 + hash(e, 3) * 16;
    const yaw = e === 0 ? 0 : (hash(e, 4) - 0.5) * 0.6;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    return wallCells().map(c => {
      pos.set(wx(c.x + c.w / 2), wy(c.y + c.h / 2), 0).applyQuaternion(q);
      return { x: pos.x + ox, y: pos.y + oy, z: pos.z + oz,
        w: c.w / 100, h: c.h / 100, d: 0.55, yaw, lit: c.k !== 'D', echo: e };
    });
  }).flat();
}
