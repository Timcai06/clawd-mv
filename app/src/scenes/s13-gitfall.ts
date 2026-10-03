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
import { exitEnvelope } from '../kit/handoff';
import { COMMITS } from '../kit/content';
import { cursorScreenAt } from './s14-shaft';
import { stackScore } from './parts/s14-stack';
import { chorusScore, impactAt, implosionAt, type ChorusScore } from './parts/s13-score';
import { lyricPlans, prefixPose, planePose, pathFor, pathCovered, cursorAt as cursorPosition, type PrefixPlan, type PlanePlan } from './parts/s13-layout';
import { SLAB, BASE_SLABS, TOWER_Z, CLAWD_VOX, LIGHT, WALL_SIZE, WALLS, S13_GLSL,
  WORD_SLOTS, cameraAt, wallEdge, wallRecoil, slabPose, onSlab, sideWallAt, clawdAt, fitsJump, implosionPoint, collapsePoint, frontLight,
  KEY_INTENSITY, BOUNCE_DIRECTION, BOUNCE_INTENSITY, CLAWD_FILL, clawdYaw, commitScale, COMMIT_INSET } from './parts/s13-world';

export const TYPE_LEVELS = { giant: 240, lyric: 72, label: 20 };
type PrintedSolid = { text: SolidText; mats: THREE.MeshLambertMaterial[]; capH: number; depth: number; word: ChorusScore['commit1']; heavy: boolean };
export const INK_ENGRAVE = { ink: lin('paper'), paper: lin('ink'), lightLines: true, maxCov: 0.3, pitch: 5, gamma: 18 };
const inkMaterial = () => {
  const material = engraveMaterial(INK_ENGRAVE), compile = material.onBeforeCompile;
  material.onBeforeCompile = (shader,r) => {
    compile.call(material,shader,r);
    shader.fragmentShader = shader.fragmentShader.replace('float engraveT = engraveSat(engraveL);', 'float engraveT = min(0.92, engraveSat(engraveL));');
    // A single thin family, with AA coverage scaled by its 0.3 ceiling. The
    // shared two-family shadow hatch would otherwise fill the ink solid's gaps.
    shader.fragmentShader = shader.fragmentShader.replace(
      'float engraveCov = min(engraveMaxCov, engraveTone(engraveU,engraveLL ? 1.0-engraveT : engraveT));',
      'float engraveCov = engraveMaxCov * engraveHatch(engraveU,max(engraveMinCov,pow(engraveT,engraveGamma)*0.95));');
  };
  material.customProgramCacheKey = () => 's13-ink-r2';
  return material;
};
function makeSolid(word: ChorusScore['commit1'], capH: number, depth: number, voice: Voice): PrintedSolid {
  const end = voice.form(word, word.end).axes, heavy = word.w.toUpperCase() === 'COMMIT';
  const material = inkMaterial(), text = new SolidText(word.w.toUpperCase(), { capH, depth, axes: heavy ? { ...end, wght: 900 } : end,
    bevel: 0.035, curveSegments: 3, material });
  const mats = text.letters.map(l => { const m = inkMaterial(); l.mesh.material = m; return m; }); material.dispose();
  return { text, mats, capH, depth, word, heavy };
}
function updateSolid(s: PrintedSolid, t: number, voice: Voice, swap: boolean) {
  const form = voice.form(s.word, t).axes, axes = s.heavy ? { ...form, wght: 900 } : form;
  const times = letterTimes({ ...s.word, w: s.word.w.toUpperCase() });
  for (const l of s.text.letters) {
    l.mesh.geometry = solidLetterGeometry(l.ch, axes, s.capH, s.depth, 0.035, 3);
    s.text.setLetter(l.i, { visible: t >= times[l.i]!.t0 });
    const hotLine=new THREE.Color(heatColor('paper','ink',t-times[l.i]!.t0));
    setEngrave(s.mats[l.i]!, { paper: lin(swap ? 'paper' : 'ink'), ink: swap ? lin('ink') : [hotLine.r,hotLine.g,hotLine.b] });
  }
}

