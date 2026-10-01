// Glyph field (v4, docs/V4-DESIGN.md 3.1 "code is matter"): tens of thousands of characters as
// GPU instances in 3D. One SDF atlas per font (built once from the loaded webfont with an exact
// Euclidean distance transform), one instanced quad per glyph. Each glyph is placed by an origin
// on its baseline and two world vectors: R (one em along the baseline) and U (one em up), so a
// glyph can stand, lie on a floor, fall, or face the camera. Positions are written by the scene
// every frame (pure functions of t), so the field is deterministic and blur-sampling safe.
import * as THREE from 'three';
import { font as cssFont, F } from '../engine/type';
import { rtScale } from '../engine/gl';

const CELL = 64; // atlas cell (px)
const FONT_PX = 40; // glyph size inside the cell
const SPREAD = 8; // SDF range (px either side of the edge)
const COLS = 16;
const PAD_X = 12, BASE_Y = 44; // pen origin inside a cell

/** Characters every atlas carries (printable ASCII + a few symbols the film needs). */
export const CHARSET = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '□■≤≥→←↑↓✓✗×·…–—“”’█▌▐';

// 1D squared distance transform (Felzenszwalb & Huttenlocher)
function edt1(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array) {
  let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
    while (s <= z[k]!) { k--; s = ((f[q]! + q * q) - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1]! < q) k++; d[q] = (q - v[k]!) * (q - v[k]!) + f[v[k]!]!; }
}
function edt2(grid: Float64Array, w: number, h: number) {
  const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x]!;
    edt1(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y]!;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x]!;
    edt1(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x]!;
  }
}

export class GlyphAtlas {
  tex: THREE.DataTexture;
  index = new Map<string, number>();
  /** Advance of the font's '0' in em (monospace advance for Plex). */
  adv: number;
  rows: number;
  private static cache = new Map<string, GlyphAtlas>();

  static of(family = F.mono(500)): GlyphAtlas {
    let a = GlyphAtlas.cache.get(family);
    if (!a) GlyphAtlas.cache.set(family, (a = new GlyphAtlas(family)));
    return a;
  }

  private constructor(readonly family: string) {
    const chars = Array.from(CHARSET);
    this.rows = Math.ceil(chars.length / COLS);
    const AW = COLS * CELL, AH = this.rows * CELL;
    const cv = document.createElement('canvas'); cv.width = CELL; cv.height = CELL;
    const c = cv.getContext('2d', { willReadFrequently: true })!;
    c.font = cssFont(family, FONT_PX);
    this.adv = c.measureText('0').width / FONT_PX;
    const data = new Uint8Array(AW * AH);
    const inside = new Float64Array(CELL * CELL), outside = new Float64Array(CELL * CELL);
    chars.forEach((ch, i) => {
      this.index.set(ch, i);
      c.clearRect(0, 0, CELL, CELL);
      c.fillStyle = '#fff'; c.font = cssFont(family, FONT_PX); c.textBaseline = 'alphabetic';
      c.fillText(ch, PAD_X, BASE_Y);
      const px = c.getImageData(0, 0, CELL, CELL).data;
      for (let k = 0; k < CELL * CELL; k++) {
        const a = px[k * 4 + 3]! / 255;
        // sub-pixel edge from coverage: distance offsets so the 0.5 level sits on the AA edge
        inside[k] = a > 0.5 ? 0 : 1e20; outside[k] = a > 0.5 ? 1e20 : 0;
      }
      edt2(inside, CELL, CELL); edt2(outside, CELL, CELL);
      const cx = (i % COLS) * CELL, cy = Math.floor(i / COLS) * CELL;
      for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
        const k = y * CELL + x;
        const a = px[k * 4 + 3]! / 255;
        const dist = Math.sqrt(outside[k]!) - Math.sqrt(inside[k]!) + (a - 0.5) * 0.9; // + inside, - outside
        const v = Math.max(0, Math.min(255, Math.round((0.5 + dist / (2 * SPREAD)) * 255)));
        // DataTexture rows run bottom-up (flipY false): store with y flipped
        data[(AH - 1 - (cy + y)) * AW + cx + x] = v;
      }
    });
    this.tex = new THREE.DataTexture(data, AW, AH, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.minFilter = THREE.LinearMipmapLinearFilter; this.tex.magFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = true; this.tex.anisotropy = 8; this.tex.needsUpdate = true;
  }

  glyph(ch: string) { return this.index.get(ch) ?? this.index.get('□')!; }
}

