import { describe, expect, test } from 'bun:test';
import { visibleLineRange } from '../src/kit/terminal';
import { CALENDAR_TESTS, testOutput } from '../src/kit/content';

describe('terminal output and viewport', () => {
  test('counts complete rows and clamps scroll positions', () => {
    expect(visibleLineRange(47, 34, 301, 30)).toEqual({ first: 34, end: 44, capacity: 10 });
    expect(visibleLineRange(47, 99, 90, 30)).toEqual({ first: 47, end: 48, capacity: 3 });
    expect(visibleLineRange(47, -2, 90, 30)).toEqual({ first: 1, end: 4, capacity: 3 });
    expect(visibleLineRange(0, 1, 90, 30)).toEqual({ first: 1, end: 1, capacity: 3 });
    expect(visibleLineRange(19, 1, 29, 30).end).toBe(1);
    expect(visibleLineRange(19, 1, -30, 30).end).toBe(1);
    expect(visibleLineRange(19, 1, 300, 0).end).toBe(1);
  });

  test('both result states contain the same 19 unique test names and exact counts', () => {
    expect(new Set(CALENDAR_TESTS).size).toBe(19);
    for (const status of ['fail', 'pass'] as const) {
      const output = testOutput(status);
      expect(output.filter((l) => l.kind === 'test' && l.status === status)).toHaveLength(19);
      expect(output.at(-1)).toEqual({ kind: 'summary', failed: status === 'fail' ? 19 : 0, passed: status === 'pass' ? 19 : 0, total: 19 });
    }
  });
});
