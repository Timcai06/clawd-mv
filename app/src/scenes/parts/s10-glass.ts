// Nineteen independent glass test plates, each triangulated into eight deterministic shards.
// One atlas, one instanced draw: no texture allocation or physics integration during render.
import * as THREE from 'three';
import { SCALE, scaleContext2D } from '../../engine/gl';
import { F, font } from '../../engine/type';
import { hash, ease } from '../../engine/util';
import { css, lin } from '../../theme';
import { CALENDAR_TESTS } from '../../kit/content';

export const GLASS = { rows: 19, pieces: 8, width: 1200, height: 34, pitch: 40, atlasWidth: 1280, atlasRow: 48 };
export function glassTriangles(row: number) {
  const { width: w, height: h } = GLASS;
  const center: [number, number] = [w * (0.32 + hash(row, 11) * 0.36), h * (0.25 + hash(row, 12) * 0.5)];
  const ring: [number, number][] = [[0, 0], [w * 0.4, 0], [w, 0], [w, h * 0.55],
    [w, h], [w * 0.6, h], [0, h], [0, h * 0.45]];
  return ring.map((p, i) => [center, p, ring[(i + 1) % ring.length]!] as const);
}
export function glassShardState(row: number, piece: number, fracture: number) {
  const id = row * GLASS.pieces + piece;
  const release = Math.max(0, (fracture - row * 0.012) / (1 - row * 0.012));
  const b = ease.inQuad(release), side = hash(id, 5) * 2 - 1;
  return {
    x: side * 690 * release, y: 160 * release + 1750 * b,
    z: (hash(id, 6) - 0.35) * 580 * release,
    rx: side * release * 2.7, ry: (hash(id, 7) - 0.5) * release * 3.8,
    rz: (hash(id, 8) - 0.5) * release * 2,
    alpha: 1 - Math.max(0, (release - 0.68) / 0.32), release,
  };
}

export class GlassWall {
  mesh: THREE.InstancedMesh; geo: THREE.BufferGeometry; mat: THREE.ShaderMaterial;
  texture: THREE.CanvasTexture;
  private alpha: THREE.InstancedBufferAttribute;
  private centers: [number, number][] = [];
  private transform = new THREE.Object3D();
  constructor(renderer: THREE.WebGLRenderer) {
    const G = GLASS, n = G.rows * G.pieces;
    const canvas = document.createElement('canvas');
    canvas.width = G.atlasWidth * SCALE; canvas.height = G.atlasRow * G.rows * SCALE;
    const c = scaleContext2D(canvas.getContext('2d')!, SCALE);
    for (let row = 0; row < G.rows; row++) {
      const y = row * G.atlasRow;
      c.fillStyle = css('paper'); c.fillRect(0, y, G.atlasWidth, G.atlasRow);
      c.fillStyle = css('fail', 0.12); c.fillRect(0, y, G.width, G.height);
      c.fillStyle = css('fail'); c.fillRect(0, y, 78, G.height);
      c.font = font(F.mono(600), 18); c.fillStyle = css('paper'); c.fillText('FAIL', 14, y + 24);
      c.fillStyle = css('ink'); c.fillText(CALENDAR_TESTS[row]!, 100, y + 24);
      c.fillStyle = css('fail'); c.fillText(`${String(row + 1).padStart(2, '0')} / 19`, 1080, y + 24);
    }
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = true; this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    const A: number[] = [], B: number[] = [], C: number[] = [], rows: number[] = [];
    for (let row = 0; row < G.rows; row++) {
      for (const tri of glassTriangles(row)) {
        const center: [number, number] = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3,
          (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
        this.centers.push(center);
        for (const [list, point] of [[A, tri[0]], [B, tri[1]], [C, tri[2]]] as const)
          list.push(point[0], point[1], center[0], center[1]);
        rows.push(row);
      }
    }
    this.geo.setAttribute('aTriA', new THREE.InstancedBufferAttribute(new Float32Array(A), 4));
    this.geo.setAttribute('aTriB', new THREE.InstancedBufferAttribute(new Float32Array(B), 4));
    this.geo.setAttribute('aTriC', new THREE.InstancedBufferAttribute(new Float32Array(C), 4));
    this.geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(new Float32Array(rows), 1));
    this.alpha = new THREE.InstancedBufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aAlpha', this.alpha);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: `
        attribute vec4 aTriA, aTriB, aTriC;
        attribute float aRow, aAlpha;
        varying vec2 vMap; varying vec3 vBary; varying float vAlpha;
        void main() {
          vec4 p = position.x > 0.5 ? aTriB : position.y > 0.5 ? aTriC : aTriA;
          vMap = vec2(p.x / 1280.0, 1.0 - (aRow * 48.0 + p.y) / 912.0);
          vBary = vec3(1.0 - position.x - position.y, position.x, position.y);
          vAlpha = aAlpha;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p.x - p.z, -(p.y - p.w), 0.0, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D map; uniform vec3 ink; uniform float fracture, pxScale;
        varying vec2 vMap; varying vec3 vBary; varying float vAlpha;
        void main() {
          vec3 color = texture2D(map, vMap).rgb;
          vec3 d = vBary / max(fwidth(vBary) * pxScale, vec3(0.00001));
          float cut = 1.0 - smoothstep(0.25, 1.1, min(d.x, min(d.y, d.z)));
          color = mix(color, ink, cut * 0.26 * min(1.0, fracture * 8.0));
          gl_FragColor = vec4(color, vAlpha * 0.94);
        }`,
      uniforms: { map: { value: this.texture }, ink: { value: new THREE.Vector3(...lin('ink')) },
        fracture: { value: 0 }, pxScale: { value: SCALE } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
  }
  update(rows: number, fracture: number, entry: number) {
    this.mat.uniforms.fracture!.value = fracture;
    const G = GLASS;
    for (let row = 0; row < G.rows; row++) for (let piece = 0; piece < G.pieces; piece++) {
      const id = row * G.pieces + piece, center = this.centers[id]!;
      const s = glassShardState(row, piece, fracture), tr = this.transform;
      const visible = row < rows;
      const fly = visible ? (1 - ease.outExpo(Math.min(1, Math.max(0, (entry - row / 9) / 0.45)))) * 580 : 580;
      tr.position.set(-310 + center[0] + s.x + fly, 370 - row * G.pitch - center[1] - s.y,
        40 + row * 1.4 + s.z);
      tr.rotation.set(s.rx, s.ry, s.rz); tr.scale.setScalar(visible ? 1 : 0);
      tr.updateMatrix(); this.mesh.setMatrixAt(id, tr.matrix);
      this.alpha.setX(id, visible ? Math.max(0, s.alpha) : 0);
    }
    this.alpha.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); this.texture.dispose(); }
}
