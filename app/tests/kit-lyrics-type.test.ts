import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { lyricsTypeState } from '../src/kit/lyrics-type';
import { lyricsMeter } from '../src/scenes/gallery-lyrics';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const stateAt = (t: number) => lyricsTypeState(lyrics, t, audio);

describe('lyric timing and line holds', () => {
  test('opening silence, exact onsets, word interiors and gaps keep distinct states', () => {
    expect(stateAt(0).visible).toBe(false);
    const first = lyrics.lines[0], word = first.words[1];
    expect(stateAt(first.start).words.map((w) => w.status)).toEqual(['singing', ...Array(6).fill('unsung')]);
    const middle = stateAt((word.start + word.end) / 2);
    expect(middle.words.slice(0, 3).map((w) => w.status)).toEqual(['sung', 'singing', 'unsung']);
    expect(middle.words[1].progress).toBeCloseTo(0.5);
    const gap = stateAt((word.end + first.words[2].start) / 2);
    expect(gap.words.filter((w) => w.status === 'singing')).toHaveLength(0);
    expect(gap.words[1].progress).toBe(1);
    expect(gap.words[2].progress).toBe(0);
  });
  test('a completed line holds until half a measured beat before the next onset', () => {
    const line = lyrics.lines[10], next = lyrics.lines[11];
    const hidden = audio.timeOfBeat(audio.beatAt(next.start) - 0.5);
    expect(stateAt(line.end).words.every((w) => w.status === 'sung')).toBe(true);
    expect(stateAt(line.end).hideAt).toBe(hidden);
    expect(stateAt(hidden - 1e-6).visible).toBe(true);
    expect(stateAt(hidden).visible).toBe(false);
    expect(stateAt(next.start).lineIndex).toBe(next.i);
    expect(stateAt(next.start).visible).toBe(true);
  });
  test('short or absent gaps do not cut off a still-sung word', () => {
    const line = lyrics.lines[16], next = lyrics.lines[17];
    expect(next.start - line.end).toBeLessThan(0.22);
    expect(stateAt(line.end - 1e-6).visible).toBe(true);
    expect(stateAt(line.end - 1e-6).hideAt).toBe(line.end);
    expect(stateAt(line.end).visible).toBe(false);
    expect(stateAt(lyrics.lines[0].end).lineIndex).toBe(1);
  });
  test('the last lyric holds half a beat, then clears during the outro', () => {
    const last = lyrics.lines.at(-1)!;
    const end = audio.timeOfBeat(audio.beatAt(last.end) + 0.5);
    expect(stateAt(last.end).visible).toBe(true);
    expect(stateAt(last.end).hideAt).toBe(end);
    expect(stateAt(end).visible).toBe(false);
    expect(stateAt(audio.duration - 1 / 60).visible).toBe(false);
  });
  test('punctuation stays in the complete mono run and token offsets round-trip', () => {
    expect(stateAt(lyrics.lines[0].start).text).toContain("o'clock");
    const line = lyrics.get('Less than or equal'), state = stateAt(line.start);
    expect(state.text).toContain('"Less than or equal" — well,');
    for (const word of state.words) expect(state.text.slice(word.from, word.to)).toBe(word.text);
    expect(state.text.slice(state.words[3].to, state.words[4].from)).toBe(' — ');
  });
  test('state is independent of seeks and does not mutate the source data', () => {
    const before = JSON.stringify(lyrics.lines), t = lyrics.lines[8].start + 0.2;
    const a = stateAt(t); stateAt(130); stateAt(0);
    expect(stateAt(t)).toEqual(a);
    expect(JSON.stringify(lyrics.lines)).toBe(before);
    for (const line of lyrics.lines) expect(stateAt(line.start).lineIndex).toBe(line.i);
  });
});

describe('COMMIT stress and pickup', () => {
  const hooks = lyrics.lines.filter((l) => /I need one (more|last) commit/.test(l.text));
  test('all five impacts use the exact second syllable, never the nearest beat', () => {
    expect(hooks).toHaveLength(5);
    for (const line of hooks) {
      const word = line.words.at(-1)!, at = word.syl![1][0];
      const before = stateAt(at - 1e-6), hit = stateAt(at);
      expect(hit.style).toBe('hook'); expect(hit.impact!.at).toBe(at);
      expect(before.impact!.visible).toBe(false); expect(hit.impact!.visible).toBe(true);
      expect(hit.impact!.at).not.toBe(audio.nearestBeat(at));
      expect(stateAt(word.start).impact!.visible).toBe(false);
      expect(hit.words.at(-1)!.progress).toBe(Lyrics.wordProgress(word, at));
      expect(hit.words.at(-1)!.progress).toBe(0.5);
    }
  });
  test('pickup words appear at their real onsets, including the final last variation', () => {
    for (const line of hooks) {
      for (let i = 0; i < 4; i++) {
        expect(stateAt(line.words[i].start).words.filter((w) => w.revealed)).toHaveLength(i + 1);
        if (i > 0) expect(stateAt(line.words[i].start - 1e-6).words[i].revealed).toBe(false);
      }
    }
    expect(stateAt(hooks.at(-1)!.start).text).toBe('I NEED ONE LAST COMMIT');
    expect(stateAt(lyrics.lines[7].start).style).toBe('small');
  });
  test('impact shrinks through one short overshoot and settles deterministically', () => {
    const at = hooks[0].words.at(-1)!.syl![1][0];
    expect(stateAt(at).impact!.scale).toBe(1.42);
    expect(stateAt(at + 0.09).impact!.scale).toBeCloseTo(0.96);
    expect(stateAt(at + 0.17).impact!.scale).toBe(1);
    expect(stateAt(at + 0.17).impact!.y).toBe(0);
    const pose = stateAt(at + 0.04).impact; stateAt(at + 0.2);
    expect(stateAt(at + 0.04).impact).toEqual(pose);
  });
  test('missing stress data fails explicitly rather than inventing a timestamp', () => {
    const fixture = JSON.parse(JSON.stringify(lyricsJSON));
    delete fixture.lines[hooks[0].i].words.at(-1).syl;
    expect(() => lyricsTypeState(new Lyrics(fixture), hooks[0].start, audio)).toThrow('Missing COMMIT second syllable');
  });
});

test('bar and beat readout follows measured beats across the entire song', () => {
  for (const [i, t] of audio.beats.entries()) {
    const meter = lyricsMeter(audio, t);
    expect(meter.beat).toBe(i % 4 + 1);
    expect(meter.bar).toBe(Math.floor(i / 4) + 1);
  }
  expect(lyricsMeter(audio, 0)).toEqual({ bar: 0, beat: 4 });
});
