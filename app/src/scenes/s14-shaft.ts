// S14 — "Down the call stack, quiet down here / Frame by frame, and the bug is near".
// An infinite vertical stack of call frames drawn as engineering diagrams (paper hairlines on solid
// ink slabs, hidden lines removed, sinking into haze). The camera falls one frame per step with spring
// landings and anticipation; each phase has its own camera (shaft / 3-4 / quiet / elevator / stop).
// The sung words are set on the frames they pass (held words echo on the next frames). The clay
// cursor hangs a plumb line down the call path with Clawd under it; on "near" the fall stops dead on
// daysIn() and line 42 lights clay — that line becomes S15's rule (kit/handoff.ts line14).
// Method learned from pdoom's stack plate (reference/pdoom/scenes/stack.ts).
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, SCALE, W, H, scaleContext2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { strokeText } from '../engine/stroke';
import { F, font } from '../engine/type';
import { clamp, ease, frameIdx, hash, lerp, TAU } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { drawCursor } from '../kit/cursor';
import { HANDOFF } from '../kit/handoff';
import { afterBeats } from '../kit/time';
import { heatColor, Voice } from '../kit/lyric-moves';
import { fillRun, varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { ARGS, FRAMES, landPulse, stackPhase, stackPos, stackScore, type StackScore } from './parts/s14-stack';

/** Cap heights (px at 1080p, at the frames' typical distance) for the hierarchy check. */
export const TYPE_LEVELS = { giant: null, lyric: 92, label: 15 } as const;

// ---- frame geometry (world units) ----
const HX = 6.4, HY = 2.7, HZ = 1.3; // half extents of a frame slab
const P = 7.4; // pitch between frames
const MX = -1.2; // call path x
const CALL_Y = -1.55; // call-site line y inside a frame (the line that calls the next frame)
const BUG_Y = -0.55; // line 42 inside daysIn
type RGB = [number, number, number];
type Seg = [number, number, number, number, number, number, number, number, number, number, number];
const PAPER = lin('paper'), INK = lin('ink'), CLAY = lin('clay');
const scale3 = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/** A word set on a plane: continuous Archivo rendered once into a texture. */
class WordPlane {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; w: number; h: number;
  constructor(text: string, capH: number) {
    const size = 260, run = varRun(text, size, { wdth: 75, wght: 900 });
    const pad = 24, cw = Math.ceil(run.width + pad * 2), ch = Math.ceil(run.capH * 1.5 + pad * 2);
    const cv = document.createElement('canvas'); cv.width = cw * SCALE; cv.height = ch * SCALE;
    const c = scaleContext2D(cv.getContext('2d')!, SCALE);
    c.fillStyle = '#fff'; fillRun(c, run, pad, pad + run.capH * 1.12);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.anisotropy = 8;
    const k = capH / run.capH;
    this.w = run.width * k; this.h = capH;
    const geo = new THREE.PlaneGeometry(cw * k, ch * k);
    // anchor: left of the ink, middle of the cap height
    geo.translate(cw * k / 2 - pad * k, -(ch * k / 2 - (pad + run.capH * 1.12 - run.capH / 2) * k), 0);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true, toneMapped: false });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false;
  }
  set(rgb: RGB, opacity: number) { this.mat.color.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace); this.mat.opacity = opacity; }
  dispose() { this.mesh.geometry.dispose(); this.mat.map!.dispose(); this.mat.dispose(); }
}

class World {
  users = 0;
  ground = new Ground();
  glow = new GlowLayer();
  cam = new THREE.PerspectiveCamera(34, W / H, 0.1, 600);
  lines = new LineBatch(120000, { screen2D: false, blend: 'add', depthTest: true });
  bodyScene = new THREE.Scene();
  bodies: THREE.InstancedMesh;
  text3 = new THREE.Scene();
  hud = new Layer2D();
  S: StackScore;
  voice: Voice;
  tmpl: Seg[] = [];
  perFrame = new Map<number, Seg[]>();
  planes: { plane: WordPlane; entry: StackScore['words'][number]; x: number; y: number; s: number }[] = [];

