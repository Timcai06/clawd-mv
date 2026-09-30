// Poster-sheet drawing shared by scenes: the 12-column grid of ink hairlines, giant cropped
// grotesk type and the big clay circle (docs/TREATMENT.md, "视觉规范"). Draws into a Stage's
// poster context (poster px). Pure functions of their arguments.
import { W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { css, INK_SOFT } from '../theme';

/** Screen-sized frame on the sheet: the part the default camera sees, centred. */
export function frameOn(pw: number, ph: number) {
  return { x: (pw - W) / 2, y: (ph - H) / 2, w: W, h: H };
}

/** Column geometry of the 12-column grid inside the frame (80 px margins, 24 px gutters). */
export function columns(pw: number, ph: number, cols = 12, margin = 80, gutter = 24) {
  const f = frameOn(pw, ph);
  const colW = (f.w - 2 * margin - (cols - 1) * gutter) / cols;
  const x = (i: number) => f.x + margin + i * (colW + gutter); // left edge of column i (0-based)
  return { colW, gutter, margin, x, frame: f };
}

/** Hairline grid over the whole sheet: column rules plus a few horizontal rules. */
export function drawGrid(c: CanvasRenderingContext2D, pw: number, ph: number, rows: number[] = [96, 540, H - 96], alpha: number = INK_SOFT.mid) {
  const g = columns(pw, ph);
  c.save();
  c.strokeStyle = css('ink', alpha);
  c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= 12; i++) {
    const x = Math.round((i < 12 ? g.x(i) : g.x(11) + g.colW) - (i && i < 12 ? g.gutter / 2 : 0)) + 0.5;
    c.moveTo(x, 0); c.lineTo(x, ph);
  }
  for (const r of rows) { const y = Math.round(g.frame.y + r) + 0.5; c.moveTo(0, y); c.lineTo(pw, y); }
  c.stroke();
  c.restore();
}

export interface BigTypeOpts {
  size: number;
  /** Archivo width (62-125). */
  width?: number;
  weight?: number;
  color?: 'ink' | 'clay' | 'paper';
  alpha?: number;
  /** Uniform scale about the text's left baseline (for slams). */
  scale?: number;
}

/** Giant grotesk type set flush left at (x, baseline y); may run off the sheet (cropped). */
export function bigType(c: CanvasRenderingContext2D, text: string, x: number, y: number, o: BigTypeOpts) {
  c.save();
  c.translate(x, y);
  if (o.scale && o.scale !== 1) c.scale(o.scale, o.scale);
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.font = font(F.archivo(o.width ?? 87.5, o.weight ?? 900), o.size);
  c.fillStyle = css(o.color ?? 'ink', o.alpha ?? 1);
  c.fillText(text, 0, 0);
  c.restore();
}

/** Flat clay disc. */
export function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: 'clay' | 'ink' = 'clay', alpha = 1) {
  c.save();
  c.fillStyle = css(color, alpha);
  c.beginPath(); c.arc(x, y, Math.max(0, r), 0, Math.PI * 2); c.fill();
  c.restore();
}

/** Small mono caption on the grid (scene labels, lyric lines before the lyric layer lands). */
export function caption(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 22, alpha = 1) {
  c.save();
  c.textBaseline = 'alphabetic';
  c.font = font(F.mono(500), size);
  c.fillStyle = css('ink', alpha);
  c.fillText(text, x, y);
  c.restore();
}
