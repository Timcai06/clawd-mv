// S11-1..4: stack rain, an upward view, two word impacts, then the lonely extreme wide.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { POSTER_POST, INK_SOFT } from '../theme';
import { Stage, type Panel } from '../kit/stage';
import { bigType, disc, drawGrid, frameOn } from '../kit/poster';
import { drawTextRain, drawWordImpact } from '../kit/textrain';
import { afterBeats } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { beatSpan, mixView, rainState, resolveX9Times, X9Lyrics, type X9Times } from './s09-z-shared';

const RW = 1780, RH = 980, PX = 12;
class World {
  stage: Stage; impact: Panel; lyrics = new X9Lyrics(); times: X9Times; users = 0;
  constructor(ctx: SceneCtx) {
    this.stage = new Stage(ctx.renderer);
    this.impact = this.stage.addPanel(RW, RH, 1.5);
    this.times = resolveX9Times(ctx);
  }
}
let world: World | undefined;

export default class S11Rain extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() {
    if (--this.w.users === 0) { this.w.lyrics.dispose(); this.w.stage.dispose(); world = undefined; }
  }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { stage, impact, times: T } = this.w, au = this.ctx.audio, t = f.t;
    const s = rainState(au, t, T), c = stage.poster, fr = frameOn(stage.pw, stage.ph);
    stage.clearPoster(); drawGrid(c, stage.pw, stage.ph);
    disc(c, fr.x + 1540, fr.y + 900, 290);
    bigType(c, 'STACK', fr.x - 60, fr.y + 1030, { size: 390, alpha: INK_SOFT.faint });
    // The stock rain includes at daysIn (month.ts:42), keeping the later line-42 reveal intact.
    drawTextRain(c, { x: 0, y: 0, width: stage.pw, height: stage.ph }, {
      phase: s.phase, density: s.density, angle: lerp(0.06, -0.14, beatSpan(au, t, T.sky, 1)),
    });

    impact.clear();
    const c2 = impact.ctx;
    s.impacts.forEach((hit, i) => {
      if (!hit.visible) return;
      // Lift the first settled word out of the second one's landing lane.
      const lift = i === 0 ? 200 * ease.outCubic(beatSpan(au, t, afterBeats(au, T.impacts[1], -1), 0.75)) : 0;
      drawWordImpact(c2, { x: 0, y: -lift, width: RW, height: 690 }, hit);
    });
    const latest = t >= afterBeats(au, T.impacts[1], -0.75) ? T.impacts[1] : T.impacts[0];
    const jumping = t >= afterBeats(au, latest, -0.75) && t < afterBeats(au, latest, 0.5);
    const action = t >= T.why ? 'A3' : jumping ? 'A6' : 'A7';
    // A6's existing one-row landing squash lands exactly at each aligned undefined onset.
    Clawd.draw(c2, RW / 2 - Clawd.W * PX / 2, 589, Clawd.pose(action, {
      beat: f.beat, beat0: au.beatAt(latest) - 0.75, jumpBeats: 0.75, p: 0,
    }), { px: PX });
    impact.update({ x: stage.pw / 2, y: stage.ph / 2 + 60, z: 45 });
    impact.shadow.visible = false;

    const wide = { x: stage.pw / 2, y: stage.ph / 2, zoom: 0.9 };
    const up = { ...wide, y: wide.y - 140, zoom: 1.05, pitch: -22, yaw: -8 };
    const medium = { ...wide, y: wide.y + 55, zoom: 1.16 };
    let view = mixView(wide, up, ease.outCubic(beatSpan(au, t, T.sky, 0.75)));
    const dropAt = afterBeats(au, T.impacts[0], -0.75);
    if (t >= dropAt) view = mixView(up, medium, ease.outCubic(beatSpan(au, t, dropAt, 0.65)));
    if (t >= T.why) view = mixView(medium, { ...wide, zoom: 0.27 }, s.pull);
    stage.view(view); stage.render(out); this.w.lyrics.draw(this.ctx, t, out);
    const k = 12 * Math.max(...s.impacts.map((hit) => hit.squash)), fi = frameIdx(t);
    return { ...POSTER_POST, hud: 0, shake: [k * (hash(fi, 21) * 2 - 1), k * (hash(fi, 22) * 2 - 1)] as [number, number] };
  }
}
