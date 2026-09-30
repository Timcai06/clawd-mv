import { describe, expect, test } from 'bun:test';
import { testCounts, testRowFragments, testRowOffset, testRows } from '../src/kit/testlist';
import { CALENDAR_TESTS } from '../src/kit/content';

describe('test list reveal, results and damage', () => {
  test('reveals only the first N of the existing nineteen test names', () => {
    expect(testRows({ visibleCount: 3.8 }).map((r) => r.name)).toEqual(CALENDAR_TESTS.slice(0, 3));
    expect(testRows({ visibleCount: -1 })).toEqual([]);
    expect(testRows({ visibleCount: 99 })).toHaveLength(19);
    expect(testCounts({ visibleCount: 4 }).text).toBe('4 failed');
  });

  test('expresses idle, running, failed and passed independently', () => {
    expect(testRows({ visibleCount: 4, statuses: ['idle', 'running', 'fail', 'pass'] }).map((r) => r.status))
      .toEqual(['idle', 'running', 'fail', 'pass']);
    expect(testCounts({ defaultStatus: 'idle' }).text).toBe('19 not run');
    expect(testCounts({ visibleCount: 1, defaultStatus: 'running' }).text).toBe('1 running');
  });

  test('progressively passes rows with exact end and mixed count strings', () => {
    expect(testCounts({ passedCount: 0 }).text).toBe('19 failed');
    expect(testCounts({ passedCount: 3 }).text).toBe('16 failed · 3/19 passed');
    expect(testRows({ passedCount: 3 }).slice(0, 4).map((r) => r.status)).toEqual(['pass', 'pass', 'pass', 'fail']);
    expect(testCounts({ passedCount: 19 }).text).toBe('19/19 passed');
    expect(testCounts({ passedCount: 99, visibleCount: 2 }).text).toBe('2/19 passed');
  });

  test('fracture polygons tile the original row and retain their seeded shapes', () => {
    const still = testRowFragments(4, 952, 37, 0), broken = testRowFragments(4, 952, 37, 0.6);
    const area = still.reduce((sum, shard) => {
      const p = shard.points;
      return sum + ((p[1].x - p[0].x) + (p[2].x - p[3].x)) * 37 / 2;
    }, 0);
    expect(area).toBeCloseTo(952 * 37, 8);
    for (let i = 0; i < still.length; i++) {
      expect(still[i].x).toBeCloseTo(0); expect(still[i].y).toBeCloseTo(0);
      expect(still[i].points).toEqual(broken[i].points);
      if (i) {
        expect(still[i - 1].points[1]).toEqual(still[i].points[0]);
        expect(still[i - 1].points[2]).toEqual(still[i].points[3]);
      }
    }
  });

  test('fracture and twitch do not depend on call order or shared RNG state', () => {
    const broken = testRowFragments(2, 952, 37, 0.42), twitch = testRowOffset(2, 46, 12);
    testRowFragments(18, 500, 20, 1); testRowOffset(8, 200, 99);
    expect(testRowFragments(2, 952, 37, 0.42)).toEqual(broken);
    expect(testRowOffset(2, 46, 12)).toEqual(twitch);
    expect(testRowFragments(3, 952, 37, 0.42)).not.toEqual(broken);
    expect(testRowOffset(2, 47, 12)).not.toEqual(twitch);
    expect(Math.abs(twitch.x)).toBeLessThanOrEqual(12);
    expect(Math.abs(twitch.y)).toBeLessThanOrEqual(4.2);
    expect(testRowFragments(2, 952, 37, 1).every((s) => s.opacity === 0)).toBe(true);
    expect(testRowOffset(2, 90, 0)).toEqual({ x: 0, y: 0 });
  });
});
