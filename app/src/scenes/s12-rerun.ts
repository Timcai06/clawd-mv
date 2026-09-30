// S12: repeated terminal commands become increasingly damaged photocopies.
// Clear sweeps real cache entries away. Archivo counts eleven legs against an expected ten.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, makeRT } from '../engine/gl';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { F, font } from '../engine/type';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { drawCursor, blink } from '../kit/cursor';
import { afterBeats, beatsSince } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { beatHit, beatSpan, rerunState, resolveX9Times, type X9Times } from './s09-z-shared';
import { CopyPass, copySettings } from './parts/s12-copy';
import { mono, sungLine } from './parts/s09-type';

const CACHE = ['month.test.ts', 'month.ts', 'calendar.json', 'test-results.json'];
export function countTypography(number: number, phase: number, extraAge: number) {
  const p = number === 11 ? Math.min(1, Math.max(0, extraAge / 0.6)) : (phase * 10) % 1;
  return { width: lerp(62, 125, ease.outExpo(p)), weight: lerp(300, 900, ease.outCubic(p)),
    scale: 1 + 0.1 * Math.sin(Math.PI * p) };
}
class World {
  ground = new Ground(); groundRT = makeRT(); copy = new CopyPass();
  layer = new Layer2D(); clean = new Layer2D(); times: X9Times; users = 0;
  constructor(ctx: SceneCtx) { this.times = resolveX9Times(ctx); }
  dispose() {
    this.ground.pass.mat.dispose(); this.groundRT.dispose(); this.copy.pass.mat.dispose();
    this.layer.texture.dispose(); this.clean.texture.dispose();
  }
}
let world: World | undefined;
export default class S12Rerun extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio, t = f.t, s = rerunState(au, t, T);
    const run = Math.max(0, s.run), punch = ease.outExpo(beatSpan(au, t, T.runs[run], 0.4));
    const zoom = s.clearing ? 1 : lerp(run === 0 ? 1 : [1.05, 1.48][run - 1]!, s.zoom, punch);
    const count = ease.outExpo(beatSpan(au, t, T.count, 0.5));
    w.ground.render(this.ctx.renderer, w.groundRT, { kind: 'paper', t, camX: run * 70 + s.clear * 260,
      camY: 30 * beatsSince(au, t, T.runs[0]), zoom, kick: f.a.kick, grid: 0.25,
      halftone: s.clearing ? 0.15 : 0.3 + run * 0.15, pitch: 12 });
    w.layer.clear(); const c = w.layer.ctx;
    if (t < T.count) {
      if (!s.clearing) {
        // Each old command is an actual printed sheet behind the next copy.
        for (let i = 0; i <= run; i++) {
          const active = i === run, localZoom = active ? zoom : 1 + i * 0.12;
          c.save(); c.translate(960 + (i - run) * 75, 540 + (i - run) * 50);
          c.rotate((i - run) * -0.035); c.scale(localZoom, localZoom); c.translate(-960, -540);
          c.fillStyle = css('paper'); c.fillRect(260, 225, 1390, 665);
          c.globalAlpha = active ? 1 : 0.33;
          mono(c, `TEST RUN / COPY ${String(i + 1).padStart(2, '0')}`, 315, 282, 22);
          mono(c, 'calendar / month.test.ts', 315, 330, 18, 'ink', 0.55);
          const chars = active ? s.chars : 8;
          c.font = font(F.mono(600), 58); c.fillStyle = css('ink');
          const command = '$ ' + 'npm test'.slice(0, chars); c.fillText(command, 315, 440);
          if (active && !s.result) drawCursor(c, { x: 330 + c.measureText(command).width,
            y: 440, h: 48, on: blink(f.beat, chars < 8) });
          const result = !active || s.result;
          if (result) {
            // Enlarging this failed-result surface is the only use of a red flood.
            const red = active ? s.red : [0.12, 0.45, 1][i]!;
            const rw = lerp(740, 1390, red), rh = lerp(180, 420, red);
            c.fillStyle = css('fail'); c.fillRect(260, 477, rw, rh);
            c.fillStyle = css('paper'); c.font = font(F.archivo(75, 900), lerp(104, 164, red));
            c.fillText('19 FAILED', 315, 608 + red * 76);
            mono(c, 'EXPECTED 31 / RECEIVED 32', 319, 655 + red * 110, 20, 'paper');
          }
          // The sung rerun line is printed on each generation, not an unrelated subtitle.
          if (active) sungLine(c, this.ctx, t, 315, 850, 1250, 'ink', 26);
          c.restore();
        }
        if (run === 2 && s.result) {
          // The third copy is now a full-frame failed-test report, not a red ground.
          c.fillStyle = css('fail'); c.fillRect(0, 0, 1920, 1080);
          mono(c, 'TEST RUN / COPY 03 / calendar / month.test.ts', 120, 130, 23, 'paper');
          mono(c, '$ npm test', 120, 240, 68, 'paper');
          c.fillStyle = css('paper'); c.font = font(F.archivo(75, 900), 320);
          c.fillText('19 FAILED', 105, 650);
          mono(c, 'EXPECTED 31 / RECEIVED 32', 120, 755, 34, 'paper');
          sungLine(c, this.ctx, t, 120, 950, 1680, 'paper', 33);
        }
      } else {
        mono(c, '$ npm cache clean --force', 260, 262, 38);
        mono(c, 'CACHE / PURGE', 260, 340, 18, 'ink', 0.5);
        c.save(); c.beginPath(); c.rect(260 + 1390 * s.clear, 370, 1390 * (1 - s.clear), 425); c.clip();
        for (const [i, file] of CACHE.entries()) {
          const y = 418 + i * 82;
          c.fillStyle = css('ink', 0.06); c.fillRect(260, y - 34, 1390, 65);
          mono(c, `node_modules/.cache/${file}`, 300, y, 27);
          mono(c, 'CACHED', 1430, y, 18, 'ink', 0.45);
        }
        c.restore();
        c.fillStyle = css('clay'); c.fillRect(260 + 1390 * s.clear, 370, 4, 425);
        drawCursor(c, { x: 260 + 1390 * s.clear - 10, y: 819, h: 35 });
        if (s.clear === 1) mono(c, 'CACHE CLEARED / 0 ENTRIES', 260, 435, 23, 'ink', 0.55);
        sungLine(c, this.ctx, t, 260, 930, 1390, 'ink', 29);
      }
    }
    const settings = copySettings(s.run, s.clearing), u = w.copy.pass.u;
    u.ground!.value = w.groundRT.texture; u.copy!.value = w.layer.upload();
    for (const [key, value] of Object.entries(settings)) u[key]!.value = value;
    u.frame!.value = frameIdx(t); u.feed!.value = au.beatAt(t) * 0.04;
    w.copy.pass.render(this.ctx.renderer, out);
    w.clean.clear(); const cc = w.clean.ctx;
    if (s.number > 0) {
      const extraAge = beatsSince(au, t, T.eleven), type = countTypography(s.number, s.countPhase, extraAge);
      const extra = s.number === 11, flash = extra && t < afterBeats(au, T.eleven, 0.5);
      cc.save(); cc.translate(960, 495); cc.scale(type.scale * count, count);
      cc.font = font(F.archivo(type.width, type.weight), 470);
      cc.fillStyle = css(flash ? 'fail' : 'ink'); cc.textAlign = 'center'; cc.fillText(String(s.number), 0, 0);
      cc.restore();
      Clawd.draw(cc, 960 - Clawd.W * 19 / 2, 660, Clawd.pose('A9', {
        beat: s.number, beat0: 0, p: s.countPhase,
      }), { px: 19 });
      // A9 remains the canonical sprite; closed eyes use the official sleep eye cells.
      mono(cc, extra ? 'COUNT ASSERTION / EXPECTED 10 / RECEIVED 11' : 'COUNT / EXPECTED 10',
        extra ? 540 : 750, 848, 22, extra ? 'fail' : 'ink', extra ? 1 : 0.5);
      sungLine(cc, this.ctx, t, 420, 962, 1140, 'ink', 29);
      cc.strokeStyle = css('ink', 0.25); cc.lineWidth = 1; cc.beginPath();
      cc.moveTo(420, 892); cc.lineTo(1500, 892); cc.stroke();
      for (let i = 0; i < 11; i++) {
        cc.fillStyle = css(i === 10 && extra ? 'fail' : 'ink', i < s.number ? 0.8 : 0.12);
        cc.fillRect(420 + i * 100, 895, 70, 3);
      }
    } else {
      Clawd.draw(cc, 125, 765, Clawd.pose(s.clearing ? 'A3' : 'A8', {
        beat: f.beat, beat0: au.beatAt(T.runs[0]), p: 0,
      }), { px: 11 });
    }
    this.ctx.comp.draw(this.ctx.renderer, w.clean.upload(), out);
    const k = s.clearing ? 0 : (5 + run * 4) * beatHit(au, t, T.runs[run]), fi = frameIdx(t);
    return { ...postFor('paper'), hud: 0, grain: 0.035,
      shake: [k * (hash(fi, 31) * 2 - 1), k * (hash(fi, 32) * 2 - 1)] as [number, number] };
  }
}
