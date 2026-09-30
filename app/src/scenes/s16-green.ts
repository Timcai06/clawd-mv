// S16: nineteen test plaques topple in a measured, accelerating cascade.
// PAPER stays PAPER. Green is reserved for passed test faces and the result count.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { ease, lerp, frameIdx, hash } from '../engine/util';
import { css, lin } from '../theme';
import { postFor } from '../kit/ground';
import { drawCursor, drawTrail } from '../kit/cursor';
import { CALENDAR_TESTS } from '../kit/content';
import * as Clawd from '../kit/clawd';
import { beatsSince, span, hitAfter } from '../kit/time';
import {
  resolveFTimes, phaseAt, beatProgress, dominoTimes, dominoState,
  drawWordRun, currentFLine, type FTimes,
} from './parts/s15-f-timing';
import { DominoMesh, dominoPosition, PLAQUE } from './parts/s16-domino-mesh';

const PAPER_FRAG = /* glsl */ `
uniform vec3 paperColor, inkColor;
uniform float t, beat, kick, camX, camZ, cameraHeight, cascade;
float rule(float value, float pitch, float width) {
  float d = abs(fract(value / pitch + 0.5) - 0.5) * pitch;
  return 1.0 - smoothstep(width, width + 0.6 + 0.7 / PX_SCALE, d);
}
void main() {
  vec2 px = FRAG_PX;
  vec2 q = (px - vec2(960.0, 540.0)) * (0.8 + cameraHeight * 0.012)
    + vec2(camX * 24.0, camZ * 16.0);
  float a = max(rule(q.x, 68.0, 0.35), rule(q.y, 68.0, 0.35));
  float b = max(rule(q.x, 272.0, 0.6), rule(q.y, 272.0, 0.6));
  vec3 color = mix(paperColor, inkColor, a * 0.045 + b * (0.06 + 0.06 * kick));
  // A travelling registration wave is made of dots, never a gradient fill.
  vec2 cell = floor(q / 12.0), local = fract(q / 12.0) - 0.5;
  float wave = 0.5 + 0.5 * sin(cell.x * 0.065 + cell.y * 0.08 - beat * 0.65);
  float radius = 0.08 + wave * (0.1 + cascade * 0.13);
  float dots = 1.0 - smoothstep(radius, radius + 0.06, length(local));
  color = mix(color, inkColor, dots * 0.045);
  float fibre = fbm(q * 0.01 + vec2(t * 0.009, 0.0), 3);
  color = mix(color, inkColor, fibre * 0.012);
  fragColor = vec4(color, 1.0);
}`;

interface CameraRig {
  target: THREE.Vector3;
  position: THREE.Vector3;
  fov: number;
}

class World {
  users = 0;
  T: FTimes;
  triggers: number[];
  plaques: DominoMesh;
  camera = new THREE.PerspectiveCamera(34, W / H, 0.1, 150);
  scene = new THREE.Scene();
  layer = new Layer2D();
  floor = new LineBatch(4000, { blend: 'normal', screen2D: false, depthTest: true });
  annotations = new LineBatch(300, { blend: 'normal' });
  ground = new FSPass(PAPER_FRAG, {
    paperColor: { value: new THREE.Vector3(...lin('paper')) },
    inkColor: { value: new THREE.Vector3(...lin('ink')) },
    t: { value: 0 }, beat: { value: 0 }, kick: { value: 0 },
    camX: { value: 0 }, camZ: { value: 0 }, cameraHeight: { value: 8 }, cascade: { value: 0 },
  });

  constructor(ctx: SceneCtx) {
    this.T = resolveFTimes(ctx);
    this.triggers = dominoTimes(ctx.audio, this.T);
    this.plaques = new DominoMesh(ctx.renderer);
    this.scene.add(this.plaques.mesh);
  }

  project(p: THREE.Vector3): [number, number] {
    const v = p.clone().project(this.camera);
    return [(v.x * 0.5 + 0.5) * W, (0.5 - v.y * 0.5) * H];
  }

