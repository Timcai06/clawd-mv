// S12's events (stage 9 ③, docs/reference/event-tables.md "S12"): the reruns stop being captions
// over a still pile of printouts.
//   Run / run / again  each rerun spits a new, worse xerox generation out of the copier: the sheet
//       shoots in from the right and a clay scan bar runs down it; "it" lights its "19 failed" row
//       red, "again," thumps a red frame round it. The third "again" stutters, so its sheet arrives
//       three times (the scene clock replays the word, kit stutterTime).
//   Clear  the sheets are swept off to the left one after another, tumbling;
//   cache  a Mono "rm -rf .cache" row drains its bar from 312 MB to 0 B.
// Pure functions of t (the scene's stuttered clock).
import type { AudioData } from '../../engine/audio';
import type { Line } from '../../engine/lyrics';
import { ease, hash, lerp } from '../../engine/util';
import { F, font } from '../../engine/type';
import { css } from '../../theme';
import { span, hitAfter } from '../../kit/time';
import type { X9Times } from '../s09-z-shared';

/** The lens per rerun: between the sheet that rerun printed and the row it sang. */
export const RUN_FOCUS = [{ x: 800, y: 520, zoom: 1.35 }, { x: 1000, y: 560, zoom: 1.45 }, { x: 1234, y: 600, zoom: 1.4 }];
/** Margin baked round each sheet (grain and feed drags spill past the paper). */
export const SHEET_M = 80;
/** The generation each rerun prints (gens 0-2 are on the pile from the start). */
const arrival = (gen: number, T: X9Times) => (gen < 3 ? -Infinity : T.runs[gen - 3]!);

export function sheetPlace(t: number, gen: number, T: X9Times, _audio: AudioData) {
  const at = arrival(gen, T);
  if (t < at) return null;
  // slapped down onto the pile: from big and off to the right, landing in 0.24 s
  const e = Number.isFinite(at) ? ease.outExpo(span(t, at, at + 0.24)) : 1;
  let dx = 700 * (1 - e), dy = -260 * (1 - e), rot = 0.18 * (1 - e);
  const scale = 1 + 1.6 * (1 - e);
  if (t >= T.clear && t < T.count) {
    // swept off one after another (front sheets first), each tumbling its own way
    const k = ease.inCubic(span(t, T.clear + (5 - gen) * 0.05, T.cache + 0.12 + (5 - gen) * 0.03));
    dx -= 700 * k * (1 + 0.15 * gen); dy += (hash(gen, 41) - 0.5) * 520 * k; rot += (hash(gen, 42) - 0.6) * 1.4 * k;
  }
  return { dx, dy, rot, scale };
}

/** On the newest sheet: the scan bar on arrival, the red row on "it", the red frame on "again,". */
export function failFlash(c: CanvasRenderingContext2D, t: number, gen: number, p: { w: number; h: number }, runs: Line, T: X9Times) {
  const at = arrival(gen, T);
  if (!Number.isFinite(at) || t < at) return;
  const scan = span(t, at + 0.05, at + 0.3);
  if (scan > 0 && scan < 1) {
    const y = lerp(0, p.h, ease.inOutQuad(scan));
    c.fillStyle = css('clay', 0.85); c.fillRect(-6, y - 3, p.w + 12, 6);
    c.fillStyle = css('clay', 0.12); c.fillRect(0, 0, p.w, y);
  }
  const r = gen - 3, it = runs.words[r * 3 + 1], again = runs.words[r * 3 + 2];
  if (it && t >= it.start) {
    const k = hitAfter(t, it.start, 0.1);
    c.fillStyle = css('fail', 0.22 + 0.5 * k); c.fillRect(14, p.h - 106, p.w - 28, 32);
  }
  if (again && r < 2 && t >= again.start) {
    const k = hitAfter(t, again.start, 0.12), g = 6 + 14 * k;
    c.strokeStyle = css('fail', 0.55 + 0.45 * k); c.lineWidth = 4 + 6 * k; c.strokeRect(-g, -g, p.w + 2 * g, p.h + 2 * g);
  }
}

/** "cache": a Mono rm row whose bar drains over the word; gone when the count starts. */
export function cacheBar(c: CanvasRenderingContext2D, t: number, T: X9Times, clear: Line) {
  const w = clear.words[2]!;
  if (t < w.start || t >= T.count + 0.15) return;
  const a = 1 - span(t, T.count, T.count + 0.15), drain = ease.inOutCubic(span(t, w.start + 0.05, w.end + 0.1));
  const x = 256, y = 712, W = 1060, pop = 1 + 0.3 * (1 - ease.outExpo(span(t, w.start, w.start + 0.14)));
  c.save(); c.globalAlpha = a; c.translate(x, y); c.scale(pop, pop);
  c.font = font(F.mono(500), 40); c.fillStyle = css('ink', 0.8); c.fillText('$ rm -rf node_modules/.cache', 0, 0);
  c.strokeStyle = css('ink', 0.7); c.lineWidth = 3; c.strokeRect(0, 30, W, 56);
  c.fillStyle = css('clay'); c.fillRect(6, 36, (W - 12) * (1 - drain), 44);
  const mb = Math.round(312 * (1 - drain));
  c.fillStyle = css('ink', 0.8); c.fillText(mb > 0 ? `${mb} MB` : '0 B', W + 30, 74);
  c.restore();
}

/** Camera kicks: each rerun's sheet landing, and the cache emptying. */
export function s12Kick(t: number, T: X9Times) {
  let k = 0;
  for (const at of T.runs) k += 0.035 * hitAfter(t, at + 0.12, 0.07);
  k += 0.03 * hitAfter(t, T.cache, 0.08);
  return k;
}
