import { F, font } from '../engine/type';
import { clamp, ease } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { CALENDAR_ISSUE } from './content';
import type { Box } from './icons';

export interface NotifyState {
  issueNumber?: number;
  project?: string;
  message?: string;
  pop?: number;
}

export const notificationTitle = (state: NotifyState) => `Issue #${state.issueNumber ?? CALENDAR_ISSUE.number} · ${state.project ?? CALENDAR_ISSUE.project}`;

/** A single overshoot, with exact resting and hidden endpoints. */
export function notificationPose(progress = 1) {
  const p = clamp(progress), e = p === 0 || p === 1 ? p : ease.outBack(p);
  return { x: (1 - e) * 70, y: (1 - e) * 210, opacity: p, scale: 0.94 + 0.06 * e };
}

/** Box is the resting card rectangle; motion may extend beyond it into the caller's stage. */
export function drawNotify(c: CanvasRenderingContext2D, box: Box, state: NotifyState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const pose = notificationPose(state.pop), scale = Math.min(box.width / 720, box.height / 200);
  c.save(); c.translate(box.x + box.width + pose.x * scale, box.y + box.height + pose.y * scale);
  c.scale(scale * pose.scale, scale * pose.scale); c.translate(-720, -200); c.globalAlpha *= pose.opacity;
  c.fillStyle = css('paper'); c.fillRect(0, 0, 720, 200);
  c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(0, 0, 720, 200);
  c.fillStyle = css('clay'); c.fillRect(0, 0, 6, 200);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.beginPath(); c.rect(28, 20, 664, 160); c.clip();
  c.fillStyle = css('ink'); c.font = font(F.archivo(100, 700), 32); c.fillText(notificationTitle(state), 32, 60);
  c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 22);
  c.fillText(state.message ?? CALENDAR_ISSUE.title, 32, 126);
  c.restore();
}
