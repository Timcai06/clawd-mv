// Camera rig helpers (v4): cameras are pure functions of t, built from phases whose edges sit on
// words and beats (pdoom loss.ts). A Cam is a plain value so phases can be blended.
import * as THREE from 'three';
import { W, H } from '../engine/gl';
import { lerp } from '../engine/util';

export interface P3 { x: number; y: number; z: number }
export interface Cam { pos: P3; tgt: P3; roll: number; fov: number }

export const p3 = (x = 0, y = 0, z = 0): P3 => ({ x, y, z });
export const lerp3 = (a: P3, b: P3, k: number): P3 => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z, b.z, k) });
export const add3 = (a: P3, b: P3): P3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

/** Camera position on a sphere around `tgt` (yaw about +y from +z, pitch up from the horizon). */
export const orbit = (tgt: P3, yaw: number, pitch: number, dist: number): P3 => ({
  x: tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist,
  y: tgt.y + Math.sin(pitch) * dist,
  z: tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist,
});
export const orbitCam = (tgt: P3, yaw: number, pitch: number, dist: number, fov = 34, roll = 0): Cam =>
  ({ pos: orbit(tgt, yaw, pitch, dist), tgt, roll, fov });

/** Blend two cameras (positions and targets linearly, fov and roll too). */
export const mixCam = (a: Cam, b: Cam, k: number): Cam =>
  ({ pos: lerp3(a.pos, b.pos, k), tgt: lerp3(a.tgt, b.tgt, k), roll: lerp(a.roll, b.roll, k), fov: lerp(a.fov, b.fov, k) });

export interface Proj { x: number; y: number; s: number; w: number }

/** A perspective camera driven by Cam values, with a fast world → screen projection. */
export class Rig {
  cam = new THREE.PerspectiveCamera(34, W / H, 0.05, 500);
  vp = new THREE.Matrix4();
  private v4 = new THREE.Vector4();

  set(c: Cam) {
    const k = this.cam;
    k.fov = c.fov; k.updateProjectionMatrix();
    k.position.set(c.pos.x, c.pos.y, c.pos.z);
    k.up.set(0, 1, 0);
    k.lookAt(c.tgt.x, c.tgt.y, c.tgt.z);
    k.rotateZ(c.roll);
    k.updateMatrixWorld(true);
    this.vp.multiplyMatrices(k.projectionMatrix, k.matrixWorldInverse);
  }

  /** Logical screen px (y down); s = px per world unit at that depth. Null behind the camera. */
  proj(x: number, y: number, z: number): Proj | null {
    const v = this.v4.set(x, y, z, 1).applyMatrix4(this.vp);
    if (v.w <= 0.05) return null;
    const P11 = this.cam.projectionMatrix.elements[5]!;
    return { x: (v.x / v.w * 0.5 + 0.5) * W, y: (0.5 - v.y / v.w * 0.5) * H, s: 0.5 * H * P11 / v.w, w: v.w };
  }
}
