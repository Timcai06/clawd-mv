// The film-long editor status bar (v4, docs/V4-DESIGN.md 3.6): Ln (the altimeter), tests,
// clock, branch. A hairline strip along the bottom edge; plates pass their state.
import { F, font } from '../engine/type';
import { css } from '../theme';

export interface StatusState {
  ln: number; col?: number;
  tests?: { red: number; green: number; total: number } | null;
  clock: string; branch: string; file?: string;
  on: 'ink' | 'paper' | 'clay';
  alpha?: number;
  /** Highlight the Ln field (e.g. while it scrolls). */
  hot?: number;
}

export function drawStatus(c: CanvasRenderingContext2D, s: StatusState) {
  const a = s.alpha ?? 1;
  if (a <= 0) return;
  const fg = s.on === 'paper' ? 'ink' : 'paper';
  const y = 1080 - 30;
  c.save();
  c.globalAlpha = a;
  c.strokeStyle = css(fg, 0.18); c.lineWidth = 1;
  c.beginPath(); c.moveTo(48, y - 22); c.lineTo(1920 - 48, y - 22); c.stroke();
  c.font = font(F.mono(500), 15); c.textBaseline = 'alphabetic';
  let x = 48;
  const put = (txt: string, al = 0.55, col: 'paper' | 'ink' | 'clay' = fg) => {
    c.fillStyle = css(col, al); c.fillText(txt, x, y); x += c.measureText(txt).width + 34;
  };
  put(s.file ?? 'src/calendar/month.ts', 0.4);
  const ln = `Ln ${Math.max(1, Math.round(s.ln))}, Col ${s.col ?? 1}`;
  put(ln, 0.55 + 0.45 * (s.hot ?? 0), (s.hot ?? 0) > 0.5 ? 'clay' : fg);
  if (s.tests) put(`tests ${s.tests.green}/${s.tests.total}${s.tests.red ? `  ✗ ${s.tests.red}` : ''}`, 0.55);
  c.textAlign = 'right';
  c.fillStyle = css(fg, 0.55); c.fillText(`${s.branch}   ${s.clock}`, 1920 - 48, y);
  c.restore();
}
