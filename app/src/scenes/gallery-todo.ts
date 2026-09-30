import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { TODO_ITEMS } from '../kit/content';
import { drawTodo, type TodoState } from '../kit/todo';

export function galleryTodoState(t: number): TodoState {
  return { visibleCount: Math.min(3, Math.floor(t) + 1),
    chars: TODO_ITEMS.map((text, i) => Math.floor(text.length * prog(t, i, i + 0.8))),
    checks: TODO_ITEMS.map((_, i) => prog(t, 3 + i, 3.8 + i)) };
}

export default class GalleryTodo extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('TODO / THREE CHECKS', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S06', 48, 134);
    drawTodo(c, { x: 48, y: 280, width: 1200, height: 580 }, galleryTodoState(f.t));
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 16); c.fillText('COMPACT', 1370, 330);
    drawTodo(c, { x: 1370, y: 360, width: 480, height: 230 }, galleryTodoState(f.t));
    c.fillStyle = css('clay'); c.font = font(F.archivo(100, 900), 90); c.fillText('01 / 02 / 03', 48, 994);
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
