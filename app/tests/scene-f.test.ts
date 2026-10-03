import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { resolveFTimes, snipState, dominoTimes, dominoState } from '../src/scenes/parts/s15-f-timing';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const T = resolveFTimes({ audio, lyrics });
const eps = 1e-6;

describe('F group uses the edit and the vocal alignment', () => {
  test('all eleven cuts resolve, while Snip follows the earlier vocal accent', () => {
    expect(T.s15).toHaveLength(6); expect(T.s16).toHaveLength(5);
    expect(T.s15.every((at, i) => i === 0 || at > T.s15[i - 1]!)).toBe(true);
    expect(T.s16[0]).toBeGreaterThan(T.s15.at(-1)!);
    expect(T.snip).toBe(lyrics.get('Snip the extra').words[0]!.start);
    expect(T.snip).toBeLessThan(T.s15[4]!);
    expect(T.end).toBe(lyrics.get('I need one last').start);
  });
  test('the lower stroke detaches and PAPER starts exactly at Snip', () => {
    expect(snipState(audio, T.snip - eps, T)).toMatchObject({ paper: false, detach: 0 });
    expect(snipState(audio, T.snip, T)).toMatchObject({ paper: true, detach: 0 });
    expect(snipState(audio, T.s15[5]!, T)).toMatchObject({ paper: true, detach: 1, dayCount: 31 });
    expect(snipState(audio, T.october - eps, T).dayCount).toBe(32);
    expect(snipState(audio, T.october, T).dayCount).toBe(31);
  });
  test('alignment changes retime all accents instead of retaining song seconds', () => {
    const shifted = structuredClone(lyricsJSON);
    for (const line of shifted.lines) {
      line.start += 0.09; line.end += 0.09;
      for (const word of line.words) {
        word.start += 0.09; word.end += 0.09;
        if (word.syl) for (const syllable of word.syl) { syllable[0] += 0.09; syllable[1] += 0.09; }
      }
    }
    const other = resolveFTimes({ audio, lyrics: new Lyrics(shifted) });
    for (const key of ['snip', 'october', 'one', 'two', 'three', 'nineteen'] as const)
      expect(other[key] - T[key]).toBeCloseTo(0.09);
    T.greens.forEach((at, i) => expect(other.greens[i]! - at).toBeCloseTo(0.09));
  });
});

describe('nineteen dominoes', () => {
  const triggers = dominoTimes(audio, T);
  test('one, two, three and each repeated green trigger their own plaque', () => {
    expect(triggers).toHaveLength(19);
    expect(triggers.slice(0, 3)).toEqual([T.one, T.two, T.three]);
    expect([3, 7, 11, 15].map(i => triggers[i])).toEqual(T.greens);
    expect(triggers[18]).toBe(T.nineteen);
    expect(triggers.every((at, i) => i === 0 || at > triggers[i - 1]!)).toBe(true);
    for (const [i, at] of triggers.entries()) {
      expect(dominoState(audio, at - eps, triggers).passed).toBe(i);
      expect(dominoState(audio, at, triggers).passed).toBe(i + 1);
    }
  });
  test('physical cascades use equal collision delays, and end at nineteen with no twentieth card', () => {
    expect(triggers[4]! - triggers[3]!).toBeLessThan(triggers[2]! - triggers[1]!);
    for (const start of [3, 7, 11]) {
      const gaps = [1, 2, 3].map(i => triggers[start + i]! - triggers[start + i - 1]!);
      expect(gaps[1]).toBeCloseTo(gaps[0]!,10); expect(gaps[2]).toBeCloseTo(gaps[1]!,10);
    }
    expect(dominoState(audio, T.end - eps, triggers).passed).toBe(19);
    expect(dominoState(audio, T.end + 20, triggers).cards.every(c => c.fall === 1)).toBe(true);
  });
  test('nominal BPM and evaluation order cannot affect motion', () => {
    const slow = new AudioData({ ...audioJSON, bpm: 40 });
    const fast = new AudioData({ ...audioJSON, bpm: 240 });
    const before = JSON.stringify(lyricsJSON);
    expect(dominoTimes(slow, T)).toEqual(dominoTimes(fast, T));
    const at = T.greens[2]! + 0.03;
    const first = dominoState(audio, at, triggers);
    dominoState(audio, T.end, triggers); dominoState(audio, T.one, triggers);
    expect(dominoState(audio, at, triggers)).toEqual(first);
    expect(JSON.stringify(lyricsJSON)).toBe(before);
  });
});

test('only one main module per F-group scene can win discovery', () => {
  const files = [...new Bun.Glob('s*.ts').scanSync({ cwd: new URL('../src/scenes/', import.meta.url).pathname })];
  expect(files.filter(f => f.startsWith('s15-'))).toEqual(['s15-line42.ts']);
  expect(files.filter(f => f.startsWith('s16-'))).toEqual(['s16-green.ts']);
});
