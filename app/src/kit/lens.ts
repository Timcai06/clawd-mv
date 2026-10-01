// A 2D camera for flat scenes (v4 motion): the scene renders into the lens's target as usual,
// then the lens films that frame — zoom about a focus point, pan, roll — onto `out`. The focus
// F (logical px of the scene's frame) lands on the screen anchor A. Zoom ≥ 1 keeps the frame
// covered; at zoom 1, A = F and no roll it is an exact copy.
import * as THREE from 'three';
import { FSPass, makeRT } from '../engine/gl';

export interface LensView { zoom: number; fx: number; fy: number; ax?: number; ay?: number; rot?: number }

const FRAG = /* glsl */ `
uniform sampler2D tex; uniform float zoom, rot; uniform vec2 F, A;
void main() {
  vec2 s = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);   // screen, logical px, y down
  vec2 d = (s - A) / zoom;
  float c = cos(-rot), n = sin(-rot);
  vec2 q = vec2(c * d.x - n * d.y, n * d.x + c * d.y) + F;
  vec2 uv = clamp(vec2(q.x / 1920.0, 1.0 - q.y / 1080.0), vec2(0.0), vec2(1.0));
  fragColor = texture(tex, uv);
}`;

export class Lens {
  rt = makeRT();
  pass = new FSPass(FRAG, {
    tex: { value: null }, zoom: { value: 1 }, rot: { value: 0 },
    F: { value: new THREE.Vector2(960, 540) }, A: { value: new THREE.Vector2(960, 540) },
  });
  /** Film the lens target onto `out` (overwrites it). */
  film(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, v: LensView) {
    const u = this.pass.u;
    u.tex!.value = this.rt.texture; u.zoom!.value = v.zoom; u.rot!.value = v.rot ?? 0;
    (u.F!.value as THREE.Vector2).set(v.fx, v.fy);
    (u.A!.value as THREE.Vector2).set(v.ax ?? v.fx, v.ay ?? v.fy);
    this.pass.render(renderer, out);
  }
  dispose() { this.rt.dispose(); this.pass.mat.dispose(); }
}
