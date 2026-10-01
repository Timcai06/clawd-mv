// Lyric typography v3 (docs/TREATMENT.md, "歌词排版 v3"): the sung words are one of the three
// protagonists. This module has two halves:
//  1. Voice — sound → form. Every sung word gets a WordForm at time t: born the instant it is sung
//     (never earlier), stretched in width while it is held (87.5 → up to 125), swelling in weight with
//     the voice (300 → its line-relative power, 900 for the stressed word), clay when stressed,
//     breathing with the kick, leaving a 12 % afterimage for one beat when the next line starts.
//  2. Moves — reusable signature moves drawn with continuous Archivo (kit/vartype.ts): grid snap,
//     stamp, odometer, missing glyphs, surface plates, road markings… Scenes pick and compose them.
// Everything is a pure function of t and the aligned data (data/lyrics.json, data/audio.json).
import type { AudioData } from '../engine/audio';
import type { Line, Lyrics, Word } from '../engine/lyrics';
import { SCALE, scaleContext2D } from '../engine/gl';
import { clamp, ease, frameIdx, hash, lerp } from '../engine/util';
import { css, THEME, type ThemeKey } from '../theme';
import { afterBeats, span } from './time';
import { fillRun, glyphPath, varRun, type Axes, type VarRun } from './vartype';

export type On = 'paper' | 'ink' | 'clay';
/** Text colour on a ground, and the stress colour on it (clay on paper/ink, ink on clay). */
export const fgOn = (on: On): ThemeKey => (on === 'paper' ? 'ink' : 'paper');
export const stressOn = (on: On): ThemeKey => (on === 'clay' ? 'ink' : 'clay');

