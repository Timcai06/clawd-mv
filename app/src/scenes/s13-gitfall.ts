// S13 V6: ink solid type strikes a displaced clay wall; commits become physical laminations.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { ease } from '../engine/util';
import { css, lin, POSTER_POST } from '../theme';
import { engraveMaterial, setEngrave } from '../kit/engrave-mat';
import { SolidText, solidLetterGeometry } from '../kit/solidtype';
import { WordPlane } from '../kit/wordplane';
import { VoxelClawd } from '../kit/clawd3d';
import * as Clawd from '../kit/clawd';
import { Voice, heatColor } from '../kit/lyric-moves';
import { drawPathText, letterTimes, layoutPath } from '../kit/pathtext';
import { Rig, planeAffine, p3 } from '../kit/rig';
import { varRun } from '../kit/vartype';
import { exitEnvelope } from '../kit/handoff';
import { COMMITS } from '../kit/content';
import { cursorScreenAt } from './s14-shaft';
import { stackScore } from './parts/s14-stack';
import { chorusScore, impactAt, implosionAt, type ChorusScore } from './parts/s13-score';
import { lyricPlans, prefixPose, planePose, pathFor, cursorAt as cursorPosition, type PrefixPlan, type PlanePlan } from './parts/s13-layout';
import { SLAB, BASE_SLABS, TOWER_Z, CLAWD_VOX, LIGHT, WALL_SIZE, WALLS, S13_GLSL,
  WORD_SLOTS, cameraAt, wallEdge, wallRecoil, slabPose, onSlab, sideWallAt, clawdAt, fitsJump, implosionPoint, collapsePoint, frontLight } from './parts/s13-world';

export const TYPE_LEVELS = { giant: 240, lyric: 72, label: 20 };
type PrintedSolid = { text: SolidText; mats: THREE.MeshLambertMaterial[]; capH: number; depth: number; word: ChorusScore['commit1']; heavy: boolean };
const inkMaterial = () => engraveMaterial({ ink: lin('paper'), paper: lin('ink'), lightLines: true, pitch: 5 });
function makeSolid(word: ChorusScore['commit1'], capH: number, depth: number, voice: Voice): PrintedSolid {
  const end = voice.form(word, word.end).axes, heavy = word.w.toUpperCase() === 'COMMIT';
  const material = inkMaterial(), text = new SolidText(word.w.toUpperCase(), { capH, depth, axes: heavy ? { ...end, wght: 900 } : end,
    bevel: 0.035, curveSegments: 3, material });
  const mats = text.letters.map(l => { const m = inkMaterial(); l.mesh.material = m; return m; }); material.dispose();
  return { text, mats, capH, depth, word, heavy };
}
function updateSolid(s: PrintedSolid, t: number, voice: Voice) {
  const form = voice.form(s.word, t).axes, axes = s.heavy ? { ...form, wght: 900 } : form;
  const times = letterTimes({ ...s.word, w: s.word.w.toUpperCase() });
  for (const l of s.text.letters) {
    l.mesh.geometry = solidLetterGeometry(l.ch, axes, s.capH, s.depth, 0.035, 3);
    s.text.setLetter(l.i, { visible: t >= times[l.i]!.t0 });
    const color = new THREE.Color(heatColor('ink', 'clay', t - times[l.i]!.t0));
    setEngrave(s.mats[l.i]!, { paper: [color.r, color.g, color.b] });
  }
}

