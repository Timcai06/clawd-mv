import { describe, expect, test } from 'bun:test';
import { editorLayout, editorLine, flattenFiles, type EditorState } from '../src/kit/editor';
import { FILE_TREE, MONTH_PATH, MONTH_SOURCE } from '../src/kit/content';

const state: EditorState = {
  tabs: [{ id: 'month', label: 'month.ts' }], activeTab: 'month', lines: MONTH_SOURCE,
  sidebar: { mode: 'files', files: FILE_TREE, expandedDepth: 2 }, firstLine: 34, currentLine: 42,
};

describe('editor state and layout', () => {
  test('file expansion follows src -> calendar -> month.ts', () => {
    expect(flattenFiles(FILE_TREE, 0).map((r) => r.path)).not.toContain('src/calendar');
    expect(flattenFiles(FILE_TREE, 1).map((r) => r.path)).toContain('src/calendar');
    expect(flattenFiles(FILE_TREE, 1).map((r) => r.path)).not.toContain(MONTH_PATH);
    expect(flattenFiles(FILE_TREE, 2).find((r) => r.path === MONTH_PATH)?.depth).toBe(2);
    expect(flattenFiles(FILE_TREE, 9, []).map((r) => r.path)).not.toContain('src/calendar');
    expect(flattenFiles(FILE_TREE, 0, ['src', 'src/calendar']).map((r) => r.path)).toContain(MONTH_PATH);
  });

  test('typing affects only the specified one-based line without changing source', () => {
    const input = { ...state, typing: { line: 42, chars: 7 } };
    expect(editorLine(input, 42)).toBe('  for (');
    expect(editorLine(input, 43)).toBe('    dates.push(d + 1);');
    expect(editorLine(input, 0)).toBe('');
    expect(MONTH_SOURCE[41]).toBe('  for (let d = 0; d <= days; d++) {');
  });

  test('uniformly shrinking the box keeps source visibility and local geometry', () => {
    const large = editorLayout({ x: 0, y: 0, width: 1440, height: 810 }, state);
    const small = editorLayout({ x: 300, y: 50, width: 480, height: 270 }, state);
    expect(small.code).toEqual(large.code);
    expect(small.visible).toEqual(large.visible);
    expect(small.scale).toBeCloseTo(1 / 3);
    expect(large.visible.first).toBe(34);
    expect(large.visible.end).toBeGreaterThan(42);
  });

  test('a terminal consumes code rows while preserving the scroll origin', () => {
    const full = editorLayout({ x: 0, y: 0, width: 1440, height: 810 }, { ...state, firstLine: 1 });
    const panel = editorLayout({ x: 0, y: 0, width: 1440, height: 810 }, {
      ...state, firstLine: 1, terminal: { height: 300, state: {} },
    });
    expect(full.visible.end - panel.visible.end).toBe(10);
    expect(panel.code.y + panel.code.height).toBe(panel.terminal.y);
    expect(panel.visible.first).toBe(1);
  });
});
