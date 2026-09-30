import { F, font } from '../engine/type';
import { css, INK_SOFT } from '../theme';
import { drawIcon, type Box } from './icons';
import { syntaxRuns, syntaxStyle, tokenizeLines, typedText, type Emphasis } from './syntax';
import { drawTerminal, visibleLineRange, type TerminalState } from './terminal';

export type Activity = 'files' | 'search' | 'source' | 'run' | 'extensions';
export interface FileNode { name: string; children?: readonly FileNode[] }
export interface FileRow { name: string; path: string; depth: number; directory: boolean; expanded: boolean }
export interface Commit { hash: string; message: string; detail?: string }
export type SidebarState =
  | { mode: 'files'; files: readonly FileNode[]; expandedDepth?: number; expandedPaths?: readonly string[]; selectedPath?: string; title?: string }
  | { mode: 'source'; message: string; messageChars?: number; commits: readonly Commit[]; newCommitHash?: string; buttonLabel?: string; branch?: string };
export interface EditorState {
  /** Default: box.width / 1440. All dimensions below are before this scale. */
  scale?: number;
  activity?: Activity;
  sidebar?: SidebarState;
  sidebarWidth?: number;
  tabs: readonly { id: string; label: string; modified?: boolean }[];
  activeTab: string;
  breadcrumbs?: readonly string[];
  lines: readonly string[];
  /** One-based source line numbers; columns are zero-based UTF-16 offsets. */
  firstLine?: number;
  currentLine?: number;
  cursor?: { line: number; column: number; visible: boolean };
  typing?: { line: number; chars: number };
  emphasis?: readonly ({ line: number } & Emphasis)[];
  fontSize?: number;
  lineHeight?: number;
  terminal?: { height: number; state: TerminalState };
  status?: { branch?: string; language?: string; detail?: string };
}

/** Root directories have depth 0. expandedDepth=2 reveals src/calendar/month.ts.
 * If expandedPaths is provided it replaces the depth rule, including an empty list.
 */
export function flattenFiles(files: readonly FileNode[], expandedDepth = 0, expandedPaths?: readonly string[]): FileRow[] {
  const result: FileRow[] = [];
  const visit = (nodes: readonly FileNode[], parent: string, depth: number) => {
    for (const node of nodes) {
      const path = parent ? `${parent}/${node.name}` : node.name;
      const directory = node.children !== undefined;
      const expanded = directory && (expandedPaths ? expandedPaths.includes(path) : depth < expandedDepth);
      result.push({ name: node.name, path, depth, directory, expanded });
      if (expanded) visit(node.children!, path, depth + 1);
    }
  };
  visit(files, '', 0); return result;
}

export function editorLine(state: Pick<EditorState, 'lines' | 'typing'>, line: number): string {
  const text = state.lines[line - 1] ?? '';
  return state.typing?.line === line ? typedText(text, state.typing.chars) : text;
}

/** Geometry is shared by rendering and visibility tests. */
export function editorLayout(box: Box, state: EditorState) {
  const scale = state.scale ?? box.width / 1440;
  const w = box.width / scale, h = box.height / scale;
  const activityWidth = 58;
  const sidebarWidth = state.sidebar ? Math.max(0, Math.min(state.sidebarWidth ?? 282, w - activityWidth - 180)) : 0;
  const mainX = activityWidth + sidebarWidth, statusHeight = 28;
  const terminalHeight = state.terminal ? Math.max(0, Math.min(state.terminal.height, h - statusHeight - 110)) : 0;
  const code: Box = { x: mainX, y: 84, width: Math.max(0, w - mainX), height: Math.max(0, h - 84 - statusHeight - terminalHeight) };
  const size = Math.max(8, state.fontSize ?? 19), lineHeight = Math.max(size + 4, state.lineHeight ?? 30);
  return { scale, w, h, activityWidth, sidebarWidth, mainX, statusHeight, code, size, lineHeight,
    terminal: { x: mainX, y: h - statusHeight - terminalHeight, width: w - mainX, height: terminalHeight },
    visible: visibleLineRange(state.lines.length, state.firstLine ?? 1, code.height - 16, lineHeight) };
}

function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 14, weight = 500, soft = false) {
  c.font = font(F.archivo(100, weight), size); c.fillStyle = css('ink', soft ? INK_SOFT.strong : 1); c.fillText(text, x, y);
}

