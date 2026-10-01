// S11 v3 storm: a deep field of stack-trace lines falling along the rain (text reads downwards, as in
// kf-S11), with clay bars mixed in. Blur is baked into a 4-level atlas and chosen per particle from its
// distance to the focal plane; far particles sink into the ink haze. Positions are a pure function of
// the travelled distance (no simulation), so any t can be rendered in any order.
import * as THREE from 'three';
import { SCALE, scaleContext2D } from '../../engine/gl';
import { F, font } from '../../engine/type';
import { hash } from '../../engine/util';
import { css } from '../../theme';
import { STACK_RAIN_LINES } from '../../kit/content';

export const DEEP = { count: 640, zNear: 9, zFar: -70, levels: 4, cellW: 1024, cellH: 72 };
const BLUR = [0, 1.6, 4.2, 9];
const ROWS = STACK_RAIN_LINES.length + 1; // last row: clay bar
const ORDER = Array.from({ length: DEEP.count }, (_, i) => i).sort((a, b) => hash(a, 1) - hash(b, 1));

/** Particle `id` at travelled distance `d` (world units fallen): position, size, kind. */
export function deepParticle(id: number, d: number) {
  const z = DEEP.zFar + (DEEP.zNear - DEEP.zFar) * Math.pow(hash(id, 1), 0.8);
  const depth = 12 - z; // distance from the camera plane
  const spanX = depth * 1.05, spanY = depth * 0.9 + 6;
  const bar = hash(id, 9) < 0.09;
  const speed = (14 - z) / (1080 / (2 * Math.tan(26 * Math.PI / 180))); // 1 unit of d = 1 screen px at the cut
  const cycle = spanY * 2;
  const y = spanY - ((((hash(id, 4) * cycle + d * speed) % cycle) + cycle) % cycle);
  return {
    x: (hash(id, 2) - 0.5) * 2 * spanX, y, z, bar,
    line: Math.floor(hash(id, 5) * STACK_RAIN_LINES.length),
    len: bar ? 0.9 + 1.4 * hash(id, 6) : 7.2 + 2.2 * hash(id, 7),
    thick: bar ? 0.34 : 0.5,
  };
}

export class DeepStorm {
  scene = new THREE.Scene();
  mesh: THREE.InstancedMesh;
  texture: THREE.CanvasTexture;
  private cell: THREE.InstancedBufferAttribute;
  private alpha: THREE.InstancedBufferAttribute;
  private o = new THREE.Object3D();

  constructor(renderer: THREE.WebGLRenderer) {
    const { cellW, cellH, levels } = DEEP;
    const cv = document.createElement('canvas');
    cv.width = cellW * levels * SCALE; cv.height = cellH * ROWS * SCALE;
    const c = scaleContext2D(cv.getContext('2d')!, SCALE);
    c.textBaseline = 'middle';
    for (let l = 0; l < levels; l++) for (let r = 0; r < ROWS; r++) {
      c.save(); c.beginPath(); c.rect(l * cellW, r * cellH, cellW, cellH); c.clip();
      c.filter = BLUR[l]! > 0 ? `blur(${BLUR[l]}px)` : 'none';
      if (r < ROWS - 1) {
        c.font = font(F.mono(500), 40); c.fillStyle = css('paper');
        c.fillText(STACK_RAIN_LINES[r]!, l * cellW + 24, r * cellH + cellH / 2);
      } else {
        c.fillStyle = css('clay'); c.fillRect(l * cellW + 30, r * cellH + 14, cellW - 60, cellH - 28);
      }
      c.restore();
    }
    // Static ink breakup across the atlas, including near/far copies; no per-frame allocations.
    c.save(); c.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14000; i++) {
      c.globalAlpha = 0.3 + hash(i, 21) * 0.6;
      c.fillRect(hash(i, 22) * cellW * levels, hash(i, 23) * cellH * ROWS, 0.7 + hash(i, 24) * 2, 1);
    }
    c.restore();
    this.texture = new THREE.CanvasTexture(cv);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const geo = new THREE.PlaneGeometry(1, 1);
    this.cell = new THREE.InstancedBufferAttribute(new Float32Array(DEEP.count * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(DEEP.count), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCell', this.cell); geo.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec2 aCell; attribute float aAlpha;
        varying vec2 vUv; varying float vAlpha;
        void main() {
          vUv = (aCell + uv) / vec2(${levels}.0, ${ROWS}.0); vUv.y = 1.0 - ((aCell.y + 1.0 - uv.y) / ${ROWS}.0);
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec2 vUv; varying float vAlpha;
        void main() { vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb, c.a * vAlpha); }`,
      uniforms: { map: { value: this.texture } },
      transparent: true, depthWrite: false, depthTest: false, toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, DEEP.count);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);
  }

  /** `d` travelled distance, `focusZ` the focal plane, `reveal` 0..1 density, `stretch` motion length. */
  update(d: number, focusZ: number, reveal: number, stretch: number) {
    // Painter's order: far first (depth test is off; alpha blending needs back-to-front).
    ORDER.forEach((id, slot) => {
      const p = deepParticle(id, d), o = this.o;
      const dz = Math.abs(p.z - focusZ);
      const level = dz < 2.5 ? 0 : dz < 8 ? 1 : dz < 20 ? 2 : 3;
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(0, 0, -Math.PI / 2); // text reads downwards, along the fall
      o.scale.set(p.len * (1 + stretch * (p.bar ? 0.6 : 0.15)), p.thick, 1);
      o.updateMatrix();
      this.mesh.setMatrixAt(slot, o.matrix);
      this.cell.setXY(slot, level, p.bar ? ROWS - 1 : p.line);
      const haze = Math.min(1, Math.max(0, (p.z - DEEP.zFar) / 45));
      const show = hash(id, 11) < reveal ? 1 : 0;
      this.alpha.setX(slot, show * (p.bar ? 0.95 : 0.25 + 0.6 * haze) * (0.35 + 0.65 * haze));
    });
    this.mesh.instanceMatrix.needsUpdate = true; this.cell.needsUpdate = true; this.alpha.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.texture.dispose(); }
}
