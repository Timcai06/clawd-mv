import { describe, expect, test } from 'bun:test';
import { gitConfetti, gitMergePoint } from '../src/kit/gitgraph';

describe('merge graph and seeded confetti', () => {
  test('return path connects the branch tip to main at its endpoints', () => {
    expect(gitMergePoint(0)).toEqual({ x: 680, y: 350 });
    expect(gitMergePoint(1)).toEqual({ x: 860, y: 190 });
    const mid = gitMergePoint(0.5); expect(mid.x).toBeGreaterThan(680); expect(mid.y).toBeLessThan(350);
    expect(gitMergePoint(-1)).toEqual(gitMergePoint(0)); expect(gitMergePoint(2)).toEqual(gitMergePoint(1));
  });
  test('confetti is independent of render order, moves and keeps its shapes and palette', () => {
    const a = gitConfetti(0.35); gitConfetti(0.9);
    expect(gitConfetti(0.35)).toEqual(a); const b = gitConfetti(0.6);
    expect(b).not.toEqual(a); expect(a).toHaveLength(64);
    a.forEach((p, i) => {
      expect(['ink', 'clay', 'paper']).toContain(p.color);
      expect([p.width, p.height, p.color]).toEqual([b[i].width, b[i].height, b[i].color]);
      expect(b[i].y).toBeGreaterThan(p.y);
    });
    expect(gitConfetti(0).every((p) => p.opacity === 0)).toBe(true);
    expect(gitConfetti(1).every((p) => p.opacity === 0)).toBe(true);
  });
});
