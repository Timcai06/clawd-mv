import { F, fitSize, font, plain, smart } from '../engine/type';
import { clamp, ease } from '../engine/util';
import { css, INK_SOFT } from '../theme';
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
}

/** Staggered reveal; the caller supplies the start time (or a lyric/beat-derived anchor). */
export function creditsState(t: number, start = 0, lines: readonly string[] = CREDIT_LINES): CreditsState {
  const elapsed = t - start;
  return { lines: lines.map((text, i) => ({ text: i === 0 ? smart(text) : plain(text), progress: span(elapsed, i * 0.7, i * 0.7 + 0.75) })) };
}

/** A poster colophon. Every row's opacity and rise are functions of its supplied progress. */
export function drawCredits(c: CanvasRenderingContext2D, box: Box, state: CreditsState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const s = Math.min(box.width / 1760, box.height / 720);
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x, box.y); c.scale(s, s); c.globalAlpha *= clamp(state.opacity ?? 1);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  state.lines.forEach((line, i) => {
    const p = clamp(line.progress);
    if (p <= 0) return;
    const family = i === 0 ? F.archivo(100, 900) : F.mono();
    const text = i === 0 ? smart(line.text).toUpperCase() : plain(line.text);
    c.save(); c.globalAlpha *= p;
    c.fillStyle = css('ink', i < 2 ? 1 : INK_SOFT.strong);
    c.font = font(family, fitSize(text, family, 1760, i === 0 ? 128 : 26));
    c.fillText(text, 0, (i === 0 ? 144 : 258 + (i - 1) * 86) + 24 * (1 - ease.outCubic(p)));
    c.restore();
  });
  c.restore();
}
