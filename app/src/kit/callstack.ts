import { F, font } from '../engine/type';
import { clamp } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { CALL_STACK } from './content';
import type { Box } from './icons';

export interface CallStackState {
  /** Zero-based inclusive window. Fractional fromFrame scrolls between floors. */
  fromFrame?: number;
  toFrame?: number;
  rowHeight?: number;
  /** Defaults to the deepest frame. Clay fill grows without bloom or shadows. */
  highlightFrame?: number;
  highlight?: number;
}

export function callStackRows(state: CallStackState) {
  const from = clamp(state.fromFrame ?? 0, 0, CALL_STACK.length - 1);
  const to = Math.floor(clamp(state.toFrame ?? CALL_STACK.length - 1, 0, CALL_STACK.length - 1));
  const rowHeight = Math.max(80, state.rowHeight ?? 160);
  return CALL_STACK.flatMap((frame, index) => index < Math.floor(from) || index > to ? [] : [{
    ...frame, index, floor: index + 1, file: `${frame.path.split('/').at(-1)}:${frame.line}`,
    y: (index - from) * rowHeight, height: rowHeight - 16,
    highlight: index === (state.highlightFrame ?? CALL_STACK.length - 1) ? clamp(state.highlight ?? 0) : 0,
  }]);
}

export function drawCallStack(c: CanvasRenderingContext2D, box: Box, state: CallStackState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const s = box.width / 1000;
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x, box.y); c.scale(s, s);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  for (const row of callStackRows(state)) {
    c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(100, row.y, 900, row.height);
    c.fillStyle = css('clay'); c.fillRect(100, row.y, 900 * row.highlight, row.height);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(600), 32);
    c.fillText(String(row.floor).padStart(2, '0'), 12, row.y + row.height / 2);
    c.fillStyle = css('ink'); c.font = font(F.mono(600), 36);
    c.fillText(`${row.name}()`, 132, row.y + row.height / 2);
    c.textAlign = 'right'; c.font = font(F.mono(), 25);
    c.fillText(row.file, 970, row.y + row.height / 2); c.textAlign = 'left';
  }
  c.restore();
}
