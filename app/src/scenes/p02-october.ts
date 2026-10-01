// P02 OCTOBER (v4 signature A, docs/V4-DESIGN.md) — "There's a thirty-second day in October /
// So I crack my claws and read it all over".
// One continuous shot at night. October is drawn as a board of tiles on an endless dark floor; the
// clay cursor counts the days cell by cell, accelerating, and on "day" steps off the grid into a
// 32nd tile that rises out of the floor past the right edge (the bug). "October" writes itself as
// the board's header. Clawd (voxels) drops onto the 31st on "So"; he cracks his claws twice. On
// "read" the board unfolds into the source it is generated from: a wave runs away from the camera,
// each week of tiles becoming five lines of month.ts lying on terraces whose height is the code's
// indentation (one coordinate: a calendar row = five code lines). The camera flies low over the
// code after the read head; the words stand up on the terraces as they are sung. At the end the
// camera tips down onto the file's last line, the TODO the plan plate starts from.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { norm, type Line, type Word } from '../engine/lyrics';
import { clamp, ease, frameIdx, hash, lerp, prog, pulse } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { GlyphBatch } from '../kit/glyphs';
import { Rig, mixCam, orbitCam, p3, type Cam, type P3 } from '../kit/rig';
import { VoxelClawd } from '../kit/clawd3d';
import * as Clawd from '../kit/clawd';
import { LetterRow } from '../kit/letters';
import { MONTH_V4, indentOf } from '../kit/month-src';
import { drawStatus } from '../kit/statusbar';

type RGB = [number, number, number];
const PAPER = lin('paper'), INK = lin('ink'), CLAY = lin('clay');
const sc = (c: readonly number[], k: number): RGB => [c[0]! * k, c[1]! * k, c[2]! * k];

// ---- board geometry (world units; floor y = 0, x right, z toward the camera) ----
const CP = 2.0; // cell pitch
const CS = 1.84; // tile size
const OFF = 4; // October 2026 starts on a Thursday (Sunday-first week)
const cellOf = (d: number) => (d === 32 ? { c: 7, r: 4 } : { c: (d - 1 + OFF) % 7, r: Math.floor((d - 1 + OFF) / 7) });
const cellX = (c: number) => (c - 3) * CP;
const cellZ = (r: number) => (r - 2) * CP;
// ---- code terrain: line n (1-based) lies on z = Z1 - (n-1)*LP at height = indent * TH ----
const LP = 0.5, Z1 = 4.8, TH = 0.38, EM = 0.34, X0 = -6.6, GUTTER = -8.6;
const lineZ = (n: number) => Z1 - (n - 1) * LP;
const NLINES = MONTH_V4.length;
const VOX = 0.12; // Clawd voxel size

function word(line: Line, q: string, from = 0): Word {
  const n = norm(q);
  for (let i = from; i < line.words.length; i++) if (norm(line.words[i]!.w) === n) return line.words[i]!;
  throw new Error(`P02: word not found: ${q}`);
}

export default class P02October extends Scene {
  rig = new Rig();
  ground = new Ground();
  glow = new GlowLayer();
  hud = new Layer2D();
  lines = new LineBatch(30000, { screen2D: false, blend: 'add', depthTest: true });
  glyphs!: GlyphBatch;
  world = new THREE.Scene();
  tiles!: THREE.InstancedMesh;
  cursor!: THREE.Mesh;
  clawd = new VoxelClawd();
  rows: { row: LetterRow; word: Word; rgb: RGB }[] = [];
  header!: LetterRow;
  T: Record<string, number> = {};
  dayT: number[] = []; // time the cursor reaches day d (index d)

