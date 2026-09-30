import { F, font } from '../engine/type';
import { clamp } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { WELCOME_LINES } from './content';
import type { Box } from './icons';

export interface WelcomeState {
  lines?: readonly string[];
  /** Completed lines; charCount reveals the next line. Defaults to all lines. */
  lineCount?: number;
  charCount?: number;
  cursor?: boolean;
}

export function welcomeLines(state: WelcomeState) {
  const lines = state.lines ?? WELCOME_LINES;
  const count = Math.floor(clamp(state.lineCount ?? lines.length, 0, lines.length));
  const result = lines.slice(0, count);
  if (count < lines.length) result.push(lines[count].slice(0, Math.max(0, Math.floor(state.charCount ?? 0))));
  return result;
}

export function welcomeLayout(box: Box) {
  const scale = Math.max(0, Math.min(box.width / 1200, box.height / 640));
  const x = box.x + (box.width - 1200 * scale) / 2, y = box.y + (box.height - 640 * scale) / 2;
  return { scale, x, y, clawd: { x: x + 64 * scale, y: y + 240 * scale, width: 320 * scale, height: 100 * scale } };
}

/** Returns the caller-owned sprite slot in the same coordinates as box. */
export function drawWelcome(c: CanvasRenderingContext2D, box: Box, state: WelcomeState): Box {
  const l = welcomeLayout(box);
  if (!(l.scale > 0)) return l.clawd;
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(l.x, l.y); c.scale(l.scale, l.scale);
  c.fillStyle = css('paper'); c.fillRect(0, 0, 1200, 640);
  // The welcome frame is a terminal rule, not an outline around type or artwork.
  c.fillStyle = css('ink', INK_SOFT.mid);
  c.fillRect(0, 0, 1200, 2); c.fillRect(0, 638, 1200, 2);
  c.fillRect(0, 0, 2, 640); c.fillRect(1198, 0, 2, 640);
  c.fillRect(420, 48, 1, 544);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  const lines = welcomeLines(state);
  lines.forEach((text, i) => {
    c.font = font(i === 0 ? F.mono(600) : F.mono(), i === 0 ? 32 : 26);
    c.fillStyle = css('ink', i === 0 ? 1 : INK_SOFT.strong);
    c.fillText(text, 464, 176 + i * 76, 688);
  });
  if (state.cursor && lines.length) {
    const row = lines.length - 1, text = lines[row];
    c.font = font(row === 0 ? F.mono(600) : F.mono(), row === 0 ? 32 : 26);
    c.fillStyle = css('clay'); c.fillRect(464 + Math.min(672, c.measureText(text).width), 160 + row * 76, 12, 32);
  }
  c.restore();
  return l.clawd;
}
