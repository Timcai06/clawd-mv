// F-group musical landmarks. Editorial cuts and vocal accents are distinct clocks.
import type { AudioData } from '../../engine/audio';
import { Lyrics, type Line } from '../../engine/lyrics';
import { F, font, glyphX, plain, fitSize } from '../../engine/type';
import { ease } from '../../engine/util';
import { css, type ThemeKey } from '../../theme';
import { afterBeats, beatsSince, span, wordTime } from '../../kit/time';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import board from '../../../../storyboard/shots.json';

export interface FTimes {
  s15: number[];
  s16: number[];
  end: number;
  fortyTwo: number;
  less: number;
  wont: number;
  snip: number;
  october: number;
  free: number;
  one: number;
  two: number;
  three: number;
  greens: number[];
  nineteen: number;
}

export function resolveFTimes(ctx: { audio: AudioData; lyrics: Lyrics }): FTimes {
  const shots = resolveStoryboard(board as Storyboard, ctx.lyrics, ctx.audio).shots;
  const cut = (id: string) => shots.find(s => s.id === id)!.start;
  const vocal = (line: string, word: string, fallback: string) =>
    wordTime(ctx.lyrics, line, word) ?? cut(fallback);
  const greenLine = ctx.lyrics.find('Green and green')[0];
  return {
    s15: Array.from({ length: 6 }, (_, i) => cut(`S15-${i + 1}`)),
    s16: Array.from({ length: 5 }, (_, i) => cut(`S16-${i + 1}`)),
    end: cut('S17-1'),
    fortyTwo: vocal('There it is, on line forty-two', 'forty-two', 'S15-2'),
    less: vocal('"Less than or equal" — well, that won\'t do', 'Less', 'S15-3'),
    wont: vocal('"Less than or equal" — well, that won\'t do', 'won\'t', 'S15-4'),
    snip: vocal('Snip the extra line and set October free', 'Snip', 'S15-5'),
    october: vocal('Snip the extra line and set October free', 'October', 'S15-6'),
    free: vocal('Snip the extra line and set October free', 'free', 'S15-6'),
    one: vocal('One goes green, and two, and three', 'One', 'S16-1'),
    two: vocal('One goes green, and two, and three', 'two', 'S16-2'),
    three: vocal('One goes green, and two, and three', 'three', 'S16-3'),
    greens: greenLine?.words.filter(w => /^green\W*$/i.test(w.w)).map(w => w.start)
      ?? [0, 1, 2, 3].map(i => afterBeats(ctx.audio, cut('S16-4'), i)),
    nineteen: vocal('Nineteen green!', 'Nineteen', 'S16-5'),
  };
}

export function phaseAt(t: number, cuts: readonly number[]): number {
  return Math.max(0, cuts.reduce((n, at, i) => t >= at ? i : n, 0));
}

export function beatProgress(audio: AudioData, t: number, at: number, length: number): number {
  return Math.min(1, Math.max(0, beatsSince(audio, t, at) / length));
}

export function snipState(audio: AudioData, t: number, T: FTimes) {
  const detach = ease.outExpo(beatProgress(audio, t, T.snip, 1.65));
  const burst = ease.outCubic(beatProgress(audio, t, T.october, 0.85));
  return {
    paper: t >= T.snip,
    detach,
    barX: 10 * detach,
    barY: 3.6 * detach - 6 * detach * detach,
    barZ: 2.5 * detach,
    barRoll: -0.9 * detach,
    burst,
    dayCount: t >= T.october ? 31 : 32,
  };
}

/** The first three vocal counts hold; each later sung green launches a four-card run. */
export function dominoTimes(audio: AudioData, T: FTimes): number[] {
  const times = [T.one, T.two, T.three];
  T.greens.forEach((at, group) => {
    const next = T.greens[group + 1] ?? T.nineteen;
    const count = group === 3 ? 3 : 4;
    const length = beatsSince(audio, next, at);
    for (let i = 0; i < count; i++) {
      const offset = length * ease.outQuad(i / count) * 0.92;
      times.push(afterBeats(audio, at, offset));
    }
  });
  times.push(T.nineteen);
  return times;
}

export function dominoState(audio: AudioData, t: number, triggers: readonly number[]) {
  const cards = triggers.map((at, i) => {
    const progress = beatProgress(audio, t, at, i < 3 ? 0.8 : 0.32);
    const fall = ease.inOutCubic(progress);
    return { at, passed: t >= at, fall, angle: 1.48 * fall };
  });
  return { cards, passed: cards.filter(c => c.passed).length };
}

/** A complete kerned run clipped per aligned word: both scenes embed this in their objects. */
export function drawWordRun(c: CanvasRenderingContext2D, line: Line | undefined, t: number,
  x: number, y: number, maxWidth: number, size: number, color: ThemeKey, mono = true) {
  if (!line || t < line.start - 0.3) return;
  const family = mono ? F.mono(500) : F.archivo(87.5, 700);
  const text = plain(line.text);
  size = fitSize(text, family, maxWidth, size);
  c.save();
  c.font = font(family, size);
  c.textBaseline = 'alphabetic';
  c.fillStyle = css(color, 0.28);
  c.fillText(text, x, y);
  let from = 0;
  for (const w of line.words) {
    const word = plain(w.w);
    const start = text.indexOf(word, from);
    if (start < 0) continue;
    from = start + word.length;
    const progress = Lyrics.wordProgress(w, t);
    if (progress <= 0) continue;
    const left = glyphX(text, start, family, size);
    const right = glyphX(text, from, family, size);
    c.save();
    c.beginPath();
    c.rect(x + left, y - size * 1.15, (right - left) * progress, size * 1.4);
    c.clip();
    c.fillStyle = css(color);
    c.fillText(text, x, y);
    c.restore();
  }
  c.restore();
}

export function currentFLine(lyrics: Lyrics, t: number, from: number, to: number): Line | undefined {
  const line = lyrics.lineAt(t) ?? lyrics.lastLine(t);
  return line && line.start >= from - 0.5 && line.start < to && t < line.end + 0.35 ? line : undefined;
}

export const holdThen = (p: number, hold = 0.18) => ease.inOutCubic(span(p, hold, 1));
