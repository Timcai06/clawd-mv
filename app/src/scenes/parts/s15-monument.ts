import * as THREE from 'three';
import { GLSL_COMMON } from '../../engine/glsl/common';
import { lin } from '../../theme';
import { MONUMENT_VERT, MONUMENT_FRAG } from './s15-monument-glsl';
import { SCULPTURE, STONES, type Face, type monumentState } from './s15-layout';

export class Monument {
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(0, 1920, 0, 1080, 0.1, 100);
  geometry = new THREE.BufferGeometry();
  material: THREE.RawShaderMaterial;
  constructor() {
    this.camera.position.z = 10;
    const positions: number[] = [], densities: number[] = [], groups: number[] = [], slopes: number[] = [];
    // The detached piece has its own local coordinates and rigid transform.
    const piece: Face = { points: [{ x: -35, y: -105 }, { x: 35, y: -105 },
      { x: 35, y: 105 }, { x: -35, y: 105 }], density: 0.5, group: 3, slope: -0.65 };
    for (const f of [...SCULPTURE, ...STONES, piece]) {
      for (let i = 1; i < f.points.length - 1; i++) for (const p of [f.points[0]!, f.points[i]!, f.points[i + 1]!]) {
        positions.push(p.x, p.y, 0); densities.push(f.density); groups.push(f.group); slopes.push(f.slope);
      }
    }
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('density', new THREE.Float32BufferAttribute(densities, 1));
    this.geometry.setAttribute('group', new THREE.Float32BufferAttribute(groups, 1));
    this.geometry.setAttribute('slope', new THREE.Float32BufferAttribute(slopes, 1));
    this.material = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: MONUMENT_VERT,
      fragmentShader: 'precision highp float;\n' + GLSL_COMMON + MONUMENT_FRAG,
      uniforms: { paper: { value: new THREE.Vector3(...lin('paper')) }, ink: { value: new THREE.Vector3(...lin('ink')) },
        scale: { value: 1 }, barY: { value: 0 }, barRoll: { value: 0 }, fracture: { value: 0 },
        pieceCentre: { value: new THREE.Vector2() }, pieceAngle: { value: 0 }, pieceVisible: { value: 0 } },
      side: THREE.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false });
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.frustumCulled = false; this.scene.add(mesh);
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, s: ReturnType<typeof monumentState>) {
    const u = this.material.uniforms;
    u.scale!.value = s.scale; u.barY!.value = s.barY; u.barRoll!.value = s.barRoll; u.fracture!.value = s.fracture;
    (u.pieceCentre!.value as THREE.Vector2).set(s.piece.cx, s.piece.cy);
    u.pieceAngle!.value = s.piece.angle; u.pieceVisible!.value = s.piece.visible ? 1 : 0;
    renderer.setRenderTarget(out); renderer.render(this.scene, this.camera);
  }
  dispose() { this.geometry.dispose(); this.material.dispose(); }
}
