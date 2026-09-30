import { describe, expect, test } from 'bun:test';
import { CREDIT_LINES, creditsState } from '../src/kit/credits';

describe('credits reveal', () => {
  test('includes all six requested lines in order', () => {
    expect(creditsState(10).lines.map((line) => line.text)).toEqual([...CREDIT_LINES]);
    expect(CREDIT_LINES).toHaveLength(6);
    expect(CREDIT_LINES[3]).toContain('three.js, rendered frame by frame');
    expect(CREDIT_LINES[5]).toContain('fan work, non-commercial');
  });
  test('staggered rows have independent, clamped progress', () => {
    expect(creditsState(-1).lines.every((line) => line.progress === 0)).toBe(true);
    const halfway = creditsState(0.375);
    expect(halfway.lines[0].progress).toBe(0.5);
    expect(halfway.lines.slice(1).every((line) => line.progress === 0)).toBe(true);
    const stagger = creditsState(1.075);
    expect(stagger.lines[0].progress).toBe(1);
    expect(stagger.lines[1].progress).toBeCloseTo(0.5);
    expect(stagger.lines[2].progress).toBe(0);
    expect(creditsState(4.25).lines.every((line) => line.progress === 1)).toBe(true);
  });
  test('a production start anchor translates the reveal without changing it', () => {
    expect(creditsState(154, 153)).toEqual(creditsState(1));
    const a = creditsState(1.5); creditsState(7); creditsState(-3);
    expect(creditsState(1.5)).toEqual(a);
  });
  test('replacement copy follows display-title and mono punctuation rules', () => {
    const copy = ['"Hello..."', 'Clawd’s day'];
    const state = creditsState(5, 0, copy);
    expect(state.lines.map((line) => line.text)).toEqual(['“Hello…”', "Clawd's day"]);
    expect(copy).toEqual(['"Hello..."', 'Clawd’s day']);
    expect(creditsState(5, 0, []).lines).toEqual([]);
  });
});