class World {
  users = 0; T: ChorusScore; voice: Voice;
  rig = new Rig(); scene = new THREE.Scene(); root = new THREE.Group(); layer = new Layer2D();
  ink = inkMaterial(); clay = engraveMaterial({ ink: lin('ink'), paper: lin('clay'), minCov: 0.02 });
  localMat = engraveMaterial({ ink: lin('ink'), paper: lin('paper') });
  pass = engraveMaterial({ ink: lin('ink'), paper: lin('pass') });
  fail = engraveMaterial({ ink: lin('paper'), paper: lin('fail'), lightLines: true });
  clawdMat = engraveMaterial({ ink: lin('ink'), paper: lin('clay'), paperMap: true });
  wallMat = engraveMaterial({ ink: lin('clay').map((v, i) => v * 0.72 + lin('ink')[i]! * 0.28) as [number, number, number],
    paper: lin('clay'), gamma: 1.25, minCov: 0.02, faceAngles: false });
  wall = new THREE.Mesh(new THREE.PlaneGeometry(WALL_SIZE.w, WALL_SIZE.h, 192, 128), this.wallMat);
  wallU = { edgeA: { value: 40 }, edgeB: { value: 0 }, recoil: { value: 0 },
    rippleHits: { value: WORD_SLOTS.map(p => new THREE.Vector3(p.x, p.y, -1)) } };
  slabs: THREE.Mesh[] = [];
  prefixes: { plan: PrefixPlan; solid: PrintedSolid }[] = [];
  commits: { event: number; solid: PrintedSolid }[] = [];
  echoes: { at: number; solid: PrintedSolid }[] = [];
  planes: { plan: PlanePlan; plane: WordPlane }[] = [];
  plans: ReturnType<typeof lyricPlans>;
  clawd = new VoxelClawd(); local: THREE.Mesh; ci: THREE.Mesh;
  marks: { mesh: THREE.Mesh; local: boolean }[] = [];
  key = new THREE.DirectionalLight(0xffffff, 1.25);
  bounce = new THREE.DirectionalLight(new THREE.Color().setRGB(...lin('clay'), THREE.LinearSRGBColorSpace), 0.25);
  P14: ReturnType<typeof cursorScreenAt>;
  constructor(ctx: SceneCtx) {
    this.T = chorusScore(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio);
    this.P14 = cursorScreenAt(this.T.end, stackScore(ctx.audio, ctx.lyrics));
    this.plans = lyricPlans(this.T, this.voice);
    this.scene.background = new THREE.Color().setRGB(...lin('ink'), THREE.LinearSRGBColorSpace);
    this.scene.add(this.root, this.key, this.key.target, this.bounce, this.bounce.target);
    this.key.position.set(LIGHT.x * 40, LIGHT.y * 40, LIGHT.z * 40); this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 0.1, far: 100 });
    this.key.shadow.bias = -0.0002; this.key.shadow.normalBias = 0.008;
    this.bounce.position.set(-40, 6, 0); this.bounce.target.position.set(4, 2, 3);
    this.wall.receiveShadow = true; this.wall.frustumCulled = false;
    const original = this.wallMat.onBeforeCompile;
    this.wallMat.onBeforeCompile = (shader, r) => {
      original.call(this.wallMat, shader, r); Object.assign(shader.uniforms, this.wallU);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + S13_GLSL + `
uniform float edgeA, edgeB, recoil; uniform vec3 rippleHits[4];
vec3 wallPoint(vec3 p) {
  p.x = mix(-45.0, edgeA+edgeB*p.y, (p.x+45.0)/90.0);
  return p;
}
float wallDepth(vec2 p) {
  float z = recoil;
  for (int i=0;i<4;i++) z += wallRipple(p,rippleHits[i].z,rippleHits[i].xy);
  return z;
}
vec2 wallGradient(vec2 p) {
  vec2 g=vec2(0.0);
  for (int i=0;i<4;i++) g+=wallRippleGradient(p,rippleHits[i].z,rippleHits[i].xy);
  return g;
}`);
      shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `
vec3 wp = wallPoint(position);
vec2 wg = wallGradient(wp.xy);
vec3 objectNormal = normalize(vec3(-wg,1.0));`)
        .replace('#include <begin_vertex>', 'vec3 transformed=wallPoint(position); transformed.z=wallDepth(transformed.xy);');
    };
    this.wallMat.customProgramCacheKey = () => 's13-wall-v6-1'; this.root.add(this.wall);
    const slabGeo = new THREE.BoxGeometry(SLAB.w, SLAB.h, SLAB.d);
    for (let i = 0; i < BASE_SLABS + this.T.slabs.length; i++) {
      const s = this.T.slabs[i - BASE_SLABS], m = new THREE.Mesh(slabGeo, s?.clay ? this.clay : this.ink);
      m.castShadow = m.receiveShadow = true; this.slabs.push(m); this.root.add(m);
    }
    for (const plan of this.plans.prefixes) {
      const solid = makeSolid(plan.word, plan.capH, plan.second ? 0.3 : 0.6, this.voice);
      this.prefixes.push({ plan, solid }); this.root.add(solid.text.group);
    }
    this.T.slabs.forEach((s, event) => {
      if (s.kind !== 'commit') return;
      const solid = makeSolid(s.words[0]!, 2.4, 0.9, this.voice);
      this.commits.push({ event, solid }); this.root.add(solid.text.group);
    });
    for (const at of this.T.echoes) {
      const solid = makeSolid(this.T.commit1, 2.4, 0.9, this.voice);
      for (const m of solid.mats) { m.transparent = true; m.opacity = 0.3; m.depthWrite = false; }
      this.echoes.push({ at, solid }); this.root.add(solid.text.group);
    }
    for (const plan of this.plans.planes) {
      const plane = new WordPlane(plan.word.w.toUpperCase(), { capH: plan.capH, axes: plan.axes, engrave: true, outline: 0, ay: 0.5 });
      this.planes.push({ plan, plane }); this.root.add(plane.mesh);
    }
    this.clawd.mesh.scale.setScalar(CLAWD_VOX); this.clawd.mesh.material = this.clawdMat;
    this.clawd.mesh.castShadow = this.clawd.mesh.receiveShadow = true; this.root.add(this.clawd.mesh);
    const sideGeo = new THREE.BoxGeometry(WALLS.w, WALLS.h, WALLS.d);
    this.local = new THREE.Mesh(sideGeo, this.localMat); this.ci = new THREE.Mesh(sideGeo, this.ink);
    for (const wall of [this.local, this.ci]) { wall.castShadow = wall.receiveShadow = true; this.root.add(wall); }
    // Semantic ✓ and ✗ are physical extruded strokes on the respective wall.
    const addStroke = (local: boolean, points: [number, number][], width: number) => {
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1]!, b = points[i]!, dx = b[0] - a[0], dy = b[1] - a[1];
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(dx, dy), width, 0.15), local ? this.pass : this.fail);
        mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.85); mesh.rotation.z = Math.atan2(dy, dx);
        (local ? this.local : this.ci).add(mesh); this.marks.push({ mesh, local });
      }
    };
    addStroke(true, [[9, 5.5], [10.5, 4.5], [13.3, 7.3]], 0.6);
    addStroke(false, [[-13.5, 4.5], [-10.5, 7.3]], 0.6); addStroke(false, [[-13.5, 7.3], [-10.5, 4.5]], 0.6);
  }
  dispose() {
    this.layer.texture.dispose(); this.wall.geometry.dispose(); this.slabs[0]!.geometry.dispose(); this.local.geometry.dispose();
    for (const m of this.marks) m.mesh.geometry.dispose();
    for (const s of [...this.prefixes.map(p => p.solid), ...this.commits.map(p => p.solid), ...this.echoes.map(p => p.solid)]) {
      s.text.dispose(); s.mats.forEach(m => m.dispose());
    }
    this.planes.forEach(p => p.plane.dispose()); this.clawd.dispose(); this.key.dispose(); this.bounce.dispose();
    [this.ink, this.clay, this.localMat, this.pass, this.fail, this.clawdMat, this.wallMat].forEach(m => m.dispose());
  }
}
let world: World | undefined;
export default class S13Gitfall extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.T, t = f.t, audio = this.ctx.audio, r = this.ctx.renderer;
    w.rig.set(cameraAt(audio, t, T));
    const k = 1 - implosionAt(t, T), anchor = implosionPoint(w.rig, w.P14);
    w.root.scale.setScalar(k); w.root.position.set(anchor.x * (1 - k), anchor.y * (1 - k), anchor.z * (1 - k));
    w.root.visible = k > 0;
    const edge = wallEdge(w.rig, t, audio, T);
    w.wallU.edgeA.value = edge.intercept; w.wallU.edgeB.value = edge.slope; w.wallU.recoil.value = wallRecoil(t, T);
    T.lines[0]!.words.slice(0, 4).forEach((word, i) => w.wallU.rippleHits.value[i]!.z = t - word.start);
    w.slabs.forEach((mesh, i) => {
      const pose = slabPose(audio, t, i, T, w.rig);
      mesh.visible = pose.visible; mesh.position.set(pose.center.x, pose.center.y - (pose.height - SLAB.h) / 2, pose.center.z);
      mesh.rotation.y = pose.yaw; mesh.scale.x = pose.scaleX;
    });
    for (const { plan, solid } of w.prefixes) {
      const pose = prefixPose(audio, t, plan, T, w.rig), g = solid.text.group;
      g.visible = pose.visible; g.position.set(pose.at.x, pose.at.y, pose.at.z); g.rotation.set(0, pose.yaw, pose.spin);
      g.scale.x = pose.scaleX;
      if (pose.visible) updateSolid(solid, t, w.voice);
    }
    for (const { event, solid } of w.commits) {
      const s = T.slabs[event]!, pose = slabPose(audio, t, BASE_SLABS + event, T, w.rig), g = solid.text.group;
      g.visible = pose.visible; g.position.set(pose.center.x, pose.center.y, pose.center.z); g.rotation.y = pose.yaw; g.scale.x = pose.scaleX;
      // Letters occupy the thicker lamination above its 0.42-unit supporting plank.
      updateSolid(solid, t, w.voice);
      for (const l of solid.text.letters) {
        solid.text.setLetter(l.i, { d: p3(-solid.text.width / 2, -s.height / 2 + SLAB.h, 0.3), visible: t >= letterTimes({ ...solid.word, w: 'COMMIT' })[l.i]!.t0 });
      }
    }
    for (const { at, solid } of w.echoes) {
      const g = solid.text.group, active = t >= at - 0.1 && t < at + 0.1;
      g.visible = active;
      if (active) {
        const base = slabPose(audio, t, BASE_SLABS, T, w.rig);
        g.position.set(base.center.x - solid.text.width / 2, base.center.y - base.height / 2 + SLAB.h + 6 * (1 - ease.inQuad(Math.min(1, Math.max(0, (t - at + 0.1) / 0.1)))), 3.3);
        updateSolid(solid, t, w.voice);
      }
    }
    for (const { plan, plane } of w.planes) {
      const pose = planePose(audio, t, plan, T, w.rig), form = w.voice.form(plan.word, t);
      plane.mesh.position.set(pose.at.x, pose.at.y, pose.at.z); plane.mesh.rotation.y = pose.yaw;
      plane.mesh.scale.x = pose.scaleX * form.axes.wdth / plan.axes.wdth;
      plane.mesh.visible = t >= plan.word.start;
      const cold = plan.carrier === 'local' || T.slabs[plan.event]?.clay ? lin('ink') : lin('paper');
      plane.set({ prog: plane.karaoke({ ...plan.word, w: plan.word.w.toUpperCase() }, t), aDim: 0,
        cDim: cold, cSung: cold, cDone: cold, done: Math.min(1, Math.max(0, (t - plan.word.end) / 0.15)),
        heat: Math.max(0, 1 - (t - plan.word.start) / 0.18), tone: frontLight(pose.yaw), opacity: 1 });
    }
    const cp = clawdAt(audio, t, T, w.rig);
    w.clawd.update(Clawd.pose(t >= T.machine.start ? 'A6' : t >= T.tests && t < T.pickup2 ? 'A8' : 'A4',
      { beat: f.beat, beat0: audio.beatAt(T.start), p: 0 }));
    w.clawd.mesh.position.set(cp.x, cp.y, cp.z);
    [w.local, w.ci].forEach((mesh, i) => {
      const p = sideWallAt(t, i === 0, T); mesh.position.set(p.x, p.y, p.z);
    });
    const shadowEnabled = r.shadowMap.enabled, shadowType = r.shadowMap.type;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    try { r.setRenderTarget(out); r.clear(true, true, true); r.render(w.scene, w.rig.cam); }
    finally { r.shadowMap.enabled = shadowEnabled; r.shadowMap.type = shadowType; }
    w.layer.clear(); const c = w.layer.ctx;
    if (k > 0) {
      // Machine log labels are projected from the actual front faces, never screen rows.
      w.slabs.forEach((mesh, i) => {
        if (!mesh.visible || t < T.commit1.start) return;
        const pose = slabPose(audio, t, i, T, w.rig), e = T.slabs[i - BASE_SLABS];
        const p = collapsePoint(onSlab(pose, p3(-3.3, -pose.height / 2 + 0.14, SLAB.d / 2 + 0.025)), t, T, anchor);
        const q = w.rig.proj(p.x, p.y, p.z);
        if (!q || q.y < 0 || q.y > 1080 || q.x < 0 || q.x > 1920) return;
        const dir = p3(Math.cos(pose.yaw) * pose.scaleX, 0, -Math.sin(pose.yaw) * pose.scaleX);
        const m = planeAffine(w.rig, p, dir, p3(0, -1, 0), 0.2 / 70 * k);
        if (!m) return;
        c.save(); c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f); c.font = font(F.mono(500), 100);
        c.fillStyle = css(e?.clay ? 'ink' : 'paper');
        const record = e ?? COMMITS[i % COMMITS.length]!;
        c.fillText(record.hash + (e?.kind === 'fix' ? '' : '  ' + record.message), 0, 0); c.restore();
      });
      for (const path of w.plans.paths) {
        if (t < path.words[0]!.start) continue;
        const p = pathFor(audio, t, path, T, w.rig, anchor);
        const layout = k === 1 ? path.layout : layoutPath(path.words, { capH: path.layout.capH * k,
          axes: word => w.voice.form(word, word.end).axes, upper: true, space: path.kind === 'tests' ? 0.24 : undefined });
        drawPathText(c, w.rig, p, layout, t, { mode: 'stand', base: path.kind === 'tests' ? 'ink' : 'paper', on: path.kind === 'tests' ? 'clay' : 'ink',
          axes: (g, tb) => w.voice.form(g.word, tb).axes, pop: 0.1, minPx: 0, maxPx: 10000,
          offset: (g, tb) => ({ d: p3(0, g.word.gi === T.fits.gi ? fitsJump(audio, tb, g.i, T) * k : 0, 0) }) });
      }
      // Exactly two machine annotations, attached to their physical walls.
      if (t >= T.split) [w.local, w.ci].forEach((wall, i) => {
        const p = collapsePoint(p3(wall.position.x + (i ? -14.2 : 9), wall.position.y + 4.2, 5.3), t, T, anchor);
        const m = planeAffine(w.rig, p, p3(1, 0, 0), p3(0, -1, 0), 0.14 / 70 * k);
        if (m) { c.save(); c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f); c.font = font(F.mono(600), 100);
          c.fillStyle = css(i ? 'paper' : 'ink'); c.fillText(i ? 'CI' : 'LOCAL', 0, 0); c.restore(); }
      });
    }
    const cursor = cursorPosition(audio, t, T, w.voice, w.plans, w.P14);
    c.fillStyle = css(t >= T.end - 0.09 ? 'hot' : 'clay'); c.beginPath(); c.arc(cursor.x, cursor.y, cursor.r, 0, Math.PI * 2); c.fill();
    this.ctx.comp.draw(r, w.layer.upload(), out);
    const hit = impactAt(t, T), envelope = exitEnvelope(t, T.end, 2);
    return { ...POSTER_POST, hud: 0, frame: 0, grain: 0.02, bloom: 0, shake: hit.shake, zoom: 1 + hit.zoom,
      invert: hit.invert, exposure: t >= T.collision + 0.2 ? envelope.gain : 1 };
  }
}
export { entryPrim, exitPrim } from './parts/s13-world';
export { cursorAt } from './parts/s13-layout';
