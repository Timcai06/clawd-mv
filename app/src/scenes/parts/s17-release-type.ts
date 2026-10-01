import { F, font } from '../../engine/type';
import type { Line } from '../../engine/lyrics';
import { Voice, drawSet, wrap, type On } from '../../kit/lyric-moves';
import { css, type ThemeKey } from '../../theme';

/** An onset-gated continuous Archivo comment; already-sung words survive editorial cuts. */
export function releaseLyric(c: CanvasRenderingContext2D, voice: Voice, line: Line, t: number,
  x: number, y: number, width = 1728, on: On = 'paper', slice?: [number, number]) {
  const presence = voice.presence(line, t);
  if (presence <= 0) return;
  const forms = slice ? voice.forms(line, t).slice(...slice) : voice.forms(line, t);
  wrap(forms, 92, width).forEach((row, i) => drawSet(c, row, x, y + i * 108, { on, alpha: presence }));
}

// Kept compatible with S18's existing machine annotations.
export function machineLabel(c: CanvasRenderingContext2D, text: string, x: number, y: number,
  size = 22, color: ThemeKey = 'ink', alpha = 1) {
  c.save(); c.font = font(F.mono(500), size); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = css(color, alpha); c.fillText(text, x, y); c.restore();
}
