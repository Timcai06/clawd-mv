import { lin } from '../../theme';

const pigment = (k: 'paper' | 'ink' | 'clay') => `vec3(${lin(k).join(',')})`;

// Binary pigment coverage: paper/ink/clay tokens. Fibre noise, stochastic dots and
// broken horizontal engraved lines replace the reference's dawn gradient.
export const DAWN_PAPER_GLSL = /* glsl */ `float dawnPaper(vec2 p, float dawn) {
  float boundary = 1605.0 - 235.0 * dawn + 26.0 * sin(p.y * 0.008);
  float coverage = clamp((p.x - boundary + 145.0) / 280.0, 0.0, 1.0);
  float dotNoise = hash12(floor(p / 1.6));
  float row = floor(p.y / 5.2);
  float end = boundary + 80.0 + (hash11(row) - 0.5) * 120.0;
  float hatch = step(mod(p.y, 5.2), 1.15) * step(boundary - 190.0, p.x) * step(p.x, end);
  return step(dotNoise, coverage) * (1.0 - hatch);
}`;

export const S18_PAPER = /* glsl */ `
uniform float dawn, glowOnly;
const vec3 S18_PAPER = ${pigment('paper')};
const vec3 S18_INK = ${pigment('ink')};
const vec3 S18_CLAY = ${pigment('clay')};
${DAWN_PAPER_GLSL}
void main() {
  vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  float paper = dawnPaper(p, dawn);
  vec3 col = paper > 0.5 ? S18_PAPER : S18_INK;
  float fleck = hash12(floor(p));
  if (fleck > 0.995) col = paper > 0.5 ? S18_CLAY : S18_PAPER;
  if (hash12(floor(p / vec2(7.0, 0.8))) > 0.998) col = paper > 0.5 ? S18_INK : S18_PAPER;
  vec2 cell = floor(p / 22.0), local = mod(p, 22.0);
  float star = step(0.945, hash12(cell + 18.0)) * step(length(local - vec2(11.0)), 0.7);
  if (star > 0.5 && paper < 0.5 && p.y < 840.0) col = hash12(cell) > 0.7 ? S18_CLAY : S18_PAPER;
  if (length(p - vec2(1640.0, 922.0)) < 82.0 && p.y < 922.0) col = S18_CLAY;
  if (p.y >= 922.0 && p.y < 983.0 && p.x > 1190.0) {
    float ray = step(mod(p.y - 922.0, 6.5), 1.0);
    float rayStart = 1170.0 + hash11(floor((p.y - 922.0) / 6.5)) * 650.0;
    if (ray > 0.5 && p.x > rayStart) col = p.y < 961.0 ? S18_CLAY : S18_PAPER;
  }
  if (glowOnly > 0.5) {
    float clay = float(distance(col, S18_CLAY) < 0.0001);
    fragColor = vec4(col * clay * (1.0-paper), 1.0);
  } else fragColor = vec4(col, 1.0);
}`;
