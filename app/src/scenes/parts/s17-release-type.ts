import { F, font, layout, plain } from '../../engine/type';
import type { Line } from '../../engine/lyrics';
import { Lyrics } from '../../engine/lyrics';
import { css, type ThemeKey } from '../../theme';
import { drawCursor } from '../../kit/cursor';

/** Sung words are printed into a release label, with font kerning preserved across wipes. */
export function releaseLyric(c: CanvasRenderingContext2D, line: Line | null | undefined, t: number,
  x: number, y: number, size = 28, color: ThemeKey = 'ink', maxWidth = 1640, cursor = false) {
  if (!line || t < line.start - 0.35 || t > line.end + 0.9) return;
  const text = plain(line.text), family = F.mono(500);
  const initial = layout(text, family, size);
  const fitted = Math.min(size, size * maxWidth / Math.max(1, initial.width));
  const run = layout(text, family, fitted);
  c.save(); c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.font = font(family, fitted);
  c.fillStyle = css(color, 0.3); c.fillText(text, x, y);
  // lineCharProgress follows aligned words, including each word's sung duration.
  const n = Lyrics.lineCharProgress(line, t);
  const full = Math.min(text.length, Math.floor(n));
  const glyph = run.glyphs[full];
  const edge = glyph ? glyph.x + glyph.w * (n - full) : run.width;
  c.beginPath(); c.rect(x - 2, y - fitted * 1.4, Math.max(0, edge + 2), fitted * 1.8); c.clip();
  c.fillStyle = css(color); c.fillText(text, x, y); c.restore();
  if (cursor) drawCursor(c, { x: x + edge + 7, y: y + 3, h: fitted * 1.1 });
}

export function machineLabel(c: CanvasRenderingContext2D, text: string, x: number, y: number,
  size = 22, color: ThemeKey = 'ink', alpha = 1) {
  c.save(); c.font = font(F.mono(500), size); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = css(color, alpha); c.fillText(text, x, y); c.restore();
}
