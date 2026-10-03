// The chorus pickup, "I / NEED / ONE / MORE (LAST)", as pdoom's hook (hook.ts): one word per hit,
// full frame, centred, slammed on the word's onset; a held word creeps toward the camera. Three
// levels escalate across the film's three choruses (docs/CONTEXT.md, ② batch 2):
//   1 (S08) clean: specimen guides (baseline, cap height), slam +16 %, shake 7, 2 swap frames;
//   2 (S13) heavier: slam +22 %, shake 13, 3 filled afterimages, MORE launches letter by letter;
//   3 (S17) maximal: the ground strobes on the 8ths, held words re-slam on every beat, slam +30 %,
//      shake 20, 6 afterimages, LAST at the largest size.
// The last word (commit) is the scene's own COMMIT slam; this module stops at its onset.
import type { AudioData } from '../engine/audio';
import type { Line } from '../engine/lyrics';
import { clamp, ease } from '../engine/util';
import { css, type ThemeKey } from '../theme';
import type { Hit } from './impact';
import { heatColor, type On, type Voice } from './lyric-moves';
import { glyphPath, varRun } from './vartype';

export type Level = 1 | 2 | 3;
const L = {
  1: { amt: 0.16, shake: 7, echoes: 0, max: 900, swap: true },
  2: { amt: 0.22, shake: 13, echoes: 3, max: 1000, swap: true },
  3: { amt: 0.3, shake: 20, echoes: 6, max: 1080, swap: false },
} as const;

/** The pickup's words before "commit", with their onsets. */
export const pickup = (line: Line) => line.words.slice(0, -1);

/**
 * The word showing at t: the latest pickup onset, then "COM" (commit's first syllable) from its
 * onset until `hit` (the stressed MIT, where the scene's own COMMIT slams); null outside.
 */