const VERT = /* glsl */ `
precision highp float;
in vec3 position; // quad corner (u, v) in [0,1]
in vec3 iO; in vec3 iR; in vec3 iU; in vec4 iC; in vec2 iG; // origin, em-right, em-up, colour, (glyph, bold)
uniform mat4 projectionMatrix; uniform mat4 modelViewMatrix;
uniform float cols, rows, cell, fontPx, padX, baseY;
out vec2 vUv; out vec4 vC; out float vBold;
void main() {
  float g = iG.x;
  vec2 cellXY = vec2(mod(g, cols), floor(g / cols));
  vec2 pc = vec2(position.x, 1.0 - position.y) * cell;            // cell px, y down
  vec2 em = vec2(pc.x - padX, baseY - pc.y) / fontPx;
  vec3 p = iO + iR * em.x + iU * em.y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  vUv = vec2((cellXY.x + position.x) / cols, 1.0 - (cellXY.y + 1.0 - position.y) / rows);
  vC = iC; vBold = iG.y;
}`;
const FRAG = /* glsl */ `
precision highp float;
in vec2 vUv; in vec4 vC; in float vBold;
uniform sampler2D atlas; uniform float pxScale;
out vec4 fragColor;
void main() {
  float d = texture(atlas, vUv).r + vBold * 0.06;
  float w = max(fwidth(d) * 0.75, 1e-4);
  float a = smoothstep(0.5 - w, 0.5 + w, d) * vC.a;
  if (a <= 0.002) discard;
  fragColor = vec4(vC.rgb * a, a);
}`;

export type GlyphBlend = 'add' | 'normal';
export interface V3 { x: number; y: number; z: number }

/** A batch of glyph instances, filled per frame (like LineBatch). Colours are linear RGB. */
export class GlyphBatch {
  readonly atlas: GlyphAtlas;
  geo = new THREE.InstancedBufferGeometry();
  mat: THREE.RawShaderMaterial;
  scene = new THREE.Scene();
  count = 0;
  private O: Float32Array; private R: Float32Array; private U: Float32Array; private C: Float32Array; private G: Float32Array;
  private attrs: THREE.InstancedBufferAttribute[];

  constructor(capacity: number, opts: { family?: string; blend?: GlyphBlend; depthTest?: boolean } = {}) {
    this.atlas = GlyphAtlas.of(opts.family);
    const quad = new Float32Array([0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]);
    this.geo.setAttribute('position', new THREE.BufferAttribute(quad, 3));
    this.geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.O = new Float32Array(capacity * 3); this.R = new Float32Array(capacity * 3); this.U = new Float32Array(capacity * 3);
    this.C = new Float32Array(capacity * 4); this.G = new Float32Array(capacity * 2);
    this.attrs = [
      new THREE.InstancedBufferAttribute(this.O, 3), new THREE.InstancedBufferAttribute(this.R, 3), new THREE.InstancedBufferAttribute(this.U, 3),
      new THREE.InstancedBufferAttribute(this.C, 4), new THREE.InstancedBufferAttribute(this.G, 2),
    ];
    ['iO', 'iR', 'iU', 'iC', 'iG'].forEach((n, i) => { this.attrs[i]!.setUsage(THREE.DynamicDrawUsage); this.geo.setAttribute(n, this.attrs[i]!); });
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        atlas: { value: this.atlas.tex }, cols: { value: COLS }, rows: { value: this.atlas.rows }, cell: { value: CELL },
        fontPx: { value: FONT_PX }, padX: { value: PAD_X }, baseY: { value: BASE_Y }, pxScale: { value: 1 },
      },
      transparent: true, depthWrite: false, depthTest: opts.depthTest ?? true, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor,
      blendDst: (opts.blend ?? 'normal') === 'add' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    });
    const mesh = new THREE.Mesh(this.geo, this.mat); mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  get capacity() { return this.G.length / 2; }
  clear() { this.count = 0; }

  /** One glyph: baseline origin o, em vectors r (right) and u (up). */
  glyph(ch: string, ox: number, oy: number, oz: number, rx: number, ry: number, rz: number, ux: number, uy: number, uz: number,
    r: number, g: number, b: number, a = 1, bold = 0) {
    if (this.count >= this.capacity || a <= 0.002 || ch === ' ') return;
    const i = this.count++;
    this.O[i * 3] = ox; this.O[i * 3 + 1] = oy; this.O[i * 3 + 2] = oz;
    this.R[i * 3] = rx; this.R[i * 3 + 1] = ry; this.R[i * 3 + 2] = rz;
    this.U[i * 3] = ux; this.U[i * 3 + 1] = uy; this.U[i * 3 + 2] = uz;
    this.C[i * 4] = r; this.C[i * 4 + 1] = g; this.C[i * 4 + 2] = b; this.C[i * 4 + 3] = a;
    this.G[i * 2] = this.atlas.glyph(ch); this.G[i * 2 + 1] = bold;
  }

  /** A monospace run starting at o, advancing along r; returns the pen position after it. */
  text(s: string, o: V3, r: V3, u: V3, rgb: readonly [number, number, number], a = 1, bold = 0): V3 {
    const adv = this.atlas.adv;
    let x = o.x, y = o.y, z = o.z;
    for (const ch of s) {
      this.glyph(ch, x, y, z, r.x, r.y, r.z, u.x, u.y, u.z, rgb[0], rgb[1], rgb[2], a, bold);
      x += r.x * adv; y += r.y * adv; z += r.z * adv;
    }
    return { x, y, z };
  }

  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null, camera: THREE.Camera) {
    for (const at of this.attrs) { at.needsUpdate = true; at.addUpdateRange(0, this.count * at.itemSize); }
    this.geo.instanceCount = this.count;
    this.mat.uniforms.pxScale!.value = rtScale(target);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, camera);
    for (const at of this.attrs) at.clearUpdateRanges();
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
