// Dev gallery: the three live grounds and the cursor. 0-4 s PAPER (halftone), 4-8 s INK (haze,
// streaks, glowing cursor with a trail), 8-10 s CLAY flood, 10-12 s INK->PAPER wipe flip.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { span } from '../kit/time';
import { Ground, GlowLayer, postFor, type GroundKind } from '../kit/ground';
import { drawCursor, drawTrail, blink } from '../kit/cursor';
import { bigType, caption } from '../kit/poster';

export default class GalleryGround extends Scene {
  ground = new Ground();
  layer = new Layer2D();
  glow = new GlowLayer();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t;
    const kind: GroundKind = t < 4 ? 'paper' : t < 8 ? 'ink' : t < 10 ? 'clay' : 'ink';
    this.ground.render(this.ctx.renderer, out, {
      kind, t, camX: t * 40, camY: kind === 'ink' ? t * 120 : 0, kick: f.a.kick, streaks: kind === 'ink' ? 1 : 0,
      travel: t * 0.8, halftone: kind === 'paper' ? 1 : kind === 'clay' ? 0.6 : 0, haze: 0.8,
      flipTo: t >= 10 ? 'paper' : undefined, wipe: t >= 10 ? span(t, 10, 10.6) : undefined,
    });
    const c = this.layer.ctx;
    this.layer.clear();
    const fgTok = kind === 'paper' ? 'ink' : 'paper';
    bigType(c, kind.toUpperCase(), 60, 1000, { size: 300, color: fgTok });
    caption(c, `ground: ${kind} · t ${t.toFixed(2)}`, 80, 80, 22);
    const pts: [number, number][] = [[300, 700], [700, 700], [700, 400], [1300, 400], [1300, 250]];
    const head = drawTrail(c, pts, span(t % 4, 0.2, 3.2), { width: 2 });
    drawCursor(c, { x: head[0], y: head[1], h: 46, on: blink(f.beat) });
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out);
    if (kind === 'ink') {
      this.glow.clear();
      drawTrail(this.glow.ctx, pts, span(t % 4, 0.2, 3.2), { width: 6, alpha: 0.6 });
      drawCursor(this.glow.ctx, { x: head[0], y: head[1], h: 46, on: blink(f.beat) });
      this.glow.composite(this.ctx, out);
    }
    return { ...postFor(kind), hud: 0 };
  }
}
