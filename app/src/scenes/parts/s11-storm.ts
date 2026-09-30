// Three depth bands of stack-trace particles. Blur is baked once into the atlas;
// positions and opacity are reconstructed at any beat, not advanced as a simulation.
import * as THREE from 'three';
import { SCALE, scaleContext2D } from '../../engine/gl';
import { F, font } from '../../engine/type';
import { hash } from '../../engine/util';
import { css } from '../../theme';
import { STACK_RAIN_LINES } from '../../kit/content';

export const STORM = { layers: 3, perLayer: 42, width: 1280, rowHeight: 96 };
export function stormParticle(id: number, beat: number) {
  const layer = Math.floor(id / STORM.perLayer), local = id % STORM.perLayer;
  const speed = [105, 172, 265][layer]!;
  const extent = [5500, 3400, 2400][layer]!;
  const cycle = 3500 + hash(id, 84) * 1000;
  const distance = beat * speed + hash(id, 81) * cycle;
  return {
    layer, line: local % STACK_RAIN_LINES.length,
    x: (hash(id, 80) - 0.5) * extent + Math.sin(beat * 0.09 + id) * (30 + layer * 22),
    y: cycle / 2 - ((distance % cycle) + cycle) % cycle,
    z: [-1300, -550, 250][layer]! + hash(id, 83) * 140,
    width: [650, 810, 990][layer]!, height: [49, 61, 74][layer]!,
    alpha: [0.15, 0.32, 0.58][layer]! * (0.75 + 0.25 * hash(id, 87)),
    rotation: (hash(id, 88) - 0.5) * 0.09,
  };
}
export class TextStorm {
  mesh: THREE.InstancedMesh; texture: THREE.CanvasTexture;
  private alpha: THREE.InstancedBufferAttribute;
  private tr = new THREE.Object3D();
  constructor(renderer: THREE.WebGLRenderer) {
    const S = STORM, count = S.layers * S.perLayer, rows = S.layers * STACK_RAIN_LINES.length;
    const canvas = document.createElement('canvas'); canvas.width = S.width * SCALE; canvas.height = rows * S.rowHeight * SCALE;
    const c = scaleContext2D(canvas.getContext('2d')!, SCALE);
    c.font = font(F.mono(500), 36); c.fillStyle = css('paper');
    for (let layer = 0; layer < S.layers; layer++) for (let line = 0; line < STACK_RAIN_LINES.length; line++) {
      c.save(); c.filter = `blur(${[2.6, 0.8, 0][layer]}px)`;
      c.fillText(STACK_RAIN_LINES[line]!, 32, (layer * 3 + line) * S.rowHeight + 62); c.restore();
    }
    this.texture = new THREE.CanvasTexture(canvas); this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter; this.texture.generateMipmaps = true;
    this.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const geo = new THREE.PlaneGeometry(1, 1);
    const atlas = Array.from({ length: count }, (_, id) => Math.floor(id / S.perLayer) * 3 + id % 3);
    geo.setAttribute('aAtlas', new THREE.InstancedBufferAttribute(new Float32Array(atlas), 1));
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(count), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alpha);
    const mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute float aAtlas, aAlpha;
        varying vec2 vMap; varying float vAlpha;
        void main() {
          vMap = vec2(uv.x, (8.0 - aAtlas + uv.y) / 9.0); vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map;
        varying vec2 vMap; varying float vAlpha;
        void main() { vec4 tx = texture2D(map, vMap); gl_FragColor = vec4(tx.rgb, tx.a * vAlpha); }`,
      uniforms: { map: { value: this.texture } }, transparent: true, depthWrite: false,
      depthTest: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }
  update(beat: number, reveal: number, tilt: number) {
    for (let id = 0; id < this.mesh.count; id++) {
      const s = stormParticle(id, beat), tr = this.tr;
      tr.position.set(s.x + (s.y * 0.08 * tilt), s.y, s.z);
      tr.rotation.set(0, 0, s.rotation - tilt * 0.06); tr.scale.set(s.width, s.height, 1);
      tr.updateMatrix(); this.mesh.setMatrixAt(id, tr.matrix); this.alpha.setX(id, s.alpha * reveal);
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.alpha.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.texture.dispose(); }
}
