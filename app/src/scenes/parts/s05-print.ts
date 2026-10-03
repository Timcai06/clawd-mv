// B-group print geometry. Layouts and drawing use these same transforms, so acceptance
// measures the objects actually submitted to Canvas / GL, not a separate mock layout.
import type { Rect } from '../../kit/handoff';
import { fillRun, runPath, type VarRun } from '../../kit/vartype';
import { css } from '../../theme';

export function clipBox(b: Rect): Rect {
  const x = Math.max(0, b.x), y = Math.max(0, b.y);
  return { x, y, w: Math.max(0, Math.min(1920, b.x + b.w) - x), h: Math.max(0, Math.min(1080, b.y + b.h) - y) };
}

export function unionBoxes(boxes: Rect[]): Rect {
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}

/** Control hull of the interpolated outlines, in run px (conservative for curves). */
export function inkBox(run: VarRun): Rect {
  const points = run.glyphs.flatMap(g => Array.from(g.o.xy).reduce<{ x: number; y: number }[]>((a, v, i, xy) => {
    if (i % 2 === 0) a.push({ x: g.x + v * run.size / 1000, y: xy[i + 1]! * run.size / 1000 });
    return a;
  }, []));
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, w: Math.max(...points.map(p => p.x)) - x, h: Math.max(...points.map(p => p.y)) - y };
}

/** Fit the ink hull, rather than the font's advance or baseline, to the print rectangle. */
export function printRun(c: CanvasRenderingContext2D, run: VarRun, box: Rect, hatch = false) {
  const b = inkBox(run);
  c.save(); c.translate(box.x, box.y); c.scale(box.w / b.w, box.h / b.h); c.translate(-b.x, -b.y);
  fillRun(c, run);
  if (hatch) {
    c.clip(runPath(run)); c.strokeStyle = css('ink', 0.85); c.lineWidth = b.h / box.h;
    c.beginPath();
    for (let y = b.y + b.h * 0.18; y < b.y + b.h; y += b.h / box.h * 5) {
      c.moveTo(b.x, y); c.lineTo(b.x + b.w, y);
    }
    c.stroke();
  }
  c.restore();
}

export function hatchBlock(c: CanvasRenderingContext2D, b: Rect, alpha: number, pitch = 12) {
  c.save(); c.beginPath(); c.rect(b.x, b.y, b.w, b.h); c.clip();
  c.strokeStyle = css('paper', alpha); c.lineWidth = 1; c.beginPath();
  for (let x = b.x - b.h; x < b.x + b.w; x += pitch) {
    c.moveTo(x, b.y + b.h); c.lineTo(x + b.h, b.y);
  }
  c.stroke(); c.restore();
}
