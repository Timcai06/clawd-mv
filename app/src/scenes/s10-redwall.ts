// S10: 19 failed results arrive as glass plates, then release into actual 3D triangles.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { F, font } from '../engine/type';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { Stage } from '../kit/stage';
import * as Clawd from '../kit/clawd';
import { beatHit, beatSpan, redwallState, resolveX9Times, type X9Times } from './s09-z-shared';
import { GlassWall } from './parts/s10-glass';
import { mono, sungLine } from './parts/s09-type';

class World {
  ground = new Ground(); layer = new Layer2D();
  stage: Stage; glass: GlassWall; times: X9Times; users = 0;
  constructor(ctx: SceneCtx) {
    this.stage = new Stage(ctx.renderer, 2880, 1620, true);
    this.glass = new GlassWall(ctx.renderer); this.stage.scene.add(this.glass.mesh);
    this.times = resolveX9Times(ctx);
  }
  dispose() {
    this.stage.scene.remove(this.glass.mesh); this.glass.dispose(); this.stage.dispose();
    this.ground.pass.mat.dispose(); this.layer.texture.dispose();
  }
}
let world: World | undefined;
export default class S10Redwall extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio, t = f.t, s = redwallState(au, t, T);
    const breakView = ease.outExpo(beatSpan(au, t, T.shatter, 0.8));
    const zoom = lerp(1.04 + s.impact * 0.055, 0.91, breakView);
    const yaw = lerp(-5, 14, breakView), pitch = lerp(2, -9, breakView);
    w.ground.render(this.ctx.renderer, out, { kind: 'paper', t, camX: 48 * breakView,
      camY: 120 * s.fracture, zoom, kick: f.a.kick, grid: 0.4,
      halftone: 0.35 + 0.25 * s.fracture, pitch: 11, streaks: s.fracture * 0.25, travel: s.fracture * 1.7 });
    w.stage.clearPoster();
    const p = w.stage.poster;
    mono(p, 'CALENDAR / ASSERTIONS', 555, 327, 19, 'ink', 0.55);
    mono(p, 'EXPECTED 31 / RECEIVED 32', 555, 1330, 19, 'ink', 0.6);
    Clawd.draw(p, 588, 1110, Clawd.pose('A8', { beat: f.beat, beat0: au.beatAt(T.nineteen), p: s.fracture }), { px: 13 });
    w.glass.update(s.rows, s.fracture, 2 * beatSpan(au, t, T.nineteen, 0.75));
    w.stage.view({ x: 1440, y: 810, zoom, yaw, pitch, roll: -1.5 * breakView });
    w.stage.render(out);
    w.layer.clear(); const c = w.layer.ctx;
    // The counter is a test result, hence fail is confined to its own ink and the plates.
    c.save(); c.translate(155, 450); const k = 1 + 0.14 * s.impact; c.scale(k, k);
    c.fillStyle = css('fail'); c.font = font(F.archivo(75, 900), 280);
    c.fillText(String(s.rows).padStart(2, '0'), 0, 0);
    c.font = font(F.mono(600), 35); c.fillText('FAILED', 12, 70); c.restore();
    mono(c, 'TEST RUN / 01', 170, 200, 19, 'ink', 0.6);
    mono(c, '19 ASSERTIONS', 170, 564, 17, 'ink', 0.45);
    // The lyric is etched on the test report's baseline; shattering releases its words.
    c.save(); c.translate(210 * s.fracture, 240 * s.fracture * s.fracture);
    c.rotate(s.fracture * 0.08);
    sungLine(c, this.ctx, t, 170, 970, 1600, 'ink', 30); c.restore();
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    const hit = 15 * s.impact + 9 * beatHit(au, t, T.shatter), fi = frameIdx(t);
    return { ...postFor('paper'), hud: 0, grain: 0.045,
      shake: [hit * (hash(fi, 10) * 2 - 1), hit * (hash(fi, 11) * 2 - 1)] as [number, number] };
  }
}