  constructor(ctx: SceneCtx) {
    this.S = stackScore(ctx.audio, ctx.lyrics);
    this.voice = new Voice(ctx.lyrics, ctx.audio);
    this.buildTemplate();
    const geo = new THREE.BoxGeometry(2 * HX * 0.995, 2 * HY * 0.995, 2 * HZ * 0.99);
    const mk = (c: RGB) => new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(c[0], c[1], c[2], THREE.LinearSRGBColorSpace), fog: true, toneMapped: false });
    const front: RGB = [INK[0] * 1.18 + PAPER[0] * 0.012, INK[1] * 1.18 + PAPER[1] * 0.012, INK[2] * 1.18 + PAPER[2] * 0.012];
    this.bodies = new THREE.InstancedMesh(geo, [mk(scale3(INK, 0.7)), mk(scale3(INK, 0.7)), mk(scale3(INK, 0.92)), mk(scale3(INK, 0.6)), mk(front), mk(scale3(INK, 0.7))], 32);
    this.bodies.frustumCulled = false;
    this.bodyScene.add(this.bodies);
    this.bodyScene.fog = new THREE.Fog(new THREE.Color().setRGB(INK[0], INK[1], INK[2], THREE.LinearSRGBColorSpace), 20, 80);
    this.layoutWords();
  }

  private stroke(into: Seg[], text: string, x: number, y: number, z: number, capH: number, w: number, c: RGB, a: number, align: 'l' | 'c' | 'r' = 'l') {
    const st = strokeText(text, 'tech', 100);
    const k = capH / Math.max(1e-3, st.capHeight);
    const ox = align === 'l' ? x : align === 'c' ? x - st.width * k / 2 : x - st.width * k;
    for (const line of st.strokes) for (let i = 1; i < line.length; i++) {
      const p = line[i - 1]!, q = line[i]!;
      into.push([ox + p.x * k, y - p.y * k, z, ox + q.x * k, y - q.y * k, z, w, c[0], c[1], c[2], a]);
    }
  }

  private buildTemplate() {
    const T = this.tmpl, z = HZ;
    const s = (a: number[], b: number[], w: number, c: RGB, al = 1) => T.push([a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, w, c[0], c[1], c[2], al]);
    const rect = (x0: number, y0: number, x1: number, y1: number, zz: number, w: number, c: RGB, al = 1, ch = 0) => {
      const pts = ch > 0
        ? [[x0 + ch, y0], [x1 - ch, y0], [x1, y0 + ch], [x1, y1 - ch], [x1 - ch, y1], [x0 + ch, y1], [x0, y1 - ch], [x0, y0 + ch], [x0 + ch, y0]]
        : [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
      for (let i = 1; i < pts.length; i++) s([pts[i - 1]![0]!, pts[i - 1]![1]!, zz], [pts[i]![0]!, pts[i]![1]!, zz], w, c, al);
    };
    const GR = scale3(PAPER, 0.42), DIM = scale3(PAPER, 0.7);
    rect(-HX, -HY, HX, HY, z, 2.2, PAPER, 0.92, 0.32);
    rect(-HX, -HY, HX, HY, -HZ, 1, GR, 0.8, 0.32);
    for (const [x, y] of [[-HX + 0.32, -HY], [HX - 0.32, -HY], [-HX + 0.32, HY], [HX - 0.32, HY], [-HX, -HY + 0.32], [HX, -HY + 0.32], [-HX, HY - 0.32], [HX, HY - 0.32]] as const)
      s([x, y, z], [x, y, -HZ], 1, DIM, 0.55);
    // laminations on the sides and top: the slab reads as a solid
    for (let i = 1; i < 7; i++) {
      const y = -HY + (i / 7) * 2 * HY;
      s([HX, y, z - 0.05], [HX, y, -HZ + 0.05], 0.8, GR, 0.7); s([-HX, y, z - 0.05], [-HX, y, -HZ + 0.05], 0.8, GR, 0.7);
    }
    for (let i = 1; i < 16; i++) { const x = -HX + (i / 16) * 2 * HX; s([x, HY, z - 0.05], [x, HY, -HZ + 0.05], 0.8, GR, 0.55); }
    rect(-HX + 0.24, -HY + 0.24, HX - 0.24, HY - 0.24, z, 0.8, GR, 0.9, 0.18);
    // header rule under the signature
    s([-HX + 0.24, HY - 1.05, z], [HX - 0.24, HY - 1.05, z], 1, DIM, 0.8);
    // right column: ARGS / LOCALS / RETURN boxes
    const bx0 = 2.6, bx1 = HX - 0.55;
    const box = (y0: number, y1: number, name: string, heads = 0) => {
      rect(bx0, y0, bx1, y1, z, 1.3, DIM, 0.85, 0.07);
      for (let h = 1; h <= heads; h++) {
        const o = h * 0.11;
        s([bx0 + o, y1 + o, z], [bx1 + o, y1 + o, z], 0.9, GR, 0.6 - h * 0.15); s([bx1 + o, y1 + o, z], [bx1 + o, y0 + o, z], 0.9, GR, 0.6 - h * 0.15);
      }
      this.stroke(T, name, bx0 + 0.18, (y0 + y1) / 2 - 0.09, z, 0.18, 1.0, DIM, 0.95);
    };
    box(0.15, 0.95, 'ARGS', 2); box(-0.95, -0.15, 'LOCALS', 1); box(-2.05, -1.25, 'RETURN', 0);
    // code body: line-number ticks and hairline code bars (the call-site bar is drawn per frame)
    for (let i = 0; i < 6; i++) {
      const y = 0.75 - i * 0.5;
      s([-HX + 0.55, y, z], [-HX + 0.75, y, z], 1, GR, 0.9);
    }
    // registration crosses and a dimension bracket
    for (const [x, y] of [[-HX + 0.5, -HY + 0.5], [HX - 0.5, -HY + 0.5], [HX - 0.5, HY - 0.5]] as const) {
      s([x - 0.14, y, z], [x + 0.14, y, z], 0.9, DIM, 0.8); s([x, y - 0.14, z], [x, y + 0.14, z], 0.9, DIM, 0.8);
    }
    s([HX + 0.7, -HY, 0], [HX + 0.7, HY, 0], 1, GR, 0.9);
    s([HX + 0.5, -HY, 0], [HX + 0.9, -HY, 0], 1, GR, 0.9); s([HX + 0.5, HY, 0], [HX + 0.9, HY, 0], 1, GR, 0.9);
    // the call leaves through the floor towards the next frame (connector through the gap)
    s([MX, -HY, z], [MX, -(P - HY), z], 1.4, DIM, 0.75);
    for (const d of [-1, 1]) s([MX, -(P - HY), z], [MX + d * 0.12, -(P - HY) + 0.2, z], 1.4, DIM, 0.75);
  }

  /** Per-frame segments (signature, floor number, code bars). Cached by index. */
  frameSegs(k: number): Seg[] {
    let L = this.perFrame.get(k);
    if (L) return L;
    L = [];
    const z = HZ, name = FRAMES[Math.min(k, FRAMES.length - 1)]!, depth = FRAMES.length - 1 - k;
    this.stroke(L, `${name}${ARGS[name] ?? '()'}`, -HX + 0.55, HY - 0.42, z, 0.36, 1.6, PAPER, 1);
    this.stroke(L, `month.ts:${[3, 9, 14, 18, 22, 25, 27, 30, 33, 35, 37, 39, 42][k] ?? 42}`, HX - 0.55, HY - 0.42, z, 0.15, 1, scale3(PAPER, 0.55), 1, 'r');
    // floor number outside the slab, like an elevator shaft marking
    this.stroke(L, `#${String(Math.max(0, depth)).padStart(2, '0')}`, -HX - 0.9, 0.2, 0, 0.62, 1.6, PAPER, 0.9, 'r');
    for (let i = 0; i < 6; i++) {
      const y = 0.75 - i * 0.5, len = 1.4 + 3.6 * hash(k, i, 3), indent = 0.25 * Math.floor(hash(k, i, 5) * 3);
      const isCall = Math.abs(y - CALL_Y - 0.0) < 0.01 || (i === 5 && k < FRAMES.length - 1);
      const x0 = -HX + 1.05 + indent;
      L.push([x0, y, z, Math.min(2.2, x0 + len), y, z, isCall ? 1.6 : 1.1, PAPER[0], PAPER[1], PAPER[2], isCall ? 0.95 : 0.55]);
    }
    this.perFrame.set(k, L);
    return L;
  }

  private layoutWords() {
    const byBlock = new Map<number, StackScore['words']>();
    for (const e of this.S.words) { if (!byBlock.has(e.block)) byBlock.set(e.block, []); byBlock.get(e.block)!.push(e); }
    const capH = 1.15, gap = 0.5, maxW = 10.4;
    for (const [, list] of byBlock) {
      const planes = list.map((e) => new WordPlane(e.word.w.replace(/[,!.]/g, '').toUpperCase(), capH));
      const total = planes.reduce((a, p) => a + p.w, 0) + gap * (planes.length - 1);
      const s = Math.min(1, maxW / total);
      let x = -total * s / 2;
      planes.forEach((p, i) => {
        p.mesh.scale.setScalar(s);
        this.planes.push({ plane: p, entry: list[i]!, x, y: 0.62, s });
        this.text3.add(p.mesh);
        x += (p.w + gap) * s;
      });
    }
  }

  dispose() {
    this.lines.geo.dispose(); this.lines.mat.dispose();
    this.bodies.geometry.dispose(); (this.bodies.material as THREE.Material[]).forEach((m) => m.dispose());
    for (const p of this.planes) p.plane.dispose();
    this.hud.texture.dispose(); this.glow.dispose(); this.ground.pass.mat.dispose();
  }
}

