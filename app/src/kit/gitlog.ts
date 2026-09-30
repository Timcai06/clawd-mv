import { F, font } from '../engine/type';
import { clamp, ease } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { COMMITS, GIT_LOG_COMMITS } from './content';
import type { Commit } from './editor';
import type { Box } from './icons';

export interface CommitHashState {
  commit?: Commit;
  pop?: number;
  color?: 'ink' | 'clay';
}
export interface GitLogState {
  /** Chronological order: oldest first. */
  commits?: readonly Commit[];
  rowCount?: number;
  /** Additional upward displacement of the entire panel, in row units. */
  overflow?: number;
  rowHeight?: number;
  color?: 'ink' | 'clay';
}

export function commitHashPose(progress = 1) {
  const p = clamp(progress), e = ease.outBack(p);
  return { scale: 0.6 + 0.4 * e, y: (1 - e) * 100, opacity: p };
}

export function drawCommitHash(c: CanvasRenderingContext2D, box: Box, state: CommitHashState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const commit = state.commit ?? COMMITS[0], pose = commitHashPose(state.pop);
  const s = Math.min(box.width / 1000, box.height / 300);
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x + box.width / 2, box.y + box.height / 2 + pose.y * s); c.scale(s * pose.scale, s * pose.scale);
  c.globalAlpha *= pose.opacity; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = css(state.color ?? 'ink'); c.font = font(F.mono(700), 136); c.fillText(commit.hash.slice(0, 7), -450, -26);
  c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 29); c.fillText(commit.message, -442, 81);
  c.restore();
}

/** Coordinates are in a 1000-wide panel before the caller's uniform scale. */
export function gitLogLayout(box: Box, state: GitLogState) {
  const scale = box.width / 1000, h = box.height / scale;
  const commits = state.commits ?? GIT_LOG_COMMITS;
  const count = Math.floor(clamp(state.rowCount ?? commits.length, 0, commits.length));
  const rowHeight = Math.max(32, state.rowHeight ?? 58), top = 76, bottom = h - 24;
  const capacity = Math.max(0, Math.floor((bottom - top) / rowHeight));
  const overflowRows = Math.max(0, count - capacity), panelY = -Math.max(0, state.overflow ?? 0) * rowHeight;
  const startY = bottom - count * rowHeight;
  return { scale, h, count, capacity, overflowRows, scrollY: overflowRows * rowHeight, panelY, rowHeight, top,
    rows: commits.slice(0, count).map((commit, i) => ({ commit, y: startY + (i + 0.5) * rowHeight })) };
}

export function drawGitLog(c: CanvasRenderingContext2D, box: Box, state: GitLogState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const l = gitLogLayout(box, state);
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x, box.y); c.scale(l.scale, l.scale); c.translate(0, l.panelY);
  c.fillStyle = css('paper'); c.fillRect(0, 0, 1000, l.h);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = css('ink'); c.font = font(F.mono(600), 23); c.fillText('git log --oneline', 28, 32);
  c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(28, 62, 944, 1);
  c.beginPath(); c.rect(0, l.top, 1000, Math.max(0, l.h - l.top - 24)); c.clip();
  for (const { commit, y } of l.rows) {
    if (y + l.rowHeight / 2 <= l.top) continue;
    c.font = font(F.mono(600), 25); c.fillStyle = css(state.color ?? 'clay'); c.fillText(commit.hash.slice(0, 7), 28, y);
    c.font = font(F.mono(), 23); c.fillStyle = css('ink'); c.fillText(commit.message, 174, y);
    c.textAlign = 'right'; c.font = font(F.mono(), 18); c.fillStyle = css('ink', INK_SOFT.strong);
    c.fillText(commit.detail ?? '', 972, y); c.textAlign = 'left';
    c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(28, y + l.rowHeight / 2 - 1, 944, 1);
  }
  c.restore();
}
