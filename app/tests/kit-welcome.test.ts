import { describe, expect, test } from 'bun:test';
import { welcomeLayout, welcomeLines } from '../src/kit/welcome';
import { WELCOME_LINES } from '../src/kit/content';

describe('welcome printing and sprite slot', () => {
  test('prints completed lines and only the requested characters of the next', () => {
    expect(welcomeLines({ lineCount: 1, charCount: 5 })).toEqual([WELCOME_LINES[0], 'cwd: ']);
    expect(welcomeLines({ lineCount: 0, charCount: 0 })).toEqual(['']);
    expect(welcomeLines({ lineCount: 99 })).toEqual([...WELCOME_LINES]);
    expect(welcomeLines({ lines: [], cursor: true })).toEqual([]);
    expect(welcomeLines({ lines: ['abc', 'def'], lineCount: -2, charCount: -3 })).toEqual(['']);
  });
  test('slot preserves 16x5 proportions and follows a scaled, centred panel', () => {
    const a = welcomeLayout({ x: 0, y: 0, width: 1200, height: 640 });
    const b = welcomeLayout({ x: 20, y: 30, width: 600, height: 400 });
    expect(b.scale).toBe(0.5); expect(b.clawd.width / b.clawd.height).toBe(16 / 5);
    expect(b.clawd.x).toBe(20 + a.clawd.x / 2);
    expect(b.clawd.y).toBe(30 + 40 + a.clawd.y / 2);
    expect(WELCOME_LINES.join('\n')).toContain('Issue #1031');
  });
});
