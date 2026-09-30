// S11: a three-depth typographic storm drowns the cursor. Two vocal undefined hits
// land independently, then the camera rips back to leave canonical Clawd alone.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { F, font, fitSize } from '../engine/type';
import { css, lin } from '../theme';
import { Stage, type Panel } from '../kit/stage';
import { Ground, postFor } from '../kit/ground';
import { drawCursor, drawTrail } from '../kit/cursor';
import { afterBeats, beatsSince } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { beatSpan, mixView, rainState, resolveX9Times, type X9Times } from './s09-z-shared';
import { TextStorm } from './parts/s11-storm';
import { mono, sungLine } from './parts/s09-type';

const IW = 1600, IH = 700;
class World {
  ground = new Ground(); stage: Stage; storm: TextStorm; impact: Panel;
  layer = new Layer2D(); hot = new LineBatch(20, { blend: 'add' });
  times: X9Times; users = 0;
  constructor(ctx: SceneCtx) {
    this.stage = new Stage(ctx.renderer, 5760, 3240, true);
    this.storm = new TextStorm(ctx.renderer); this.stage.scene.add(this.storm.mesh);
    this.impact = this.stage.addPanel(IW, IH, 1.25);
    this.times = resolveX9Times(ctx);
  }
  dispose() {
    this.stage.scene.remove(this.storm.mesh); this.storm.dispose(); this.stage.dispose();
    this.ground.pass.mat.dispose(); this.layer.texture.dispose(); this.hot.geo.dispose(); this.hot.mat.dispose();
  }
}
let world: World | undefined;
export default class S11Rain extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio, t = f.t, s = rainState(au, t, T);
    const beat = beatsSince(au, t, T.stack), sky = ease.outExpo(beatSpan(au, t, T.sky, 0.6));
    const impactAt = afterBeats(au, T.impacts[0], -0.75);
    const wide = { x: 2880, y: 1620, zoom: 0.85, pitch: 0, yaw: 0 };
    const up = { ...wide, y: 1360, zoom: 1.0, pitch: -26, yaw: -9 };
    const medium = { ...wide, y: 1640, zoom: 1.12 };
    let view = mixView(wide, up, sky);
    if (t >= impactAt) view = mixView(up, medium, ease.outExpo(beatSpan(au, t, impactAt, 0.55)));
    if (t >= T.why) view = mixView(medium, { ...wide, zoom: 0.19 }, ease.outExpo(s.pull));
    w.ground.render(this.ctx.renderer, out, { kind: 'ink', t, camX: beat * 24,
      camY: beat * 64, zoom: view.zoom, grid: 0.24, haze: 0.7, hazeY: 0.2,
      streaks: 0.7 + 0.2 * f.a.kick, streakAngle: lerp(-0.08, 0.2, sky), travel: beat * 0.22,
      kick: f.a.kick });
    w.stage.clearPoster(); const p = w.stage.poster;
    // This trail is physically behind every rain band; it is progressively submerged.
    const flood = Math.max(0, 1 - beatSpan(au, t, T.stack, 5));
    const head = drawTrail(p, [[1800, 1830], [2500, 1830], [2680, 1710], [2880, 1710]],
      Math.min(1, Math.max(0, beat / 3)), { width: 2, alpha: flood });
    drawCursor(p, { x: head[0], y: head[1], h: 28, on: flood });
    // Architectural floor measures make the pullback legible without a giant poster word.
    p.strokeStyle = css('paper', 0.15); p.lineWidth = 1;
    for (let x = 1480; x < 4300; x += 280) {
      p.beginPath(); p.moveTo(x, 1860); p.lineTo(x, 1878); p.stroke();
    }
    p.beginPath(); p.moveTo(1300, 1860); p.lineTo(4460, 1860); p.stroke();
    mono(p, 'month.ts:42', 3010, 1860, 20, 'paper', 0.42);
    w.storm.update(beat, ease.outCubic(beatSpan(au, t, T.stack, 1)), sky);
    w.impact.clear(); const c = w.impact.ctx;
    const second = t >= afterBeats(au, T.impacts[1], -0.75);
    s.impacts.forEach((hit, i) => {
      if (!hit.visible) return;
      const lift = i === 0 && second ? 190 * ease.outExpo(beatSpan(au, t, afterBeats(au, T.impacts[1], -0.75), 0.6)) : 0;
      const fall = ease.inQuad(hit.fall), y = 415 - (1 - fall) * 1000 - lift;
      c.save(); c.translate(IW / 2, y); c.scale(1 + hit.squash * 0.08, 1 - hit.squash * 0.16);
      const family = F.archivo(i === 0 ? 75 : 87.5, 900);
      c.font = font(family, fitSize('undefined', family, IW - 100, 240));
      c.textAlign = 'center'; c.fillStyle = css('paper', i === 0 && second ? 0.36 : 1);
      c.fillText('undefined', 0, 0); c.restore();
    });
    const latest = second ? T.impacts[1] : T.impacts[0];
    const jumping = t >= afterBeats(au, latest, -0.75) && t < afterBeats(au, latest, 0.5);
    Clawd.draw(c, IW / 2 - 96, 440, Clawd.pose(t >= T.why ? 'A3' : jumping ? 'A6' : 'A7', {
      beat: f.beat, beat0: au.beatAt(latest) - 0.75, jumpBeats: 0.75, p: 0,
    }), { px: 12 });
    w.impact.update({ x: 2880, y: 1720, z: 35 }); w.impact.shadow.visible = false;
    w.stage.view(view); w.stage.render(out);
    w.layer.clear();
    const lc = w.layer.ctx;
    // Lyrics enter on a slanted storm lane, then recede with the lonely pullback.
    lc.save(); lc.translate(960, 150 + 160 * s.pull); lc.rotate(-0.035 * (1 - s.pull));
    lc.scale(1 - s.pull * 0.22, 1 - s.pull * 0.22);
    sungLine(lc, this.ctx, t, -780, 0, 1560, 'paper', 31); lc.restore();
    mono(lc, 'STACK TRACE / UNRESOLVED', 130, 930, 18, 'paper', 0.35);
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    // Clay-only HDR fades before the cursor is submerged; no white or error text glows.
    w.hot.clear();
    if (flood > 0) {
      w.stage.cam.updateMatrixWorld();
      const v = w.impact.mesh.position.clone().set(head[0] - 2880, 1620 - head[1], 0).project(w.stage.cam);
      const x = (v.x + 1) * 960, y = (1 - v.y) * 540;
      const clay = lin('clay').map(v => v * 3.4) as [number, number, number];
      w.hot.seg2(x, y - 12, x, y, 8, clay, flood); w.hot.render(this.ctx.renderer, out);
    }
    const k = 13 * Math.max(...s.impacts.map(hit => hit.squash)), fi = frameIdx(t);
    return { ...postFor('ink'), hud: 0, bloom: 0.4 * flood, bloomThreshold: 1.05, bloomKnee: 0.02,
      vignette: 0.12, shake: [k * (hash(fi, 21) * 2 - 1), k * (hash(fi, 22) * 2 - 1)] as [number, number] };
  }
}