function drawSidebar(c: CanvasRenderingContext2D, box: Box, state: SidebarState) {
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x, box.y);
  const w = box.width;
  c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(0, 0, w, box.height);
  label(c, state.mode === 'files' ? 'EXPLORER' : 'SOURCE CONTROL', 20, 25, 13, 700);
  if (state.mode === 'files') {
    drawIcon(c, 'down', { x: 15, y: 54, width: 15, height: 15 });
    label(c, state.title ?? 'CALENDAR', 39, 62, 14, 700);
    const rows = flattenFiles(state.files, state.expandedDepth, state.expandedPaths);
    rows.forEach((row, i) => {
      const y = 98 + i * 32, x = 15 + row.depth * 20;
      if (row.path === state.selectedPath) {
        c.fillStyle = css('paper'); c.fillRect(0, y - 16, w, 32);
        c.fillStyle = css('clay'); c.fillRect(0, y - 16, 3, 32);
      }
      if (row.directory) drawIcon(c, row.expanded ? 'down' : 'chevron', { x, y: y - 7, width: 14, height: 14 });
      drawIcon(c, row.directory ? 'folder' : 'file', { x: x + 21, y: y - 8, width: 17, height: 17 }, css('ink', INK_SOFT.strong));
      label(c, row.name, x + 47, y, 15, row.path === state.selectedPath ? 700 : 500);
    });
  } else {
    c.fillStyle = css('paper'); c.fillRect(16, 51, w - 32, 58);
    c.save(); c.beginPath(); c.rect(26, 51, w - 52, 58); c.clip();
    label(c, typedText(state.message, state.messageChars) || 'Message', 26, 79, 15, 500, !state.message);
    c.restore();
    c.fillStyle = css('clay'); c.fillRect(16, 120, w - 32, 37);
    drawIcon(c, 'check', { x: 31, y: 130, width: 18, height: 18 });
    label(c, state.buttonLabel ?? 'Commit', 60, 139, 16, 700);
    label(c, state.branch ?? 'main', 20, 188, 14, 700);
    label(c, `${state.commits.length} COMMITS`, 20, 223, 12, 500, true);
    state.commits.forEach((commit, i) => {
      const y = 254 + i * 65, fresh = commit.hash === state.newCommitHash;
      if (fresh) { c.fillStyle = css('clay', INK_SOFT.faint); c.fillRect(0, y - 17, w, 61); }
      c.fillStyle = css(fresh ? 'clay' : 'ink', fresh ? 1 : INK_SOFT.mid);
      c.beginPath(); c.arc(23, y, 4, 0, Math.PI * 2); c.fill();
      if (i + 1 < state.commits.length) { c.fillStyle = css('ink', INK_SOFT.mid); c.fillRect(22.5, y + 7, 1, 51); }
      label(c, commit.message, 40, y, 15, fresh ? 700 : 500);
      c.font = font(F.mono(), 12); c.fillStyle = css(fresh ? 'clay' : 'ink', fresh ? 1 : INK_SOFT.strong);
      c.fillText(`${commit.hash}${fresh ? '  NEW' : ''}`, 40, y + 23);
      if (commit.detail) label(c, commit.detail, 166, y + 23, 11, 500, true);
    });
  }
  c.restore();
}

