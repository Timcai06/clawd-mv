import { F, font } from '../engine/type';
import { clamp, TAU } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { KEYBOARD_ROWS } from './content';
import type { Box } from './icons';

export interface KeyboardState {
  /** Row-major per-key depression, 0..1; entries override the wave. */
  depressions?: readonly number[];
  /** Cyclic phase, supplied by the scene. Omit for a still keyboard. */
  wavePhase?: number;
  waveAmount?: number;
  /** Labels select keys; Enter is unique. */
  highlightKey?: string;
  highlight?: number;
}

export function keyboardKeys(state: KeyboardState) {
  let index = 0;
  return KEYBOARD_ROWS.flatMap((row, rowIndex) => {
    let x = 0;
    return row.map(([label, units]) => {
      const keyIndex = index++, center = x + units / 2;
      const wave = state.wavePhase === undefined ? 0 : (0.5 + 0.5 * Math.sin(TAU * (state.wavePhase - center / 15 - rowIndex / 7))) * clamp(state.waveAmount ?? 1);
      const down = clamp(state.depressions?.[keyIndex] ?? wave);
      const key = { index: keyIndex, label, row: rowIndex, x: x * 80 + 5, y: rowIndex * 86 + 5,
        width: units * 80 - 10, height: 76, down,
        highlight: label === state.highlightKey ? clamp(state.highlight ?? 1) : 0 };
      x += units;
      return key;
    });
  });
}

export function keyboardLayout(box: Box, state: KeyboardState) {
  const scale = Math.max(0, Math.min(box.width / 1200, box.height / 430));
  return { scale, x: box.x + (box.width - 1200 * scale) / 2, y: box.y + (box.height - 430 * scale) / 2,
    keys: keyboardKeys(state) };
}

export function drawKeyboard(c: CanvasRenderingContext2D, box: Box, state: KeyboardState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const l = keyboardLayout(box, state);
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(l.x, l.y); c.scale(l.scale, l.scale);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const key of l.keys) {
    // Flat contraction and translation express travel without sidewalls or shadows.
    const inset = 4 * key.down, y = key.y + 9 * key.down;
    c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(key.x + inset, y, key.width - inset * 2, key.height - 9 * key.down);
    if (key.highlight > 0) {
      c.fillStyle = css('clay', key.highlight); c.fillRect(key.x + inset, y, key.width - inset * 2, key.height - 9 * key.down);
    }
    c.fillStyle = css('ink'); c.font = font(F.mono(key.highlight > 0 ? 600 : 400), key.label.length > 1 ? 17 : 24);
    c.fillText(key.label, key.x + key.width / 2, y + (key.height - 9 * key.down) / 2, key.width - 12);
  }
  c.restore();
}
