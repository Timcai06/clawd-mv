import { css } from '../theme';
import type { Box } from './icons';

export type DeviceType = 'computer' | 'tablet' | 'phone';
export interface DeviceState {
  type: DeviceType;
  body?: 'ink' | 'clay';
  screen?: 'paper' | 'ink' | 'clay';
  /** Called once in the caller's coordinates, clipped to the screen. */
  content?: (c: CanvasRenderingContext2D, screen: Box) => void;
}

export function deviceLayout(box: Box, type: DeviceType) {
  const width = type === 'computer' ? 320 : type === 'tablet' ? 220 : 140;
  const height = type === 'computer' ? 240 : 300;
  const s = Math.max(0, Math.min(box.width / width, box.height / height));
  const x = box.x + (box.width - width * s) / 2, y = box.y + (box.height - height * s) / 2;
  const rect = (rx: number, ry: number, w: number, h: number): Box => ({ x: x + rx * s, y: y + ry * s, width: w * s, height: h * s });
  return { body: rect(0, 0, width, type === 'computer' ? 202 : height),
    screen: rect(10, type === 'computer' ? 10 : 18, width - 20, type === 'computer' ? 176 : height - 36),
    stand: type === 'computer' ? [rect(145, 202, 30, 26), rect(108, 228, 104, 12)] : [] };
}

export function drawDevice(c: CanvasRenderingContext2D, box: Box, state: DeviceState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const l = deviceLayout(box, state.type);
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.fillStyle = css(state.body ?? 'ink');
  for (const r of [l.body, ...l.stand]) c.fillRect(r.x, r.y, r.width, r.height);
  const screen = l.screen;
  c.fillStyle = css(state.screen ?? 'paper'); c.fillRect(screen.x, screen.y, screen.width, screen.height);
  c.beginPath(); c.rect(screen.x, screen.y, screen.width, screen.height); c.clip();
  try { state.content?.(c, screen); } finally { c.restore(); }
}

/** One device per O/D pixel; cell centres preserve the canonical 16x5 grid. */
export function deviceWallLayout(pixels: readonly string[], box: Box) {
  if (pixels.length !== 5 || pixels.some((row) => row.length !== 16 || /[^.OD]/.test(row))) {
    throw new Error('Device wall requires a 16x5 . / O / D pixel grid');
  }
  if (!(box.width > 0 && box.height > 0)) return [];
  const cell = Math.min(box.width / 16, box.height / 5);
  const x = box.x + (box.width - 16 * cell) / 2, y = box.y + (box.height - 5 * cell) / 2;
  return pixels.flatMap((line, row) => [...line].flatMap((pixel, column) => {
    if (pixel !== 'O' && pixel !== 'D') return [];
    const type = (['computer', 'tablet', 'phone'] as const)[(column + row * 2) % 3];
    return [{ row, column, pixel, type, box: { x: x + (column + 0.07) * cell, y: y + (row + 0.07) * cell,
      width: cell * 0.86, height: cell * 0.86 } }];
  }));
}
