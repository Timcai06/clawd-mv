// Stationary paper fibres, pressure mottling and sparse ink specks, in logical pixels.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';

export class PrintOverlay {
  pass: FSPass;
  /** mask is pigment coverage only; noise never depends on time or camera. */
  constructor(mask = '1.0', uniforms: Record<string, THREE.IUniform> = {}, declarations = '') {
    this.pass = new FSPass(/* glsl */ `
      uniform float strength;
      ${declarations}
      void main() {
        vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
        float fibre = 0.5 + 0.5 * snoise(p * vec2(0.65, 0.025));
        float pressure = 0.5 + 0.5 * snoise(p * 0.006);
        vec2 cell = floor(p / 4.0), local = mod(p, 4.0);
        float speck = step(0.997, hash12(cell)) * (1.0 - smoothstep(0.3, 0.8, length(local - 2.0)));
        float coverage = clamp(${mask}, 0.0, 1.0);
        float density = fibre * 0.55 + pressure * 0.35 + speck * 0.1;
        fragColor = vec4(vec3(1.0 - strength * coverage * density), 1.0);
      }`, { strength: { value: 0.05 }, ...uniforms }, { blending: THREE.CustomBlending, transparent: true });
    // Multiply the existing HDR RGB; preserve its alpha. No framebuffer readback/copy.
    const m = this.pass.mat;
    m.blendEquation = THREE.AddEquation; m.blendSrc = THREE.DstColorFactor; m.blendDst = THREE.ZeroFactor;
    m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
  }
  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, strength = 0.05) {
    this.pass.u.strength!.value = strength; this.pass.render(renderer, out);
  }
  dispose() { this.pass.mat.dispose(); }
}
