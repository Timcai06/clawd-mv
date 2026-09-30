import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawCommitHash, drawGitLog, type GitLogState } from '../kit/gitlog';
import { COMMITS, GIT_LOG_COMMITS, PR_TITLE } from '../kit/content';

export function galleryGitLogState(t: number): GitLogState {
  return { rowCount: Math.floor(GIT_LOG_COMMITS.length * prog(t, 0, 8)),
    overflow: t >= 10 ? 0 : 16 * prog(t, 8, 10), color: t >= 10 ? 'clay' : 'ink' };
}

export default class GalleryGitLog extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('COMMIT / GIT LOG', 48, 79);
    c.font = font(F.mono(), 18); c.fillStyle = css('ink', INK_SOFT.strong); c.fillText('S08 · S13 · S17', 48, 134);
    const final = f.t >= 10;
    drawCommitHash(c, { x: 48, y: 280, width: 840, height: 340 }, {
      commit: final ? COMMITS[0] : { ...COMMITS[0], message: GIT_LOG_COMMITS[0].message },
      pop: prog(f.t, final ? 10 : 0, final ? 11 : 1), color: final ? 'clay' : 'ink',
    });
    drawGitLog(c, { x: 970, y: 190, width: 888, height: 760 }, galleryGitLogState(f.t));
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 700), 42); c.fillText(PR_TITLE, 48, 820);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText(GIT_LOG_COMMITS.slice(0, 3).map((commit) => commit.message).join(' / '), 48, 975);
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
