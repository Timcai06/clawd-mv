import { F, font } from '../../engine/type';
import type { Line } from '../../engine/lyrics';
import { Voice, wrap, type On } from '../../kit/lyric-moves';
import { affine, drawInscription, headX, inscribe, type Inscription } from '../../kit/inscribe';
import { drawCursor } from '../../kit/cursor';
import { css, type ThemeKey } from '../../theme';

/**
 * An onset-gated continuous Archivo comment, typed into the page a letter at a time (stage 9 ②):
 * the rows are wrapped once from the words' final shapes (nothing reflows while typing), each
 * letter strikes while it is sung, and the clay cursor rides the typing head until the row is done.
 * Already-sung words survive editorial cuts.
 */
export function releaseLyric(c: CanvasRenderingContext2D, voice: Voice, line: Line, t: number,
  x: number, y: number, width = 1728, on: On = 'paper', slice?: [number, number], cursor = true) {
  const presence = voice.presence(line, t);
  if (presence <= 0) return;
  const words = slice ? line.words.slice(...slice) : line.words;
  if (!words.length || t < words[0]!.start) return;
  const rows = wrap(words.map((w) => ({ ...voice.form(w, w.end), born: 1, age: 0 })), 92, width);
  let head: { x: number; y: number; h: number } | null = null, last = -Infinity;
  rows.forEach((row, i) => {
    const fin = inscribe(row.words.map((s) => s.form), 92), by = y + i * 108;
    if (!fin.glyphs.length || t < fin.glyphs[0]!.t) return;
    const live: Inscription = { ...fin, glyphs: fin.glyphs.map((g) => ({ ...g, form: voice.form(g.form.word, t) })) };
    drawInscription(c, live, t, { on, head: 'type', alpha: presence, place: (_g, gx) => affine(x + gx, by), seed: 170 + i + words[0]!.index });
    head = { x: x + headX(fin, t) + 6, y: by, h: fin.capH }; last = fin.glyphs.at(-1)!.t;
  });
  if (cursor && head && t < last + 0.3) drawCursor(c, head);
}

// Kept compatible with S18's existing machine annotations.
export function machineLabel(c: CanvasRenderingContext2D, text: string, x: number, y: number,
  size = 22, color: ThemeKey = 'ink', alpha = 1) {
  c.save(); c.font = font(F.mono(500), size); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = css(color, alpha); c.fillText(text, x, y); c.restore();
}
