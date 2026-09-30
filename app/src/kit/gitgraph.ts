import { F, font } from '../engine/type';
import { clamp, mulberry32, TAU } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { GIT_GRAPH_LABELS } from './content';
import type { Box } from './icons';

export interface GitGraphState {
  merge?: number;
  confetti?: number;
  commitCount?: number;
}

/** Cubic return from the last branch commit to the mainline merge node. */
export function gitMergePoint(progress: number) {
  const p = clamp(progress), q = 1 - p;
  return { x: q ** 3 * 680 + 3 * q * q * p * 800 + 3 * q * p * p * 740 + p ** 3 * 860,
    y: q ** 3 * 350 + 3 * q * q * p * 350 + 3 * q * p * p * 190 + p ** 3 * 190 };
}

/** Local 1000x560 coordinates. No shared RNG or accumulated particle state. */
export function gitConfetti(progress = 0) {
  const p = clamp(progress), random = mulberry32(1031);
  return Array.from({ length: 64 }, () => {
    const startX = 100 + random() * 800, startY = -40 - random() * 220;
    const drift = (random() - 0.5) * 240, travel = 650 + random() * 200;
    const width = 5 + random() * 10, height = 10 + random() * 14;
    const spin = (random() - 0.5) * TAU * 3;
    const color = (['ink', 'clay', 'paper'] as const)[Math.floor(random() * 3)];
    return { x: startX + drift * p, y: startY + travel * p, width, height, rotation: spin * p,
      opacity: Math.min(clamp(p * 8), clamp((1 - p) * 5)), color };
  });
}

export function drawGitGraph(c: CanvasRenderingContext2D, box: Box, state: GitGraphState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const s = Math.min(box.width / 1000, box.height / 560), p = clamp(state.merge ?? 0);
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x, box.y); c.scale(s, s);
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.font = font(F.mono(600), 27);
  c.fillStyle = css('ink'); c.fillText(GIT_GRAPH_LABELS.main, 50, 110);
  c.fillStyle = css('clay'); c.fillText(GIT_GRAPH_LABELS.branch, 340, 422);
  // Strokes are graph edges, never outlines around type or nodes.
  c.strokeStyle = css('ink', INK_SOFT.strong); c.lineWidth = 5; c.lineCap = 'butt';
  c.beginPath(); c.moveTo(50, 190); c.lineTo(950, 190); c.stroke();
  c.strokeStyle = css('clay'); c.beginPath(); c.moveTo(150, 190);
  c.bezierCurveTo(260, 190, 240, 350, 350, 350); c.lineTo(680, 350);
  for (let i = 1; i <= 32; i++) { const pt = gitMergePoint(p * i / 32); c.lineTo(pt.x, pt.y); }
  c.stroke();
  const node = (x: number, y: number, r: number, color: 'ink' | 'clay') => {
    c.fillStyle = css(color); c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  };
  [150, 420, 860].forEach((x) => node(x, 190, 13, 'ink'));
  const count = Math.floor(clamp(state.commitCount ?? 3, 0, 3));
  [380, 530, 680].slice(0, count).forEach((x) => node(x, 350, 13, 'clay'));
  if (p > 0) { const tip = gitMergePoint(p); node(tip.x, tip.y, 8 + 5 * p, 'clay'); }
  for (const piece of gitConfetti(state.confetti)) {
    if (!piece.opacity) continue;
    c.save(); c.translate(piece.x, piece.y); c.rotate(piece.rotation); c.globalAlpha *= piece.opacity;
    c.fillStyle = css(piece.color); c.fillRect(-piece.width / 2, -piece.height / 2, piece.width, piece.height); c.restore();
  }
  c.restore();
}
