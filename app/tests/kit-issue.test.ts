import { expect, test } from 'bun:test';
import { issueCircle, issueStampPose, issueTitle } from '../src/kit/issue';
import { CALENDAR_ISSUE } from '../src/kit/content';

test('issue title types from empty to the exact storyboard title', () => {
  expect(issueTitle({ titleProgress: 0 })).toBe('');
  expect(issueTitle({ titleProgress: 0.5 })).toBe(CALENDAR_ISSUE.title.slice(0, Math.floor(CALENDAR_ISSUE.title.length / 2)));
  expect(issueTitle({ titleProgress: 1 })).toBe('Calendar shows October 32');
  expect(issueStampPose(0).scale).toBe(2.5);
  expect(issueStampPose(1)).toEqual({ scale: 1, y: 0, opacity: 1 });
});

test('annotation surrounds day 32 in the actual thumbnail coordinate system', () => {
  const box = { x: 40, y: 50, width: 250, height: 205 };
  const circle = issueCircle(box, { dayCount: 32 }, 0.5)!;
  expect(circle.x).toBe(62); expect(circle.y).toBe(234.5); expect(circle.radius).toBe(16);
  expect(circle.endAngle).toBeCloseTo(Math.PI / 2);
  expect(issueCircle(box, { dayCount: 31 })).toBeNull();
  expect(issueCircle(box, { dayCount: 32, extraBurst: 1 })).toBeNull();
});
