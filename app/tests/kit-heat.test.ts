import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { heatColor, Voice, type On } from '../src/kit/lyric-moves';
import type { ThemeKey } from '../src/theme';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

describe('lyric heat on each pigment', () => {
  const cases: [ThemeKey, On, string[]][] = [
    ['paper', 'ink', ['rgb(242,239,233)', 'rgb(255,243,224)', 'rgb(247,240,230)', 'rgb(242,239,233)']],
    ['clay', 'ink', ['rgb(215,119,87)', 'rgb(255,243,224)', 'rgb(230,165,137)', 'rgb(215,119,87)']],
    ['ink', 'paper', ['rgb(27,42,74)', 'rgb(215,119,87)', 'rgb(96,70,79)', 'rgb(27,42,74)']],
    ['ink', 'clay', ['rgb(27,42,74)', 'rgb(242,239,233)', 'rgb(106,114,132)', 'rgb(27,42,74)']],
  ];
  for (const [base, on, expected] of cases) {
    [-1, 0, 0.28, 2].forEach((age, i) => test(`${base} on ${on}, age=${age}`, () => {
      expect(heatColor(base, on, age)).toBe(expected[i]!);
    }));
  }
  test('clay on paper stays clay throughout the cooling interval', () => {
    for (const age of [-1, 0, 0.28, 2]) expect(heatColor('clay', 'paper', age)).toBe('rgb(215,119,87)');
  });
});

test('Voice.form age is exactly t - word.start, including before birth', () => {
  const lyrics = new Lyrics(lyricsJSON), voice = new Voice(lyrics, new AudioData(audioJSON));
  const word = lyrics.lines[0]!.words[3]!;
  for (const age of [-1, 0, 0.28, 2]) {
    const t = word.start + age, form = voice.form(word, t);
    expect(form.age).toBe(t - word.start);
    expect(form.t0).toBe(word.start); expect(form.t1).toBe(word.end);
    if (age <= 0) expect(form.born).toBe(0);
  }
});
