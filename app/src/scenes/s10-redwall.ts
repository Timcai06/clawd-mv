import { PrintOverlay } from '../kit/print-overlay';
// S10: upright foreshortened glass reports, engraved thickness and beat-driven shards.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { ease, hash, lerp } from '../engine/util';
import { span } from '../kit/time';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { Voice, setLine, drawSet, odometer } from '../kit/lyric-moves';
import * as Clawd from '../kit/clawd';
import { CALENDAR_TESTS } from '../kit/content';
import { resolveX9Times, type X9Times } from './s09-z-shared';
import { glassState, glassShardState, glassTriangles, handoffIn, handoffOut, fallTravel, type Point } from './parts/s10-glass';
import { carry, mono, counter19, exitBeat } from './parts/s09-type';
// Archivo levels are cap heights; Plex label=18 is its CSS font size.
export const TYPE_LEVELS = { giant: null, lyric: 65.856, label: 18 };
const polygon = (c: CanvasRenderingContext2D, pts: Point[]) => {
  c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath();
};
class World {
  print = new PrintOverlay();
  ground = new Ground(); layer = new Layer2D(); times: X9Times; voice: Voice; users = 0;
  hatch: CanvasPattern;
  constructor(ctx: SceneCtx) {
    this.times = resolveX9Times(ctx); this.voice = new Voice(ctx.lyrics, ctx.audio);
    const tile = document.createElement('canvas'); tile.width = tile.height = 48;
    const c = tile.getContext('2d')!; c.fillStyle = css('paper'); c.fillRect(0, 0, 48, 48);
    c.strokeStyle = css('ink', 0.9); c.lineWidth = 1;
    for (let i = -48; i < 96; i += 4) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 48, 48); c.stroke(); }
    this.hatch = this.layer.ctx.createPattern(tile, 'repeat')!;
  }
  dispose() { this.print.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); }
}
let world: World | undefined;
export default class S10Redwall extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio, t = f.t, v = w.voice;
    const s = glassState(au, t, T), hand = handoffOut(t, au, T), leaving = exitBeat(au, t, T.wallEnd);
    w.ground.render(this.ctx.renderer, out, { kind: 'paper', t, grid: 0, haze: 0, halftone: 0.12 });
    w.layer.clear(); const c = w.layer.ctx;
    const line = v.line('Nineteen red, and they’re shattering like glass');
    const set = setLine(v.forms(line, t).slice(1), 96, { space: 0.2 });
    // v4 motion: "Nineteen red" sweeps the lens down the row of plates; "shattering" throws it back
    // wide with a hit, then it drifts forward and rolls into the falling shards (the rain plate).
    const sweep = ease.inOutCubic(span(t, T.nineteen, T.shatter));
    const hit = t >= T.shatter ? Math.pow(0.5, (t - T.shatter) / 0.08) : 0;
    const fall = ease.inQuad(span(t, T.shatter, T.wallEnd));
    const zin = Math.sin(Math.PI * sweep);
    const zoom = 1 + 0.28 * zin + 0.12 * hit + 0.14 * fall;
    const fx = lerp(lerp(300, 1650, sweep), 960, t >= T.shatter ? 1 : 0), fy = 560 + 80 * fall;
    c.save(); c.translate(fx, fy); c.rotate(0.03 * fall - 0.015 * hit); c.scale(zoom, zoom); c.translate(-fx, -fy);
    // Plates from back to front. Each printed surface is clipped to its projected face.
    for (const p of [...s.plates].reverse()) {
      const q = p.quad, thick = 9 / p.depth;
      polygon(c, [q[0]!, [q[0]![0] - thick, q[0]![1] + 4], [q[3]![0] - thick, q[3]![1] + 4], q[3]!]);
      c.fillStyle = w.hatch; c.fill();
      // Jagged voids grow from the lower edge while the upper test label remains on its face.
      const face = () => {
        polygon(c, q);
        for (let j = 0; j < 2; j++) {
          const cx = p.x + p.w * (0.3 + j * 0.45), bottom = q[3]![1];
          const r = p.w * 0.22 * s.fracture, tip = p.y + p.h * (0.82 - 0.45 * s.fracture);
          c.moveTo(cx - r, bottom + 5); c.lineTo(cx, tip); c.lineTo(cx + r, bottom + 5); c.closePath();
        }
      };
      face(); c.fillStyle = css('paper'); c.fill('evenodd');
      c.strokeStyle = css('ink', 0.65); c.lineWidth = 1.4; c.stroke();
      c.save(); face(); c.clip('evenodd');
      // Low-density face engraving, distinct from densely engraved sides and shards.
      c.strokeStyle = css('ink', 0.13); c.lineWidth = 0.8;
      for (let i = -p.h; i < p.w; i += 6) {
        c.beginPath(); c.moveTo(p.x + i, p.y); c.lineTo(p.x + i + p.h, p.y + p.h); c.stroke();
      }
      const cx = p.x + p.w * 0.55, cy = p.y + 85 / p.depth, r = 21 / Math.sqrt(p.depth);
      c.strokeStyle = css('fail', 0.6); c.lineWidth = 7 / Math.sqrt(p.depth);
      c.beginPath(); c.moveTo(cx - r, cy - r); c.lineTo(cx + r, cy + r);
      c.moveTo(cx + r, cy - r); c.lineTo(cx - r, cy + r); c.stroke();
      c.save(); c.translate(p.x + 24 / p.depth, p.y + 142 / p.depth); c.rotate(0.12);
      c.scale(1 / Math.sqrt(p.depth), 1 / Math.sqrt(p.depth));
      mono(c, CALENDAR_TESTS[p.row]!, 0, 0, 18); c.restore();
      // The lyric is a single engraved strip crossing the plate faces; the gaps cut the words.
      drawSet(c, set, 96, 676, { on: 'paper' }); c.restore();
    }
    // Sharp triangular fragments from the bottom of each face, with solid engraved edge thickness.
    for (const p of s.plates) for (let piece = 0; piece < 8; piece++) {
      const id = p.row * 8 + piece, sh = glassShardState(p.row, piece, s.fracture);
      const travel = fallTravel(t, au, T), roll = hand.roll;
      const x = p.x + hash(id, 31) * p.w + sh.x + Math.sin(roll) * travel;
      const y = p.y + p.h * (0.3 + hash(id, 32) * 0.7) + sh.y + Math.cos(roll) * travel;
      const r = (18 + hash(id, 33) * 85) / Math.sqrt(p.depth) * s.fracture;
      c.save(); c.translate(x, y); c.rotate(sh.rz + roll * leaving);
      const source = glassTriangles(p.row)[piece]!;
      const cx = source.reduce((n, v) => n + v[0], 0) / 3, cy = source.reduce((n, v) => n + v[1], 0) / 3;
      const pts: Point[] = source.map(([x, y]) => [(x - cx) / 170 * r * 2, (y - cy) / 620 * r * 2]);
      polygon(c, pts.map(([x, y]) => [x + 4, y + 4])); c.fillStyle = css('ink'); c.fill();
      polygon(c, pts); c.fillStyle = w.hatch; c.fill();
      c.strokeStyle = css('ink', 0.8); c.lineWidth = 1; c.stroke();
      c.clip();
      // Torn letter portions move with the same shard as the toner that carried them.
      drawSet(c, set, 96 - x, 676 - y, { on: 'paper' }); c.restore();
    }
    c.restore();
    const n = handoffIn(t, au, T), first = v.form(line.words[0]!, t);
    if (t < line.start) counter19(c, n.x, n.baseline, n.capH, 'fail');
    else if (first.born > 0) odometer(c, 19 * first.sung, n.x, n.baseline, 196,
      { digits: 2, color: first.stress ? 'clay' : 'fail', on: 'paper', age: first.age, axes: first.axes, pitch: 98 });
    c.font = font(F.mono(700), 180); c.fillStyle = css('fail', 0.6); c.fillText('failed', 386, 204);
    c.fillStyle = css('clay'); c.fillRect(974, 76, 58, 135);
    carry(c, v, t, T.wallStart, 96, 348, 'paper');
    const crab = s.clawd; Clawd.draw(c, crab.x, crab.y + 40 * fall, crab.pose, { px: crab.px });
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.print.render(this.ctx.renderer, out);
    return { ...postFor('paper'), hud: 0, bloom: 0 };
  }
}
