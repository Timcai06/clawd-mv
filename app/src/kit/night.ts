// Night-version trial (docs/CONTEXT.md「夜景试验」, 2026-10-02): scenes that switch on NIGHT keep
// their composition, camera and timing, but sit on a near-black ground where light is the subject:
// only semantic colours (clay, fail red, pass green) and the white-hot heat emit; paper type and
// hairlines never glow; surfaces are white-line engravings whose lines brighten with the light.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import { lin } from '../theme';

/** Off by default (Tim 2026-10-02: the colour was not the problem). `?night` renders the trial versions. */
export const NIGHT = typeof location !== 'undefined' && new URLSearchParams(location.search).get('night') !== null;

/** Night sky: near-black, a faint cool haze rising from the horizon (y = horizon in 0..1 from the bottom). */
export class NightSky {
  pass = new FSPass(/* glsl */ `
    uniform vec3 night, ink; uniform float horizon, glow;
    void main() {
      float y = vUv.y;
      float haze = exp(-max(0.0, y - horizon) * 5.0) * smoothstep(horizon - 0.25, horizon, y);
      vec3 c = night + ink * 0.22 * haze + ink * 0.05 * (1.0 - y);
      c += vec3(0.9, 0.35, 0.18) * 0.012 * glow * haze;
      fragColor = vec4(c, 1.0);
    }`, {
    night: { value: new THREE.Vector3(...lin('night')) }, ink: { value: new THREE.Vector3(...lin('ink')) },
    horizon: { value: 0.55 }, glow: { value: 0 },
  });
  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, horizon = 0.55, glow = 0) {
    this.pass.u.horizon!.value = horizon; this.pass.u.glow!.value = glow;
    this.pass.render(r, out);
  }
  dispose() { this.pass.mat.dispose(); }
}

/**
 * Night glow for flat (Canvas2D) scenes: re-adds the strongly coloured pixels of a layer (clay,
 * fail red, pass green — high chroma) at HDR intensity so only they bloom. Paper, ink and night
 * have low chroma and are untouched, so type never glows.
 */
export class ChromaGlow {
  pass = new FSPass(/* glsl */ `
    uniform sampler2D tex; uniform float gain;
    void main() {
      vec4 c = texture(tex, vUv);
      vec3 rgb = c.rgb * c.a;
      float chroma = max(rgb.r, max(rgb.g, rgb.b)) - min(rgb.r, min(rgb.g, rgb.b));
      float key = smoothstep(0.14, 0.3, chroma);
      fragColor = vec4(rgb * key * gain, 1.0);
    }`, { tex: { value: null }, gain: { value: 1.5 } }, { blending: THREE.AdditiveBlending, transparent: true });
  composite(r: THREE.WebGLRenderer, tex: THREE.Texture, out: THREE.WebGLRenderTarget, gain = 1.5) {
    this.pass.u.tex!.value = tex; this.pass.u.gain!.value = gain;
    this.pass.render(r, out);
  }
  dispose() { this.pass.mat.dispose(); }
}
