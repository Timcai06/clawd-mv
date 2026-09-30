import { expect, test } from 'bun:test';
import { notificationPose, notificationTitle } from '../src/kit/notify';
import { NEXT_ISSUE } from '../src/kit/content';

test('notification supports the first issue and the next-day issue', () => {
  expect(notificationTitle({})).toBe('Issue #1031 · calendar');
  expect(notificationTitle({ issueNumber: NEXT_ISSUE.number })).toBe('Issue #1032 · calendar');
});

test('notification travels from below-right, rebounds once and settles exactly', () => {
  expect(notificationPose(0)).toEqual({ x: 70, y: 210, opacity: 0, scale: 0.94 });
  expect(notificationPose(0.6).y).toBeLessThan(0);
  expect(notificationPose(1)).toEqual({ x: 0, y: 0, opacity: 1, scale: 1 });
  const ys = Array.from({ length: 101 }, (_, i) => notificationPose(i / 100).y);
  const changes = ys.slice(1).map((v, i) => Math.sign(v - ys[i]));
  expect(changes.filter((v, i) => i > 0 && v !== changes[i - 1])).toHaveLength(1);
});
