import { F, font } from '../engine/type';
import { css, INK_SOFT } from '../theme';
import { drawIcon, type Box } from './icons';
import { typedText } from './syntax';

export type TerminalLine =
  | { kind: 'text'; text: string; muted?: boolean }
  | { kind: 'test'; text: string; status: 'fail' | 'pass' }
  | { kind: 'summary'; failed: number; passed: number; total?: number };

export interface TerminalState {
  /** Default: box.width / 1000. Set 1 inside an editor's local coordinates. */
  scale?: number;
  tabs?: readonly string[];
  activeTab?: string;
  shell?: string;
  prompt?: string;
  command?: string;
  /** Number of visible UTF-16 code units, clamped to the command length. */
  commandChars?: number;
  cursorVisible?: boolean;
  lines?: readonly TerminalLine[];
  /** Reveal the first N output entries before applying the scroll position. */
  visibleOutputCount?: number;
  /** One-based output entry; the command stays above the output viewport. */
  firstLine?: number;
  fontSize?: number;
  lineHeight?: number;
}

/** One-based [first, end) range, including only complete rows. */
export function visibleLineRange(total: number, firstLine: number, height: number, lineHeight: number) {
  const count = Math.max(0, Math.floor(Number.isFinite(total) ? total : 0));
  const first = Math.max(1, Math.min(Math.max(1, count), Math.floor(Number.isFinite(firstLine) ? firstLine : 1)));
  const capacity = lineHeight > 0 && Number.isFinite(lineHeight) && Number.isFinite(height)
    ? Math.max(0, Math.floor(height / lineHeight)) : 0;
  return { first, end: Math.min(count + 1, first + capacity), capacity };
}

/** Pure Canvas2D panel. No wrapping: long lines clip at the panel's right edge. */
export function drawTerminal(c: CanvasRenderingContext2D, box: Box, state: TerminalState): void {
  const scale = state.scale ?? box.width / 1000;
  if (!(box.width > 0 && box.height > 0 && scale > 0 && Number.isFinite(scale))) return;
  const w = box.width / scale, h = box.height / scale;
  const size = Math.max(8, state.fontSize ?? 17), lineHeight = Math.max(size + 4, state.lineHeight ?? 27);
  c.save(); c.translate(box.x, box.y); c.scale(scale, scale);
  c.beginPath(); c.rect(0, 0, w, h); c.clip();
  c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillStyle = css('paper'); c.fillRect(0, 0, w, h);
  c.fillStyle = css('ink', INK_SOFT.faint); c.fillRect(0, 0, w, 1);
  const tabs = state.tabs ?? ['PROBLEMS', 'OUTPUT', 'DEBUG CONSOLE', 'TERMINAL'];
  let tx = 20;
  c.save(); c.beginPath(); c.rect(0, 0, Math.max(0, w - 125), 46); c.clip();
  for (const tab of tabs) {
    const active = tab === (state.activeTab ?? 'TERMINAL');
    c.font = font(F.archivo(100, active ? 700 : 500), 13);
    c.fillStyle = css('ink', active ? 1 : INK_SOFT.strong);
    c.fillText(tab, tx, 23);
    const width = c.measureText(tab).width;
    if (active) { c.fillStyle = css('clay'); c.fillRect(tx, 43, width, 3); }
    tx += width + 26;
  }
  c.restore();
  if (w > 240) {
    drawIcon(c, 'terminal', { x: w - 112, y: 15, width: 17, height: 17 });
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 13);
    c.fillText(state.shell ?? 'zsh', w - 87, 23);
    drawIcon(c, 'plus', { x: w - 40, y: 15, width: 17, height: 17 });
  }
  c.save(); c.beginPath(); c.rect(20, 54, Math.max(0, w - 40), Math.max(0, h - 54)); c.clip();
  const prompt = state.prompt ?? 'clawd ~/calendar $';
  const command = typedText(state.command ?? '', state.commandChars);
  const baseline = 58 + lineHeight / 2;
  c.font = font(F.mono(600), size); c.fillStyle = css('ink'); c.fillText(prompt, 20, baseline);
  const commandX = 20 + c.measureText(prompt + ' ').width;
  c.font = font(F.mono(), size); c.fillText(command, commandX, baseline);
  if (state.cursorVisible) {
    const x = commandX + c.measureText(command).width;
    c.fillStyle = css('clay'); c.fillRect(x + 1, baseline - size * 0.6, 2, size * 1.2);
  }
  const lines = state.lines ?? [];
  const revealed = state.visibleOutputCount === undefined ? lines.length
    : Math.max(0, Math.min(lines.length, Math.floor(state.visibleOutputCount) || 0));
  const outputY = 58 + lineHeight + 8;
  const range = visibleLineRange(revealed, state.firstLine ?? 1, h - outputY - 14, lineHeight);
  for (let n = range.first; n < range.end; n++) {
    const line = lines[n - 1]!;
    const y = outputY + (n - range.first + 0.5) * lineHeight;
    c.font = font(F.mono(), size);
    if (line.kind === 'test') {
      c.fillStyle = css(line.status); c.fillText(line.status === 'pass' ? '✓' : '✗', 20, y);
      c.fillText(line.text, 20 + size * 1.8, y);
    } else if (line.kind === 'summary') {
      let x = 20;
      c.font = font(F.mono(600), size);
      for (const [count, status, label] of [[line.failed, 'fail', 'failed'], [line.passed, 'pass', 'passed']] as const) {
        if (count <= 0) continue;
        const text = `${count} ${label}`;
        c.fillStyle = css(status); c.fillText(text, x, y); x += c.measureText(text + '  ').width;
      }
      if (line.total !== undefined) {
        c.fillStyle = css('ink', INK_SOFT.strong); c.fillText(`/ ${line.total} tests`, x, y);
      }
    } else {
      c.fillStyle = css('ink', line.muted ? INK_SOFT.strong : 1); c.fillText(line.text, 20, y);
    }
  }
  c.restore(); c.restore();
}