/** Flat, stateless editor surface; the caller owns time, transforms and compositing. */
export function drawEditor(c: CanvasRenderingContext2D, box: Box, state: EditorState): void {
  if (!(box.width > 0 && box.height > 0)) return;
  const l = editorLayout(box, state);
  if (!(l.scale > 0 && Number.isFinite(l.scale))) return;
  c.save(); c.translate(box.x, box.y); c.scale(l.scale, l.scale);
  c.beginPath(); c.rect(0, 0, l.w, l.h); c.clip();
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = css('paper'); c.fillRect(0, 0, l.w, l.h);
  c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(0, 0, l.activityWidth, l.h);
  const activity = state.activity ?? (state.sidebar?.mode === 'source' ? 'source' : 'files');
  (['files', 'search', 'source', 'run', 'extensions'] as const).forEach((name, i) => {
    const y = 20 + i * 61, active = activity === name;
    if (active) { c.fillStyle = css('clay'); c.fillRect(0, y - 8, 3, 42); }
    drawIcon(c, name, { x: 17, y, width: 25, height: 25 }, css('ink', active ? 1 : INK_SOFT.strong));
  });
  if (state.sidebar) drawSidebar(c, { x: l.activityWidth, y: 0, width: l.sidebarWidth, height: l.h - l.statusHeight }, state.sidebar);
  c.save(); c.beginPath(); c.rect(l.mainX, 0, l.w - l.mainX, 84); c.clip();
  c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(l.mainX, 0, l.w - l.mainX, 47);
  let x = l.mainX;
  for (const tab of state.tabs) {
    c.font = font(F.archivo(100, 500), 15);
    const width = Math.max(144, c.measureText(tab.label).width + 69), active = tab.id === state.activeTab;
    if (active) { c.fillStyle = css('paper'); c.fillRect(x, 0, width, 47); c.fillStyle = css('clay'); c.fillRect(x, 0, width, 2); }
    drawIcon(c, 'file', { x: x + 15, y: 15, width: 16, height: 16 }, css('ink', INK_SOFT.strong));
    label(c, tab.label, x + 40, 24, 15, active ? 700 : 500, !active);
    if (tab.modified) { c.fillStyle = css('clay'); c.beginPath(); c.arc(x + width - 17, 24, 3, 0, Math.PI * 2); c.fill(); }
    else drawIcon(c, 'close', { x: x + width - 23, y: 18, width: 12, height: 12 }, css('ink', INK_SOFT.strong));
    x += width;
  }
  x = l.mainX + 23;
  (state.breadcrumbs ?? []).forEach((part, i) => {
    label(c, part, x, 65, 13, 500, true); x += c.measureText(part).width + 10;
    if (i < state.breadcrumbs!.length - 1) { drawIcon(c, 'chevron', { x, y: 60, width: 11, height: 11 }, css('ink', INK_SOFT.strong)); x += 22; }
  });
  c.restore();
  c.save(); c.beginPath(); c.rect(l.code.x, l.code.y, l.code.width, l.code.height); c.clip();
  const tokens = tokenizeLines(state.lines);
  c.font = font(F.mono(), l.size);
  const cell = c.measureText('M').width, gutter = Math.max(65, String(state.lines.length).length * cell + 28);
  const textX = l.code.x + gutter + 18;
  for (let n = l.visible.first; n < l.visible.end; n++) {
    const y = l.code.y + 8 + (n - l.visible.first) * l.lineHeight;
    if (state.currentLine === n) {
      c.fillStyle = css('clay', INK_SOFT.faint); c.fillRect(l.code.x, y, l.code.width, l.lineHeight);
      c.fillStyle = css('clay'); c.fillRect(l.code.x, y, 3, l.lineHeight);
    }
    c.textAlign = 'right'; c.font = font(F.mono(), l.size - 2);
    c.fillStyle = css(state.currentLine === n ? 'clay' : 'ink', state.currentLine === n ? 1 : INK_SOFT.mid);
    c.fillText(String(n), l.code.x + gutter - 9, y + l.lineHeight / 2); c.textAlign = 'left';
    const visible = editorLine(state, n);
    const emphasis = (state.emphasis ?? []).filter((e) => e.line === n);
    c.save(); c.beginPath(); c.rect(textX, y, Math.max(0, l.code.x + l.code.width - textX - 12), l.lineHeight); c.clip();
    for (const run of syntaxRuns(tokens[n - 1]!, emphasis, visible.length)) {
      const style = syntaxStyle(run.kind, run.accent);
      c.font = font(F.mono(style.weight), l.size); c.fillStyle = style.color;
      c.fillText(run.text, textX + run.start * cell, y + l.lineHeight / 2);
    }
    if (state.cursor?.visible && state.cursor.line === n) {
      const column = typedText(visible, state.cursor.column).length;
      c.fillStyle = css('clay'); c.fillRect(textX + column * cell, y + 4, 2, l.lineHeight - 8);
    }
    c.restore();
  }
  c.restore();
  if (state.terminal) drawTerminal(c, l.terminal, { ...state.terminal.state, scale: state.terminal.state.scale ?? 1 });
  const sy = l.h - l.statusHeight;
  c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(0, sy, l.w, l.statusHeight);
  drawIcon(c, 'source', { x: 15, y: sy + 7, width: 14, height: 14 });
  label(c, state.status?.branch ?? 'main', 37, sy + 14, 12);
  const status = state.status?.detail ?? `Ln ${state.cursor?.line ?? state.currentLine ?? 1}, Col ${(state.cursor?.column ?? 0) + 1}    UTF-8`;
  c.textAlign = 'right'; label(c, `${status}    ${state.status?.language ?? 'TypeScript'}`, l.w - 18, sy + 14, 12, 500, true);
  c.restore();
}
