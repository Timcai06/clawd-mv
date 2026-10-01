// The v4 story file: src/calendar/month.ts. Line 42 is the bug (`d <= days`), as sung
// ("There it is, on line forty-two"). Plates read it for code terrain, the call stack and line 42.
export const MONTH_V4 = [
  'export interface CalendarCell {',
  '  day: number;',
  '  label: string;',
  '  weekday: number;',
  '}',
  '',
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
  '  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();',
  '  const dates = daysIn(year, month);',
  '  return dates.map((day) => ({',
  '    day,',
  '    label: labelFor(day),',
  '    weekday: (first + day - 1) % WEEK_LENGTH,',
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
  '',
  '  // Walk every day offset of the month.',
  '  for (let d = 0; d <= days; d++) {',
  '    dates.push(d + 1);',
  '  }',
  '  return dates;',
  '}',
  '',
  '// TODO(clawd): read the code, write a plan',
] as const;

export const BUG_LINE = 42;
if (!MONTH_V4[BUG_LINE - 1]!.includes('<= days')) throw new Error('month-src: line 42 must be the bug');

/** Indent level (2 spaces = 1) of a 1-based line; blank lines take the indent of the next line. */
export function indentOf(ln: number): number {
  for (let i = ln - 1; i < MONTH_V4.length; i++) {
    const s = MONTH_V4[i]!;
    if (s.trim()) return (s.length - s.trimStart().length) / 2;
  }
  return 0;
}
