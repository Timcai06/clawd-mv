import { describe, expect, test } from 'bun:test';
import { commitHashPose, gitLogLayout } from '../src/kit/gitlog';
import { COMMITS, GIT_LOG_COMMITS, PR_TITLE } from '../src/kit/content';

const box = { x: 0, y: 0, width: 1000, height: 390 };

describe('commit pop and log overflow', () => {
  test('preserves existing content and adds chronological unique retry hashes', () => {
    expect(COMMITS[0]).toEqual({ hash: 'a1f3c9e', message: 'fix: calendar loop', detail: 'just now' });
    expect(GIT_LOG_COMMITS.slice(0, 3).map((c) => c.message)).toEqual(['fix', 'fix', 'fix a bit']);
    expect(GIT_LOG_COMMITS.at(-1)?.message).toBe('fix: calendar loop');
    expect(new Set(GIT_LOG_COMMITS.map((c) => c.hash)).size).toBe(GIT_LOG_COMMITS.length);
    expect(GIT_LOG_COMMITS.every((c) => /^[a-f0-9]{7}$/.test(c.hash))).toBe(true);
    expect(PR_TITLE).toBe('Fix October 32nd');
  });

  test('new entries push previous rows upward by exactly one row height', () => {
    const a = gitLogLayout(box, { rowCount: 2 }), b = gitLogLayout(box, { rowCount: 3 });
    expect(a.capacity).toBe(5);
    expect(b.rows[0].y).toBe(a.rows[0].y - a.rowHeight);
    expect(b.rows.at(-1)?.y).toBe(a.rows.at(-1)?.y);
    expect(b.overflowRows).toBe(0);
  });

  test('separates automatic content overflow from whole-panel displacement', () => {
    const full = gitLogLayout(box, { rowCount: 5 }), over = gitLogLayout(box, { rowCount: 8, overflow: 2.5 });
    expect(full.overflowRows).toBe(0); expect(full.scrollY).toBe(0);
    expect(over.count).toBe(8); expect(over.overflowRows).toBe(3); expect(over.scrollY).toBe(174);
    expect(over.panelY).toBe(-145);
    expect(over.rows[0].y).toBe(full.rows[0].y - 3 * 58);
    expect(gitLogLayout(box, { rowCount: 8, overflow: 8 }).panelY + box.height).toBeLessThan(0);
  });

  test('bounds reveals and keeps overflow units consistent at thumbnail scale', () => {
    expect(gitLogLayout(box, { rowCount: -4, overflow: -2 }).rows).toEqual([]);
    expect(gitLogLayout(box, { rowCount: 999 }).count).toBe(GIT_LOG_COMMITS.length);
    const small = gitLogLayout({ ...box, width: 500, height: 195 }, { rowCount: 8, overflow: 2 });
    expect(small.rows).toEqual(gitLogLayout(box, { rowCount: 8, overflow: 2 }).rows);
    expect(small.scale).toBe(0.5);
  });

  test('hash pop starts hidden, overshoots once and rests at identity', () => {
    expect(commitHashPose(0).opacity).toBe(0);
    expect(commitHashPose(0.6).scale).toBeGreaterThan(1);
    expect(commitHashPose(1)).toEqual({ scale: 1, y: 0, opacity: 1 });
  });
});
