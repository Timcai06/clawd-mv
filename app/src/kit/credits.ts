import { F, font, plain, smart } from '../engine/type';
import { clamp, ease } from '../engine/util';
import { varRun, glyphPath } from './vartype';
import { css, type ThemeKey } from '../theme';
import type { Box } from './icons';
import { span } from './time';

export const CREDIT_LINES = [
  'Works on My Machine',
  "A song about Clawd's day",
  'Music generated with Suno · lyrics & prompt by Tim 蔡任天',
  'Every frame drawn by code — three.js, rendered frame by frame',
  'Made with Claude Code & Codex',
  "Clawd is Anthropic's Claude Code mascot · fan work, non-commercial",
] as const;

export interface CreditsState {
  lines: readonly { text: string; progress: number }[];
  opacity?: number;
  color?: ThemeKey;
  /** Column count (default 2). */
  columns?: number;
}

/** Staggered reveal; the caller supplies the start time (or a lyric/beat-derived anchor). */
export function creditsState(t: number, start = 0, lines: readonly string[] = CREDIT_LINES): CreditsState {
  const elapsed = t - start;
  return { lines: lines.map((text, i) => ({ text: i === 0 ? smart(text) : plain(text), progress: span(elapsed, i * 0.7, i * 0.7 + 0.75) })) };
}

/** Two annotation blocks on a 96 px grid; all six rows use the same 20 px Mono tier. */
export function creditsLayout(box: Box, state: CreditsState) {
  const cols = state.columns ?? 2;
  const rows = Math.ceil(state.lines.length / cols);
  const pitch = Math.min(32, box.height / Math.max(1, rows));
  const column = box.width / cols;
  return state.lines.map((line, i) => ({ ...line, size: 20,
    x: box.x + Math.floor(i / Math.max(1, rows)) * column,
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

/** The author, as the film signs it (Tim 2026-10-01: the audience must see at a glance who made it). */
export const AUTHOR = { latin: 'TIM', cjk: '蔡任天' } as const;
/** CJK face: macOS system fonts (the film is rendered on Tim's Mac); first available wins. */
const CJK_FAMILY = '"PingFang SC", "Hiragino Sans GB", "STHeiti", sans-serif';

/**
 * The signature card: TIM in continuous Archivo and 蔡任天 in a heavy CJK face, the same cap height,
 * on one baseline. `reveal` 0..1 per glyph (6 glyphs: T, I, M, 蔡, 任, 天) drops each one in.
 * Returns the right edge (for a cursor).
 */
export function drawSignature(c: CanvasRenderingContext2D, x: number, baseline: number, capH: number,
  reveal: (i: number) => number, o: { color?: ThemeKey; alpha?: number } = {}): number {
  const run = varRun(AUTHOR.latin, 100, { wdth: 75, wght: 900 });
  const k = capH / run.capH;
  c.save();
  c.globalAlpha *= o.alpha ?? 1;
  c.fillStyle = css(o.color ?? 'paper');
  const drop = (p: number) => (1 - ease.outCubic(clamp(p))) * -capH * 0.35;
  run.glyphs.forEach((g, i) => {
    const p = clamp(reveal(i));
    if (p <= 0) return;
    c.save(); c.globalAlpha *= Math.min(1, p * 3);
    c.translate(x + g.x * k, baseline + drop(p)); c.scale(k, k);
    c.fill(glyphPath(run, g));
    c.restore();
  });
  let px = x + run.width * k + capH * 0.42;
  // CJK: em ≈ 1.1 × the Latin cap height; raised so the ideographs bottom out on the Latin baseline
  const em = capH * 1.1;
  c.font = `600 ${em}px ${CJK_FAMILY}`;
  c.textBaseline = 'alphabetic';
  Array.from(AUTHOR.cjk).forEach((ch, j) => {
    const p = clamp(reveal(3 + j));
    const w = c.measureText(ch).width;
    if (p > 0) {
      c.save(); c.globalAlpha *= Math.min(1, p * 3);
      c.fillText(ch, px, baseline - em * 0.085 + drop(p));
      c.restore();
    }
    px += w + capH * 0.04;
  });
  c.restore();
  return px;
}
