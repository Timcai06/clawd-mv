// S14 — open, engraved stack frames projected down into a vertical shaft.
// Geometry is calibrated to kf-S14 and shared with the nonvisual composition tests.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { hash } from '../engine/util';
import { css, lin } from '../theme';
import { GlowLayer, postFor } from '../kit/ground';
import { Voice, Plate, drawSet, setLine } from '../kit/lyric-moves';
import { fillRun, varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { diveScore, type DiveScore } from './parts/s14-score';
import { frameAt, handoffIn, handoffOut, shaftState, VP, TYPE_LEVELS as PRINT_LEVELS, LYRIC_SIZE, type Point } from './parts/s14-layout';
export const TYPE_LEVELS = { ...PRINT_LEVELS };

const BG = /* glsl */ `
uniform vec3 ink, paper;
uniform float travel, stopped;
void main() {
  vec2 p = FRAG_PX;
  float fibre = hash12(floor(p * vec2(0.7, 1.9)));
  // Printed grain is stationary on the sheet; the construction grid moves with depth.
  vec2 q = p + vec2(travel * 24.0, travel * 170.0);
  float gx = pxLine(abs(fract(q.x / 110.0 + 0.5) - 0.5) * 110.0, 0.0, 0.65);
  float gy = pxLine(abs(fract(q.y / 190.0 + 0.5) - 0.5) * 190.0, 0.0, 0.65);
  float column = step(0.982, hash11(floor(p.x / 12.0)));
  float stripe = column * step(0.38, fract(p.y / 560.0 + travel)) * (1.0 - stopped);
  fragColor = vec4(mix(ink, paper, fibre * 0.016 + max(gx, gy) * 0.028 + stripe * 0.11), 1.0);
}`;

function path(c: CanvasRenderingContext2D, points: Point[]) {
  c.beginPath(); c.moveTo(points[0]!.x, points[0]!.y);
  for (const p of points.slice(1)) c.lineTo(p.x, p.y);
  c.closePath();
}
function segment(c: CanvasRenderingContext2D, a: Point, b: Point) {
  c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
}

class World {
  users = 0;
  T: DiveScore;
  voice: Voice;
  bg = new FSPass(BG, { ink: { value: new THREE.Vector3(...lin('ink')) },
    paper: { value: new THREE.Vector3(...lin('paper')) }, travel: { value: 0 }, stopped: { value: 0 } });
  layer = new Layer2D();
  walls = new Layer2D();
  plate = new Plate(1200, 300);
  glow = new GlowLayer();
  constructor(ctx: SceneCtx) {
    this.T = diveScore(ctx.audio, ctx.lyrics);
    this.voice = new Voice(ctx.lyrics, ctx.audio);
    const c = this.walls.ctx;
    // Four engraved uprights: open centres are never filled by solid slabs.
    const strips = [
      [{ x: -65, y: -90 }, { x: 64, y: -90 }, { x: 820, y: 1120 }, { x: 794, y: 1120 }],
      [{ x: 1590, y: -90 }, { x: 1668, y: -90 }, { x: 1070, y: 1120 }, { x: 1034, y: 1120 }],
      [{ x: 1872, y: -90 }, { x: 1912, y: -90 }, { x: 1097, y: 1120 }, { x: 1070, y: 1120 }],
    ];
    for (const [id, points] of strips.entries()) {
      c.save(); path(c, points); c.clip();
      c.fillStyle = css('paper', 0.04); c.fillRect(0, 0, W, H);
      c.strokeStyle = css('paper', 0.38); c.lineWidth = 0.7;
      for (let i = -500; i < 2300; i += 4) {
        const a = { x: i + hash(i, id) * 2, y: -50 };
        segment(c, a, { x: VP.x + (i - VP.x) * 0.14, y: 1100 });
      }
      c.fillStyle = css('paper', 0.34);
      for (let i = 0; i < 5000; i++) c.fillRect(hash(i, id, 1) * W, hash(i, id, 2) * H, 1.3, 1.8);
      c.restore(); c.strokeStyle = css('paper', 0.6); c.lineWidth = 1.3; path(c, points); c.stroke();
    }
    c.lineWidth = 0.7;
    for (let i = 0; i < 32; i++) {
      const x = i * 67 - 140;
      c.strokeStyle = css(i % 9 === 0 ? 'clay' : 'paper', i % 9 === 0 ? 0.65 : 0.18);
      segment(c, { x, y: -70 }, { x: VP.x + (x - VP.x) * 0.18, y: 1060 });
    }
  }
  dispose() {
    this.bg.mat.dispose(); this.layer.texture.dispose(); this.walls.texture.dispose(); this.glow.layer.texture.dispose();
  }
}
let world: World | undefined;

export default class S14Shaft extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.T, audio = this.ctx.audio, t = f.t;
    const s = shaftState(audio, t, T);
    w.bg.u.travel!.value = s.travel; w.bg.u.stopped!.value = s.stopped ? 1 : 0;
    w.bg.render(this.ctx.renderer, out);
    w.layer.clear(); w.glow.clear();
    const c = w.layer.ctx;
    c.globalAlpha = s.enter; c.drawImage(w.walls.canvas, 0, 0, W, H); c.globalAlpha = 1;
    const incoming = handoffIn(t, audio, T);
    if (incoming.alpha > 0) {
      c.strokeStyle = css('paper', incoming.alpha * 0.5); c.lineWidth = 1;
      for (let i = -4; i < 30; i++) {
        const y = i * incoming.pitch + incoming.distance;
        segment(c, { x: 1210, y }, { x: 1830, y });
      }
    }
    // Painter order supplies distance fog with discrete printed densities, no lit surfaces.
    for (let depth = 23; depth >= 0; depth--) {
      const points = frameAt(depth, s.travel);
      if (points.some(p => !Number.isFinite(p.x))) continue;
      const alpha = s.enter * Math.exp(-Math.max(0, depth - s.travel) * 0.20);
      c.strokeStyle = css('paper', alpha * 0.75); c.lineWidth = depth < 3 ? 1.4 : 0.8;
      path(c, points); c.stroke();
      c.strokeStyle = css('paper', alpha * 0.19);
      path(c, points.map(p => ({ x: p.x, y: p.y + 4 / (1 + Math.max(0, depth)) }))); c.stroke();
      if (depth >= 0) {
        const next = frameAt(depth + 1, s.travel);
        for (const i of [0, 1, 2, 3]) {
          c.strokeStyle = css('paper', alpha * 0.27); c.lineWidth = 0.75;
          segment(c, points[i]!, next[i]!);
        }
      }
    }
    this.surfaces(f, s);
    // Canonical cells are rotated with the shaft; their exact drawn footprint is tested.
    const pose = Clawd.pose('A11', { beat: f.beat, beat0: audio.beatAt(T.down), p: 0, travel: 0 });
    c.save(); c.translate(s.cx, s.cy); c.rotate(s.roll);
    Clawd.draw(c, -8 * s.px, -2.5 * s.px, pose, { px: s.px, alpha: s.enter }); c.restore();
    c.strokeStyle = css('clay', s.enter); c.lineWidth = 1.6;
    segment(c, { x: s.cx + 19, y: -30 }, { x: s.cx + 14, y: s.cy - 118 });
    c.fillStyle = css('clay', s.enter); c.fillRect(s.cx + 4, s.cy - 135, 21, 38);
    const line = handoffOut(t, audio, T);
    for (const ctx of [c, w.glow.ctx]) {
      ctx.save(); ctx.translate((line.x0 + line.x1) / 2, line.y); ctx.rotate(line.roll);
      ctx.strokeStyle = css('clay', ctx === c ? 1 : 0.45); ctx.lineWidth = ctx === c ? 3 : 5;
      segment(ctx, { x: -(line.x1 - line.x0) / 2, y: 0 }, { x: (line.x1 - line.x0) / 2, y: 0 }); ctx.restore();
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.glow.composite(this.ctx, out, 1.15);
    return { ...postFor('ink'), hud: 0, frame: 0, bloom: 0.25, bloomThreshold: 1.06,
      grain: 0.035, vignette: 0, shake: [0, 0] as [number, number] };
  }

  private surfaces(f: Frame, state: ReturnType<typeof shaftState>) {
    const w = this.w, T = w.T, t = f.t, v = w.voice;
    const line = this.ctx.lyrics.lastLine(t);
    // Includes the S13 phrase still being sung at the first cut, without restarting its words.
    const presence = line ? v.presence(line, t, line.i === v.line('Frame by frame, and the bug is near').i ? T.end - line.end : 0.6) : 0;
    const forms = line ? v.forms(line, t) : [];
    const count = Math.max(3, forms.length);
    for (let depth = count - 1; depth >= 0; depth--) {
      const q = frameAt(depth, state.travel), a = q[0]!, b = q[1]!, d = q[3]!;
      const c = w.plate.ctx; w.plate.clear();
      c.fillStyle = css('paper', 0.55);
      if (depth < 3) {
        fillRun(c, varRun(String(3 - depth).padStart(2, '0'), LYRIC_SIZE, { wdth: 100, wght: 900 }), 24, 94);
        // Two surface metadata labels; all other ornament / HUD labels were removed.
        if (depth < 2) {
          c.font = font(F.mono(500), TYPE_LEVELS.label);
          c.fillText(depth === 0 ? 'render()' : 'buildMonth()', 24, 143);
        }
        c.fillRect(24, 166, 220, 1);
      }
      if (presence > 0) {
        if (state.stopped && depth === 0) {
          // On near the complete phrase freezes on the nearest surface, two lyric-tier rows.
          const rows = [forms.slice(0, 3), forms.slice(3)];
          rows.forEach((row, i) => drawSet(c, setLine(row, LYRIC_SIZE, { space: 0.2 }), 255, 125 + i * 125,
            { on: 'ink', alpha: presence }));
        } else if (!state.stopped && forms[depth]) {
          const form = forms[depth]!;
          drawSet(c, setLine([form], LYRIC_SIZE), 24, 280, { on: 'ink', alpha: presence });
        }
      }
      const target = w.layer.ctx;
      target.save(); path(target, q); target.clip();
      // UV plate on the projected floor. Local print coordinates follow both camera axes.
      target.transform((b.x - a.x) / 1200, (b.y - a.y) / 1200,
        (d.x - a.x) / 300, (d.y - a.y) / 300, a.x, a.y);
      target.globalAlpha = state.enter * Math.exp(-depth * 0.10);
      target.drawImage(w.plate.canvas, 0, 0, 1200, 300); target.restore();
    }
  }
}
