import { describe, expect, test } from 'bun:test';
import { prDiffRows, prReviewPose } from '../src/kit/pr';
import { MONTH_SOURCE, PR_COPY, PR_TITLE } from '../src/kit/content';

describe('October pull request', () => {
  test('one deletion and one addition remove exactly the extra equals sign on line 42', () => {
    const [before, after] = prDiffRows();
    expect(PR_TITLE).toBe('Fix October 32nd'); expect(PR_COPY.stats).toBe('+1 −1');
    expect(PR_COPY.context).toContain('#1031'); expect(PR_COPY.review).toBe('✓ LGTM');
    expect(before.text).toBe('- for (let d = 0; d <= days; d++) {');
    expect(after.text).toBe('+ for (let d = 0; d < days; d++) {');
    expect(before.text.slice(2)).toBe(MONTH_SOURCE[41].trim());
    expect(after.text.slice(2)).toBe(before.text.slice(2).replace('<=', '<'));
    expect([before.line, after.line]).toEqual([42, 42]); expect([before.color, after.color]).toEqual(['fail', 'pass']);
  });
  test('reveals diff rows in order and brings the review to rest', () => {
    expect(prDiffRows(0).map((r) => r.reveal)).toEqual([0, 0]);
    expect(prDiffRows(0.75).map((r) => r.reveal)).toEqual([1, 0.5]);
    expect(prDiffRows(2).map((r) => r.reveal)).toEqual([1, 1]);
    expect(prReviewPose(0).opacity).toBe(0); expect(prReviewPose(1)).toEqual({ opacity: 1, scale: 1, y: 0 });
  });
});