let world: World | undefined;

export default class S14Shaft extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  private camera(t: number, pos: number) {
    const S = this.w.S, ph = stackPhase(t, S), lt = t - ph.t0, cam = this.w.cam;
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

  private project(x: number, y: number, z: number) {
    const v = new THREE.Vector3(x, y, z).project(this.w.cam);
    return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H, ok: v.z < 1 && v.z > -1 };
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, S = w.S, t = f.t, r = this.ctx.renderer;
    const pos = stackPos(t, S);
    const { ph, dist } = this.camera(t, pos);
    const stopped = ph.id === 'stop';
    const last = S.steps.length; // the daysIn frame index
    const bugK = stopped ? ease.outCubic(clamp((t - S.near) / 0.35)) : 0;
    const speed = Math.abs(stackPos(t, S) - stackPos(t - 1 / 60, S)) * 60;

    w.ground.render(r, out, { kind: 'ink', t, camX: 0, camY: pos * 260, zoom: 1, grid: stopped ? 0.12 : 0.22, haze: 0.5, hazeY: 0.1,
      streaks: stopped ? 0 : Math.min(1, 0.25 + speed * 0.35), streakAngle: 0, travel: pos * 0.6, kick: f.a.kick });
    r.setRenderTarget(out); r.clearDepth();