class World {
  lastTime = 0;
  users = 0; T: ChorusScore; voice: Voice;
  rig = new Rig(); scene = new THREE.Scene(); root = new THREE.Group(); layer = new Layer2D();
  ink = inkMaterial(); clay = engraveMaterial({ ink: lin('ink'), paper: lin('clay'), minCov: 0.02 });
  localMat = engraveMaterial({ ink: lin('ink'), paper: lin('paper') });
  pass = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...lin('pass')) });
  fail = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...lin('fail')) });
  wallMat = engraveMaterial({ ink: lin('ink'),
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
  key = new THREE.DirectionalLight(0xffffff, KEY_INTENSITY);
  bounce = new THREE.DirectionalLight(new THREE.Color().setRGB(...lin('clay'), THREE.LinearSRGBColorSpace), BOUNCE_INTENSITY);
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
    this.bounce.position.set(BOUNCE_DIRECTION.x*40, BOUNCE_DIRECTION.y*40, BOUNCE_DIRECTION.z*40);
    this.wall.receiveShadow = true; this.wall.frustumCulled = false;
    const original = this.wallMat.onBeforeCompile;
    this.wallMat.onBeforeCompile = (shader, r) => {
      original.call(this.wallMat, shader, r); Object.assign(shader.uniforms, this.wallU);
      shader.fragmentShader = shader.fragmentShader.replace('float engraveT = engraveSat(engraveL);', 'float engraveT = max(0.18, engraveSat(engraveL));');
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
    this.wallMat.customProgramCacheKey = () => 's13-wall-v6-r2'; this.root.add(this.wall);
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
      const plane = new WordPlane(plan.word.w.toUpperCase(), { capH: plan.capH, axes: plan.axes, engrave: false, outline: 0, ay: 0.5 });
      this.planes.push({ plan, plane }); this.root.add(plane.mesh);
    }
    this.clawd.mesh.scale.setScalar(CLAWD_VOX);
    this.clawd.mat.vertexShader = this.clawd.mat.vertexShader.replace('varying vec3 vN;', 'varying float vFront; varying vec3 vN;')
      .replace('vN = normalize', 'vFront = normal.z; vN = normalize');
    this.clawd.mat.fragmentShader = this.clawd.mat.fragmentShader.replace('varying vec3 vN;', 'varying float vFront; varying vec3 vN;');
    // Retain clawd3d's clay instance colours and eye pits. Main, clay bounce and a
    // front-only fill all measure irradiance; no engraving or emissive lift.
    this.clawd.mat.fragmentShader = this.clawd.mat.fragmentShader.replace(
      'vec3 c = vC * (uAmb + (1.0 - uAmb) * dif) * face;', `
      vec3 reflected = vec3(${KEY_INTENSITY.toFixed(12)}) * max(dot(n, normalize(vec3(${LIGHT.x},${LIGHT.y},${LIGHT.z}))),0.0)
        + vec3(${lin('clay').join(',')}) * ${BOUNCE_INTENSITY} * max(dot(n, normalize(vec3(${BOUNCE_DIRECTION.x},${BOUNCE_DIRECTION.y},${BOUNCE_DIRECTION.z}))),0.0);
      vec3 c = vC * clamp(reflected / 3.141592653589793 + vec3(${CLAWD_FILL}) * max(n.z,0.0),0.0,1.0);`);
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
    addStroke(true, [[9.4, 4.5], [10.9, 3.5], [13.7, 6.3]], 0.6);
    addStroke(false, [[-13.5, 3.5], [-10.5, 6.3]], 0.6); addStroke(false, [[-13.5, 6.3], [-10.5, 3.5]], 0.6);
  }
  dispose() {
    this.layer.texture.dispose(); this.wall.geometry.dispose(); this.slabs[0]!.geometry.dispose(); this.local.geometry.dispose();
    for (const m of this.marks) m.mesh.geometry.dispose();
    for (const s of [...this.prefixes.map(p => p.solid), ...this.commits.map(p => p.solid), ...this.echoes.map(p => p.solid)]) {
      s.text.dispose(); s.mats.forEach(m => m.dispose());
    }
    this.planes.forEach(p => p.plane.dispose()); this.clawd.dispose(); this.key.dispose(); this.bounce.dispose();
    [this.ink, this.clay, this.localMat, this.pass, this.fail, this.wallMat].forEach(m => m.dispose());
  }
}
let world: World | undefined;
export default class S13Gitfall extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.T, t = f.t, audio = this.ctx.audio, r = this.ctx.renderer;
    w.lastTime = t;
    const hit = impactAt(t, T);
    setEngrave(w.ink, { paper: lin(hit.swap ? 'paper' : 'ink'), ink: lin(hit.swap ? 'ink' : 'paper') });
    for (const m of [w.wallMat, w.clay]) setEngrave(m, { paper: lin(hit.swap ? 'ink' : 'clay'), ink: lin(hit.swap ? 'clay' : 'ink') });
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
      if (pose.visible) updateSolid(solid, t, w.voice, hit.swap);
    }
    for (const { event, solid } of w.commits) {
      const s = T.slabs[event]!, pose = slabPose(audio, t, BASE_SLABS + event, T, w.rig), g = solid.text.group;
      g.visible = pose.visible; g.position.set(pose.center.x, pose.center.y, pose.center.z); g.rotation.y = pose.yaw; g.scale.x = pose.scaleX * commitScale(t,event,solid.text.width,T);
      // Letters occupy the thicker lamination above its 0.42-unit supporting plank.
      updateSolid(solid, t, w.voice, hit.swap);
      for (const l of solid.text.letters) {
        solid.text.setLetter(l.i, { d: p3(-solid.text.width / 2, -s.height / 2 + SLAB.h - COMMIT_INSET, 0.2), visible: t >= letterTimes({ ...solid.word, w: 'COMMIT' })[l.i]!.t0 });
      }
    }
    for (const { at, solid } of w.echoes) {
      const g = solid.text.group, active = t >= at - 0.1 && t < at + 0.1;
      g.visible = active;
      if (active) {
        const base = slabPose(audio, t, BASE_SLABS, T, w.rig);
        g.scale.x = commitScale(t,0,solid.text.width,T);
        g.position.set(base.center.x - solid.text.width * g.scale.x / 2, base.center.y - base.height / 2 + SLAB.h + 6 * (1 - ease.inQuad(Math.min(1, Math.max(0, (t - at + 0.1) / 0.1)))), 3.2);
        updateSolid(solid, t, w.voice, hit.swap);
      }
    }
    for (const { plan, plane } of w.planes) {
      const pose = planePose(audio, t, plan, T, w.rig), form = w.voice.form(plan.word, t);
      plane.mesh.position.set(pose.at.x, pose.at.y, pose.at.z); plane.mesh.rotation.y = pose.yaw;
      plane.mesh.scale.x = pose.scaleX * form.axes.wdth / plan.axes.wdth;
      plane.mesh.visible = t >= plan.word.start;
      const cold = lin(plan.carrier === 'local' ? 'ink' : 'paper');
      plane.set({ prog: plane.karaoke({ ...plan.word, w: plan.word.w.toUpperCase() }, t), aDim: 0,
        cDim: cold, cSung: cold, cDone: cold, done: Math.min(1, Math.max(0, (t - plan.word.end) / 0.15)),
        heat: 0, tone: frontLight(pose.yaw), opacity: 1 });
    }
    const cp = clawdAt(audio, t, T, w.rig);
    w.clawd.update(Clawd.pose(t >= T.machine.start ? 'A6' : t >= T.tests && t < T.pickup2 ? 'A8' : 'A4',
      { beat: f.beat, beat0: audio.beatAt(T.start), p: 0 }));
    w.clawd.mesh.position.set(cp.x, cp.y, cp.z);
    w.clawd.mesh.rotation.y = clawdYaw(audio,t,T);
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
        if (t < path.words[0]!.start || pathCovered(t,path,T)) continue;
        const p = pathFor(audio, t, path, T, w.rig, anchor);
        const layout = k === 1 ? path.layout : layoutPath(path.words, { capH: path.layout.capH * k,
          axes: word => w.voice.form(word, word.end).axes, upper: true, space: path.kind === 'tests' ? 0.24 : undefined });
        drawPathText(c, w.rig, p, layout, t, { mode: 'stand', base: path.kind === 'tests' ? 'ink' : 'paper', on: path.kind === 'tests' ? 'clay' : 'ink',
          axes: (g, tb) => w.voice.form(g.word, tb).axes, pop: 0.1, minPx: 0, maxPx: 110,
          offset: (g, tb) => ({ d: p3(0, g.word.gi === T.fits.gi ? fitsJump(audio, tb, g.i, T) * k : 0, 0) }) });
      }
      // Exactly two machine annotations, attached to their physical walls.
      if (t >= T.lines[4]!.words[0]!.start - 0.3) [w.local, w.ci].forEach((wall, i) => {
        const p = collapsePoint(p3(wall.position.x + (i ? -14.2 : 9), wall.position.y + 4.2, 5.3), t, T, anchor);
        const m = planeAffine(w.rig, p, p3(1, 0, 0), p3(0, -1, 0), 0.14 / 70 * k);
        if (m) { c.save(); c.setTransform(m.a, m.b, m.c, m.d, m.e, m.f); c.font = font(F.mono(600), 100);
          c.fillStyle = css(i ? 'paper' : 'ink'); c.fillText(i ? 'CI' : 'LOCAL', 0, 0); c.restore(); }
      });
    }
    const cursor = cursorPosition(audio, t, T, w.voice, w.plans, w.P14);
    c.fillStyle = css(t >= T.end - 0.09 ? 'hot' : 'clay'); c.beginPath(); c.arc(cursor.x, cursor.y, cursor.r, 0, Math.PI * 2); c.fill();
    this.ctx.comp.draw(r, w.layer.upload(), out);
    const envelope = exitEnvelope(t, T.end, 2);
    return { ...POSTER_POST, hud: 0, frame: 0, grain: 0.02, bloom: 0, shake: hit.shake, zoom: 1 + hit.zoom,
      invert: 0, exposure: t >= T.collision + 0.2 ? envelope.gain : 1 };
  }
}
export { entryPrim, exitPrim } from './parts/s13-world';
export { cursorAt } from './parts/s13-layout';

