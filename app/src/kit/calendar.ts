import { F, font } from '../engine/type';
import { clamp, ease, mulberry32, TAU } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { CALENDAR_MONTHS, CALENDAR_WEEKDAYS } from './content';
import type { Box } from './icons';

export interface CalendarMonth { title: string; year: number; days: number; firstWeekday: number }
export type CalendarCellStatus = 'normal' | 'lit' | 'error';
export interface CalendarState {
  month?: CalendarMonth;
  dayCount?: number;
  highlightedDays?: readonly number[];
  cellStates?: Readonly<Record<number, CalendarCellStatus>>;
  /** Cyclic 0..1 phase; errors use clay, never the test-only fail token. */
  errorPhase?: number;
  extraPop?: number;
  extraBurst?: number;
  nextMonth?: CalendarMonth;
  nextHighlightedDays?: readonly number[];
  /** Current month at 0, next month at 1; a flat fold switches faces at 0.5. */
  flip?: number;
}

export function calendarPage(state: CalendarState) {
  const p = state.nextMonth ? clamp(state.flip ?? 0) : 0, next = p >= 0.5;
  return { month: (next ? state.nextMonth : state.month) ?? CALENDAR_MONTHS.october,
    next, scaleY: Math.abs(Math.cos(Math.PI * p)), progress: p };
}

export function calendarCells(state: CalendarState) {
  const page = calendarPage(state), month = page.month;
  const count = Math.floor(clamp(page.next ? month.days : state.dayCount ?? month.days, 0, 32));
  const first = Math.floor(clamp(month.firstWeekday, 0, 6));
  const highlighted = (page.next ? state.nextHighlightedDays : state.highlightedDays) ?? [];
  return Array.from({ length: count }, (_, i) => {
    const day = i + 1, slot = first + i;
    const status = (!page.next ? state.cellStates?.[day] : undefined) ?? (day === 32 ? 'error' : highlighted.includes(day) ? 'lit' : 'normal');
    return { day, column: slot % 7, row: Math.floor(slot / 7), status };
  }).filter((cell) => cell.day !== 32 || page.next || (state.extraBurst ?? 0) < 1);
}

/** Stable six-week geometry avoids moving the first 31 cells when day 32 appears. */
export function calendarLayout(box: Box, state: CalendarState) {
  const scale = Math.min(box.width / 1000, box.height / 820);
  return { scale, x: box.x + (box.width - 1000 * scale) / 2, y: box.y + (box.height - 820 * scale) / 2,
    cells: calendarCells(state).map((cell) => ({ ...cell, x: 24 + cell.column * 136, y: 170 + cell.row * 104, width: 128, height: 96 })) };
}

export function calendarExtraPose(pop = 1, burst = 0, errorPhase = 0) {
  const p = clamp(pop), b = clamp(burst), e = ease.outBack(p);
  return { scale: (0.45 + 0.55 * e) * (1 + 0.25 * b), y: (1 - e) * 65,
    opacity: p * (1 - b), flash: 0.55 + 0.45 * (0.5 + 0.5 * Math.cos(TAU * errorPhase)) };
}

/** Seeded triangular pieces radiate from the cell centre like a bursting bubble. */
export function calendarBurstFragments(width: number, height: number, progress: number) {
  const random = mulberry32(1032), p = clamp(progress);
  const corners = Array.from({ length: 10 }, (_, i) => {
    const angle = TAU * i / 10;
    return { x: width / 2 + Math.cos(angle) * width * 0.46, y: height / 2 + Math.sin(angle) * height * 0.46 };
  });
  return corners.map((point, i) => {
    const angle = TAU * (i + 0.5) / 10, distance = (0.7 + random() * 1.1) * p;
    return { points: [{ x: width / 2, y: height / 2 }, point, corners[(i + 1) % corners.length]],
      x: Math.cos(angle) * width * distance, y: Math.sin(angle) * height * distance + height * p * p * 0.5,
      rotation: (random() - 0.5) * 2 * p, opacity: 1 - p };
  });
}

export function drawCalendar(c: CanvasRenderingContext2D, box: Box, state: CalendarState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const l = calendarLayout(box, state), page = calendarPage(state);
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(l.x, l.y); c.scale(l.scale, l.scale);
  c.fillStyle = css('paper'); c.fillRect(0, 0, 1000, 820);
  if (page.scaleY < 0.0001) { c.restore(); return; }
  c.translate(0, 410); c.scale(1, page.scaleY); c.translate(0, -410);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = font(F.archivo(100, 900), 64); c.fillStyle = css('ink'); c.fillText(page.month.title, 24, 60);
  c.textAlign = 'right'; c.font = font(F.mono(), 23); c.fillStyle = css('ink', INK_SOFT.strong); c.fillText(String(page.month.year), 968, 60);
  c.textAlign = 'left'; c.font = font(F.mono(600), 18);
  CALENDAR_WEEKDAYS.forEach((day, i) => c.fillText(day, 34 + i * 136, 140));
  c.fillStyle = css('ink', INK_SOFT.mid); c.fillRect(24, 110, 944, 1);
  for (const cell of l.cells) {
    const extra = cell.day === 32 && !page.next;
    const burst = extra ? clamp(state.extraBurst ?? 0) : 0;
    const pose = calendarExtraPose(extra ? state.extraPop : 1, burst, state.errorPhase);
    c.save(); c.translate(cell.x + cell.width / 2, cell.y + cell.height / 2 + (extra ? pose.y : 0));
    c.scale(extra ? pose.scale : 1, extra ? pose.scale : 1); c.translate(-cell.width / 2, -cell.height / 2);
    c.globalAlpha *= extra ? clamp(state.extraPop ?? 1) : 1;
    if (burst > 0) {
      for (const shard of calendarBurstFragments(cell.width, cell.height, burst)) {
        c.save(); c.translate(cell.width / 2 + shard.x, cell.height / 2 + shard.y); c.rotate(shard.rotation);
        c.translate(-cell.width / 2, -cell.height / 2); c.globalAlpha *= shard.opacity;
        c.fillStyle = css('clay'); c.beginPath(); shard.points.forEach((pt, i) => i ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y));
        c.closePath(); c.fill(); c.restore();
      }
    } else {
      c.fillStyle = cell.status === 'normal' ? css('ink', INK_SOFT.faint) : css('clay', cell.status === 'error' ? pose.flash : 1);
      c.fillRect(0, 0, cell.width, cell.height);
    }
    c.globalAlpha *= 1 - burst;
    c.fillStyle = css('ink'); c.font = font(F.mono(cell.status === 'normal' ? 400 : 600), 32);
    c.fillText(String(cell.day), 16, cell.height / 2);
    c.restore();
  }
  c.restore();
}
