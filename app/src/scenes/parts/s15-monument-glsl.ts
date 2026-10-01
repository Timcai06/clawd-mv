// Engraved, thick comparator faces in a calibrated oblique projection.
// Separate top / front / end densities print depth without lighting or gradients.
export const MONUMENT_VERT = /* glsl */ `
precision highp float;
in vec3 position;
in float density, group, slope;
uniform mat4 projectionMatrix, modelViewMatrix;
uniform float scale, barY, barRoll, pieceAngle, pieceVisible;
uniform vec2 pieceCentre;
out vec2 printPos;
out float printDensity, printGroup, printSlope;
void main() {
  vec2 p = position.xy;
  printPos = p;
  printDensity = density; printGroup = group; printSlope = slope;
  if (group > 2.5) {
    float co = cos(pieceAngle), si = sin(pieceAngle);
    p = pieceCentre + mat2(co, si, -si, co) * p;
  } else {
    if (group > 0.5 && group < 1.5) {
      vec2 q = p - vec2(1040.0, 780.0);
      float co = cos(barRoll), si = sin(barRoll);
      p = vec2(1040.0, 780.0 + barY) + mat2(co, si, -si, co) * q;
    }
    p = vec2(1260.0, 570.0) + (p - vec2(1260.0, 570.0)) * scale;
  }
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, position.z, 1.0);
}`;

export const MONUMENT_FRAG = /* glsl */ `
precision highp float;
in vec2 printPos;
in float printDensity, printGroup, printSlope;
out vec4 fragColor;
uniform vec3 paper, ink;
uniform float fracture, pieceVisible;
void main() {
  if (printGroup > 1.5 && printGroup < 2.5 && fracture < 0.1) discard;
  if (printGroup > 2.5 && pieceVisible < 0.5) discard;
  // Carved crack in the equal stroke, with a serrated stone edge, rather than a mask wipe.
  if (printGroup > 0.5 && printGroup < 1.5) {
    float jag = sin(printPos.y * 0.083) * 6.0 + sin(printPos.y * 0.24) * 2.5;
    if (abs(printPos.x - 1040.0 - jag) < fracture * 24.0) discard;
  }
  float u = printPos.x + printPos.y * printSlope;
  float warp = snoise(printPos * 0.017) * 0.9;
  float cut = hatch((u + warp) / 4.1, printDensity);
  float cross = hatch((printPos.y - printPos.x * 0.35) / 5.8, max(0.0, printDensity - 0.53));
  float dry = step(0.97, hash12(floor(printPos * vec2(1.3, 0.85))));
  float pigment = max(cut, cross) * (1.0 - dry * 0.55);
  float pores = step(0.996, hash12(floor(printPos * 0.8)));
  fragColor = vec4(mix(paper, ink, max(pigment * 0.92, pores * 0.50)), 1.0);
}`;
