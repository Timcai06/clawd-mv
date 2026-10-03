// Group A's print geometry. Control-point bounds conservatively enclose the actual glyph ink.
import { hash } from '../../engine/util';
import { css } from '../../theme';
import { fillRun, varRun, type VarRun } from '../../kit/vartype';
import type { Rect } from '../../kit/handoff';
export function inkBounds(run: VarRun): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const s = run.size / 1000;
  for (const g of run.glyphs) for (let i = 0; i < g.o.xy.length; i += 2) {
    const x = g.x + g.o.xy[i]! * s, y = g.o.xy[i + 1]! * s;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export function printInBox(c: CanvasRenderingContext2D, run: VarRun, box: Rect) {
  const b = inkBounds(run);
  c.save(); c.translate(box.x, box.y); c.scale(box.w / b.w, box.h / b.h);
  fillRun(c, run, -b.x, -b.y); c.restore();
}
export function grain(c: CanvasRenderingContext2D, box: Rect, seed: number, n = 900) {
  c.save(); c.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) {
    c.globalAlpha = 0.15 + hash(seed, i, 3) * 0.5;
    const r = 0.5 + hash(seed, i, 4) ** 5 * 3;
    c.fillRect(box.x + hash(seed, i, 1) * box.w, box.y + hash(seed, i, 2) * box.h, r, r);
  }
  c.restore();
}
export function machineTitle(c: CanvasRenderingContext2D, text: string, box: Rect, alpha = 0.6) {
  c.save(); c.globalAlpha *= alpha; c.fillStyle = css('ink');
  printInBox(c, varRun(text, 100, { wdth: 75, wght: 900 }), box); c.restore();
}
export function mixRect(a: Rect, b: Rect, k: number): Rect {
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
}

// HANDOFF.cursor01 is a top-left rectangle; kit.drawCursor takes a bottom baseline.
export function cursorFromTop(p: {x:number;y:number;h:number}) { return {...p,y:p.y+p.h}; }
