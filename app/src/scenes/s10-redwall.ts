// S10-1..2: nineteen failed rows burst in at the sung word, then fracture on "shattering".
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { ease, frameIdx, hash } from '../engine/util';
import { F, font } from '../engine/type';
import { css, POSTER_POST } from '../theme';
import { Stage, type Panel } from '../kit/stage';
import { bigType, disc, drawGrid, frameOn } from '../kit/poster';
import { drawTestList } from '../kit/testlist';
import { span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { beatHit, beatSpan, mixView, redwallState, resolveX9Times, X9Lyrics, type X9Times } from './s09-z-shared';

const LW = 1040, LH = 880;
class World {
  stage: Stage; wall: Panel; lyrics = new X9Lyrics(); times: X9Times; users = 0;
  constructor(ctx: SceneCtx) {
    this.stage = new Stage(ctx.renderer);
    this.wall = this.stage.addPanel(LW, LH, 1.25);
    this.times = resolveX9Times(ctx);
  }
}
let world: World | undefined;

export default class S10Redwall extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() {
    if (--this.w.users === 0) { this.w.lyrics.dispose(); this.w.stage.dispose(); world = undefined; }
  }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { stage, wall, times: T } = this.w, au = this.ctx.audio, t = f.t;
    const s = redwallState(au, t, T), fr = frameOn(stage.pw, stage.ph), c = stage.poster;
    stage.clearPoster(); drawGrid(c, stage.pw, stage.ph);
    disc(c, fr.x + 350, fr.y + 730, 310);
    bigType(c, 'TESTS', fr.x - 35, fr.y + 1070, { size: 330 });
    // This counter is a test result, so its only semantic colour is the fail token.
    if (s.rows > 0) {
      c.save(); c.translate(fr.x + 90, fr.y + 580);
      const scale = 1 + 0.16 * ease.outBack(beatSpan(au, t, T.nineteen, 0.75)) + 0.2 * s.impact;
      c.scale(scale, scale); c.globalAlpha = 1 - s.fracture;
      c.fillStyle = css('fail'); c.font = font(F.archivo(75, 900), 390); c.fillText(String(s.rows), 0, 0);
      c.font = font(F.mono(600), 56); c.fillText('failed', 0, 74); c.restore();
    }
    const px = 12;
    Clawd.draw(c, fr.x + 175, fr.y + 790, Clawd.pose('A8', { beat: f.beat, beat0: au.beatAt(T.nineteen), p: s.fracture }), { px });
    wall.clear();
    drawTestList(wall.ctx, { x: 0, y: 0, width: LW, height: LH }, {
      defaultStatus: 'fail', visibleCount: s.rows, fracture: s.fracture, showCount: true,
    });
    wall.update({ x: fr.x + 1330, y: fr.y + 575, z: 70, rz: -1,
      alpha: 1 - span(s.fracture, 0.65, 1), visible: s.fracture < 1 });
    const wide = { x: stage.pw / 2, y: stage.ph / 2 + 30, zoom: 1 };
    stage.view(mixView({ ...wide, x: wide.x - 70, zoom: 1.12 }, wide, ease.outCubic(beatSpan(au, t, T.shatter, 1))));
    stage.render(out); this.w.lyrics.draw(this.ctx, t, out);
    const k = 17 * s.impact + 10 * beatHit(au, t, T.shatter), fi = frameIdx(t);
    return { ...POSTER_POST, hud: 0, shake: [k * (hash(fi, 10) * 2 - 1), k * (hash(fi, 11) * 2 - 1)] as [number, number] };
  }
}