  dispose() {
    this.plaques.dispose(); this.layer.texture.dispose(); this.ground.mat.dispose();
    this.floor.mat.dispose(); this.floor.geo.dispose();
    this.annotations.mat.dispose(); this.annotations.geo.dispose();
  }
}

let world: World | undefined;

export default class S16Green extends Scene {
  private w!: World;

  override init() {
    this.w = world ??= new World(this.ctx);
    this.w.users++;
  }

  override dispose() {
    if (this.w && --this.w.users === 0) { this.w.dispose(); world = undefined; }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.T, t = f.t, audio = this.ctx.audio;
    const state = dominoState(audio, t, w.triggers);
    const phase = phaseAt(t, T.s16);
    const cascade = t >= T.greens[0]!;
    const complete = t >= T.nineteen;
    this.setCamera(f, phase, state.passed);

    const u = w.ground.u;
    u.t!.value = t; u.beat!.value = f.beat; u.kick!.value = f.a.kick;
    u.camX!.value = w.camera.position.x; u.camZ!.value = w.camera.position.z;
    u.cameraHeight!.value = w.camera.position.y;
    u.cascade!.value = cascade ? beatProgress(audio, t, T.greens[0]!, 4) : 0;
    w.ground.render(this.ctx.renderer, out);

    // Reset every instance every frame, including after backward and cross-shot seeks.
    w.plaques.setState(state.cards);
    this.ctx.renderer.setRenderTarget(out);
    this.ctx.renderer.clearDepth();
    this.ctx.renderer.render(w.scene, w.camera);
    this.drawFloor(f, state.passed);
    w.floor.render(this.ctx.renderer, out, w.camera);

    w.layer.clear(); w.annotations.clear();
    const c = w.layer.ctx;
    this.drawResult(c, f, phase, state.passed);
    this.drawClawd(c, f, state.passed, complete);
    this.drawCursorPath(c, f, state.passed);
    const line = currentFLine(this.ctx.lyrics, t, T.s16[0]!, T.end);
    if (!complete) {
      // The words are printed on the numbered test-run register alongside the domino route.
      c.fillStyle = css('ink', 0.6); c.font = font(F.mono(400), 18);
      c.fillText('RUN 042 / calendar / month.test.ts', 122, 908);
      drawWordRun(c, line, t, 122, 965, 1676, 39, 'ink', false);
    } else {
      c.font = font(F.mono(500), 21); c.fillStyle = css('ink', 0.6);
      c.fillText('NINETEEN TESTS. ONE CHARACTER.', 122, 965);
      // The terminal claim is still per-word, even though the counter is already nineteen.
      drawWordRun(c, line, t, 1040, 190, 750, 47, 'ink', false);
    }
    w.annotations.render(this.ctx.renderer, out);
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);

