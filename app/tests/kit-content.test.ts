import { expect, test } from 'bun:test';
import { CALL_STACK, COMMITS, MONTH_PATH, MONTH_SOURCE } from '../src/kit/content';

test('the story source has the exact loop at line 42 and consistent stack locations', () => {
  expect(MONTH_SOURCE[41]).toBe('  for (let d = 0; d <= days; d++) {');
  expect(CALL_STACK.map((f) => f.name)).toEqual(['render', 'buildMonth', 'daysIn']);
  expect(CALL_STACK.every((f) => f.path === MONTH_PATH)).toBe(true);
  expect(MONTH_SOURCE[CALL_STACK[0].line - 1]).toContain('buildMonth(');
  expect(MONTH_SOURCE[CALL_STACK[1].line - 1]).toContain('daysIn(');
  expect(COMMITS.every((c) => /^[\da-f]{7}$/.test(c.hash))).toBe(true);
});

test('the one-character story fix removes October 32 throughout the real call chain', () => {
  const source = MONTH_SOURCE.join('\n');
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  const evaluate = (text: string) => new Function(`${transpiler.transformSync(text.replace(/export /g, ''))}; return { daysIn, buildMonth, render };`)();
  const broken = evaluate(source), fixed = evaluate(source.replace('d <= days', 'd < days'));
  expect(broken.daysIn(2026, 10)).toHaveLength(32);
  expect(broken.render(2026, 10).split(' ').at(-1)).toBe('32');
  expect(fixed.daysIn(2026, 10)).toHaveLength(31);
  expect(fixed.buildMonth(2026, 10).at(-1).day).toBe(31);
  expect(fixed.render(2026, 10).split(' ').at(-1)).toBe('31');
  expect(fixed.daysIn(2024, 2)).toHaveLength(29);
  expect(fixed.daysIn(2026, 2)).toHaveLength(28);
});