/** Technical ID pass of the last evaluated frame, for RGBA statistics, not a screenshot.
 * All other geometry writes black and retains depth, so masks exclude occluded surfaces.
 * The caller applies the same post shake/zoom to this raw camera-space mask. */
export function pixelMask(renderer: THREE.WebGLRenderer, kind: 'commit' | 'clawd' | 'wall-text' | 'fix-text' | 'words') {
  if (!world) throw new Error('Render S13 before requesting a pixel mask');
  const w = world, target = new THREE.WebGLRenderTarget(1920,1080), saved: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  const black = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const special: THREE.Material[] = [], commitMeshes = new Set(w.commits.flatMap(s => s.solid.text.letters.map(l => l.mesh)));
  const textMeshes = new Set(w.planes.filter(p => kind==='fix-text'?p.plan.carrier==='fix':p.plan.carrier!=='fix').map(p => p.plane.mesh));
  const wordMeshes = new Map<THREE.Mesh,number>();
  w.prefixes.forEach(p=>p.solid.text.letters.forEach(l=>wordMeshes.set(l.mesh,p.plan.word.gi+1)));
  w.commits.forEach(p=>p.solid.text.letters.forEach(l=>wordMeshes.set(l.mesh,p.solid.word.gi+1)));
  w.echoes.forEach(p=>p.solid.text.letters.forEach(l=>wordMeshes.set(l.mesh,p.solid.word.gi+1)));
  w.planes.forEach(p=>wordMeshes.set(p.plane.mesh,p.plan.word.gi+1));
  const ids=new Map<number,THREE.MeshBasicMaterial>();
  const background = w.scene.background, currentTarget = renderer.getRenderTarget();
  try {
    w.scene.background = new THREE.Color(0);
    w.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      saved.push([o,o.material]);
      const id=wordMeshes.get(o);
      if(kind==='words' && id!==undefined){
        if(o.material instanceof THREE.RawShaderMaterial){
          const m=o.material.clone();
          m.uniforms.map!.value=o.material.uniforms.map!.value;
          m.uniforms.s13WordID={value:new THREE.Vector3(id/255,.8,.4)};
          m.fragmentShader=m.fragmentShader.replace('precision highp float;','precision highp float; uniform vec3 s13WordID;')
            .replace('fragColor = vec4(rgb,a);','if(a<0.5)discard; fragColor=vec4(s13WordID,1.0);');
          special.push(m);o.material=m;
        }else{
          let m=ids.get(id);
          if(!m){m=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(id/255,.8,.4),side:THREE.DoubleSide});ids.set(id,m);special.push(m);}
          o.material=m;
        }
      } else if (kind === 'commit' && commitMeshes.has(o)) o.material = white;
      else if (kind === 'clawd' && o === w.clawd.mesh) {
        const m = w.clawd.mat.clone();
        m.fragmentShader = m.fragmentShader.replace('gl_FragColor = vec4(c, 1.0);',
          'gl_FragColor = vec4(vec3(vFront > 0.99 && vC.r > 0.1 ? 1.0 : 0.0),1.0);');
        special.push(m); o.material = m;
      } else if ((kind === 'wall-text'||kind==='fix-text') && textMeshes.has(o)) {
        const m = (o.material as THREE.RawShaderMaterial).clone();
        m.uniforms.map!.value=(o.material as THREE.RawShaderMaterial).uniforms.map!.value;
        m.fragmentShader = m.fragmentShader.replace('fragColor = vec4(rgb,a);', 'fragColor = vec4(vec3(a),a);');
        special.push(m); o.material = m;
      } else if (o.material instanceof THREE.RawShaderMaterial) {
        const m = o.material.clone();
        m.uniforms.map!.value=o.material.uniforms.map!.value;
        m.fragmentShader = m.fragmentShader.replace('fragColor = vec4(rgb,a);', 'fragColor = vec4(vec3(0.0),a);');
        special.push(m); o.material = m;
      } else o.material = black;
    });
    renderer.setRenderTarget(target); renderer.clear(true,true,true); renderer.render(w.scene,w.rig.cam);
    const pixels = new Uint8Array(1920*1080*4); renderer.readRenderTargetPixels(target,0,0,1920,1080,pixels);
    return { pixels, transform: impactAt(w.lastTime,w.T) };
  } finally {
    for (const [mesh, material] of saved) mesh.material = material;
    w.scene.background = background; renderer.setRenderTarget(currentTarget);
    black.dispose(); white.dispose(); special.forEach(m => m.dispose()); target.dispose();
  }
}

