// Group A's document layout also supplies the notification's match-cut destination.
import { F, font } from '../../engine/type';
import { css } from '../../theme';
import { CALENDAR_ISSUE } from '../../kit/content';
import { mono, calendarForm } from './s01-drafting';

export const FORM = { x: 240, y: 112, w: 1440, h: 856 } as const;
export const STAMP = { x: 1432, y: 356, angle: -0.095, w: 350, h: 150 } as const;
export const EXTRA = { x: 350 + 780 * 0.85, y: 450 + 394 * 0.85, r: 43 } as const;

export function drawForm(c: CanvasRenderingContext2D, titleProgress: number, beat: number) {
  c.fillStyle = css('paper', 0.96); c.fillRect(FORM.x, FORM.y, FORM.w, FORM.h);
  // Formal rules describe fields; there is no decorative card outline.
  c.fillStyle = css('ink', 0.3);
  c.fillRect(288, 190, 1344, 1); c.fillRect(288, 404, 1344, 1);
  c.fillRect(288, 850, 1344, 1); c.fillRect(1164, 448, 1, 358);
  mono(c, 'CALENDAR / INCIDENT REPORT', 288, 160, 20);
  mono(c, 'NO. 1031', 1420, 160, 20);
  mono(c, 'SUBJECT', 288, 224, 16, 'ink', 0.6);
  c.fillStyle = css('ink'); c.font = font(F.archivo(100, 700), 60);
  c.fillText(CALENDAR_ISSUE.title.slice(0, Math.floor(CALENDAR_ISSUE.title.length * titleProgress)), 288, 292);
  mono(c, 'RECEIVED  09:00', 288, 362, 19, 'ink', 0.6);
  mono(c, 'PROJECT  calendar', 680, 362, 19, 'ink', 0.6);
  mono(c, 'ATTACHMENT 01 / OBSERVED OUTPUT', 288, 437, 15, 'ink', 0.6);
  calendarForm(c, 350, 450, 0.85);
  mono(c, 'EXPECTED', 1208, 490, 16, 'ink', 0.6);
  c.font = font(F.archivo(87.5, 700), 83); c.fillStyle = css('ink'); c.fillText('31', 1208, 580);
  mono(c, 'OBSERVED', 1208, 634, 16, 'ink', 0.6);
  c.font = font(F.archivo(87.5, 700), 83); c.fillStyle = css('clay'); c.fillText('32', 1208, 724);
  mono(c, 'DIFFERENCE   +1 DAY', 1208, 779, 15, 'ink', 0.6);
  mono(c, 'REPORTER / DICTATION', 288, 882, 15, 'ink', 0.6);
  // A small printer registration index steps on measured beats.
  for (let i = 0; i < 8; i++) {
    c.fillStyle = css('ink', i === Math.floor(beat) % 8 ? 0.6 : 0.12);
    c.fillRect(1600 + (i % 2) * 10, 904 + Math.floor(i / 2) * 10, 5, 5);
  }
}
