// Three simultaneous fixtures: a typed command, nineteen failures, nineteen passes.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawTerminal } from '../kit/terminal';
import { testOutput } from '../kit/content';

export default class GalleryTerminal extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper'));
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.font = font(F.archivo(100, 900), 52); c.fillStyle = css('ink');
    c.fillText('TERMINAL / CALENDAR', 48, 79);
    c.font = font(F.mono(), 16); c.fillStyle = css('ink', INK_SOFT.strong);
    c.fillText('01  INPUT', 48, 140);
    c.fillText('02  NINETEEN FAILED', 680, 140);
    c.fillText('03  NINETEEN PASSED', 1296, 140);
    drawTerminal(c, { x: 48, y: 160, width: 568, height: 255 }, {
      scale: 0.8, prompt: 'clawd $', command: 'npm test', commandChars: Math.floor(8 * prog(f.t, 0, 3)), cursorVisible: true,
      lines: f.t >= 3 ? [{ kind: 'text', text: 'Running calendar tests...', muted: true }] : [],
    });
    drawTerminal(c, { x: 680, y: 160, width: 568, height: 854 }, {
      scale: 0.8, prompt: 'clawd $', command: 'npm test', fontSize: 18, lineHeight: 39, lines: testOutput('fail'),
    });
    drawTerminal(c, { x: 1296, y: 160, width: 568, height: 854 }, {
      scale: 0.8, prompt: 'clawd $', command: 'npm test', fontSize: 18, lineHeight: 39, lines: testOutput('pass'),
    });
    c.font = font(F.archivo(100, 900), 82); c.fillStyle = css('ink'); c.fillText('npm test', 48, 581);
    c.font = font(F.mono(), 18); c.fillStyle = css('ink', INK_SOFT.strong);
    c.fillText('src/calendar/month.test.ts', 48, 637);
    c.fillText('render → buildMonth → daysIn', 48, 676);
    c.fillText('October 2026', 48, 973);
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }

  override dispose() { this.layer.texture.dispose(); }
}