/** Visible ink bounds: an ID render retains real depth occlusion and letter-time coverage.
 * This supplements the conservative unoccluded font/mesh corner bounds in s13-layout. */
export function pixelWordBounds(renderer:THREE.WebGLRenderer){
  if(!world)throw new Error('Render S13 first');
  const w=world,{pixels,transform}=pixelMask(renderer,'words'),bounds=new Map<number,{x:number;y:number;x1:number;y1:number;pixels:number}>();
  const collect=(px:Uint8Array|Uint8ClampedArray,flip:boolean)=>{
    for(let y=0;y<1080;y++)for(let x=0;x<1920;x++){
      const i=((flip?1079-y:y)*1920+x)*4;
      // Exact interior ID pixels avoid inventing neighbouring word IDs from
      // Canvas antialiasing / unpremultiplication of an edge pixel.
      if(px[i+1]!==204||px[i+2]!==102||px[i+3]!==255)continue;
      const id=px[i]!;if(!id)continue;
      const b=bounds.get(id)??{x:1920,y:1080,x1:-1,y1:-1,pixels:0};
      b.x=Math.min(b.x,x);b.y=Math.min(b.y,y);b.x1=Math.max(b.x1,x);b.y1=Math.max(b.y1,y);b.pixels++;bounds.set(id,b);
    }
  };
  collect(pixels,true);
  const canvas=document.createElement('canvas');canvas.width=1920;canvas.height=1080;
  const c=canvas.getContext('2d')!, t=w.lastTime, audio=w.voice.audio;
  for(const p of w.plans.paths){
    if(pathCovered(t,p,w.T))continue;
    const path=pathFor(audio,t,p,w.T,w.rig);
    for(const word of p.words){
      const proxy=new Proxy(c,{set(target,key,value){if(key==='fillStyle')target.fillStyle=`rgb(${word.gi+1},204,102)`;else Reflect.set(target,key,value,target);return true;},
        get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      drawPathText(proxy,w.rig,path,p.layout,t,{mode:'stand',base:'ink',on:'clay',axes:(g,tb)=>w.voice.form(g.word,tb).axes,
        pop:.1,minPx:0,maxPx:110,offset:(g,tb)=>g.word.gi===word.gi?{d:p3(0,g.word.gi===w.T.fits.gi?fitsJump(audio,tb,g.i,w.T):0,0)}:null});
    }
  }
  collect(c.getImageData(0,0,1920,1080).data,false);
  const zoom=1+transform.zoom;
  return [...bounds].map(([id,b])=>({gi:id-1,pixels:b.pixels,box:{
    x:(b.x-960+transform.shake[0])*zoom+960,y:(b.y-540-transform.shake[1])*zoom+540,
    w:(b.x1-b.x+1)*zoom,h:(b.y1-b.y+1)*zoom}}));
}
