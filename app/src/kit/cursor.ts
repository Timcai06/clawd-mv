// The clay block cursor ▍ — the video's running motif (visual spec v2; pdoom's spark in our world).
// It blinks, it can drag a hairline trail behind it, and on INK it glows (draw it into a
// GlowLayer as well, see kit/ground.ts). Pure drawing functions; the scene decides where it is.
import { css } from '../theme';

export interface CursorState {
  x: number;
  y: number;
  /** Height in logical px (width is 0.55 of it). */
  h: number;
  /** Visible 0..1 (use blink() for the on/off rhythm). */
  on?: number;
  /** Solid colour token (default clay). */
  color?: 'clay' | 'ink' | 'paper';
}

/** Standard blink: on for the first half of every beat (pass Frame.beat). Always on while `hold`. */
export function blink(beat: number, hold = false): number {
  return hold ? 1 : beat - Math.floor(beat) < 0.5 ? 1 : 0;
}

export function drawCursor(c: CanvasRenderingContext2D, s: CursorState) {
  const on = s.on ?? 1;
  if (on <= 0) return;
  c.save();
  c.globalAlpha *= on;
  c.fillStyle = css(s.color ?? 'clay');
  c.fillRect(s.x, s.y - s.h, s.h * 0.55, s.h);
  c.restore();
}

/**
 * A hairline trail through `pts` (logical px), drawn up to `progress` (0..1 of its length),
 * with the cursor at its head. Returns the head position.
 */
export function drawTrail(c: CanvasRenderingContext2D, pts: readonly [number, number][], progress: number,
  o: { width?: number; color?: 'clay' | 'ink' | 'paper'; alpha?: number } = {}): [number, number] {
  if (pts.length === 0) return [0, 0];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]); seg.push(d); total += d; }
  let left = Math.max(0, Math.min(1, progress)) * total;
  c.save();
  c.strokeStyle = css(o.color ?? 'clay', o.alpha ?? 1);
  c.lineWidth = o.width ?? 2;
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(pts[0]![0], pts[0]![1]);
  let head: [number, number] = [pts[0]![0], pts[0]![1]];
  for (let i = 1; i < pts.length && left > 0; i++) {
    const d = seg[i - 1]!, k = Math.min(1, left / d);
    head = [pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * k, pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * k];
    c.lineTo(head[0], head[1]);
    left -= d;
  }
  c.stroke();
  c.restore();
  return head;
}
