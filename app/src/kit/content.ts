// Fictional story fixtures. Keep the source line numbers stable for S14 and S15.
import type { FileNode, Commit } from './editor';
import type { TerminalLine } from './terminal';

export const MONTH_PATH = 'src/calendar/month.ts';
export const MONTH_SOURCE = [
  'export interface CalendarCell {',
  '  day: number;',
  '  label: string;',
  '  weekday: number;',
  '}',
  '',
  '// The view asks the month builder for its cells.',
  'export function render(year: number, month: number): string {',
  '  const cells = buildMonth(year, month);',
  '  return cells.map((cell) => cell.label).join(" ");',
  '}',
  '',
  'const WEEK_LENGTH = 7;',
  '',
  'function labelFor(day: number): string {',
  '  return String(day).padStart(2, "0");',
  '}',
  '',
  '// Month numbers are one-based: October is 10.',
  'export function buildMonth(year: number, month: number): CalendarCell[] {',
  '  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();',
  '  const dates = daysIn(year, month);',
  '',
  '  return dates.map((day) => ({',
  '    day,',
  '    label: labelFor(day),',
  '    weekday: (firstWeekday + day - 1) % WEEK_LENGTH,',
  '  }));',
  '}',
  '',
  'function monthLength(year: number, month: number): number {',
  '  return new Date(Date.UTC(year, month, 0)).getUTCDate();',
  '}',
  '',
  '// Enumerate the day labels used by every calendar view.',
  'export function daysIn(year: number, month: number): number[] {',
  '  const days = monthLength(year, month);',
  '  const dates: number[] = [];',
  '',
  '  // Offsets start at zero; labels start at one.',
  '  // Issue #1031: October unexpectedly contains a day 32.',
  '  for (let d = 0; d <= days; d++) {',
  '    dates.push(d + 1);',
  '  }',
  '',
  '  return dates;',
  '}',
] as const;

export const FILE_TREE: readonly FileNode[] = [
  { name: 'src', children: [
    { name: 'calendar', children: [{ name: 'month.ts' }, { name: 'month.test.ts' }, { name: 'view.ts' }] },
    { name: 'components', children: [{ name: 'day-cell.ts' }] },
    { name: 'index.ts' },
  ] },
  { name: 'package.json' }, { name: 'tsconfig.json' }, { name: 'README.md' },
];

export const COMMITS: readonly Commit[] = [
  { hash: 'a1f3c9e', message: 'fix: calendar loop', detail: 'just now' },
  { hash: '3f9a2c1', message: 'fix a bit', detail: '2 min ago' },
  { hash: '8c4e1f0', message: 'fix', detail: '4 min ago' },
  { hash: 'a1b7d3e', message: 'feat: calendar view', detail: '1 hour ago' },
  { hash: '6f2c9ad', message: 'refactor: date utilities', detail: '2 hours ago' },
];

export const CALENDAR_TESTS = [
  'renders 31 days in October',
  'ends October on day 31',
  'never renders October 32',
  'renders 31 days in January',
  'renders 28 days in February',
  'renders 29 days in a leap year',
  'renders 30 days in April',
  'renders 31 days in December',
  'starts each month at day one',
  'keeps day labels consecutive',
  'contains no duplicate dates',
  'places the first weekday',
  'fills the final week exactly',
  'preserves UTC day boundaries',
  'wraps October into November',
  'wraps December into January',
  'pads single-digit day labels',
  'buildMonth matches month length',
  'render matches calendar cells',
] as const;

export function testOutput(status: 'fail' | 'pass'): TerminalLine[] {
  return [
    { kind: 'text', text: 'calendar / month.test.ts' },
    ...CALENDAR_TESTS.map((text): TerminalLine => ({ kind: 'test', status, text })),
    { kind: 'summary', failed: status === 'fail' ? 19 : 0, passed: status === 'pass' ? 19 : 0, total: 19 },
  ];
}

export const CALL_STACK = [
  { name: 'render', path: MONTH_PATH, line: 9 },
  { name: 'buildMonth', path: MONTH_PATH, line: 22 },
  { name: 'daysIn', path: MONTH_PATH, line: 42 },
] as const;

export const TODO_ITEMS = ['Read the code', 'Write a plan', 'Fix October'] as const;
export const CALENDAR_WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
export const CALENDAR_MONTHS = {
  october: { title: 'October', year: 2026, days: 31, firstWeekday: 4 },
  november: { title: 'November', year: 2026, days: 30, firstWeekday: 0 },
} as const;
export const CALENDAR_ISSUE = { number: 1031, title: 'Calendar shows October 32', label: 'bug', project: 'calendar' } as const;
export const NEXT_ISSUE = { number: 1032, project: 'calendar' } as const;
export const PR_TITLE = 'Fix October 32nd';
export const CALENDAR_ROLLOVER = { from: 'Oct 31', to: 'Nov 1', morning: ['09:00 / October 31', '09:00 / November 1'] } as const;

// Oldest first: additions enter at the bottom of the animated log.
// These fictional retries supplement COMMITS without changing its existing order.
export const GIT_LOG_COMMITS: readonly Commit[] = [
  { hash: '8c4e1f0', message: 'fix', detail: '09:41' },
  { hash: 'c91d2a7', message: 'fix', detail: '09:43' },
  { hash: '3f9a2c1', message: 'fix a bit', detail: '09:45' },
  { hash: 'd42b901', message: 'fix', detail: '09:46' },
  { hash: '7ac02d4', message: 'fix', detail: '09:47' },
  { hash: 'e0c8b31', message: 'fix a bit', detail: '09:48' },
  { hash: '19f0eac', message: 'fix', detail: '09:49' },
  { hash: 'b32a170', message: 'fix', detail: '09:50' },
  { hash: '5ed3c28', message: 'fix a bit', detail: '09:51' },
  { hash: 'ab40e19', message: 'fix', detail: '09:52' },
  { hash: '20d91c6', message: 'fix', detail: '09:53' },
  { hash: 'f312a8b', message: 'fix a bit', detail: '09:54' },
  { hash: '60a9d2e', message: 'fix', detail: '09:55' },
  { hash: 'a1f3c9e', message: 'fix: calendar loop', detail: '10:42' },
];
