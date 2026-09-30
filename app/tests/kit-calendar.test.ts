import { describe, expect, test } from 'bun:test';
import { calendarBurstFragments, calendarCells, calendarExtraPose, calendarLayout, calendarPage } from '../src/kit/calendar';
import { CALENDAR_MONTHS } from '../src/kit/content';

describe('calendar dates and transitions', () => {
  test('October has 31 numbered cells; only the explicit bug state adds day 32', () => {
    const ordinary = calendarCells({}), bug = calendarCells({ dayCount: 32 });
    expect(ordinary.map((c) => c.day)).toEqual(Array.from({ length: 31 }, (_, i) => i + 1));
    expect(bug).toHaveLength(32);
    expect(bug[0]).toEqual({ day: 1, row: 0, column: 4, status: 'normal' });
    expect(bug[30]).toEqual({ day: 31, row: 4, column: 6, status: 'normal' });
    expect(bug[31]).toEqual({ day: 32, row: 5, column: 0, status: 'error' });
    expect(calendarCells({ dayCount: 31, extraPop: 1 })).toHaveLength(31);
  });

  test('explicit cell states and selected dates use separate semantic states', () => {
    const cells = calendarCells({ dayCount: 32, highlightedDays: [1, 2], cellStates: { 2: 'normal', 12: 'error' } });
    expect(cells[0].status).toBe('lit'); expect(cells[1].status).toBe('normal'); expect(cells[11].status).toBe('error');
    expect(calendarExtraPose(1, 0, 0).flash).toBe(1);
    expect(calendarExtraPose(1, 0, 0.5).flash).toBeCloseTo(0.55);
  });

  test('removes the burst cell at completion without shifting the other dates', () => {
    const box = { x: 0, y: 0, width: 1000, height: 820 };
    const initial = calendarLayout(box, { dayCount: 32 }), burst = calendarLayout(box, { dayCount: 32, extraBurst: 1 });
    expect(burst.cells).toHaveLength(31); expect(burst.cells).toEqual(initial.cells.slice(0, 31));
    expect(calendarExtraPose(0).opacity).toBe(0); expect(calendarExtraPose(1).scale).toBe(1);
  });

  test('bubble shards are seeded, repeatable after other calls and fully disappear', () => {
    const a = calendarBurstFragments(128, 96, 0.4);
    calendarBurstFragments(30, 20, 0.8);
    expect(calendarBurstFragments(128, 96, 0.4)).toEqual(a);
    expect(calendarBurstFragments(128, 96, 0.7)).not.toEqual(a);
    expect(calendarBurstFragments(128, 96, 0).every((p) => p.x === 0 && p.y === 0)).toBe(true);
    expect(calendarBurstFragments(128, 96, 1).every((p) => p.opacity === 0)).toBe(true);
  });

  test('fold changes October 31 to November 1 with the correct weekday and length', () => {
    const state = { month: CALENDAR_MONTHS.october, nextMonth: CALENDAR_MONTHS.november, dayCount: 32, highlightedDays: [31], nextHighlightedDays: [1] };
    expect(calendarPage({ ...state, flip: 0 }).month.title).toBe('October');
    expect(calendarPage({ ...state, flip: 0.5 }).scaleY).toBeCloseTo(0);
    expect(calendarPage({ ...state, flip: 1 }).scaleY).toBe(1);
    const next = calendarCells({ ...state, flip: 1 });
    expect(next).toHaveLength(30); expect(next[0]).toEqual({ day: 1, row: 0, column: 0, status: 'lit' });
    expect(next.some((c) => c.day === 32)).toBe(false);
  });

  test('thumbnail and full-size calendar share local cell geometry', () => {
    const big = calendarLayout({ x: 0, y: 0, width: 1000, height: 820 }, { dayCount: 32 });
    const small = calendarLayout({ x: 70, y: 20, width: 250, height: 205 }, { dayCount: 32 });
    expect(small.cells).toEqual(big.cells); expect(small.scale).toBe(0.25); expect(small.x).toBe(70);
  });
});
