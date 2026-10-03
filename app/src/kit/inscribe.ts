// Lyrics written into the picture (stage 9 ②, docs/reference/polish-gaps.md §0): every letter has
// its own sung moment, a writing head (the clay cursor) puts it there, it is born white-hot and
// cools, and it sits on a carrier the scene supplies (a form field, a waveform on glass…), so it
// moves and leaves with that carrier instead of floating on top like a subtitle.
//
// Pure functions of (forms, t): the scene lays the words out with the current Voice forms each
// frame, then draws them through its carrier. Letter timing follows pdoom: a word's letters are
// spread over the first 80 % of the word, at most 0.7 s (spacetime), and never before the head
// reaches them (loss.ts glyphTime).
import { clamp, ease, hash } from '../engine/util';
import { css, type ThemeKey } from '../theme';
import { fgOn, heatColor, stressOn, type On, type WordForm } from './lyric-moves';
import { glyphPath, varRun, type VarGlyph, type VarRun } from './vartype';

export interface InGlyph {
  ch: string;
  form: WordForm;
  /** Word index in the inscription, glyph index in the word. */
  wi: number; gi: number;
  /** Left edge (local px along the baseline) and advance. */
  x: number; adv: number;
  /** The moment this letter is sung. */
  t: number;
  run: VarRun; g: VarGlyph;
}
export interface Inscription { glyphs: InGlyph[]; width: number; size: number; capH: number }

/** Seconds over which a word's letters are spread (pdoom: the first 80 %, at most 0.7 s). */
export const letterSpan = (f: WordForm) => Math.min(0.8 * Math.max(0, f.t1 - f.t0), 0.7);

/** Lay forms out on one baseline (each word keeps its own axes) and time every letter. */
export function inscribe(forms: WordForm[], size: number, o: { space?: number; tracking?: number; upper?: boolean } = {}): Inscription {
  const space = size * (o.space ?? 0.26);
  const glyphs: InGlyph[] = [];
  let x = 0, capH = 0;
  forms.forEach((f, wi) => {
    const run = varRun(o.upper ? f.text.toUpperCase() : f.text, size, f.axes, o.tracking ?? 0);
    capH = run.capH;
    const n = run.glyphs.length, span = letterSpan(f);
    run.glyphs.forEach((g, gi) => glyphs.push({ ch: g.ch, form: f, wi, gi, x: x + g.x, adv: g.adv, t: f.t0 + span * gi / Math.max(1, n), run, g }));
    x += run.width + space;
  });
  if (!capH) capH = varRun('H', size, { wdth: 100, wght: 500 }).capH;
  return { glyphs, width: Math.max(0, x - space), size, capH };
}

/** Uniformly scale an inscription's advances (fit a measure without changing the letter shapes' time). */
export function fitWidth(ins: Inscription, width: number): number { return ins.width > width ? width / ins.width : 1; }

/** Letters written so far (in time order the glyph list is already sorted). */
export const born = (ins: Inscription, t: number) => ins.glyphs.filter((g) => t >= g.t);

/**
 * The writing head along the baseline: the right edge of the newest letter, reached 60 ms after
 * it strikes (a carriage step); before the first letter, the first letter's left edge.
 */
export function headX(ins: Inscription, t: number, scale = 1): number {
  let x = (ins.glyphs[0]?.x ?? 0) * scale;
  for (const g of ins.glyphs) {
    if (t < g.t) break;
    x = (g.x + g.adv * clamp((t - g.t) / 0.06)) * scale;
  }
  return x;
}

/** A 2D affine (Canvas setTransform order). */
export interface Aff { a: number; b: number; c: number; d: number; e: number; f: number }
export const affine = (x: number, y: number, rot = 0, sx = 1, sy = sx): Aff => {
  const cs = Math.cos(rot), sn = Math.sin(rot);
  return { a: cs * sx, b: sn * sx, c: -sn * sy, d: cs * sy, e: x, f: y };
};
export const applyAff = (m: Aff, x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });

export type Head = 'type' | 'scan';
export interface DrawOpts {
  on: On;
  head: Head;
  /** Where a letter sits: an affine taking letter-local px (origin = its left baseline) to canvas px. */
  place: (g: InGlyph, x: number) => Aff | null;
  /** Horizontal scale of the layout (fitWidth). */
  scale?: number;
  /** Base colour per letter (default: stressed words clay, the rest the ground's ink). */
  color?: (g: InGlyph) => ThemeKey;
  alpha?: number;
  seed?: number;
  /** 'scan' only: letters are revealed up to this local x (the head), so the frontier letter is cut. */
  reveal?: number;
  /** On INK: clay letters are repeated into this glow layer at the same transform. */
  glow?: CanvasRenderingContext2D;
}

/**
 * Draw the letters born by t. 'type': each letter strikes with a small upward kick that settles in
 * ~60 ms and keeps a fixed, slightly misregistered slug (rotation, baseline wobble, ink density),
 * like pdoom bureau.ts drawTyped. 'scan': letters develop where the scan head has passed.
 */