/** Static token RGB interpolation; unborn words retain their base colour. */
export function heatColor(base: ThemeKey, on: On, age: number): string {
  const rgb = (key: ThemeKey) => {
    const n = parseInt(THEME[key].slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const cold = rgb(base), hot = rgb(on === 'ink' ? 'hot' : on === 'paper' ? 'clay' : 'paper');
  const k = age < 0 ? 0 : Math.exp(-age / 0.28);
  return `rgb(${cold.map((v, i) => Math.round(lerp(v, hot[i]!, k))).join(',')})`;
}

/** Repeat an existing drawing in a clay-only layer at its exact logical transform. */
export function glowDraw(source: CanvasRenderingContext2D, glow: CanvasRenderingContext2D,
  draw: (g: CanvasRenderingContext2D) => void, alpha = 1) {
  glow.save(); glow.setTransform(source.getTransform());
  glow.globalAlpha = source.globalAlpha * alpha; glow.filter = source.filter;
  draw(glow); glow.restore();
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, '');

/**
 * The stressed word of every line (by line index; `[word, occurrence]`). Authored, because the
 * accent the listener hears is musical (the word the melody leans on), not simply the loudest one.
 */
export const STRESS: [string, number][] = [
  ['ping', 1], ['bug', 1], ['thirty-second', 1], ['claws', 1], ['check', 3], ['back', 1],
  ['commit', 1], ['fit', 1], ['quit', 1], ['commit', 1], ['machine', 1],
  ['pass', 1], ['shattering', 1], ['rain', 1], ['why', 1], ['again', 3], ['ten', 1],
  ['commit', 1], ['bit', 1], ['fits', 1], ['commit', 1], ['machine', 1],
  ['quiet', 1], ['near', 1], ['forty-two', 1], ['equal', 1], ['free', 1],
  ['green', 1], ['green', 4], ['green', 1],
  ['commit', 1], ['it', 1], ['good', 1], ['merged', 1], ['every', 1],
];

export interface WordForm {
  word: Word;
  /** Display text (typographic quotes; case as sung unless the move changes it). */
  text: string;
  /** Seconds since word.start (negative before birth). */
  age: number;
  t0: number;
  t1: number;
  /** 0 before the onset, eases to 1 within ~110 ms of it. */
  born: number;
  /** Sung progress 0..1. */
  sung: number;
  singing: boolean;
  stress: boolean;
  /** Continuous Archivo axes from the voice. */
  axes: Axes;
  /** 0..1 how long the note is (drives the stretch; 1 = a held note ≥ ~0.85 s). */
  held: number;
}

export class Voice {
  private power = new Map<number, number>(); // word gi → 0..1 line-relative loudness
  constructor(readonly lyrics: Lyrics, readonly audio: AudioData) {
    for (const line of lyrics.lines) {
      const m = line.words.map((w) => this.meanEnv(w.start, w.end));
      const lo = Math.min(...m), hi = Math.max(...m);
      line.words.forEach((w, i) => this.power.set(w.gi, hi - lo > 1e-3 ? (m[i]! - lo) / (hi - lo) : 0.5));
    }
  }

  private meanEnv(a: number, b: number) {
    let s = 0, n = 0;
    for (let t = a; t <= b; t += 0.02) { s += this.audio.env('vocal', t); n++; }
    return n ? s / n : 0;
  }

  /** Smoothed vocal envelope (a 60 ms box, sampled; deterministic). */
  env(t: number) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += this.audio.env('vocal', t - k * 0.02);
    return s / 4;
  }

  /** The line at index i, or the n-th (1-based) line whose text matches. */
  line(q: number | string, occ = 1): Line {
    if (typeof q === 'number') return this.lyrics.lines[q]!;
    const k = norm(q.replace(/\s+/g, ''));
    const hits = this.lyrics.lines.filter((l) => norm(l.text.replace(/\s+/g, '')) === k);
    const l = hits[occ - 1];
    if (!l) throw new Error(`lyric line not found: ${q} #${occ}`);
    return l;
  }

  isStressed(w: Word): boolean {
    const s = STRESS[w.line];
    if (!s) return false;
    const line = this.lyrics.lines[w.line]!;
    let n = 0;
    for (const x of line.words) {
      if (norm(x.w) === s[0]) n++;
      if (x === w) return norm(x.w) === s[0] && n === s[1];
    }
    return false;
  }

  /** Sound → form for one word at t. */
  form(w: Word, t: number, o: { rest?: number; maxWidth?: number; minWidth?: number } = {}): WordForm {
    const dur = w.end - w.start, sung = clamp((t - w.start) / Math.max(0.05, dur));
    const stress = this.isStressed(w);
    const held = clamp((dur - 0.18) / 0.67);
    const w0 = o.minWidth ?? 87.5, w1 = lerp(w0, o.maxWidth ?? 125, held);
    // Width follows the held note (fast at first, then creeping): a held word visibly stretches.
    const wdth = t < w.start ? w0 : lerp(w0, w1, ease.outCubic(sung));
    // Weight swells from light to the word's power while it is sung, with the live voice on top.
    const target = stress ? 900 : lerp(o.rest ?? 520, 820, this.power.get(w.gi) ?? 0.5);
    const swell = ease.outQuad(clamp((t - w.start) / Math.min(0.35, Math.max(0.08, dur * 0.8))));
    const live = t >= w.start && t < w.end ? (this.env(t) - 0.5) * 160 : 0;
    const wght = clamp(lerp(300, target, swell) + live, 300, 900);
    return {
      word: w, text: w.w, age: t - w.start, t0: w.start, t1: w.end,
      born: t < w.start ? 0 : ease.outExpo(clamp((t - w.start) / 0.11)),
      sung, singing: t >= w.start && t < w.end, stress, held, axes: { wdth, wght },
    };
  }

  forms(line: Line, t: number, o?: Parameters<Voice['form']>[2]): WordForm[] {
    return line.words.map((w) => this.form(w, t, o));
  }

  /**
   * Line visibility: 1 from its first word until the next line starts, then a 12 % afterimage for
   * one beat, then gone. `hold` (s) keeps the last line of a phrase up through a gap.
   */
  presence(line: Line, t: number, hold = 0.6): number {
    if (t < line.start) return 0;
    const next = this.lyrics.lines[line.i + 1];
    const end = next ? Math.min(next.start, line.end + hold) : line.end + hold;
    if (t < end) return 1;
    const residueEnd = afterBeats(this.audio, end, 1);
    return t < residueEnd ? 0.12 : 0;
  }

  /** Kick breathing: 1 … ~1.018. */
  breath(kick: number) { return 1 + 0.018 * kick; }
}

// ---------------------------------------------------------------------------------------------
// Setting words

export interface SetOpts {
  on: On;
  /** Optional clay-only duplicate, on INK only. */
  glow?: CanvasRenderingContext2D;
  /** Explicit colour override (token). */
  color?: ThemeKey;
  /** Word space as a fraction of size (default 0.26). */
  space?: number;
  tracking?: number;
  /** Uppercase the display text. */
  upper?: boolean;
  alpha?: number;
}

export interface SetWord { form: WordForm; run: VarRun; x: number; w: number }

/** Lay out a line of forms on one baseline (each word with its own axes). */
export function setLine(forms: WordForm[], size: number, o: Pick<SetOpts, 'space' | 'tracking' | 'upper'> = {}): { words: SetWord[]; width: number } {
  let x = 0;
  const words = forms.map((f) => {
    const run = varRun(o.upper ? f.text.toUpperCase() : f.text, size, f.axes, o.tracking ?? 0);
    const s: SetWord = { form: f, run, x, w: run.width };
    x += run.width + size * (o.space ?? 0.26);
    return s;
  });
  return { words, width: Math.max(0, x - size * (o.space ?? 0.26)) };
}

/** Draw a set line at (x, baseline y). Unborn words are skipped; born words rise 6 % of size into place. */
export function drawSet(c: CanvasRenderingContext2D, set: { words: SetWord[] }, x: number, y: number, o: SetOpts) {
  const fg = o.color ?? fgOn(o.on);
  for (const s of set.words) {
    if (s.form.born <= 0) continue;
    c.globalAlpha = (o.alpha ?? 1) * Math.min(1, s.form.born * 1.6);
    const base = s.form.stress && !o.color ? stressOn(o.on) : fg;
    c.fillStyle = heatColor(base, o.on, s.form.age);
    const baseline = y + (1 - s.form.born) * s.run.size * 0.06;
    fillRun(c, s.run, x + s.x, baseline);
    if (base === 'clay' && o.on === 'ink' && o.glow)
      glowDraw(c, o.glow, g => { g.fillStyle = c.fillStyle; fillRun(g, s.run, x + s.x, baseline); });
  }
  c.globalAlpha = 1;
}

/** Wrap forms into lines no wider than `width` (greedy), returning per-line sets. */
export function wrap(forms: WordForm[], size: number, width: number, o: Pick<SetOpts, 'space' | 'tracking' | 'upper'> = {}) {
  const lines: WordForm[][] = [[]];
  let w = 0;
  for (const f of forms) {
    const run = varRun(o.upper ? f.text.toUpperCase() : f.text, size, f.axes, o.tracking ?? 0);
    const add = (lines.at(-1)!.length ? size * (o.space ?? 0.26) : 0) + run.width;
    if (w + add > width && lines.at(-1)!.length) { lines.push([]); w = 0; }
    w += lines.at(-1)!.length ? add : run.width;
    lines.at(-1)!.push(f);
  }
  return lines.map((l) => setLine(l, size, o));
}

// ---------------------------------------------------------------------------------------------
// Moves

/**
 * GRID SNAP — the verse default. Words land in a Swiss grid, each in the next cell, dropping
 * 0.3 rows into place on its onset; the landing cell's hairline flashes and decays.
 * Returns the cell rectangles used (for scenes that attach things to them).
 */
export function gridSnap(c: CanvasRenderingContext2D, forms: WordForm[], g: {
  x: number; y: number; colW: number; rowH: number; cols: number; size: number; on: On; t: number; glow?: CanvasRenderingContext2D; alpha?: number; upper?: boolean;
}) {
  const fg = fgOn(g.on);
  let col = 0, row = 0;
  const cells: { x: number; y: number; w: number; h: number; form: WordForm }[] = [];
  for (const f of forms) {
    const run = varRun(g.upper ? f.text.toUpperCase() : f.text, g.size, f.axes);
    const span = Math.max(1, Math.ceil((run.width + g.size * 0.3) / g.colW));
    if (col + span > g.cols && col > 0) { col = 0; row++; }
    const cx = g.x + col * g.colW, cy = g.y + row * g.rowH;
    cells.push({ x: cx, y: cy, w: span * g.colW, h: g.rowH, form: f });
    if (f.born > 0) {
      const flash = Math.max(0, 1 - (g.t - f.t0) / 0.35);
      c.strokeStyle = css(f.stress ? stressOn(g.on) : fg, (0.12 + 0.55 * flash) * (g.alpha ?? 1));
      c.lineWidth = 1;
      c.strokeRect(cx + 0.5, cy + 0.5, span * g.colW - 1, g.rowH - 1);
      if (f.stress && g.on === 'ink' && g.glow)
        glowDraw(c, g.glow, glow => { glow.strokeStyle = c.strokeStyle; glow.lineWidth = c.lineWidth;
          glow.strokeRect(cx + 0.5, cy + 0.5, span * g.colW - 1, g.rowH - 1); });
      c.globalAlpha = (g.alpha ?? 1) * Math.min(1, f.born * 1.5);
      const base = f.stress ? stressOn(g.on) : fg;
      c.fillStyle = heatColor(base, g.on, f.age);
      const baseline = cy + g.rowH * 0.5 + run.capH * 0.5 - (1 - f.born) * g.rowH * 0.3;
      fillRun(c, run, cx + g.size * 0.14, baseline);
      if (base === 'clay' && g.on === 'ink' && g.glow)
        glowDraw(c, g.glow, glow => { glow.fillStyle = c.fillStyle; fillRun(glow, run, cx + g.size * 0.14, baseline); });
      c.globalAlpha = 1;
    }
    col += span;
  }
  return cells;
}

/**
 * ODOMETER — a number word rolls into place like a mechanical counter. `value` is fractional
 * (the scene drives it, e.g. from sung progress); each digit column rolls with the carry.
 * Digits are set at fixed pitch so the columns do not jitter. Draws with (x, y) = left, baseline.
 */
export function odometer(c: CanvasRenderingContext2D, value: number, x: number, y: number, size: number, o: {
  digits: number; axes?: Axes; color: ThemeKey; on?: On; age?: number; glow?: CanvasRenderingContext2D; alpha?: number; pitch?: number; blur?: boolean;
}) {
  const axes = o.axes ?? { wdth: 87.5, wght: 900 };
  const pitch = o.pitch ?? varRun('0', size, axes).width * 1.04;
  const capH = varRun('0', size, axes).capH;
  const lineH = capH * 1.45;
  c.save();
  c.beginPath(); c.rect(x - size * 0.1, y - capH - (lineH - capH) / 2, pitch * o.digits + size * 0.2, lineH); c.clip();
  c.fillStyle = o.age === undefined ? css(o.color) : heatColor(o.color, o.on ?? 'paper', o.age);
  c.globalAlpha *= o.alpha ?? 1;
  for (let k = 0; k < o.digits; k++) {
    const place = Math.pow(10, o.digits - 1 - k);
    const v = value / place;
    // A column only moves while the column to its right carries (mechanical counter).
    const whole = Math.floor(v), frac = v - whole;
    const lower = value - whole * place; // remainder within this place
    const carry = place === 1 ? frac : clamp((lower - (place - 1)) / 1);
    const pos = (whole % 10) + carry;
    for (let d = -1; d <= 1; d++) {
      const digit = ((Math.floor(pos) + d) % 10 + 10) % 10;
      const run = varRun(String(digit), size, axes);
      const dy = (d - (pos - Math.floor(pos))) * lineH;
      const dx = x + k * pitch + (pitch - run.width) / 2;
      fillRun(c, run, dx, y + dy);
      if (o.color === 'clay' && o.on === 'ink' && o.glow)
        glowDraw(c, o.glow, g => {
          g.beginPath(); g.rect(x - size * 0.1, y - capH - (lineH - capH) / 2, pitch * o.digits + size * 0.2, lineH); g.clip();
          g.fillStyle = c.fillStyle; fillRun(g, run, dx, y + dy);
        });
    }
  }
  c.restore();
  return pitch * o.digits;
}

/**
 * MISSING GLYPHS — "undefined": the font has no glyph for it. Glyphs for which `missing(i)` is
 * 0..1 are drawn as hollow .notdef boxes (the box outline grows as the glyph disappears).
 */
export function drawWithMissing(c: CanvasRenderingContext2D, run: VarRun, x: number, y: number, missing: (i: number) => number, color: string) {
  c.fillStyle = color; c.strokeStyle = color;
  for (const g of run.glyphs) {
    const m = clamp(missing(g.i));
    if (m < 1) {
      c.save(); c.translate(x + g.x, y);
      c.globalAlpha *= 1 - m;
      c.fill(glyphPath(run, g)); c.restore();
    }
    if (m > 0) {
      const lw = run.size * (0.03 + 0.05 * (g.axes.wght - 300) / 600);
      const bw = g.adv * 0.78, bh = run.capH * 1.02;
      c.save(); c.globalAlpha *= m; c.lineWidth = lw;
      c.strokeRect(x + g.x + (g.adv - bw) / 2 + lw / 2, y - bh + lw / 2, bw - lw, bh - lw);
      c.restore();
    }
  }
}

/**
 * STAMP — a word slams down like a rubber stamp: overshoot scale, then ink. Ink texture is a
 * deterministic speckle mask knocked out of the fill (rough rubber), with a few splats.
 * Returns the shake amount (0..1) for the scene's post shake.
 */
export function stamp(c: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, o: {
  t: number; at: number; rot?: number; color: ThemeKey; on?: On; axes?: Axes; seed?: number; box?: boolean;
}): number {
  if (o.t < o.at) return 0;
  const k = o.t - o.at;
  const sc = k < 0.06 ? lerp(1.55, 0.97, ease.inQuad(k / 0.06)) : lerp(0.97, 1, ease.outCubic(clamp((k - 0.06) / 0.12)));
  const run = varRun(text, size, o.axes ?? { wdth: 100, wght: 900 });
  c.save();
  c.translate(x, y); c.rotate(o.rot ?? -0.1); c.scale(sc, sc);
  c.globalAlpha = clamp(k / 0.04);
  c.fillStyle = heatColor(o.color, o.on ?? 'paper', k);
  const ox = -run.width / 2, oy = run.capH / 2;
  fillRun(c, run, ox, oy);
  if (o.box !== false) {
    const pad = size * 0.16, lw = size * 0.07;
    c.lineWidth = lw; c.strokeStyle = heatColor(o.color, o.on ?? 'paper', k);
    c.strokeRect(ox - pad, -run.capH / 2 - pad, run.width + pad * 2, run.capH + pad * 2);
  }
  // Rubber: knock speckles out of the ink.
  c.globalCompositeOperation = 'destination-out';
  const seed = o.seed ?? 7, w = run.width + size * 0.5, h = run.capH + size * 0.5;
  for (let i = 0; i < 260; i++) {
    const px = (hash(seed, i, 1) - 0.5) * w, py = (hash(seed, i, 2) - 0.5) * h;
    const r = size * (0.004 + 0.02 * Math.pow(hash(seed, i, 3), 3));
    c.beginPath(); c.ellipse(px, py, r * 1.8, r, hash(seed, i, 4) * 3, 0, Math.PI * 2); c.fill();
  }
  c.globalCompositeOperation = 'source-over';
  c.restore();
  return Math.max(0, 1 - k / 0.25);
}

/**
 * A plate: an offscreen canvas (SCALE-aware) for drawing words that the scene maps onto 3D
 * surfaces (rooftops, roads, glass, dominoes, stack frames). Logical size w×h.
 */
export class Plate {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  constructor(readonly w: number, readonly h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * SCALE); this.canvas.height = Math.round(h * SCALE);
    this.ctx = scaleContext2D(this.canvas.getContext('2d')!, SCALE);
  }
  clear() { this.ctx.save(); this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height); this.ctx.restore(); }
}

/** Per-frame jitter for print / glitch effects that must not double-expose across sub-frames. */
export const frameJitter = (t: number, salt: number) => hash(frameIdx(t), salt) - 0.5;

/** Ink-roller wipe progress for a word painted onto a surface: 0..1 across ~90 ms from the onset. */
export const rollOn = (f: WordForm, t: number) => ease.outCubic(span(t, f.t0, f.t0 + 0.09));
