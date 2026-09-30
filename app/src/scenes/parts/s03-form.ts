// Group A's document layout also supplies the notification's match-cut destination.
import { F, textPath2D } from '../../engine/type';
import { css } from '../../theme';
import { CALENDAR_ISSUE } from '../../kit/content';
import { mono, calendarForm } from './s01-drafting';

export const FORM = { x: 240, y: 112, w: 1440, h: 856 } as const;
export const STAMP = { x: 1432, y: 356, angle: -0.095, w: 350, h: 150 } as const;
export const EXTRA = { x: 350 + 780 * 0.85, y: 450 + 394 * 0.85, r: 43 } as const;

const displayPaths = new Map<string, Path2D>();
function displayPath(text: string, size: number, width = 100) {
  const key = `${text}:${size}:${width}`;
  let path = displayPaths.get(key);
  if (!path) { path = textPath2D(text, F.archivo(width, 700), size); displayPaths.set(key, path); }
  return path;
}

export function prepareForm() {
  for (let i = 0; i <= CALENDAR_ISSUE.title.length; i++) displayPath(CALENDAR_ISSUE.title.slice(0, i), 60);
  displayPath('31', 83, 87.5); displayPath('32', 83, 87.5);
}

function display(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, width = 100) {
  // Fixed vector paths avoid seek-order-dependent GPU glyph-atlas rasterisation
  // when the large 32 is rotated and enlarged during the attachment dive.
  c.save(); c.translate(x, y); c.fill(displayPath(text, size, width)); c.restore();
}

export function drawForm(c: CanvasRenderingContext2D, titleProgress: number, beat: number) {
  c.fillStyle = css('paper', 0.96); c.fillRect(FORM.x, FORM.y, FORM.w, FORM.h);
  // Formal rules describe fields; there is no decorative card outline.
  c.fillStyle = css('ink', 0.3);
  c.fillRect(288, 190, 1344, 1); c.fillRect(288, 404, 1344, 1);
  c.fillRect(288, 850, 1344, 1); c.fillRect(1164, 448, 1, 358);
  mono(c, 'CALENDAR / INCIDENT REPORT', 288, 160, 20);
  mono(c, 'NO. 1031', 1420, 160, 20);
  mono(c, 'SUBJECT', 288, 224, 16, 'ink', 0.6);
  c.fillStyle = css('ink');
  display(c, CALENDAR_ISSUE.title.slice(0, Math.floor(CALENDAR_ISSUE.title.length * titleProgress)), 288, 292, 60);
  mono(c, 'RECEIVED  09:00', 288, 362, 19, 'ink', 0.6);
  mono(c, 'PROJECT  calendar', 680, 362, 19, 'ink', 0.6);
  mono(c, 'ATTACHMENT 01 / OBSERVED OUTPUT', 288, 437, 15, 'ink', 0.6);
  calendarForm(c, 350, 450, 0.85);
  mono(c, 'EXPECTED', 1208, 490, 16, 'ink', 0.6);
  c.fillStyle = css('ink'); display(c, '31', 1208, 580, 83, 87.5);
  mono(c, 'OBSERVED', 1208, 634, 16, 'ink', 0.6);
  c.fillStyle = css('clay'); display(c, '32', 1208, 724, 83, 87.5);
  mono(c, 'DIFFERENCE   +1 DAY', 1208, 779, 15, 'ink', 0.6);
  mono(c, 'REPORTER / DICTATION', 288, 882, 15, 'ink', 0.6);
  // A small printer registration index steps on measured beats.
  for (let i = 0; i < 8; i++) {
    c.fillStyle = css('ink', i === Math.floor(beat) % 8 ? 0.6 : 0.12);
    c.fillRect(1600 + (i % 2) * 10, 904 + Math.floor(i / 2) * 10, 5, 5);
  }
}
