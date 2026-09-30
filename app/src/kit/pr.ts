import { F, font } from '../engine/type';
import { clamp, ease } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { MONTH_PATH, PR_COPY, PR_DIFF, PR_TITLE } from './content';
import type { Box } from './icons';

export interface PrState {
  titleProgress?: number;
  diffProgress?: number;
  reviewProgress?: number;
  mergePress?: number;
}

export function prDiffRows(progress = 1) {
  const p = clamp(progress);
  return PR_DIFF.map((row, i) => ({ ...row, color: row.kind === 'delete' ? 'fail' as const : 'pass' as const,
    reveal: clamp(p * PR_DIFF.length - i) }));
}

export function prReviewPose(progress = 0) {
  const p = clamp(progress), e = ease.outBack(p);
  return { opacity: p, scale: 0.65 + 0.35 * e, y: 45 * (1 - e) };
}

export function drawPr(c: CanvasRenderingContext2D, box: Box, state: PrState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const s = Math.min(box.width / 1200, box.height / 740), review = prReviewPose(state.reviewProgress);
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x, box.y); c.scale(s, s);
  c.fillStyle = css('paper'); c.fillRect(0, 0, 1200, 740);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 22); c.fillText(PR_COPY.context, 32, 44);
  c.fillStyle = css('ink'); c.font = font(F.archivo(100, 700), 60);
  c.fillText(PR_TITLE.slice(0, Math.floor(PR_TITLE.length * clamp(state.titleProgress ?? 1))), 32, 126);
  c.font = font(F.mono(600), 30); c.fillText(PR_COPY.stats, 32, 211);
  c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(32, 254, 1136, 1);
  c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 23); c.fillText(MONTH_PATH, 32, 296);
  for (const [i, row] of prDiffRows(state.diffProgress).entries()) {
    c.save(); c.beginPath(); c.rect(32, 342 + i * 74, 1136 * row.reveal, 68); c.clip();
    // Diff is an explicitly approved correct/incorrect semantic state.
    c.fillStyle = css(row.color, INK_SOFT.faint); c.fillRect(32, 342 + i * 74, 1136, 68);
    c.fillStyle = css(row.color); c.font = font(F.mono(), 25);
    c.fillText(String(row.line), 52, 376 + i * 74); c.fillText(row.text, 130, 376 + i * 74);
    c.restore();
  }
  c.save(); c.translate(32, 558 + review.y); c.scale(review.scale, review.scale); c.globalAlpha *= review.opacity;
  c.fillStyle = css('ink'); c.fillRect(0, -28, 56, 56);
  c.fillStyle = css('paper'); c.beginPath(); c.arc(28, 0, 14, 0, Math.PI * 2); c.fill();
  c.fillStyle = css('ink'); c.font = font(F.mono(600), 32); c.fillText(PR_COPY.review, 82, 0); c.restore();
  const press = clamp(state.mergePress ?? 0);
  c.fillStyle = css('clay', 1 - 0.3 * press); c.fillRect(32, 630 + press * 8, 430, 64 - press * 8);
  c.fillStyle = css('ink'); c.font = font(F.archivo(100, 600), 28); c.fillText(PR_COPY.merge, 56, 662 + press * 4);
  c.restore();
}