    const impact = hitAfter(t, T.nineteen, 0.065);
    const fi = frameIdx(t);
    return {
      ...postFor('paper'), hud: 0, frame: 0, paper: 1,
      grain: 0.034, flash: hitAfter(t, T.nineteen, 0.027) * 0.7,
      shake: [6 * impact * (hash(fi, 19) - 0.5), 5 * impact * (hash(fi, 20) - 0.5)] as [number, number],
    };
  }

  private setCamera(f: Frame, phase: number, passed: number) {
    const { T, camera } = this.w, audio = this.ctx.audio;
    const focus = Math.min(2, phase);
    const close = (i: number): CameraRig => {
      const p = dominoPosition(i);
      return {
        target: p.clone().add(new THREE.Vector3(2.05, 1.2, 0)),
        position: p.clone().add(new THREE.Vector3(-1.2, 6.8, 13.4)), fov: 34,
      };
    };
    let rig = close(focus);
    // Hold the failed face, then snap to the next test on the measured cut.
    if (phase < 3) {
      const hold = ease.outExpo(beatProgress(audio, f.t, T.s16[phase]!, 0.7));
      const prior = close(Math.max(0, focus - 1));
      rig = {
        target: prior.target.clone().lerp(rig.target, hold),
        position: prior.position.clone().lerp(rig.position, hold), fov: rig.fov,
      };
    }
    if (phase === 3 || f.t >= T.greens[0]!) {
      const crane = ease.inOutCubic(span(f.t, T.s16[3]!, T.nineteen));
      const wide: CameraRig = {
        target: new THREE.Vector3(0, 0.8, -1.1),
        position: new THREE.Vector3(3.5, 21.5, 24.0), fov: 40,
      };
      const start = close(2);
      rig = {
        target: start.target.lerp(wide.target, crane),
        position: start.position.lerp(wide.position, crane), fov: lerp(34, 40, crane),
      };
      // Fast horizontal advances land at the individual cascade triggers, then settle.
      const at = this.w.triggers[Math.max(0, passed - 1)]!;
      const kick = hitAfter(f.t, at, 0.04) * (1 - crane);
      rig.target.x += 0.22 * kick;
    }
    if (f.t >= T.nineteen) {
      const p = ease.outExpo(beatProgress(audio, f.t, T.nineteen, 0.65));
      rig = {
        target: new THREE.Vector3(0, lerp(0.8, 0.6, p), -1.1),
        position: new THREE.Vector3(lerp(3.5, 0, p), lerp(21.5, 25.8, p), lerp(24, 27.5, p)),
        fov: lerp(40, 38, p),
      };
    }
    camera.position.copy(rig.position); camera.up.set(0, 1, 0);
    camera.lookAt(rig.target); camera.fov = rig.fov;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }

  private drawFloor(f: Frame, passed: number) {
    const lb = this.w.floor; lb.clear();
    const ink = lin('ink'), clay = lin('clay');
    const seg = (a: THREE.Vector3, b: THREE.Vector3, alpha: number, color = ink, width = 1) =>
      lb.seg(a.x, a.y, a.z, b.x, b.y, b.z, width, ...color, alpha);
    // A routed hairline stays under the plaques, with tick marks for all nineteen tests.
    for (let i = 0; i < 19; i++) {
      const p = dominoPosition(i); p.y = -0.02;
      if (i < 18) seg(p, dominoPosition(i + 1).setY(-0.02), 0.22);
      seg(p.clone().add(new THREE.Vector3(-0.33, 0, 0)),
        p.clone().add(new THREE.Vector3(0.33, 0, 0)), 0.34);
      seg(p.clone().add(new THREE.Vector3(0, 0, -0.33)),
        p.clone().add(new THREE.Vector3(0, 0, 0.33)), 0.34);
      // Flat engraved registration, no projected soft shadow or realistic light.
      for (let h = 0; h < 7; h++) {
        const z = p.z - 0.5 + h * 0.16;
        seg(new THREE.Vector3(p.x - 0.75, -0.025, z),
          new THREE.Vector3(p.x + 0.75, -0.025, z + 0.32), 0.095, ink, 0.85);
      }
    }
    const at = this.w.triggers[Math.max(0, passed - 1)]!;
    const p = dominoPosition(Math.max(0, passed - 1)); p.y = 0.02;
    const r = 0.55 + 0.3 * ease.outExpo(beatProgress(this.ctx.audio, f.t, at, 0.5));
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      seg(p.clone().add(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r)),
        p.clone().add(new THREE.Vector3(Math.cos(angle) * (r + 0.25), 0, Math.sin(angle) * (r + 0.25))),
        0.7, clay, 1.5);
    }
  }

  private drawResult(c: CanvasRenderingContext2D, f: Frame, phase: number, passed: number) {
    const T = this.w.T, complete = f.t >= T.nineteen;
    c.fillStyle = css('ink'); c.font = font(F.mono(500), 23);
    c.fillText('calendar / month.test.ts', 122, 141);
    c.font = font(F.mono(400), 18); c.fillStyle = css('ink', 0.6);
    c.fillText('strict bound / d < days', 122, 179);
    this.w.annotations.seg2(122, 219, 1798, 219, 1.2, lin('ink'), 0.25);
    if (complete) {
      const p = ease.outExpo(beatProgress(this.ctx.audio, f.t, T.nineteen, 0.55));
      c.save(); c.translate(120, 440); c.scale(lerp(1.18, 1, p), lerp(1.18, 1, p));
      c.font = font(F.archivo(87.5 + p * 12.5, 900), 180); c.fillStyle = css('pass');
      c.fillText('19/19', 0, 0);
      c.font = font(F.mono(500), 25); c.fillStyle = css('ink');
      c.fillText('PASSED', 6, 54); c.restore();
    } else {
      c.font = font(F.archivo(100, 800), 114); c.fillStyle = css('pass');
      c.textAlign = 'right'; c.fillText(`${String(passed).padStart(2, '0')}/19`, 1798, 364);
      c.font = font(F.mono(500), 22); c.fillStyle = css('ink', 0.6);
      c.fillText('PASSED', 1798, 402); c.textAlign = 'left';
    }
    // The register prints the first named tests, then compacts to nineteen status marks.
    if (phase < 3) {
      const index = Math.max(0, Math.min(2, passed - 1));
      const at = this.w.triggers[index]!;
      const p = beatProgress(this.ctx.audio, f.t, at, 0.45);
      c.font = font(F.mono(400), 20); c.fillStyle = css('ink', 0.6);
      c.fillText(`TEST ${String(index + 1).padStart(2, '0')}`, 122, 772);
      c.font = font(F.mono(500), 27); c.fillStyle = css('ink');
      c.fillText(CALENDAR_TESTS[index]!, 122, 815);
      const head = drawTrail(c, [[122, 835], [722, 835]], ease.outExpo(p), { width: 1.5 });
      drawCursor(c, { x: head[0], y: head[1], h: 12 });
    }
    for (let i = 0; i < 19; i++) {
      const x = 1130 + i * 35;
      c.fillStyle = css(i < passed ? 'pass' : 'fail');
      c.fillRect(x, 820, i < passed ? 20 : 8, 12);
      c.fillStyle = css('ink', 0.45); c.font = font(F.mono(400), 12);
      c.fillText(String(i + 1).padStart(2, '0'), x, 851);
    }
  }

  private drawClawd(c: CanvasRenderingContext2D, f: Frame, passed: number, complete: boolean) {
    const i = Math.max(0, Math.min(18, passed - 1));
    const at = this.w.triggers[i]!;
    const p = dominoPosition(i);
    p.y = 0.3; p.z += 1.15;
    const [x, y] = this.w.project(p);
    const b = beatsSince(this.ctx.audio, f.t, at);
    const px = complete ? 7 : passed < 4 ? 7 : 5;
    let pose: Clawd.Pose;
    if (complete) {
      // Freeze the canonical celebration at the apex, keeping the final pose deterministic.
      const beat0 = this.ctx.audio.beatAt(this.w.T.nineteen);
      pose = Clawd.pose('A12', { beat: beat0 + 0.5, beat0, p: 0.5 });
    } else {
      pose = Clawd.pose(passed < 4 ? 'A6' : 'A12', {
        beat: f.beat, beat0: this.ctx.audio.beatAt(at), p: Math.min(1, b), jumpBeats: 0.8,
      });
    }
    Clawd.draw(c, x - px * 8, y - px * 5, pose, { px });
  }

  private drawCursorPath(c: CanvasRenderingContext2D, f: Frame, passed: number) {
    const index = Math.max(0, Math.min(18, passed - 1));
    const at = this.w.triggers[index]!;
    const settle = ease.outExpo(beatProgress(this.ctx.audio, f.t, at, 0.35));
    const p = dominoPosition(index); p.y = 0.06; p.z -= 0.48;
    const prior = dominoPosition(Math.max(0, index - 1)); prior.y = p.y; prior.z -= 0.48;
    const position = prior.clone().lerp(p, settle);
    const head = this.w.project(position);
    const pts: [number, number][] = [];
    for (let i = 0; i < index; i++) {
      const point = dominoPosition(i); point.y = 0.06; point.z -= 0.48;
      pts.push(this.w.project(point));
    }
    pts.push(head);
    drawTrail(c, pts, 1, { width: 1.3, alpha: 0.7 });
    drawCursor(c, { x: head[0], y: head[1], h: passed < 4 ? 17 : 12 });
  }
}