export function currentWord(line: Line, t: number, hit = line.words.at(-1)!.start) {
  const ws = pickup(line), commit = line.words.at(-1)!;
  if (t < ws[0]!.start || t >= hit) return null;
  if (t >= commit.start) return { i: ws.length, w: commit, text: 'COM' };
  let i = 0;
  for (let k = 0; k < ws.length; k++) if (t >= ws[k]!.start) i = k;
  return { i, w: ws[i]!, text: ws[i]!.w.replace(/[^\p{L}’']/gu, '').toUpperCase() };
}

/** Level 3 re-slams a held word on every beat (hook.ts retrig); others slam once. */
export function slamStart(level: Level, audio: AudioData, t: number, t0: number) {
  if (level !== 3) return t0;
  const bt = audio.timeOfBeat(Math.floor(audio.beatAt(t) + 1e-4));
  return bt > t0 + 0.12 ? bt : t0;
}
/** Scale of a slammed word: overshoot that lands in 0.16 s (outExpo), then a slow creep. */
export function slamScale(level: Level, audio: AudioData, t: number, t0: number) {
  const r = slamStart(level, audio, t, t0);
  const creep = 1 + 0.035 * Math.max(0, t - t0);
  return creep * (1 + L[level].amt * (r === t0 ? 1 : 0.5) * (1 - ease.outExpo(clamp((t - r) / 0.16))));
}

/** The hits a scene feeds to kit/impact: every pickup word (and every re-slam at level 3). */
export function pickupHits(level: Level, audio: AudioData, line: Line): Hit[] {
  const out: Hit[] = [], commit = line.words.at(-1)!;
  out.push({ t: commit.start, shake: L[level].shake, kick: 0.02, swap: L[level].swap });
  pickup(line).forEach((w, k, ws) => {
    out.push({ t: w.start, shake: L[level].shake, kick: 0.02, swap: L[level].swap });
    if (level === 3) {
      const end = ws[k + 1]?.start ?? commit.start;
      for (let b = Math.floor(audio.beatAt(w.start)) + 1; audio.timeOfBeat(b) < end - 0.05; b++)
        if (audio.timeOfBeat(b) > w.start + 0.12) out.push({ t: audio.timeOfBeat(b), shake: L[level].shake * 0.6, kick: 0.012 });
    }
  });
  return out;
}

/** Level 3's strobing ground: ink / clay / paper on the 8ths through the pickup. */
export function strobe(level: Level, line: Line, t: number, beat: number, base: On, hit?: number): On {
  if (level !== 3 || !currentWord(line, t, hit)) return base;
  const e = ((Math.floor(beat * 2) % 3) + 3) % 3;
  return e === 0 ? 'ink' : e === 1 ? 'clay' : 'paper';
}
const inkOn = (on: On): ThemeKey => (on === 'paper' || on === 'clay' ? 'ink' : 'paper');

/**
 * Draw the current pickup word, full frame and centred on (cx, cy). `on` is the ground under it
 * (on an impact frame the scene swaps its ground and passes the swapped one). `from` delays the
 * first drawn frame (S08 grows the inherited cursor into the I first).
 */
export function drawPickup(c: CanvasRenderingContext2D, v: Voice, line: Line, t: number, level: Level, audio: AudioData,
  o: { on: On; cx?: number; cy?: number; color?: ThemeKey; from?: number; hit?: number }) {
  const cur = currentWord(line, t, o.hit);
  if (!cur || t < (o.from ?? -Infinity)) return;
  const cx = o.cx ?? 960, cy = o.cy ?? 540;
  const form = v.form(cur.w, t, { minWidth: 75, maxWidth: 112.5, rest: 900 });
  const text = cur.text;
  const axes = { wdth: form.axes.wdth, wght: Math.max(800, form.axes.wght) };
  const probe = varRun(text, 100, axes);
  const isLast = /^last$/i.test(text), cap = isLast ? L[level].max * 1.18 : L[level].max;
  const size = Math.min(cap, 100 * (1920 - 160) / Math.max(1, probe.width));
  const run = varRun(text, size, axes), s = slamScale(level, audio, t, cur.w.start);
  const ink = o.color ?? inkOn(o.on), fg = ink;
  const base = cy + run.capH / 2, x0 = -run.width / 2;
  if (level === 1) { // specimen guides: baseline and cap height, full width
    c.save(); c.fillStyle = css(ink, 0.35);
    c.fillRect(0, base, 1920, 1); c.fillRect(0, base - run.capH, 1920, 1); c.restore();
  }
  c.save(); c.translate(cx, base); c.scale(s, s);
  // filled afterimages behind the word (no outlines: CONTEXT bans outlined type)
  const age = t - slamStart(level, audio, t, cur.w.start);
  for (let j = L[level].echoes; j >= 1; j--) {
    const k = 1 + j * 0.07 * (1 + age * 2.5);
    c.save(); c.scale(k, k); c.globalAlpha = Math.max(0, 0.34 - j * 0.045);
    c.fillStyle = css(j % 2 ? (o.on === 'clay' ? 'paper' : 'clay') : ink);
    for (const g of run.glyphs) { c.save(); c.translate(x0 + g.x, 0); c.fill(glyphPath(run, g)); c.restore(); }
    c.restore();
  }
  // a white-hot flash on the slam only (a held word stays clean ink, like pdoom's bone hooks)
  c.fillStyle = heatColor(fg, o.on, (t - slamStart(level, audio, t, cur.w.start)) * 4);
  const rising = level >= 2 && /^more$/i.test(text);
  run.glyphs.forEach((g, i) => {
    let dy = 0, sy = 1;
    if (rising) { // MORE launches letter by letter from below (hook.ts drawUP)
      const k = clamp((t - cur.w.start - i * 0.035) / 0.3), e = ease.outExpo(k);
      dy = (1 - e) * (1080 - cy + run.capH * 1.3); sy = 1 + 0.9 * (1 - e) * (k > 0 ? 1 : 0);
      if (k <= 0) return;
    }
    c.save(); c.translate(x0 + g.x, dy); c.scale(1, sy); c.fill(glyphPath(run, g)); c.restore();
  });
  c.restore();
}
