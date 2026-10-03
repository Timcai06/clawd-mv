// S06's sung rows are written by the pen that ticks the boxes (stage 9 ②, docs/reference/polish-gaps.md):
// "Read the code" and "write a plan" keep the list's bold variable type (T 2026-10-03: the
// single-stroke font read too thin), and the pen sweeps along each row's baseline, developing every
// letter while it is sung (pdoom's letter timing: the first 80 % of the word, at most 0.7 s).
// The pen head is the cursor. Pure functions of t; the layout is built once fonts are loaded.
import type { Line } from '../../engine/lyrics';
import type { Voice } from '../../kit/lyric-moves';
import { affine, drawInscription, headX, inscribe, type Inscription } from '../../kit/inscribe';
import { TODO_ROWS } from './s06-timing';

export interface PlotRow { ins: Inscription; x: number; y: number; first: number }

/** The two rows, each word in the shape it ends with (nothing reflows while it is written). */
export function plotRows(v: Voice, plan: Line): PlotRow[] {
  return ([[0, 0], [1, 3]] as const).map(([r, first]) => {
    const words = plan.words.slice(first, first + 3);
    const ins = inscribe(words.map((w) => ({ ...v.form(w, w.end), born: 1, age: 0 })), TODO_ROWS[r].size, { space: 0.4 });
    return { ins, x: TODO_ROWS[r].x, y: TODO_ROWS[r].y, first };
  });
}

/** Write the rows up to t; returns the pen head (sheet px, on the baseline) of the newest row, if any. */
export function drawPlot(c: CanvasRenderingContext2D, v: Voice, plan: Line, rows: PlotRow[], t: number) {
  let head: { x: number; y: number } | null = null;
  for (const r of rows) {
    if (t < r.ins.glyphs[0]!.t) continue;
    const reveal = headX(r.ins, t);
    const live: Inscription = { ...r.ins, glyphs: r.ins.glyphs.map((g) => ({ ...g, form: v.form(plan.words[r.first + g.wi]!, t) })) };
    drawInscription(c, live, t, { on: 'paper', head: 'scan', reveal, place: (_g, x) => affine(r.x + x, r.y) });
    head = { x: r.x + reveal, y: r.y };
  }
  return head;
}
/** Where the pen rests before it writes: at the first row's start. */
export const plotRest = () => ({ x: TODO_ROWS[0].x, y: TODO_ROWS[0].y });
/** True while a row is being written (between its first and last letter, plus the carriage step). */
export const plotWriting = (rows: PlotRow[], t: number) =>
  rows.some((r) => t >= r.ins.glyphs[0]!.t && t < r.ins.glyphs.at(-1)!.t + 0.06);
