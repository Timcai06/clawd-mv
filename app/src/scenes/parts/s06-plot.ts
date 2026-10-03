// S06's sung rows are plotted (stage 9 ②, docs/reference/polish-gaps.md): "Read the code" and
// "write a plan" are written by the same pen that ticks the boxes, in a single-stroke font, each
// letter while its word is sung (pdoom's letter timing: the first 80 % of the word, at most 0.7 s).
// The pen head is the cursor. Pure functions of t; the layout is built once fonts are loaded.
import type { Line } from '../../engine/lyrics';
import { drawStrokeText, strokeText, writtenLength, type StrokeText } from '../../engine/stroke';
import { heatColor, type Voice } from '../../kit/lyric-moves';
import { letterSpan } from '../../kit/inscribe';
import { TODO_ROWS } from './s06-timing';

/** Cap height of the plotted rows (the lyric tier of TYPE_LEVELS) and the pen's line width. */
export const PLOT = { cap: 56, pen: 7, space: 0.42, font: 'readable' } as const;
export interface PlotWord { st: StrokeText; x: number; y: number; wi: number; times: [number, number][] }

/** The two rows' words, each laid out at its row's baseline, with per-letter write intervals. */
export function plotRows(v: Voice, plan: Line): PlotWord[] {
  const em = 100 * PLOT.cap / strokeText('H', PLOT.font, 100).capHeight;
  const out: PlotWord[] = [];
  for (const [r, words] of [[0, [0, 1, 2]], [1, [3, 4, 5]]] as const) {
    let x = TODO_ROWS[r].x;
    for (const wi of words) {
      const w = plan.words[wi]!, f = v.form(w, w.end);
      const st = strokeText(f.text, PLOT.font, em), n = Array.from(f.text).length, sp = letterSpan(f);
      const times = Array.from({ length: n }, (_, j) => [f.t0 + sp * j / n, f.t0 + sp * (j + 1) / n] as [number, number]);
      out.push({ st, x, y: TODO_ROWS[r].y, wi, times });
      x += st.width + em * PLOT.space;
    }
  }
  return out;
}

/** Plot the rows up to t; returns the pen head (sheet px) of the newest stroke, if any. */
export function drawPlot(c: CanvasRenderingContext2D, v: Voice, plan: Line, words: PlotWord[], t: number) {
  let head: { x: number; y: number } | null = null;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = PLOT.pen;
  for (const p of words) {
    const len = writtenLength(p.st, p.times, t);
    if (len <= 0) continue;
    const f = v.form(plan.words[p.wi]!, t);
    c.strokeStyle = heatColor(f.stress ? 'clay' : 'ink', 'paper', f.age);
    c.save(); c.translate(p.x, p.y);
    const h = drawStrokeText(c, p.st, len);
    c.restore();
    if (h) head = { x: p.x + h.x, y: p.y + h.y };
  }
  c.restore();
  return head;
}
/** Where the pen rests before it writes: at the first row's start. */
export const plotRest = () => ({ x: TODO_ROWS[0].x, y: TODO_ROWS[0].y });
