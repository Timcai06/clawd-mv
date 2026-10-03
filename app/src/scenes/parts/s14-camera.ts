// S14's camera and frame geometry as pure functions, so the S13→S14 hand-off (C13, docs/CUTS.md)
// can ask where S14's cursor is on its first frame.
import * as THREE from 'three';
import { W, H } from '../../engine/gl';
import { clamp, ease, frameIdx, hash, lerp } from '../../engine/util';
import { landPulse, stackPhase, stackPos, type StackScore } from './s14-stack';

// ---- frame geometry (world units) ----
export const HX = 6.4, HY = 2.7, HZ = 1.3; // half extents of a frame slab
export const P = 7.4; // pitch between frames
export const MX = -1.2; // call path x
export const CALL_Y = -1.55; // call-site line y inside a frame (the line that calls the next frame)
export const BUG_Y = -0.55; // line 42 inside daysIn

/** Point `cam` for time t at stack depth `pos`; returns the phase and the camera distance. */
export function shaftCamera(cam: THREE.PerspectiveCamera, S: StackScore, t: number, pos: number) {
  const ph = stackPhase(t, S), lt = t - ph.t0;
  let yaw = -0.3, pitch = 1.3, dist = 26, fov = 42, roll = 0, fx = 0, fy = -1.5;
  if (ph.id === 'shaft') {
    // straight down the shaft, frames receding into haze; a slow turn while the plumb line lowers
    // the front faces step down and away: you see the shaft's depth, not just the top slab
    yaw = -0.62 + lt * 0.06; pitch = 0.98; dist = 27 - lt * 0.8; fov = 42; fy = -6;
  } else if (ph.id === 'down') {
    // crane from the shaft view to a 3/4 view over the first landing
    const k = ease.inOutCubic(clamp(lt / 0.55));
    yaw = lerp(-0.5, -0.46, k); pitch = lerp(0.98, 0.5, k); dist = lerp(25, 18, k); fov = lerp(42, 34, k); fy = lerp(-6, 0.2, k);
    roll = lerp(0, -0.03, k);
  } else if (ph.id === 'quiet') {
    // pulled back, high, slow: quiet down here
    yaw = 0.44 + lt * 0.04; pitch = 0.95 - lt * 0.04; dist = 31 - lt * 1.2; fov = 38; roll = 0.04; fx = 0.6; fy = -1.2;
  } else if (ph.id === 'elevator') {
    // elevator: tight near-flat elevation, the frames flicking past
    yaw = 0.3 + lt * 0.02; pitch = 0.14; dist = 15.5 - lt * 0.4; fov = 33; roll = -0.02; fx = -0.4; fy = 0.3;
  } else {
    // dead stop: engineering elevation, telephoto, slow push to line 42
    const k = ease.inOutCubic(clamp((lt - 0.25) / 1.4));
    yaw = 0.16; pitch = 0.08; fov = 22; dist = lerp(34, 29, k); fx = lerp(0, -0.6, k); fy = lerp(0.2, -0.2, k);
  }
  const land = ph.id === 'stop' ? 0 : landPulse(t, S);
  const shx = (hash(frameIdx(t), 1) - 0.5) * land * 0.14, shy = (hash(frameIdx(t), 2) - 0.5) * land * 0.14;
  const focus = new THREE.Vector3(fx + shx, -pos * P + fy + shy, 0);
  cam.fov = fov;
  cam.position.set(focus.x + Math.sin(yaw) * Math.cos(pitch) * dist, focus.y + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  cam.up.set(0, 1, 0); cam.lookAt(focus); cam.rotateZ(roll);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  return { ph, dist };
}

/** The plumb-line cursor (drawCursor's baseline form: x, y = bottom, h) at time t, or null off screen. */
export function shaftCursor(cam: THREE.PerspectiveCamera, S: StackScore, t: number) {
  const depth = stackPos(t, S), last = S.steps.length;
  const { ph, dist } = shaftCamera(cam, S, t, depth);
  const stop = ph.id === 'stop', k = stop ? ease.outCubic(clamp((t - S.near) / 0.35)) : 0;
  const y = stop ? -last * P + lerp(CALL_Y - 0.3, BUG_Y, k) : -depth * P + CALL_Y - 0.3;
  const v = new THREE.Vector3(MX, y, HZ + 0.02).project(cam), h = clamp(34 * 14 / dist, 12, 40);
  return v.z > -1 && v.z < 1 ? { x: (v.x * 0.5 + 0.5) * W - h * 0.27, y: (0.5 - v.y * 0.5) * H + h, h } : null;
}

let probe: THREE.PerspectiveCamera | undefined;
/** C13: S14's cursor block on screen at time t (drawCursor's rect). */
export function shaftCursorRect(S: StackScore, t: number) {
  const q = shaftCursor((probe ??= new THREE.PerspectiveCamera(34, W / H, 0.1, 600)), S, t)!;
  return { x: q.x, y: q.y - q.h, w: q.h * 0.55, h: q.h };
}
