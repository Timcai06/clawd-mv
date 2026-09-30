import { F, font } from '../engine/type';
import { clamp, hash, mulberry32, type V2 } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import { CALENDAR_TESTS } from './content';
import type { Box } from './icons';

export type TestStatus = 'idle' | 'running' | 'fail' | 'pass';
export interface TestListState {
  names?: readonly string[];
  statuses?: readonly TestStatus[];
  defaultStatus?: TestStatus;
  visibleCount?: number;
  /** When supplied, the first N tests pass and all remaining tests fail. */
  passedCount?: number;
  fracture?: number;
  /** Discrete phase supplied by the scene, e.g. frameIdx(t). */
  twitchPhase?: number;
  /** Maximum horizontal displacement in row-height units. */
  twitchAmount?: number;
  showCount?: boolean;
}

export function testRows(state: TestListState) {
  const names = state.names ?? CALENDAR_TESTS;
  const visible = Math.floor(clamp(state.visibleCount ?? names.length, 0, names.length));
  return names.slice(0, visible).map((name, i) => ({ name, status: state.passedCount === undefined
    ? state.statuses?.[i] ?? state.defaultStatus ?? 'fail'
    : i < Math.floor(state.passedCount) ? 'pass' as const : 'fail' as const }));
}

/** Counts only revealed rows; the pass denominator is the complete suite. */
export function testCounts(state: TestListState) {
  const rows = testRows(state), total = (state.names ?? CALENDAR_TESTS).length;
  const passed = rows.filter((r) => r.status === 'pass').length;
  const failed = rows.filter((r) => r.status === 'fail').length;
  const running = rows.filter((r) => r.status === 'running').length;
  const text = failed > 0 ? `${failed} failed${passed ? ` · ${passed}/${total} passed` : ''}`
    : passed > 0 ? `${passed}/${total} passed` : running ? `${running} running` : `${rows.length} not run`;
  return { passed, failed, running, total, text };
}

export function testRowOffset(row: number, phase = 0, amount = 0): V2 {
  const a = Math.max(0, amount);
  if (a === 0) return { x: 0, y: 0 };
  return { x: (hash(1031, row, phase, 0) * 2 - 1) * a, y: (hash(1031, row, phase, 1) * 2 - 1) * a * 0.35 };
}

/** Six adjacent quadrilaterals tile a row at progress zero. Units are row-local pixels. */
export function testRowFragments(row: number, width: number, height: number, progress: number) {
  const random = mulberry32(1031 + row * 997), p = clamp(progress);
  const top = [0], bottom = [0];
  for (let i = 1; i < 6; i++) {
    top.push(width * (i + (random() - 0.5) * 0.65) / 6);
    bottom.push(width * (i + (random() - 0.5) * 0.65) / 6);
  }
  top.push(width); bottom.push(width);
  return Array.from({ length: 6 }, (_, i) => {
    const points = [{ x: top[i], y: 0 }, { x: top[i + 1], y: 0 }, { x: bottom[i + 1], y: height }, { x: bottom[i], y: height }];
    const origin = { x: (top[i] + top[i + 1] + bottom[i] + bottom[i + 1]) / 4, y: height / 2 };
    return { points, origin, x: (random() - 0.5) * width * 0.6 * p,
      y: (random() - 0.6) * height * 7 * p + height * 20 * p * p,
      rotation: (random() - 0.5) * 2.8 * p, opacity: 1 - p };
  });
}

/** Flat test surface; all damage and jitter are caller-controlled. */
export function drawTestList(c: CanvasRenderingContext2D, box: Box, state: TestListState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const scale = Math.min(box.width / 1000, box.height / 850), w = box.width / scale, h = box.height / scale;
  const rows = testRows(state), counts = testCounts(state), p = clamp(state.fracture ?? 0), rowHeight = 37;
  c.save(); c.translate(box.x, box.y); c.scale(scale, scale);
  c.beginPath(); c.rect(0, 0, w, h); c.clip();
  c.fillStyle = css('paper'); c.fillRect(0, 0, w, h);
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.font = font(F.mono(600), 20); c.fillStyle = css('ink'); c.fillText('calendar / month.test.ts', 24, 34);
  rows.forEach((row, i) => {
    const offset = testRowOffset(i, state.twitchPhase, (state.twitchAmount ?? 0) * rowHeight);
    const paint = () => {
      c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(0, rowHeight - 1, w - 48, 1);
      c.font = font(F.mono(), 20);
      c.fillStyle = row.status === 'fail' || row.status === 'pass' ? css(row.status) : css('ink', INK_SOFT.strong);
      c.fillText(({ fail: '✗', pass: '✓', idle: '·', running: '›' })[row.status], 8, rowHeight / 2);
      c.fillText(row.name, 48, rowHeight / 2);
    };
    c.save(); c.translate(24 + offset.x, 68 + i * rowHeight + offset.y);
    if (p <= 0) paint();
    else if (p < 1) for (const shard of testRowFragments(i, w - 48, rowHeight, p)) {
      c.save(); c.translate(shard.origin.x + shard.x, shard.origin.y + shard.y); c.rotate(shard.rotation);
      c.translate(-shard.origin.x, -shard.origin.y); c.globalAlpha *= shard.opacity;
      c.beginPath(); shard.points.forEach((pt, j) => j ? c.lineTo(pt.x, pt.y) : c.moveTo(pt.x, pt.y)); c.closePath(); c.clip();
      paint(); c.restore();
    }
    c.restore();
  });
  if (state.showCount !== false) {
    c.fillStyle = css('paper'); c.fillRect(0, h - 65, w, 65);
    c.font = font(F.mono(600), 27); c.fillStyle = css(counts.failed ? 'fail' : counts.passed ? 'pass' : 'ink');
    c.fillText(counts.text, 24, h - 31);
  }
  c.restore();
}
