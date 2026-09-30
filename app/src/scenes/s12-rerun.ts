// S12-1..5: three escalating attempts, a cache wipe, and an off-by-one counting hint.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { F, font } from '../engine/type';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { Stage, type Panel, type CameraView } from '../kit/stage';
import { bigType, disc, drawGrid, frameOn } from '../kit/poster';
import { drawTerminal, type TerminalLine } from '../kit/terminal';
import { afterBeats, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { beatHit, beatSpan, mixView, rerunState, resolveX9Times, X9Lyrics, type X9Times } from './s09-z-shared';

const TW = 1460, TH = 860, PX = 14;
const CACHE: TerminalLine[] = ['month.test.ts', 'month.ts', 'calendar.json', 'test-results.json'].map((file) => ({
  kind: 'text', text: `node_modules/.cache/${file}`, muted: true,
}));

class World {
  stage: Stage; terminal: Panel; lyrics = new X9Lyrics(); times: X9Times; users = 0;
  constructor(ctx: SceneCtx) {
    this.stage = new Stage(ctx.renderer);
    this.terminal = this.stage.addPanel(TW, TH, 1.5);
    this.times = resolveX9Times(ctx);
  }
}
let world: World | undefined;

export default class S12Rerun extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() {
    if (--this.w.users === 0) { this.w.lyrics.dispose(); this.w.stage.dispose(); world = undefined; }
  }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { stage, terminal, times: T } = this.w, au = this.ctx.audio, t = f.t;
    const s = rerunState(au, t, T), c = stage.poster, fr = frameOn(stage.pw, stage.ph);
    const tx = stage.pw / 2 + 110, ty = stage.ph / 2 + 90;
    const cx = fr.x + 470, cy = fr.y + 610;
    stage.clearPoster(); drawGrid(c, stage.pw, stage.ph);
    disc(c, fr.x + 1590, fr.y + 890, 315);
    bigType(c, s.clearing ? 'CLEAR' : 'AGAIN', fr.x - 30, fr.y + 1060, { size: 390, alpha: INK_SOFT.faint });

    terminal.clear();
    const box = { x: 0, y: 100, width: TW, height: TH - 100 };
    drawTerminal(terminal.ctx, box, { command: '', cursorVisible: s.clearing && s.clear === 1, fontSize: 24 });
    // Wipe actual cache entries, leaving the clean terminal beneath the moving edge.
    terminal.ctx.save(); terminal.ctx.beginPath();
    terminal.ctx.rect(TW * s.clear, 100, TW * (1 - s.clear), TH - 100); terminal.ctx.clip();
    const history: TerminalLine[] = T.runs.slice(0, Math.max(0, s.run)).flatMap(() => [
      { kind: 'text', text: '$ npm test' }, { kind: 'summary', failed: 19, passed: 0, total: 19 },
    ]);
    drawTerminal(terminal.ctx, box, {
      command: s.clearing ? 'npm cache clean --force' : 'npm test',
      commandChars: s.clearing ? undefined : s.chars,
      cursorVisible: !s.result && !s.clearing, fontSize: 24, lineHeight: 34,
      lines: s.clearing ? CACHE : [...history, ...(s.result ? [{ kind: 'summary', failed: 19, passed: 0, total: 19 } as TerminalLine] : []), ...CACHE],
    });
    if (s.result) {
      // Red belongs to this failed-test result surface; the paper and Clawd retain their tokens.
      const c2 = terminal.ctx, w = lerp(550, TW, s.red), h = lerp(180, TH - 200, s.red);
      c2.fillStyle = css('fail'); c2.fillRect((TW - w) / 2, 285, w, h);
      c2.fillStyle = css('paper'); c2.textAlign = 'center'; c2.textBaseline = 'middle';
      c2.font = font(F.archivo(75, 900), lerp(100, 215, s.red)); c2.fillText('19 FAILED', TW / 2, 285 + h / 2);
    }
    terminal.ctx.restore();
    const countReveal = ease.outCubic(beatSpan(au, t, T.count, 0.5));
    terminal.update({ x: tx + 900 * countReveal, y: ty, z: 60, rz: 0,
      alpha: 1 - countReveal, visible: countReveal < 1 });

    if (s.number > 0) {
      // A9 is driven by the same measured subdivision as the displayed count.
      Clawd.draw(c, cx, cy, Clawd.pose('A9', { beat: s.number, beat0: 0, p: s.countPhase }), { px: PX });
      c.save(); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      const extra = s.number === 11;
      c.fillStyle = css(extra && t < afterBeats(au, T.eleven, 0.5) ? 'fail' : 'ink');
      c.font = font(F.archivo(100, 900), 158); c.fillText(String(s.number), cx + Clawd.W * PX / 2, cy - 58);
      // The fail flash is an explicit count assertion, consistent with the semantic-colour rule.
      c.font = font(F.mono(500), 15); c.fillStyle = css(extra ? 'fail' : 'ink', extra ? 1 : INK_SOFT.strong);
      c.fillText(extra ? 'COUNT ASSERTION: expected 10, received 11' : 'COUNT / EXPECTED 10', cx + Clawd.W * PX / 2, cy + 120);
      c.restore();
    } else {
      Clawd.draw(c, fr.x + 170, fr.y + 700, Clawd.pose(s.clearing ? 'A3' : 'A8', {
        beat: f.beat, beat0: au.beatAt(T.runs[0]), p: 0,
      }), { px: PX });
    }

    const medium = { x: stage.pw / 2, y: stage.ph / 2 + 40, zoom: 1 };
    const target = { x: tx, y: ty + 80, zoom: s.zoom };
    let view: CameraView = target;
    if (s.run >= 0 && !s.clearing) {
      const previous = { ...target, zoom: s.run ? [1.05, 1.48][s.run - 1] : 1 };
      view = mixView(previous, target, ease.outCubic(beatSpan(au, t, T.runs[s.run], 0.5)));
    }
    if (s.clearing) view = mixView(target, medium, ease.outCubic(beatSpan(au, t, T.clear, 0.75)));
    if (t >= T.count) view = mixView(medium, { x: cx + Clawd.W * PX / 2, y: cy - 30, zoom: 2.3 },
      ease.outCubic(span(t, T.count, afterBeats(au, T.count, 0.6))));
    stage.view(view); stage.render(out); this.w.lyrics.draw(this.ctx, t, out);
    const k = s.clearing || s.run < 0 ? 0 : (5 + s.run * 4) * beatHit(au, t, T.runs[s.run]), fi = frameIdx(t);
    return { ...POSTER_POST, hud: 0, shake: [k * (hash(fi, 31) * 2 - 1), k * (hash(fi, 32) * 2 - 1)] as [number, number] };
  }
}
