import { F, font } from '../engine/type';
import { clamp } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { TODO_ITEMS } from './content';
import type { Box } from './icons';

export interface TodoState {
  items?: readonly string[];
  visibleCount?: number;
  /** Per-item progress: 0 unchecked, 0..1 checking, 1 checked and struck through. */
  checks?: readonly number[];
  /** Optional per-item UTF-16 character counts for the S06 typewriter reveal. */
  chars?: readonly number[];
}

export function todoRows(state: TodoState) {
  const items = state.items ?? TODO_ITEMS;
  return items.slice(0, Math.floor(clamp(state.visibleCount ?? items.length, 0, items.length))).map((text, i) => {
    const progress = clamp(state.checks?.[i] ?? 0);
    return { text: text.slice(0, Math.floor(clamp(state.chars?.[i] ?? text.length, 0, text.length))), progress,
      strike: clamp((progress - 0.65) / 0.35), checked: progress >= 1 };
  });
}

export function drawTodo(c: CanvasRenderingContext2D, box: Box, state: TodoState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const rows = todoRows(state), total = (state.items ?? TODO_ITEMS).length;
  const scale = Math.min(box.width / 1000, box.height / (88 + Math.max(3, total) * 118));
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x, box.y); c.scale(scale, scale);
  c.fillStyle = css('paper'); c.fillRect(0, 0, box.width / scale, box.height / scale);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(600), 20); c.fillText('TODO', 28, 33);
  rows.forEach((row, i) => {
    const y = 100 + i * 118;
    // Four filled rules form the functional checkbox, not an ornamental panel border.
    c.fillStyle = css('ink', INK_SOFT.mid);
    c.fillRect(28, y, 42, 2); c.fillRect(28, y + 40, 42, 2); c.fillRect(28, y, 2, 42); c.fillRect(68, y, 2, 42);
    if (row.progress > 0) {
      c.fillStyle = css('clay'); c.fillRect(28, y, 42, 42);
      c.save(); c.beginPath(); c.rect(28, y, 42 * clamp(row.progress / 0.65), 42); c.clip();
      c.fillStyle = css('ink'); c.font = font(F.mono(600), 38); c.fillText('✓', 32, y + 21); c.restore();
    }
    c.font = font(F.mono(row.checked ? 400 : 600), 38); c.fillStyle = css('ink', row.checked ? INK_SOFT.strong : 1);
    c.fillText(row.text, 106, y + 21);
    if (row.strike > 0) { c.fillStyle = css('ink'); c.fillRect(106, y + 20, c.measureText(row.text).width * row.strike, 2); }
  });
  c.restore();
}
