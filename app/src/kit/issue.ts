import { F, font } from '../engine/type';
import { clamp, ease, TAU } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { CALENDAR_ISSUE } from './content';
import { calendarLayout, calendarPage, drawCalendar, type CalendarState } from './calendar';
import type { Box } from './icons';

export interface IssueState {
  issueNumber?: number;
  title?: string;
  titleProgress?: number;
  label?: string;
  stamp?: number;
  calendar?: CalendarState;
  circle?: number;
}

export function issueTitle(state: IssueState) {
  const title = state.title ?? CALENDAR_ISSUE.title;
  return title.slice(0, Math.floor(title.length * clamp(state.titleProgress ?? 1)));
}

export function issueStampPose(progress = 1) {
  const p = clamp(progress), e = ease.outCubic(p);
  return { scale: 2.5 - 1.5 * e, y: 100 * (e - 1), opacity: p };
}

/** Marker follows the thumbnail geometry, including a page's vertical fold. */
export function issueCircle(box: Box, calendar: CalendarState, progress = 1) {
  const l = calendarLayout(box, calendar), cell = l.cells.find((item) => item.day === 32);
  if (!cell) return null;
  const page = calendarPage(calendar);
  return { x: l.x + (cell.x + cell.width / 2) * l.scale,
    y: l.y + (410 + (cell.y + cell.height / 2 - 410) * page.scaleY) * l.scale,
    radius: 64 * l.scale, endAngle: -Math.PI / 2 + TAU * clamp(progress) };
}

export function drawIssue(c: CanvasRenderingContext2D, box: Box, state: IssueState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const scale = Math.min(box.width / 1200, box.height / 1080), pose = issueStampPose(state.stamp);
  const attachment = { x: 40, y: 278, width: 1120, height: 766 };
  const calendar: CalendarState = state.calendar ?? { dayCount: 32 };
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x, box.y); c.scale(scale, scale);
  c.fillStyle = css('paper'); c.fillRect(0, 0, 1200, 1080);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 22);
  c.fillText(`${CALENDAR_ISSUE.project} / Issue #${state.issueNumber ?? CALENDAR_ISSUE.number}`, 40, 43);
  c.fillStyle = css('ink'); c.font = font(F.archivo(100, 700), 49); c.fillText(issueTitle(state), 40, 117, 1120);
  c.save(); c.translate(100, 204 + pose.y); c.scale(pose.scale, pose.scale); c.globalAlpha *= pose.opacity;
  c.fillStyle = css('clay'); c.fillRect(-60, -23, 120, 46);
  c.textAlign = 'center'; c.fillStyle = css('ink'); c.font = font(F.mono(600), 24); c.fillText(state.label ?? CALENDAR_ISSUE.label, 0, 0);
  c.restore();
  c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(40, 259, 1120, 1);
  drawCalendar(c, attachment, calendar);
  const circle = issueCircle(attachment, calendar, state.circle ?? 0);
  if (circle && (state.circle ?? 0) > 0) {
    // This stroke is the story's hand-drawn annotation, not a decorative outline.
    c.strokeStyle = css('clay'); c.lineWidth = 5; c.lineCap = 'round';
    c.beginPath(); c.arc(circle.x, circle.y, circle.radius, -Math.PI / 2, circle.endAngle); c.stroke();
  }
  c.restore();
}
