// S09-1..2: the terminal rises, types the command, then waits one dot per measured beat.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { lerp } from '../engine/util';
import { POSTER_POST, INK_SOFT } from '../theme';
import { Stage, type Panel } from '../kit/stage';
import { bigType, disc, drawGrid, frameOn } from '../kit/poster';
import { drawTerminal } from '../kit/terminal';
import { beatsSince } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { resolveX9Times, terminalState, X9Lyrics, type X9Times } from './s09-z-shared';

const TW = 1400, TH = 780, PX = 12;
class World {
  stage: Stage; terminal: Panel; lyrics = new X9Lyrics(); times: X9Times; users = 0;
  constructor(ctx: SceneCtx) {
    this.stage = new Stage(ctx.renderer);
    this.terminal = this.stage.addPanel(TW, TH, 1.5);
    this.times = resolveX9Times(ctx);
  }
}
let world: World | undefined;

export default class S09Terminal extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() {
    if (--this.w.users === 0) { this.w.lyrics.dispose(); this.w.stage.dispose(); world = undefined; }
  }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { stage, terminal, times: T } = this.w, au = this.ctx.audio, t = f.t;
    const s = terminalState(au, t, T), fr = frameOn(stage.pw, stage.ph);
    stage.clearPoster();
    drawGrid(stage.poster, stage.pw, stage.ph);
    bigType(stage.poster, 'TEST', fr.x - 20, fr.y + 1030, { size: 430, alpha: INK_SOFT.faint });
    disc(stage.poster, fr.x + 1640, fr.y + 850, 290);

    terminal.clear();
    drawTerminal(terminal.ctx, { x: 0, y: 150, width: TW, height: TH - 150 }, {
      command: 'npm test', commandChars: s.chars, fontSize: 26, lineHeight: 44,
      cursorVisible: Math.floor(beatsSince(au, t, T.terminal) * 2) % 2 === 0,
      lines: s.dots ? [{ kind: 'text', text: '> calendar / month.test.ts', muted: true },
        { kind: 'text', text: 'RUNNING  ' + '. '.repeat(s.dots) }] : [],
    });
    Clawd.draw(terminal.ctx, 190, 150 - Clawd.H * PX, Clawd.pose(t < T.waiting ? 'A4' : 'A3', {
      beat: f.beat, beat0: au.beatAt(T.terminal), p: s.push, look: t >= T.waiting ? 1 : 0,
    }), { px: PX });
    const x = stage.pw / 2 + 120, y = stage.ph / 2 + 40;
    terminal.update({ x, y: y + (1 - s.rise) * 1100, z: 65, rz: 0 });
    stage.view({ x: lerp(stage.pw / 2, x - 100, s.push), y: lerp(stage.ph / 2, y - 65, s.push), zoom: lerp(1, 1.22, s.push) });
    stage.render(out);
    this.w.lyrics.draw(this.ctx, t, out);
    return { ...POSTER_POST, hud: 0 };
  }
}
