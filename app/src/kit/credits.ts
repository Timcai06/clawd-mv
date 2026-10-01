import { F, font, plain, smart } from '../engine/type';
import { clamp } from '../engine/util';
import { css, type ThemeKey } from '../theme';
import type { Box } from './icons';
import { span } from './time';

export const CREDIT_LINES = [
  'Works on My Machine',
  "A song about Clawd's day",
  'Music generated with Suno · lyrics & prompt by Tim',
  'Every frame drawn by code — three.js, rendered frame by frame',
  'Made with Claude Code & Codex',
  "Clawd is Anthropic's Claude Code mascot · fan work, non-commercial",
] as const;

export interface CreditsState {
  lines: readonly { text: string; progress: number }[];
  opacity?: number;
  color?: ThemeKey;
}

/** Staggered reveal; the caller supplies the start time (or a lyric/beat-derived anchor). */
export function creditsState(t: number, start = 0, lines: readonly string[] = CREDIT_LINES): CreditsState {
  const elapsed = t - start;
  return { lines: lines.map((text, i) => ({ text: i === 0 ? smart(text) : plain(text), progress: span(elapsed, i * 0.7, i * 0.7 + 0.75) })) };
}

/** Two annotation blocks on a 96 px grid; all six rows use the same 20 px Mono tier. */
export function creditsLayout(box: Box, state: CreditsState) {
  const rows = Math.ceil(state.lines.length / 2);
  const pitch = Math.min(32, box.height / Math.max(1, rows));
  const column = box.width / 2;
  return state.lines.map((line, i) => ({ ...line, size: 20,
    x: box.x + (i >= rows ? column : 0),
    y: box.y + 20 + (i % Math.max(1, rows)) * pitch,
    width: column - 24,
  }));
}

/** Grid colophon: clipped columns, fixed type size, progress controls ink coverage only. */
export function drawCredits(c: CanvasRenderingContext2D, box: Box, state: CreditsState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  for (const line of creditsLayout(box, state)) {
    const p = clamp(line.progress);
    if (p <= 0) continue;
    c.save(); c.globalAlpha *= p;
    c.globalAlpha *= clamp(state.opacity ?? 1);
    c.beginPath(); c.rect(line.x, box.y, line.width, box.height); c.clip();
    c.fillStyle = css(state.color ?? 'ink', 0.6); c.font = font(F.mono(), line.size);
    c.fillText(plain(line.text), line.x, line.y);
    c.restore();
  }
  c.restore();
}