  override init() {
    const ly = this.ctx.lyrics, au = this.ctx.audio;
    const L1 = ly.get('thirty-second day'), L2 = ly.get('crack my claws');
    const T = this.T;
    T.t0 = this.ctx.start; T.t1 = this.ctx.end;
    T.there = word(L1, "There's").start; T.thirty = word(L1, 'thirty-second').start;
    T.day = word(L1, 'day').start; T.in = word(L1, 'in').start; T.oct = word(L1, 'October').start; T.octEnd = word(L1, 'October').end;
    T.so = word(L2, 'So').start; T.crack = word(L2, 'crack').start; T.claws = word(L2, 'claws').start;
    T.and = word(L2, 'and').start; T.read = word(L2, 'read').start; T.all = word(L2, 'all').start; T.over = word(L2, 'over').start;
    // Clawd lands on the beat after "So"
    T.land = au.timeOfBeat(Math.ceil(au.beatAt(T.so + 0.12)));
    // the cursor counts 1..31 from "There's" to just before "day", accelerating; 32 on "day"
    for (let d = 1; d <= 31; d++) {
      const u = (d - 1) / 30;
      this.dayT[d] = lerp(T.there - 0.05, T.day - 0.1, 1 - Math.pow(1 - u, 1.8));
    }
    this.dayT[32] = T.day;
    this.dayT[0] = T.there - 0.3;

    this.glyphs = new GlyphBatch(26000, { blend: 'normal', depthTest: true });

    // tiles (thin slabs); index d-1 for day d, 32 included
    const geo = new THREE.BoxGeometry(CS, 1, CS);
    geo.translate(0, -0.5, 0); // top face at y = 0 (scaled height grows downward / upward via matrix)
    const mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vC;
        void main() { mat4 m = modelMatrix * instanceMatrix; vN = normalize(mat3(m) * normal); vC = instanceColor;
          gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        varying vec3 vN; varying vec3 vC;
        void main() { float f = vN.y > 0.5 ? 1.0 : vN.z > 0.5 ? 0.62 : 0.45; gl_FragColor = vec4(vC * f, 1.0); }`,
    });
    this.tiles = new THREE.InstancedMesh(geo, mat, 32);
    this.tiles.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(32 * 3), 3);
    this.tiles.frustumCulled = false;
    this.world.add(this.tiles);
    const cg = new THREE.BoxGeometry(0.2, 0.9, 0.06);
    cg.translate(0, 0.45, 0);
    this.cursor = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...sc(CLAY, 3.2), THREE.LinearSRGBColorSpace), toneMapped: false }));
    this.world.add(this.cursor);
    this.clawd.mesh.scale.setScalar(VOX);
    this.world.add(this.clawd.mesh);

    // ---- sung words ----
    const add = (row: LetterRow, w: Word, rgb: RGB) => { this.rows.push({ row, word: w, rgb }); this.world.add(row.group); return row; };
    const AX = { wdth: 100, wght: 820 };
    // footer of the board (flat): THERE'S A THIRTY-SECOND
    {
      const ws = [word(L1, "There's"), word(L1, 'a'), word(L1, 'thirty-second')];
      const rows = ws.map((w, i) => new LetterRow(w.w.toUpperCase(), i === 2 ? 0.95 : 0.5, i === 2 ? { wdth: 112, wght: 900 } : AX, w));
      let x = -7;
      rows.forEach((r, i) => {
        r.group.position.set(x, 0.01, 6.4 + (i === 2 ? 0.25 : 0)); r.group.rotation.set(-Math.PI / 2, 0, 0);
        x += r.width + (i === 1 ? 0.45 : 0.3);
        add(r, ws[i]!, i === 2 ? CLAY : PAPER);
      });
    }
    // DAY stands on the 32nd tile
    {
      const w = word(L1, 'day');
      const r = add(new LetterRow('DAY', 0.62, { wdth: 100, wght: 900 }, w), w, PAPER);
      const { c, r: rr } = cellOf(32);
      r.group.position.set(cellX(c) - r.width / 2, 0.52, cellZ(rr) - 0.55);
    }
    // IN · OCTOBER: the board's header
    {
      const wi = word(L1, 'in');
      const ri = add(new LetterRow('IN', 0.55, AX, wi), wi, PAPER);
      ri.group.position.set(-7, 0.01, -5.55); ri.group.rotation.set(-Math.PI / 2, 0, 0);
      const wo = word(L1, 'October');
      this.header = add(new LetterRow('OCTOBER', 1.9, { wdth: 118, wght: 900 }, wo, [wo.start, wo.end + 0.15]), wo, PAPER);
      const s = Math.min(1, (14 - ri.width - 0.4) / this.header.width);
      this.header.group.scale.setScalar(s);
      this.header.group.position.set(-7 + ri.width + 0.4, 0.01, -5.55); this.header.group.rotation.set(-Math.PI / 2, 0, 0);
    }
    // CRACK / CLAWS stand behind Clawd
    {
      const c31 = cellOf(31);
      const wc = word(L2, 'crack'), wl = word(L2, 'claws');
      const rc = add(new LetterRow('CRACK', 0.8, { wdth: 75, wght: 900 }, wc), wc, PAPER);
      rc.group.position.set(cellX(2) - 0.6, 0, cellZ(c31.r) - 1.3);
      const rl = add(new LetterRow('CLAWS', 0.8, { wdth: 75, wght: 900 }, wl), wl, CLAY);
      rl.group.position.set(cellX(2) - 0.6 + rc.width + 0.35, 0, cellZ(c31.r) - 1.3);
    }
    // READ IT ALL OVER stand on the terraces at the read head
    for (const q of ['read', 'it', 'all', 'over']) {
      const w = word(L2, q, 6);
      const r = add(new LetterRow(w.w.toUpperCase(), q === 'over' ? 1.25 : 0.95, { wdth: q === 'over' ? 112 : 100, wght: 880 }, w), w, q === 'over' ? CLAY : PAPER);
      const n = this.headLine(w.start + 0.05);
      r.group.position.set(-1.6 + (q === 'it' ? 2.6 : q === 'all' ? 0.8 : q === 'over' ? 1.4 : 0), this.lineY(n + 8) + 0.02, lineZ(n + 8));
    }
  }

  // ---------------------------------------------------------------- code terrain
  /** Terrace height of line n (continuous in n: soft risers between lines). */
  lineY(n: number) {
    const a = Math.floor(n), f = n - a;
    const ya = indentOf(clamp(a, 1, NLINES)) * TH, yb = indentOf(clamp(a + 1, 1, NLINES)) * TH;
    return lerp(ya, yb, ease.inOutCubic(clamp((f - 0.82) / 0.18)));
  }
  /** Wave front (z) of the board → code unfolding. */
  waveZ(t: number) { return lerp(7.5, lineZ(NLINES) - 3, ease.inOutQuad(prog(t, this.T.claws + 0.35, this.T.over + 0.1))); }
  /** The line being read at t (continuous). */
  headLine(t: number) {
    const T = this.T;
    const u = prog(t, T.read - 0.15, T.t1 - 0.12);
    return 1 + (NLINES - 1) * (0.55 * u + 0.45 * u * u);
  }

  // ---------------------------------------------------------------- camera
  cursorPos(t: number): P3 {
    let d = 0;
    while (d < 32 && t >= this.dayT[d + 1]!) d++;
    const a = cellOf(Math.max(1, d)), b = cellOf(Math.min(32, d + 1));
    const t0 = this.dayT[d]!, t1 = this.dayT[d + 1] ?? t0 + 1;
    const k = d === 0 ? 0 : d >= 32 ? 0 : ease.outExpo(clamp((t - t0) / Math.max(0.02, Math.min(0.12, t1 - t0))));
    const pa = { x: cellX(a.c), z: cellZ(a.r) }, pb = { x: cellX(b.c), z: cellZ(b.r) };
    // in the instant before stepping, the cursor stays on its cell
    const kk = d >= 1 && d < 32 ? clamp((t - (t1 - 0.06)) / 0.06) : 0;
    void k;
    return { x: lerp(pa.x, pb.x, ease.inOutCubic(kk)), y: 0, z: lerp(pa.z, pb.z, ease.inOutCubic(kk)) };
  }

  camera(t: number): Cam {
    const T = this.T;
    const cur = this.cursorPos(t);
    const c32 = cellOf(32), c31 = cellOf(31);
    const A = orbitCam(p3(lerp(0, cur.x, 0.18), 0, lerp(0.4, cur.z, 0.15)), -0.32 + 0.04 * (t - T.t0), 1.0, lerp(25, 21.5, prog(t, T.t0, T.day)), 32, 0.02);
    const B = orbitCam(p3(cellX(c32.c) - 0.6, 0.5, cellZ(c32.r)), -0.18, 0.62, 12.5 - 1.2 * prog(t, T.day, T.in), 33, -0.03);
    const C = orbitCam(p3(0.5, 0, -3.2), 0.12 - 0.05 * (t - T.in), 0.98, 19.5 - 0.8 * (t - T.in), 34, 0.0);
    const tc = p3(cellX(c31.c) - 0.6, 0.6, cellZ(c31.r) - 0.4);
    const D = orbitCam(tc, -0.42 + 0.06 * (t - T.so), 0.3 + 0.02 * (t - T.so), 6.8 - 0.4 * (t - T.so), 34, 0.015);
    // E: low flyover after the read head; tips down onto the last line at the end
    const n = this.headLine(t);
    const hz = lineZ(n), hy = this.lineY(n);
    const tip = prog(t, T.t1 - 0.5, T.t1, ease.inOutCubic);
    const E = orbitCam(p3(-3.0, hy + 0.3, hz - 2.6), lerp(0.32, -0.12, prog(t, T.and, T.t1)) + 0.1 * tip, lerp(0.66, 1.25, tip), lerp(10.5, 5.6, tip) - 1.2 * prog(t, T.and, T.t1 - 0.5), lerp(40, 34, tip), lerp(-0.04, 0, tip));
    const bl = (a: Cam, b: Cam, t0: number, d = 0.38) => mixCam(a, b, ease.inOutCubic(clamp((t - t0) / d)));
    let c = bl(A, B, T.day - 0.04, 0.22);
    c = bl(c, C, T.in, 0.45);
    c = bl(c, D, T.so - 0.05, 0.4);
    c = bl(c, E, T.claws + 0.35, 0.7);
    // impacts
    const shake = 0.22 * pulse(t, T.day, 0.08) + 0.16 * pulse(t, T.land, 0.07) + 0.08 * pulse(t, T.crack, 0.06) + 0.08 * pulse(t, T.claws, 0.06);
    const fi = frameIdx(t);
    c.tgt = { x: c.tgt.x + (hash(fi, 1) - 0.5) * shake, y: c.tgt.y + (hash(fi, 2) - 0.5) * shake, z: c.tgt.z };
    return c;
  }

  // ---------------------------------------------------------------- render
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t, T = this.T, r = this.ctx.renderer;
    const cam = this.camera(t);
    this.rig.set(cam);
    const wave = this.waveZ(t);
    const head = this.headLine(t);

    this.ground.render(r, out, { kind: 'ink', t, grid: 0, haze: 0.55, hazeY: 0.85, kick: f.a.kick });
    r.setRenderTarget(out); r.clearDepth();

    // ---- tiles: visited days glow then cool; 32 rises (clay); tiles sink as the code wave passes
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const drawIn = prog(t, T.t0, T.there - 0.05, ease.outCubic);
    for (let d = 1; d <= 32; d++) {
      const { c, r: rr } = cellOf(d);
      const x = cellX(c), z = cellZ(rr);
      const dIn = prog(drawIn, (Math.abs(x) + Math.abs(z)) / 16 * 0.6, 0.4 + (Math.abs(x) + Math.abs(z)) / 16 * 0.6);
      let h = 0.08, y = 0, s = 1;
      const visit = t >= this.dayT[d]! ? Math.exp(-(t - this.dayT[d]!) / 0.35) : 0;
      let rgb: RGB = sc(INK, 1.55 + 0.9 * visit);
      if (d === 32) {
        const up = t >= T.day ? 1 - Math.exp(-(t - T.day) / 0.09) * Math.cos((t - T.day) * 22) : 0;
        h = 0.08 + 0.42 * up; s = t >= T.day ? 1 : 0.0001;
        rgb = sc(CLAY, 0.32 + 0.5 * pulse(t, T.day, 0.15));
      }
      // the wave: tiles sink into the floor as their week turns into code
      const sink = clamp(((z + CP / 2) - wave) / CP);
      y -= 1.4 * ease.inCubic(sink);
      s *= dIn > 0 ? 1 : 0.0001;
      m4.makeScale(s * (0.6 + 0.4 * ease.outBack(dIn)), h * s, s * (0.6 + 0.4 * ease.outBack(dIn))).setPosition(x, y + h * s, z);
      this.tiles.setMatrixAt(d - 1, m4);
      col.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
      this.tiles.setColorAt(d - 1, col);
    }
    this.tiles.instanceMatrix.needsUpdate = true; this.tiles.instanceColor!.needsUpdate = true;

    // ---- cursor (counting) — on the floor of the current tile; leaves when the counting is over
    const cp = this.cursorPos(t);
    const curOn = t >= T.there - 0.3 && t < T.so;
    this.cursor.visible = curOn;
    const top32 = t >= T.day ? 0.08 + 0.42 : 0.08;
    this.cursor.position.set(cp.x - 0.62, t >= T.day - 0.02 ? top32 : 0.08, cp.z + 0.62);
    this.cursor.scale.setScalar(1 + 0.4 * pulse(t, T.day, 0.1));

    // ---- Clawd: drops onto the 31st on "So", cracks his claws on "crack" and "claws", then rides the read head
    const c31 = cellOf(31);
    let cx = cellX(c31.c), cy = 0.08, cz = cellZ(c31.r);
    let action: Clawd.Action | null = null;
    if (t < T.land) { const dt = T.land - t, g = 60; cy = 0.08 + 0.5 * g * dt * dt; }
    else if (t < T.land + 0.12) action = null;
    if ((t >= T.crack && t < T.crack + 0.32) || (t >= T.claws && t < T.claws + 0.36)) action = 'A7';
    if (t >= T.and) {
      // walk off the tile onto the code, then ride the read head along the gutter
      const k = ease.inOutCubic(prog(t, T.and, T.read + 0.1));
      const n = head;
      cx = lerp(cx, GUTTER + 1.4, k); cz = lerp(cz, lineZ(n) + 0.15, k); cy = lerp(0.08, this.lineY(n), k) + (t > T.read ? 0 : 0.0);
      action = 'A5';
    }
    const visibleClawd = t >= T.so - 0.3;
    this.clawd.mesh.visible = visibleClawd;
    if (visibleClawd) {
      const pose = Clawd.pose(action, { beat: f.beat, beat0: this.ctx.audio.beatAt(T.so), p: 0, travel: 0, look: t >= T.and ? 0 : 1 });
      // landing squash
      if (t >= T.land && t < T.land + 0.09) pose.cells = pose.cells.filter((c) => c.y !== 0).map((c) => (c.y < 3 ? { ...c, y: c.y + 1 } : c));
      this.clawd.update(pose);
      this.clawd.mesh.position.set(cx, cy, cz);
      this.clawd.mesh.rotation.set(0, 0, 0);
      this.clawd.light([-0.5, 0.9, 0.7], 0.42, 0.5 * pulse(t, T.crack, 0.08) + 0.5 * pulse(t, T.claws, 0.08));
    }

    // ---- sung words
    for (const w of this.rows) {
      let a = 1;
      // the footer and header sink with the board
      const z = w.row.group.position.z;
      if (w.word.line === this.rows[0]!.word.line) a = 1 - clamp((z - wave + 0.5) / 1.5);
      if (z > 6) a *= 1 - prog(t, T.so - 0.2, T.so + 0.2);
      if (/crack|claws/i.test(w.word.w)) a = 1 - prog(t, T.read, T.read + 0.4);
      w.row.write(t, w.rgb, a);
    }
    r.setRenderTarget(out);
    r.render(this.world, this.rig.cam);

    // ---- hairlines: board grid + the code terrain's terraces
    const L = this.lines; L.clear();
    this.drawBoardLines(L, t, wave, drawIn);
    this.drawTerrain(L, t, wave, head);
    L.render(r, out, this.rig.cam);

    // ---- glyphs: day numbers, weekday heads, code
    const G = this.glyphs; G.clear();
    this.drawDayNumbers(G, t, wave, drawIn);
    this.drawCode(G, t, wave, head);
    G.render(r, out, this.rig.cam);

    // ---- 2D: callout at day 32, status bar, glow
    const c = this.hud.ctx; this.hud.clear();
    const g = this.glow.ctx; this.glow.clear();
    this.drawCallout(c, t, wave);
    const ln = t < T.read - 0.15 ? 42 : head;
    drawStatus(c, {
      ln, col: t < T.read - 0.15 ? 18 : 1, clock: `09:0${Math.min(9, 1 + Math.floor((t - 4) / 4))}`, branch: 'main', on: 'ink',
      tests: null, alpha: 0.9 * prog(t, T.t0, T.t0 + 0.4), hot: t >= T.read - 0.15 ? 1 : 0,
    });
    this.ctx.comp.draw(r, this.hud.upload(), out);
    // cursor glow (screen space)
    if (curOn) {
      const q = this.rig.proj(cp.x - 0.4, (t >= T.day - 0.02 ? top32 : 0.08) + 0.45, cp.z + 0.5);
      if (q) { g.fillStyle = css('clay'); const hh = q.s * 0.9; g.fillRect(q.x - hh * 0.12, q.y - hh * 0.5, hh * 0.22, hh); }
    }
    this.glow.composite(this.ctx, out, 1.4);

    const flash = 0.05 * pulse(t, T.day, 0.06);
    const tens = prog(t, T.t1 - 0.45, T.t1, ease.inQuad);
    return { ...postFor('ink'), hud: 0, flash, vignette: 0.3 + 0.2 * tens, ca: 0.6 + 2.5 * tens + 2 * pulse(t, T.day, 0.08) };
  }

  // ---------------------------------------------------------------- drawing helpers
  drawBoardLines(L: LineBatch, t: number, wave: number, drawIn: number) {
    const T = this.T;
    const P = sc(PAPER, 0.75), DIM = sc(PAPER, 0.28);
    const x0 = cellX(0) - CP / 2, x1 = cellX(6) + CP / 2;
    const z0 = cellZ(0) - CP / 2, z1 = cellZ(4) + CP / 2;
    const fade = (z: number) => 1 - clamp((z - wave + 0.3) / 1.2);
    // outer frame and column rules, drawn from the centre outward
    const k = drawIn;
    const xm = 0, xa = lerp(xm, x0, k), xb = lerp(xm, x1, k);
    for (let r = 0; r <= 5; r++) {
      const z = z0 + r * CP, a = fade(z);
      if (a > 0) L.seg(xa, 0.005, z, xb, 0.005, z, r === 0 || r === 5 ? 1.6 : 1, ...(r === 0 || r === 5 ? P : DIM), a);
    }
    for (let c = 0; c <= 7; c++) {
      const x = x0 + c * CP;
      const zb = Math.min(z1, Math.max(z0, wave));
      const za = lerp((z0 + z1) / 2, z0, k), zc = lerp((z0 + z1) / 2, zb, k);
      if (zc > za) L.seg(x, 0.005, za, x, 0.005, zc, c === 0 || c === 7 ? 1.6 : 1, ...(c === 0 || c === 7 ? P : DIM), 1);
    }
    // header rule
    if (fade(-5.9) > 0) L.seg(x0, 0.005, z0 - 2.4, x1, 0.005, z0 - 2.4, 1, ...DIM, fade(-5.9) * k);
    // the 32nd tile's outline (clay, hot when it rises)
    if (t >= T.day) {
      const { c, r } = cellOf(32);
      const x = cellX(c), z = cellZ(r), h = 0.5 * (1 - Math.exp(-(t - T.day) / 0.09));
      const hot = sc(CLAY, 1.6 + 3 * pulse(t, T.day, 0.12));
      const a = 1 - clamp((z - wave + 0.5) / 1.5);
      const e = CS / 2;
      const top = [[x - e, z - e], [x + e, z - e], [x + e, z + e], [x - e, z + e], [x - e, z - e]];
      for (let i = 1; i < top.length; i++) L.seg(top[i - 1]![0]!, h, top[i - 1]![1]!, top[i]![0]!, h, top[i]![1]!, 1.8, ...hot, a);
      for (const [px, pz] of top.slice(0, 4)) L.seg(px!, 0, pz!, px!, h, pz!, 1.2, ...hot, a);
      // the grid's edge, dashed beyond it: day 32 is outside the month
      for (let zz = z - e; zz < z + e; zz += 0.25) L.seg(x1, 0.006, zz, x1, 0.006, zz + 0.12, 1.4, ...sc(CLAY, 1.2), a);
    }
  }

  drawTerrain(L: LineBatch, t: number, wave: number, head: number) {
    const P = sc(PAPER, 0.22);
    // one hairline along the front edge of every revealed line, across the whole floor; risers
    for (let n = 1; n <= NLINES; n++) {
      const z = lineZ(n) + LP / 2;
      const rev = clamp((wave - z) / -1.0 + 1) * (wave < z ? 1 : 0);
      const a = clamp((z - wave) / 1.2);
      if (a <= 0) continue;
      void rev;
      const y = indentOf(n) * TH, yp = n > 1 ? indentOf(n - 1) * TH : 0;
      const hl = Math.abs(n - head) < 0.5 ? 1 : 0;
      if (yp !== y) {
        // a riser: the step between two indent levels
        L.seg(-9.5, yp, z, 9.5, yp, z, 1, ...P, a * 0.6);
        L.seg(-9.5, y, z, 9.5, y, z, 1.2, ...sc(PAPER, 0.4), a);
      }
      if (hl) {
        const hot = sc(CLAY, 2.2);
        L.seg(GUTTER + 0.9, y + 0.01, lineZ(n) - LP * 0.45, GUTTER + 0.9, y + 0.01, lineZ(n) + LP * 0.45, 3, ...hot, a);
      }
    }
  }

  drawDayNumbers(G: GlyphBatch, t: number, wave: number, drawIn: number) {
    const T = this.T;
    for (let d = 1; d <= 32; d++) {
      const { c, r } = cellOf(d);
      const x = cellX(c) - CS / 2 + 0.16, z = cellZ(r) - CS / 2 + 0.52;
      const dz = Math.abs(cellX(c)) + Math.abs(cellZ(r));
      const a0 = prog(drawIn, 0.3 + dz / 16 * 0.5, 0.6 + dz / 16 * 0.5);
      const sink = 1 - clamp((cellZ(r) + CP / 2 - wave) / 1.0);
      let a = a0 * sink;
      let y = 0.09;
      if (d === 32) { if (t < T.day) continue; y = 0.09 + 0.42 * (1 - Math.exp(-(t - T.day) / 0.09)); a = sink; }
      const visit = t >= this.dayT[d]! ? Math.exp(-(t - this.dayT[d]!) / 0.3) : 0;
      const seen = t >= this.dayT[d]! ? 1 : 0.55;
      const base = d === 32 ? sc(CLAY, 1.4) : sc(PAPER, 0.85 * seen);
      const rgb: RGB = [lerp(base[0], 3.2, visit), lerp(base[1], 2.3, visit), lerp(base[2], 1.5, visit)];
      const em = d === 32 ? 0.62 : 0.5;
      G.text(String(d), { x, y, z }, { x: em, y: 0, z: 0 }, { x: 0, y: 0, z: -em }, rgb, a, d === 32 ? 1 : 0.5);
    }
    // weekday heads
    const wd = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const a = drawIn * (1 - clamp((-5.3 - wave) / 1.0));
    for (let c = 0; c < 7; c++) G.text(wd[c]!, { x: cellX(c) - 0.1, y: 0.01, z: cellZ(0) - CP / 2 - 0.3 }, { x: 0.36, y: 0, z: 0 }, { x: 0, y: 0, z: -0.36 }, sc(PAPER, 0.5), a);
  }

  drawCode(G: GlyphBatch, t: number, wave: number, head: number) {
    for (let n = 1; n <= NLINES; n++) {
      const z = lineZ(n) + LP * 0.25;
      if (z < wave - 0.01) {
        // not yet unfolded
        continue;
      }
      const age = (z - wave) / 2.2; // distance behind the front ~ time since unfolding
      const pop = clamp(age * 3);
      const y = indentOf(n) * TH + 0.004;
      const read = n < head - 0.5 ? 1 : 0;
      const isHead = Math.abs(n - head) < 0.5;
      const hot = Math.exp(-age * 2.5);
      const base = isHead ? sc(PAPER, 1.25) : sc(PAPER, read ? 0.62 : 0.42);
      const rgb: RGB = [lerp(base[0], 2.6, hot), lerp(base[1], 1.9, hot), lerp(base[2], 1.3, hot)];
      const src = MONTH_V4[n - 1]!;
      const em = EM * (0.3 + 0.7 * pop);
      const bug = n === 42 && isHead;
      G.text(src, { x: X0, y, z }, { x: em, y: 0, z: 0 }, { x: 0, y: 0, z: -em }, bug ? sc(CLAY, 2) : rgb, 1, isHead ? 0.6 : 0);
      G.text(String(n).padStart(2, ' '), { x: GUTTER + 1.1, y, z }, { x: em * 0.9, y: 0, z: 0 }, { x: 0, y: 0, z: -em * 0.9 }, isHead ? sc(CLAY, 1.6) : sc(PAPER, 0.3), 1);
    }
  }

  drawCallout(c: CanvasRenderingContext2D, t: number, wave: number) {
    const T = this.T;
    const a = prog(t, T.day + 0.12, T.day + 0.3) * (1 - prog(t, T.so - 0.2, T.so)) * (wave < 4 ? 0 : 1);
    if (a <= 0) return;
    const { c: cc, r } = cellOf(32);
    const p = this.rig.proj(cellX(cc) + 0.9, 0.85, cellZ(r) - 0.9);
    if (!p) return;
    const x = Math.min(p.x + 40, W - 470), y = p.y - 70;
    c.save(); c.globalAlpha = a;
    c.strokeStyle = css('paper', 0.6); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(p.x + 4, p.y - 4); c.lineTo(x - 6, y + 6); c.lineTo(x + 380, y + 6); c.stroke();
    c.font = font(F.mono(500), 21); c.fillStyle = css('paper', 0.95);
    c.fillText('days.length === 32', x, y - 6);
    c.font = font(F.mono(400), 17); c.fillStyle = css('paper', 0.55);
    c.fillText('// expected 31', x, y + 30);
    c.restore();
  }

  override dispose() {
    this.lines.geo.dispose(); this.lines.mat.dispose(); this.glyphs.dispose(); this.clawd.dispose();
    for (const w of this.rows) w.row.dispose();
    this.tiles.geometry.dispose(); (this.tiles.material as THREE.Material).dispose();
    this.hud.texture.dispose(); this.glow.layer.texture.dispose();
  }
}
