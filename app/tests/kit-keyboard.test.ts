import { describe, expect, test } from 'bun:test';
import { keyboardKeys, keyboardLayout } from '../src/kit/keyboard';
import { KEYBOARD_ROWS } from '../src/kit/content';

describe('ANSI keyboard motion', () => {
  test('rows have equal width, unique indices, wide space and a unique Enter key', () => {
    expect(KEYBOARD_ROWS.map((row) => row.reduce((sum, [, width]) => sum + width, 0))).toEqual([15, 15, 15, 15, 15]);
    const keys = keyboardKeys({});
    expect(new Set(keys.map((k) => k.index)).size).toBe(keys.length);
    expect(keys.filter((k) => k.label === 'Enter')).toHaveLength(1);
    expect(keys.find((k) => k.label === 'Space')!.width).toBeGreaterThan(keys.find((k) => k.label === 'A')!.width);
    expect(keys.every((k) => k.down === 0)).toBe(true);
  });
  test('per-key travel overrides the deterministic spatial wave and stays bounded', () => {
    const state = { wavePhase: 0.3, depressions: [0, 2, -1], highlightKey: 'Enter' };
    const a = keyboardKeys(state); keyboardKeys({ wavePhase: 0.9 }); expect(keyboardKeys(state)).toEqual(a);
    expect(a.slice(0, 3).map((k) => k.down)).toEqual([0, 1, 0]);
    expect(a.filter((k) => k.highlight).map((k) => k.label)).toEqual(['Enter']);
    expect(keyboardKeys({ wavePhase: 0.8 })).not.toEqual(keyboardKeys({ wavePhase: 0.3 }));
    const l = keyboardLayout({ x: 30, y: 20, width: 600, height: 215 }, {});
    expect(l.scale).toBe(0.5); expect(l.x).toBe(30); expect(l.y).toBe(20);
  });
});