    // solid slabs (hidden-line removal), fogged
    const fog = w.bodyScene.fog as THREE.Fog;
    fog.near = dist * 0.8; fog.far = dist * 3.1;
    const last0 = w.S.steps.length; // daysIn: the bottom of the stack
    const kNow = Math.min(last0, Math.round(pos)), k0 = Math.max(0, kNow - 3), k1 = Math.min(last0, kNow + 12);
    const m4 = new THREE.Matrix4();
    let nb = 0;
    for (let k = k0; k <= k1; k++) { m4.makeTranslation(0, -k * P, 0); w.bodies.setMatrixAt(nb++, m4); }
    w.bodies.count = nb; w.bodies.instanceMatrix.needsUpdate = true;
    r.render(w.bodyScene, w.cam);

    // hairlines: template + per-frame text + the plumb line
    const lb = w.lines; lb.clear();
    const cp = w.cam.position;
    const land = landPulse(t, S);
    // "quiet": the deeper the frames, the fewer the marks
    const quiet = ph.id === 'quiet' || ph.id === 'elevator' || stopped;
    for (let k = k0; k <= k1; k++) {
      const by = -k * P;
      const dz = Math.hypot(cp.x, cp.y - by, cp.z);
      const fogK = Math.exp(-Math.max(0, dz - dist * 0.8) / (dist * 1.05));
      if (fogK < 0.02) continue;
      const focusBlock = k === kNow;
      const boost = focusBlock ? 1 + land * 0.8 : 1;
      const detail = quiet && !focusBlock ? 0.55 : 1;
      for (const list of [w.tmpl, w.frameSegs(k)]) for (const sg of list) {
        lb.seg(sg[0], sg[1] + by, sg[2], sg[3], sg[4] + by, sg[5], sg[6], sg[7] * boost, sg[8] * boost, sg[9] * boost, sg[10] * fogK * detail);
      }
      // line 42 in daysIn: lights clay on the stop
      if (k === last && bugK > 0) {
        const hot = scale3(CLAY, 2.6 + 1.2 * Math.sin(t * 9) * 0.2);
        lb.seg(-HX + 1.05, BUG_Y + by, HZ + 0.01, 2.2, BUG_Y + by, HZ + 0.01, 3.2, hot[0], hot[1], hot[2], bugK);
      }
    }
    // the plumb line: clay, from far above down the call path to the cursor head
    const headY = stopped ? -last * P + lerp(CALL_Y - 0.3, BUG_Y, bugK) : -pos * P + CALL_Y - 0.3;
    const plumb = scale3(CLAY, 2.2);
    lb.seg(MX, 40, HZ + 0.02, MX, headY, HZ + 0.02, 1.6, plumb[0], plumb[1], plumb[2], 0.95);
    lb.render(r, out, w.cam);

