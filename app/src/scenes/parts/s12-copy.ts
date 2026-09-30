// Local photocopier pass. It degrades only the printed copy, never the live paper ground.
// Registration drift, toner dropout, feed bands, and dust are deterministic uniforms.
import * as THREE from 'three';
import { FSPass } from '../../engine/gl';
import { lin } from '../../theme';

export function copySettings(run: number, clearing: boolean) {
  const generation = clearing ? 0 : Math.max(0, run + 1);
  return { generation, dropout: [0, 0.04, 0.14, 0.28][generation]!,
    drift: [0, 0.8, 3.2, 8][generation]!, bands: [0, 0.06, 0.14, 0.25][generation]! };
}
export class CopyPass {
  pass = new FSPass(/* glsl */ `
    uniform sampler2D ground, copy;
    uniform float generation, dropout, drift, bands, frame, feed;
    uniform vec3 ink, paper;
    void main() {
      vec2 px = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
      float strip = floor(px.y / 6.0);
      float slip = (hash12(vec2(strip, frame)) - 0.5) * drift;
      vec2 uv = vUv + vec2(slip / 1920.0, 0.0);
      vec4 tx = texture(copy, uv);
      vec4 ghost = texture(copy, uv + vec2(drift, -drift * 0.25) / vec2(1920.0, 1080.0));
      // Optical density is printed toner, not a global colour grade.
      float dust = hash12(floor(px / 1.7) + vec2(generation * 11.0, 7.0));
      float voids = step(dust, dropout);
      tx.rgb = mix(tx.rgb, paper, voids * 0.74);
      float band = step(0.84, fract(px.y / 75.0 + feed));
      tx.rgb = mix(tx.rgb, ink, band * bands * 0.22);
      tx.rgb = mix(tx.rgb, ghost.rgb, ghost.a * generation * 0.04);
      vec3 base = texture(ground, vUv).rgb;
      fragColor = vec4(mix(base, tx.rgb, tx.a), 1.0);
    }`, {
    ground: { value: null }, copy: { value: null }, generation: { value: 0 },
    dropout: { value: 0 }, drift: { value: 0 }, bands: { value: 0 }, frame: { value: 0 }, feed: { value: 0 },
    ink: { value: new THREE.Vector3(...lin('ink')) }, paper: { value: new THREE.Vector3(...lin('paper')) },
  });
}
