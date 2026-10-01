// A sung word as a 3D object (v4): continuous Archivo (kit/vartype.ts) rendered once into a
// mipmapped texture on a plane. Local frame: origin at the left end of the baseline, x along the
// word, y up (cap height = `capH` world units). Place it with mesh.position / quaternion.
import * as THREE from 'three';
import { SCALE, scaleContext2D } from '../engine/gl';
import { varRun, fillRun, type Axes } from './vartype';

export class WordPlane {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  /** World width / cap height. */
  w: number; h: number;
  constructor(readonly text: string, capH: number, axes: Axes = { wdth: 100, wght: 800 }, tracking = 0) {
    const size = 220, run = varRun(text, size, axes, tracking);
    const pad = 20, cw = Math.ceil(run.width + pad * 2), ch = Math.ceil(run.capH * 1.45 + pad * 2);
    const cv = document.createElement('canvas'); cv.width = cw * SCALE; cv.height = ch * SCALE;
    const c = scaleContext2D(cv.getContext('2d')!, SCALE);
    const base = pad + run.capH * 1.1;
    c.fillStyle = '#fff'; fillRun(c, run, pad, base);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
    const k = capH / run.capH;
    this.w = run.width * k; this.h = capH;
    const geo = new THREE.PlaneGeometry(cw * k, ch * k);
    // origin: left end of the baseline
    geo.translate(cw * k / 2 - pad * k, ch * k / 2 - (ch - base) * k, 0);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true, toneMapped: false, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false;
  }
  /** Linear colour (may exceed 1 to glow) and opacity. */
  set(rgb: readonly number[], opacity: number) {
    this.mat.color.setRGB(rgb[0]!, rgb[1]!, rgb[2]!, THREE.LinearSRGBColorSpace);
    this.mat.opacity = opacity; this.mesh.visible = opacity > 0.002;
  }
  /** Lay flat on a floor (y up), reading along +x, letters' tops toward -z. */
  flat(x: number, y: number, z: number, s = 1) {
    this.mesh.position.set(x, y, z); this.mesh.rotation.set(-Math.PI / 2, 0, 0); this.mesh.scale.setScalar(s);
  }
  /** Stand upright facing +z. */
  stand(x: number, y: number, z: number, s = 1, yaw = 0) {
    this.mesh.position.set(x, y, z); this.mesh.rotation.set(0, yaw, 0); this.mesh.scale.setScalar(s);
  }
  dispose() { this.mesh.geometry.dispose(); this.mat.map!.dispose(); this.mat.dispose(); }
}

/** White-hot → colour cooling for a freshly written word (pdoom heatCss, in linear RGB). */
export function heat(rgb: readonly number[], k: number): [number, number, number] {
  const hot = [3.2, 2.2, 1.4];
  return [rgb[0]! + (hot[0]! - rgb[0]!) * k, rgb[1]! + (hot[1]! - rgb[1]!) * k, rgb[2]! + (hot[2]! - rgb[2]!) * k];
}
