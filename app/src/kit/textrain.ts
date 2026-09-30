import { F, font } from '../engine/type';
import { clamp, mulberry32 } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { STACK_RAIN_LINES, UNDEFINED_WORD } from './content';
import type { Box } from './icons';

export interface TextRainState {
  /** Continuous phase supplied by the scene; one unit travels one field height at speed 1. */
  phase: number;
  /** 0..1 population density. Existing drops keep their identities as density changes. */
  density?: number;
  speed?: number;
  /** Radians from vertical; also tilts the text baseline. */
  angle?: number;
}
export interface WordImpactState {
  word?: string;
  fall?: number;
  squash?: number;
}

export function textRainDrops(box: Box, state: TextRainState) {
  if (!(box.width > 0 && box.height > 0)) return [];
  const random = mulberry32(42), count = Math.floor(72 * clamp(state.density ?? 1));
  const angle = clamp(state.angle ?? 0, -Math.PI / 3, Math.PI / 3);
  const margin = box.height * 0.15, travel = box.height + margin * 2;
  return Array.from({ length: count }, (_, index) => {
    const x0 = random(), y0 = random(), rate = 0.65 + random() * 0.7;
    const size = 16 + random() * 9;
    const line = STACK_RAIN_LINES[Math.floor(random() * STACK_RAIN_LINES.length)];
    const cycle = y0 + state.phase * Math.max(0, state.speed ?? 1) * rate;
    const y = (cycle - Math.floor(cycle)) * travel - margin;
    const x = x0 * (box.width + 400) - 200 + Math.tan(angle) * (y - box.height / 2);
    return { index, text: line, x: box.x + x, y: box.y + y, size, angle, opacity: INK_SOFT.strong };
  });
}

export function wordImpactPose(state: WordImpactState) {
  const p = clamp(state.fall ?? 1), squash = p === 1 ? clamp(state.squash ?? 0) : 0;
  return { fall: p, y: 1.3 * (p * p - 1), scaleX: 1 + 0.18 * squash, scaleY: 1 - 0.55 * squash };
}

export function drawTextRain(c: CanvasRenderingContext2D, box: Box, state: TextRainState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.textAlign = 'left'; c.textBaseline = 'middle';
  for (const drop of textRainDrops(box, state)) {
    c.save(); c.translate(drop.x, drop.y); c.rotate(-drop.angle); c.fillStyle = css('ink', drop.opacity);
    c.font = font(F.mono(), drop.size); c.fillText(drop.text, 0, 0); c.restore();
  }
  c.restore();
}

export function drawWordImpact(c: CanvasRenderingContext2D, box: Box, state: WordImpactState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const p = wordImpactPose(state), word = state.word ?? UNDEFINED_WORD;
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.font = font(F.archivo(75, 900), 200);
  const size = Math.min(box.height * 0.55, 200 * box.width * 0.82 / Math.max(1, c.measureText(word).width));
  c.translate(box.x + box.width / 2, box.y + box.height * (0.85 + p.y)); c.scale(p.scaleX, p.scaleY);
  c.fillStyle = css('ink'); c.font = font(F.archivo(75, 900), size); c.textAlign = 'center'; c.textBaseline = 'bottom';
  c.fillText(word, 0, 0); c.restore();
}
