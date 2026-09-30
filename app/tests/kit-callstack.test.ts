import { describe, expect, test } from 'bun:test';
import { callStackRows } from '../src/kit/callstack';
import { CALL_STACK } from '../src/kit/content';

describe('call stack descent', () => {
  test('keeps the canonical order and the deepest source location', () => {
    const rows = callStackRows({});
    expect(rows.map((r) => r.name)).toEqual(CALL_STACK.map((r) => r.name));
    expect(rows.at(-1)?.name).toBe('daysIn'); expect(rows.at(-1)?.file).toBe('month.ts:42');
    expect(rows.map((r) => r.floor)).toEqual([1, 2, 3]);
  });
  test('inclusive windows retain floor numbers and support fractional scrolling', () => {
    const rows = callStackRows({ fromFrame: 1.5, toFrame: 2, rowHeight: 120 });
    expect(rows.map((r) => r.floor)).toEqual([2, 3]); expect(rows.map((r) => r.y)).toEqual([-60, 60]);
    expect(callStackRows({ fromFrame: 2, toFrame: 0 })).toEqual([]);
    expect(callStackRows({ fromFrame: 99 })).toHaveLength(1);
  });
  test('highlights only the selected frame with bounded clay coverage', () => {
    expect(callStackRows({ highlight: 2 }).map((r) => r.highlight)).toEqual([0, 0, 1]);
    expect(callStackRows({ highlightFrame: 1, highlight: 0.4 }).map((r) => r.highlight)).toEqual([0, 0.4, 0]);
    expect(callStackRows({ highlight: -1 }).every((r) => r.highlight === 0)).toBe(true);
  });
});
