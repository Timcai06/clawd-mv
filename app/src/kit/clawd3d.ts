// Clawd as voxels (v4, Tim 2026-10-01): the official 16x5 pixel sprite extruded. Seen from the
// front the silhouette is exactly the sprite; the body has depth, arms and legs are thinner.
// The eyes are recessed pits (never through-holes), so they read as the darkest thing on any
// ground (Tim noticed the v3 eyes often vanished: they were ink-coloured holes on ink grounds).
// One voxel = 1 unit in the object's local space (x right, y up, z toward the viewer);
// origin at the centre of the sprite's bottom edge (between the legs, on the ground).
import * as THREE from 'three';
import type { Pose } from './clawd';
import { lin } from '../theme';

const BODY_D = 4, LIMB_D = 2, PIT = 1.3;

const VERT = /* glsl */ `
varying vec3 vN; varying vec3 vC; varying vec3 vW;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(position, 1.0);
  vW = wp.xyz;
  vN = normalize(mat3(m) * normal);
  vC = instanceColor;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FRAG = /* glsl */ `
uniform vec3 uL; uniform float uAmb; uniform vec3 uRim; uniform float uGlow;
varying vec3 vN; varying vec3 vC; varying vec3 vW;
void main() {
  vec3 n = normalize(vN);
  float dif = max(dot(n, normalize(uL)), 0.0);
  // faces: front brightest, top a little less, sides darker (reads as a solid at any size)
  float face = n.z > 0.5 ? 1.0 : n.y > 0.5 ? 0.86 : n.y < -0.5 ? 0.45 : 0.68;
  vec3 c = vC * (uAmb + (1.0 - uAmb) * dif) * face;
  c += vC * uGlow;
  gl_FragColor = vec4(c, 1.0);
}`;

export class VoxelClawd {
  mesh: THREE.InstancedMesh;
  mat: THREE.ShaderMaterial;
  private m4 = new THREE.Matrix4();
  private col = new THREE.Color();
  private body = lin('clay');
  private eye: [number, number, number] = [0.004, 0.006, 0.014];

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: { uL: { value: new THREE.Vector3(-0.4, 0.8, 0.6) }, uAmb: { value: 0.45 }, uRim: { value: new THREE.Vector3() }, uGlow: { value: 0 } },
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 16 * 6 + 8);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array((16 * 6 + 8) * 3), 3);
    this.mesh.frustumCulled = false;
  }

  /** Light direction (world), ambient share, and an emissive lift (e.g. a hit flash). */
  light(dir: [number, number, number], amb = 0.45, glow = 0) {
    (this.mat.uniforms.uL!.value as THREE.Vector3).set(...dir);
    this.mat.uniforms.uAmb!.value = amb; this.mat.uniforms.uGlow!.value = glow;
  }

  /** Build the voxels for a pose (kit/clawd.ts) — call every frame. */
  update(p: Pose) {
    let n = 0;
    const put = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: readonly number[]) => {
      this.m4.makeScale(sx, sy, sz).setPosition(x, y, z);
      this.mesh.setMatrixAt(n, this.m4);
      this.col.setRGB(c[0]!, c[1]!, c[2]!, THREE.LinearSRGBColorSpace);
      this.mesh.setColorAt(n, this.col);
      n++;
    };
    for (const cell of p.cells) {
      // sprite (x right, y down; row 4 = feet) → voxel centre (origin: bottom centre)
      const x = cell.x + p.dx - 8 + 0.5, y = 4 - cell.y - p.dy + 0.5;
      const limb = cell.y === 4 || (cell.y === 2 && (cell.x < 2 || cell.x > 13)) || cell.x < 2 || cell.x > 13;
      const d = limb ? LIMB_D : BODY_D;
      if (cell.k === 'D') {
        // recessed eye: the back of the pit is dark, the pit walls are the neighbours' sides
        put(x, y, -BODY_D / 2 + (BODY_D - PIT) / 2, 1, 1, BODY_D - PIT, this.eye);
      } else put(x, y, 0, 1.002, 1.002, d, this.body);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
