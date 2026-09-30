import { describe, expect, test } from 'bun:test';
import { textRainDrops, wordImpactPose } from '../src/kit/textrain';
import { STACK_RAIN_LINES, UNDEFINED_WORD } from '../src/kit/content';

const box = { x: 50, y: 20, width: 1200, height: 600 };
describe('stateless stack rain and word impact', () => {
  test('repeat rendering and backward seeks reproduce every drop', () => {
    const state = { phase: 0.32, density: 0.75, speed: 1.2, angle: 0.15 };
    const a = textRainDrops(box, state); textRainDrops(box, { phase: 12 });
    expect(textRainDrops(box, state)).toEqual(a); expect(a).toHaveLength(54);
    expect(textRainDrops(box, { ...state, phase: 0.4 })).not.toEqual(a);
    expect(STACK_RAIN_LINES).toContain('at daysIn (month.ts:42)');
    expect(a.some((d) => d.text === 'at daysIn (month.ts:42)')).toBe(true);
  });
  test('density preserves drop identities and speed zero freezes positions', () => {
    expect(textRainDrops(box, { phase: 2, density: 0.5 })).toEqual(textRainDrops(box, { phase: 2 }).slice(0, 36));
    expect(textRainDrops(box, { phase: 2, density: 0 })).toEqual([]);
    expect(textRainDrops(box, { phase: -20, speed: 0 })).toEqual(textRainDrops(box, { phase: 20, speed: 0 }));
    expect(textRainDrops(box, { phase: -20, angle: 20 }).every((d) => Number.isFinite(d.x) && Number.isFinite(d.y))).toBe(true);
    expect(textRainDrops(box, { phase: 2, angle: 0.2 })).not.toEqual(textRainDrops(box, { phase: 2, angle: 0 }));
  });
  test('impact accelerates, lands and only then squashes around the ground', () => {
    const start = wordImpactPose({ fall: 0 }), mid = wordImpactPose({ fall: 0.5 }), end = wordImpactPose({ fall: 1 });
    expect(UNDEFINED_WORD).toBe('undefined'); expect(start.y).toBeLessThan(mid.y); expect(mid.y).toBeLessThan(end.y);
    expect(end.y).toBe(0); expect(wordImpactPose({ fall: 0.5, squash: 1 }).scaleY).toBe(1);
    const flat = wordImpactPose({ fall: 1, squash: 1 });
    expect(flat.y).toBe(0); expect(flat.scaleY).toBeCloseTo(0.45); expect(flat.scaleX).toBeCloseTo(1.18);
  });
});
