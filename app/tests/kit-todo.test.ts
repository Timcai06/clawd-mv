import { expect, test } from 'bun:test';
import { todoRows } from '../src/kit/todo';
import { TODO_ITEMS } from '../src/kit/content';

test('todo uses the three story actions and independently controls typing and checks', () => {
  expect(todoRows({}).map((r) => r.text)).toEqual([...TODO_ITEMS]);
  const rows = todoRows({ checks: [0, 0.5, 1], chars: [4, 5, 99] });
  expect(rows.map((r) => r.text)).toEqual(['Read', 'Write', 'Fix October']);
  expect(rows.map((r) => r.checked)).toEqual([false, false, true]);
  expect(rows.map((r) => r.strike)).toEqual([0, 0, 1]);
  expect(todoRows({ checks: [0.8] })[0].strike).toBeGreaterThan(0);
});

test('todo clamps progress and reveals only requested entries without mutation', () => {
  const checks = Object.freeze([-1, 3, 0.7]);
  expect(todoRows({ checks, visibleCount: 2 }).map((r) => r.progress)).toEqual([0, 1]);
  expect(todoRows({ visibleCount: 0 })).toEqual([]);
  expect(todoRows({ visibleCount: 100 })).toHaveLength(3);
});