    // words on the frames
    for (const p of w.planes) {
      const e = p.entry, wd = e.word;
      const by = -e.block * P;
      p.plane.mesh.position.set(p.x, by + p.y, HZ + 0.35);
      const born = t >= wd.start ? 1 : 0;
      const stress = w.voice.isStressed(wd);
      const colour = new THREE.Color(heatColor(stress ? 'clay' : 'paper', 'ink', t - wd.start));
      const col: RGB = [colour.r, colour.g, colour.b];
      p.plane.set(col, born * (e.echo ? 0.32 : 1));
    }
    r.setRenderTarget(out); r.render(w.text3, w.cam);
    const opacities = w.planes.map(p => p.plane.mat.opacity);
    w.planes.forEach(p => { if (!w.voice.isStressed(p.entry.word)) p.plane.mat.opacity = 0; });
    w.glow.renderScene(r, w.text3, w.cam, w.bodyScene);
    w.planes.forEach((p, i) => { p.plane.mat.opacity = opacities[i]!; });

    // 2D: cursor head + Clawd, the depth counter, the stop callout, the S15 handoff
    const c = w.hud.ctx; w.hud.clear();
    const g = w.glow.ctx; w.glow.clear();
    const head = this.project(MX, headY, HZ + 0.02);
    if (head.ok) {
      const ch = clamp(34 * 14 / dist, 12, 40);
      drawCursor(c, { x: head.x - ch * 0.27, y: head.y + ch, h: ch });
      drawCursor(g, { x: head.x - ch * 0.27, y: head.y + ch, h: ch });
      const px = clamp(Math.round(5 * 18 / dist), 3, 7), sz = Clawd.size(px);
      Clawd.draw(c, head.x - sz.w / 2, head.y + ch + px * 2, Clawd.pose(stopped ? 'A3' : 'A11', {
        beat: f.beat, beat0: this.ctx.audio.beatAt(S.down), p: 0, look: 'down',
      }), { px });
    }
    // depth counter (label level): the floor number ticks like an elevator
    const depth = Math.max(0, FRAMES.length - 1 - Math.min(kNow, FRAMES.length - 1));
    c.font = font(F.mono(500), 15); c.fillStyle = css('paper', 0.55); c.fillText('CALL STACK', 96, 112);
    c.font = font(F.mono(400), 22); c.fillStyle = css('paper', 0.9);
    c.fillText(`#${String(depth).padStart(2, '0')}  ${FRAMES[Math.min(kNow, FRAMES.length - 1)]}()`, 96, 142);
    // stop callout: leader from line 42 to the margin
    if (bugK > 0) {
      // leader from the line's left end down to a margin callout under the frame
      const a = this.project(-HX + 1.05, -last * P + BUG_Y, HZ);
      const fade = 1 - ease.inOutCubic(clamp((t - afterBeats(this.ctx.audio, S.end, -1)) / 0.2));
      c.save(); c.globalAlpha = bugK * fade;
      c.strokeStyle = css('clay', 0.95); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(a.x - 6, a.y); c.lineTo(a.x - 60, a.y); c.lineTo(a.x - 60, 880); c.lineTo(96 + 420, 880); c.stroke();
      c.font = font(F.mono(500), 22); c.fillStyle = css('clay'); c.fillText('month.ts:42', 96, 870);
      c.font = font(F.mono(400), 15); c.fillStyle = css('paper', 0.7); c.fillText('for (let d = 0; d <= days; d++)', 96, 906);
      c.restore();
      // handoff: in the last beat the lit line slides to S15's rule
      const h0 = afterBeats(this.ctx.audio, S.end, -1);
      const k = ease.inOutCubic(clamp((t - h0) / (S.end - h0)));
      if (k > 0) {
        const l = this.project(-HX + 1.05, -last * P + BUG_Y, HZ), rr = this.project(2.2, -last * P + BUG_Y, HZ);
        const L = HANDOFF.line14;
        const x0 = lerp(l.x, L.x0, k), x1 = lerp(rr.x, L.x1, k), y = lerp(l.y, L.y, k);
        for (const cc of [c, g]) { cc.strokeStyle = css('clay'); cc.lineWidth = lerp(3, 2, k); cc.beginPath(); cc.moveTo(x0, y); cc.lineTo(x1, y); cc.stroke(); }
      }
    }
    this.ctx.comp.draw(r, w.hud.upload(), out);
    w.glow.composite(this.ctx, out, 1.6);
    void TAU;
    return { ...postFor('ink'), hud: 0, bloom: 0.55, bloomThreshold: 0.95, vignette: 0.32 };
  }
}

/** Handoff geometry at the end of S14 (for tests): the lit line lands on HANDOFF.line14. */
export function handoffOut() { return { ...HANDOFF.line14 }; }