export function drawInscription(c: CanvasRenderingContext2D, ins: Inscription, t: number, o: DrawOpts) {
  const sc = o.scale ?? 1, seed = o.seed ?? 7;
  for (const g of ins.glyphs) {
    if (t < g.t) break;
    const lx = g.x * sc;
    if (o.head === 'scan' && o.reveal !== undefined && lx > o.reveal) break;
    const m = o.place(g, lx);
    if (!m) continue;
    const age = t - g.t;
    const base = o.color ? o.color(g) : g.form.stress ? stressOn(o.on) : fgOn(o.on);
    c.save();
    c.transform(m.a, m.b, m.c, m.d, m.e, m.f);
    if (o.head === 'type') {
      const kick = -ins.capH * 0.06 * Math.pow(0.5, age / 0.025);
      const rot = (hash(seed, g.wi, g.gi, 1) - 0.5) * 0.03, wob = (hash(seed, g.wi, g.gi, 2) - 0.5) * ins.capH * 0.025;
      c.translate(g.adv * sc / 2, kick + wob); c.rotate(rot); c.translate(-g.adv * sc / 2, 0);
      c.globalAlpha = (o.alpha ?? 1) * (0.86 + 0.14 * hash(seed, g.wi, g.gi, 3));
    } else {
      c.globalAlpha = o.alpha ?? 1;
      if (o.reveal !== undefined && lx + g.adv * sc > o.reveal) { c.beginPath(); c.rect(-1, -ins.size * 1.2, o.reveal - lx + 1, ins.size * 1.6); c.clip(); }
    }
    if (sc !== 1) c.scale(sc, 1);
    c.fillStyle = heatColor(base, o.on, age);
    const path = glyphPath(g.run, g.g);
    c.fill(path);
    if (o.glow && base === 'clay' && o.on === 'ink') {
      o.glow.save(); o.glow.setTransform(c.getTransform()); o.glow.globalAlpha = c.globalAlpha;
      o.glow.fillStyle = c.fillStyle; o.glow.fill(path); o.glow.restore();
    }
    c.restore();
  }
}

/**
 * The strike guide (pdoom bureau.ts): a small clay triangle under where the next letter will land,
 * shown from `lead` s before it. Returns nothing when no letter is pending.
 */
export function drawStrikeGuide(c: CanvasRenderingContext2D, ins: Inscription, t: number, place: DrawOpts['place'], scale = 1, lead = 0.6) {
  const next = ins.glyphs.find((g) => g.t > t);
  if (!next || t < next.t - lead) return;
  const m = place(next, next.x * scale);
  if (!m) return;
  const s = ins.capH / 70, x = next.adv * scale * 0.5;
  c.save(); c.transform(m.a, m.b, m.c, m.d, m.e, m.f);
  c.fillStyle = css('clay');
  c.beginPath(); c.moveTo(x - 8 * s, 22 * s); c.lineTo(x + 8 * s, 22 * s); c.lineTo(x, 10 * s); c.closePath(); c.fill();
  c.restore();
}

/** Ease helper for carriers: a step that lands hard (outExpo) over `dur` s from t0. */
export const land = (t: number, t0: number, dur = 0.22) => ease.outExpo(clamp((t - t0) / dur));

// ── Typed input (Plex Mono): the machine voice, for a lyric typed at a prompt ──────────────────
/** Fixed-pitch layout: one cell per character (typewriter quotes), letters timed as in inscribe(). */
export interface MonoGlyph { ch: string; form: WordForm; wi: number; col: number; t: number }
export interface MonoInscription { glyphs: MonoGlyph[]; cols: number; size: number; adv: number }
/** Plex Mono's advance is 0.6 em. */
export const MONO_ADV = 0.6;
export function inscribeMono(forms: WordForm[], size: number): MonoInscription {
  const glyphs: MonoGlyph[] = [];
  let col = 0;
  forms.forEach((f, wi) => {
    const chars = Array.from(f.text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"'));
    const span = letterSpan(f);
    chars.forEach((ch, i) => glyphs.push({ ch, form: f, wi, col: col + i, t: f.t0 + span * i / Math.max(1, chars.length) }));
    col += chars.length + 1;
  });
  return { glyphs, cols: Math.max(0, col - 1), size, adv: size * MONO_ADV };
}
/** Column of the typing head (the cell after the newest typed character). */
export function monoHead(ins: MonoInscription, t: number): number {
  let col = 0;
  for (const g of ins.glyphs) { if (t < g.t) break; col = g.col + 1; }
  return col;
}
/** Draw the typed characters at (x, baseline y): each strikes white-hot and cools; stressed words in clay. */
export function drawMono(c: CanvasRenderingContext2D, ins: MonoInscription, t: number, x: number, y: number, o: { on: On; font: string; alpha?: number }) {
  c.save(); c.font = o.font; c.textBaseline = 'alphabetic';
  for (const g of ins.glyphs) {
    if (t < g.t) break;
    const base = g.form.stress ? stressOn(o.on) : fgOn(o.on);
    c.globalAlpha = o.alpha ?? 1;
    c.fillStyle = heatColor(base, o.on, t - g.t);
    c.fillText(g.ch, x + g.col * ins.adv, y - ins.size * 0.05 * Math.pow(0.5, (t - g.t) / 0.025));
  }
  c.restore();
}
