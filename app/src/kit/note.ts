// Deadpan annotation layer (v4 E, docs/reference/gap-v4-vs-pdoom.md §6): a small mono note with a
// hairline leader to the thing it is about, like pdoom's "grokking (?)" or "sharp minimum
// (generalizes poorly)". The leader draws out from a dot on the anchor, then the note types itself,
// then (optionally) fades. Pure function of t; drawn in the scene's own frame (so it moves with
// the scene's camera / lens).
import { F, font } from '../engine/type';
import { clamp, ease } from '../engine/util';
import { css } from '../theme';

export interface Note {
  /** The point the note is about, and where the note's text starts (logical px; baseline). */
  ax: number; ay: number; x: number; y: number;
  text: string; sub?: string;
  /** Leader starts at t0; optional fade-out end t1. */
  t0: number; t1?: number;
  on: 'ink' | 'paper' | 'clay';
  size?: number;
}

export function drawNote(c: CanvasRenderingContext2D, n: Note, t: number) {
  if (t < n.t0) return;
  const out = n.t1 === undefined ? 1 : 1 - clamp((t - (n.t1 - 0.2)) / 0.2);
  if (out <= 0) return;
  const fg = n.on === 'paper' ? 'ink' : 'paper';
  const size = n.size ?? 18;
  const lead = ease.outCubic(clamp((t - n.t0) / 0.16));
  const typed = clamp((t - n.t0 - 0.12) / 0.32);
  c.save();
  c.globalAlpha *= out;
  // anchor dot and the leader (an elbow: diagonal, then a short horizontal under the text start)
  c.strokeStyle = css(fg, 0.7); c.lineWidth = 1;
  c.beginPath(); c.arc(n.ax, n.ay, 3.5, 0, Math.PI * 2); c.stroke();
  const ex = n.x - 8, ey = n.y + 7;
  const kx = n.ax + (ex - n.ax) * lead, ky = n.ay + (ey - n.ay) * lead;
  c.beginPath(); c.moveTo(n.ax + Math.sign(ex - n.ax) * 3.5, n.ay); c.lineTo(kx, ky); c.stroke();
  c.font = font(F.mono(500), size); c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  const w = c.measureText(n.text).width;
  if (lead >= 1) { c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex + 8 + w * typed, ey); c.stroke(); }
  if (typed > 0) {
    c.fillStyle = css(fg, 0.85);
    c.fillText(n.text.slice(0, Math.ceil(n.text.length * typed)), n.x, n.y);
    if (n.sub) {
      c.font = font(F.mono(400), size * 0.85); c.fillStyle = css(fg, 0.5);
      c.fillText(n.sub.slice(0, Math.ceil(n.sub.length * clamp((t - n.t0 - 0.3) / 0.3))), n.x, n.y + size * 1.35);
    }
  }
  c.restore();
}
