import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawGitGraph, type GitGraphState } from '../kit/gitgraph';

export function galleryGitGraphState(t: number): GitGraphState {
  return { commitCount: Math.floor(3 * prog(t, 0, 2)), merge: prog(t, 2, 5), confetti: prog(t, 5, 9) };
}

export default class GalleryGitGraph extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('GIT GRAPH / MERGED AND FREE', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S17 · MAIN ← FIX/OCTOBER-32', 48, 134);
    drawGitGraph(c, { x: 180, y: 185, width: 1560, height: 874 }, galleryGitGraphState(f.t));
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
