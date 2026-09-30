// A solid, extruded comparator built from three rectangular SDF strokes.
// Unlike an image extrusion, the lower stroke has an independent rigid transform.
export const MONUMENT_FRAG = /* glsl */ `
uniform vec3 camPos, camR, camU, camF;
uniform vec3 paperColor, inkColor, clayColor, barOffset;
uniform float tanF, isPaper, opacity, barRoll, shiver;

float boxD(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
float strokeD(vec3 p, vec2 a, vec2 b) {
  vec2 d = normalize(b - a);
  vec2 q = p.xy - (a + b) * 0.5;
  vec3 local = vec3(dot(q, d), dot(q, vec2(-d.y, d.x)), p.z);
  return boxD(local, vec3(length(b - a) * 0.5, 0.29, 0.64)) - 0.025;
}
vec2 mapGlyph(vec3 p) {
  float a = strokeD(p, vec2(2.65, 2.5), vec2(-2.65, 0.0));
  float b = strokeD(p, vec2(-2.65, 0.0), vec2(2.65, -2.5));
  vec3 q = p - vec3(0.0, -3.7 + shiver, 0.0) - barOffset;
  q.xy = rot2(-barRoll) * q.xy;
  float bar = boxD(q, vec3(2.95, 0.27, 0.64)) - 0.025;
  return bar < min(a, b) ? vec2(bar, 1.0) : vec2(min(a, b), 0.0);
}
vec3 normalAt(vec3 p, float e) {
  vec2 k = vec2(1.0, -1.0);
  return normalize(k.xyy * mapGlyph(p + k.xyy * e).x
    + k.yyx * mapGlyph(p + k.yyx * e).x
    + k.yxy * mapGlyph(p + k.yxy * e).x
    + k.xxx * mapGlyph(p + k.xxx * e).x);
}
void main() {
  if (opacity <= 0.0) discard;
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(camF + tanF * (camR * ndc.x * (16.0 / 9.0) + camU * ndc.y));
  // Intersect an enclosing slab before marching; empty pixels do no SDF work.
  vec3 safeRd = sign(rd) * max(abs(rd), vec3(0.00001));
  vec3 tA = (vec3(-4.0, -7.5, -1.0) - camPos) / safeRd;
  vec3 tB = (vec3(15.0, 4.0, 4.0) - camPos) / safeRd;
  vec3 lo = min(tA, tB), hi = max(tA, tB);
  float at = max(0.0, max(lo.x, max(lo.y, lo.z)));
  float end = min(hi.x, min(hi.y, hi.z));
  if (end <= at) discard;
  vec2 sampleD = vec2(1.0);
  bool hit = false;
  for (int i = 0; i < 64; i++) {
    sampleD = mapGlyph(camPos + rd * at);
    if (sampleD.x < max(0.0007, at * 0.00018)) { hit = true; break; }
    at += max(sampleD.x * 0.9, 0.001);
    if (at > end) break;
  }
  if (!hit) discard;
  vec3 p = camPos + rd * at;
  vec3 n = normalAt(p, max(at * 0.00015, 0.001));
  // Fixed discrete tones, cut with engraving: no specular light or smooth fill gradient.
  float side = step(0.45, abs(n.x));
  float top = step(0.45, abs(n.y));
  float darkness = 0.24 + 0.37 * side + 0.18 * top;
  vec2 uv = abs(n.z) > 0.5 ? p.xy : abs(n.x) > 0.5 ? p.zy : p.xz;
  if (sampleD.y > 0.5) uv = rot2(-barRoll) * (uv - barOffset.xy);
  float lines = engrave(uv, darkness, 23.0, 0.68);
  float cuts = hatch(p.z * 36.0 + p.y * 0.8, 0.18) * max(side, top);
  vec3 base = mix(paperColor, inkColor, isPaper);
  vec3 incision = mix(inkColor, paperColor, isPaper);
  vec3 color = mix(base, incision, max(lines * 0.82, cuts * 0.55));
  // The detachable part is still the same engraved material; only the cursor is clay.
  fragColor = vec4(color * opacity, opacity);
}`;
