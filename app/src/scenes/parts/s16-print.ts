// Dry ink, sharp engraved slab sides and flat hatched shadows. Shared only within F.
import { hash } from '../../engine/util';
import { css } from '../../theme';
import { F, font } from '../../engine/type';
import { fillRun, runPath, type VarRun } from '../../kit/vartype';
import type { Rect, Pt } from '../../kit/handoff';
import type { Domino } from './s16-green-state';

export function polygon(c: CanvasRenderingContext2D, points: readonly Pt[]) {
  c.beginPath(); c.moveTo(points[0]!.x, points[0]!.y);
  for (const p of points.slice(1)) c.lineTo(p.x, p.y);
  c.closePath();
}

// Bounds of the actual outline's control hull, not its advance width. Both the painter and
// tests use this transform, so bearings and descenders cannot shift the measured layout.
export function inkBounds(run: VarRun): Rect {
  const points: Pt[] = [];
  for (const g of run.glyphs) for (let i = 0; i < g.o.xy.length; i += 2)
    points.push({ x: g.x + g.o.xy[i]! * run.size / 1000, y: g.o.xy[i + 1]! * run.size / 1000 });
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function printTransform(run: VarRun, box: Rect) {
  const b = inkBounds(run), sx = box.w / b.w, sy = box.h / b.h;
  return { sx, sy, tx: box.x - b.x * sx, ty: box.y - b.y * sy };
}

export function printedPoints(run: VarRun, box: Rect): Pt[] {
  const m = printTransform(run, box), points: Pt[] = [];
  for (const g of run.glyphs) for (let i = 0; i < g.o.xy.length; i += 2)
    points.push({ x: m.tx + m.sx * (g.x + g.o.xy[i]! * run.size / 1000),
      y: m.ty + m.sy * g.o.xy[i + 1]! * run.size / 1000 });
  return points;
}

export function printRun(c: CanvasRenderingContext2D, run: VarRun, box: Rect,
  color: 'ink' | 'paper' | 'clay' | 'pass' | 'fail', seed: number, alpha = 1) {
  const b = inkBounds(run), m = printTransform(run, box);
  c.save(); c.transform(m.sx, 0, 0, m.sy, m.tx, m.ty);
  c.globalAlpha = alpha; c.fillStyle = css(color); fillRun(c, run);
  c.clip(runPath(run)); c.fillStyle = css('paper', 0.3);
  for (let i = 0; i < 550; i++) c.fillRect(b.x + hash(seed, i, 1) * b.w,
    b.y + hash(seed, i, 2) * b.h, 0.35 + hash(seed, i, 3) * 0.7, 0.4);
  c.restore();
}

export function drawDomino(c: CanvasRenderingContext2D, card: Domino, inkAlpha = 0.6) {
  const { front: p, side, i, passed, face: b } = card;
  // A projected shadow made of horizontal engraving strokes (no soft lighting).
  c.save(); c.strokeStyle = css('ink', 0.35); c.lineWidth = 0.8;
  for (let j = 0; j < 22; j++) {
    const y = p[3]!.y + card.thickness * j / 22;
    c.beginPath(); c.moveTo(p[3]!.x - b.h * 0.5, y); c.lineTo(p[2]!.x, y - 9); c.stroke();
  }
  polygon(c, side); c.fillStyle = css('ink'); c.fill(); c.clip();
  c.strokeStyle = css('paper', 0.75); c.lineWidth = 0.75;
  for (let x = b.x - b.h; x < b.x + b.w + b.h; x += 3) {
    c.beginPath(); c.moveTo(x, b.y); c.lineTo(x + b.h * 0.4, b.y + b.h + 35); c.stroke();
  }
  c.restore();
  c.save(); polygon(c, p); c.fillStyle = css('paper'); c.fill(); c.clip();
  c.fillStyle = css('ink', 0.08);
  for (let j = 0; j < 100; j++) c.fillRect(b.x + hash(i, j, 1) * b.w, b.y + hash(i, j, 2) * b.h, 1, 2);
  // Map the plate's square to the front's affine basis, preserving the slanted typography.
  c.transform(p[1]!.x - p[0]!.x, p[1]!.y - p[0]!.y,
    p[3]!.x - p[0]!.x, p[3]!.y - p[0]!.y, p[0]!.x, p[0]!.y);
  c.fillStyle = css('ink', inkAlpha); c.font = font(F.mono(600), 20 / Math.max(1, b.h));
  // Non-sung serial numbers have one annotation size, compensated for foreshortening.
  c.save(); c.scale(b.h / Math.max(1, p[1]!.x - p[0]!.x), 1);
  c.fillText(String(i + 1).padStart(2, '0'), 0.1 * (p[1]!.x - p[0]!.x) / b.h, 0.1); c.restore();
  c.strokeStyle = css(passed ? 'pass' : 'fail'); c.lineWidth = 0.105;
  c.beginPath();
  if (passed) { c.moveTo(0.19, 0.58); c.lineTo(0.43, 0.7); c.lineTo(0.8, 0.43); }
  else { c.moveTo(0.28, 0.48); c.lineTo(0.72, 0.67); c.moveTo(0.72, 0.48); c.lineTo(0.28, 0.67); }
  c.stroke(); c.restore();
}
