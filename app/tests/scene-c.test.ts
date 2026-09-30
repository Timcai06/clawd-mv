import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { afterBeats } from '../src/kit/time';
import { resolveCTimes, todoState, keyboardState, lyricCharTimes } from '../src/scenes/parts/s06-timing';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const T = resolveCTimes(audio, lyrics);

describe('C group musical events', () => {
  test('each check uses a distinct measured snare and completes before the keyboard cut', () => {
    expect(T.checks).toHaveLength(3);
    expect(new Set(T.checks).size).toBe(3);
    for (const t of T.checks) expect(audio.events('snare', t, t + 0.0001).length).toBe(1);
    for (const t of T.checks) expect(todoState(audio, t - 0.00001, T).completed).toBeLessThan(todoState(audio, afterBeats(audio, t, 0.3), T).completed);
    const finished = todoState(audio, T.keyboard - 0.00001, T);
    expect(finished.checks).toEqual([1, 1, 1]);
    expect(finished.strikes).toEqual([1, 1, 1]);
  });
  test('per-word writing never starts ahead of an aligned word', () => {
    for (const line of [T.plan, T.claws]) {
      const times = lyricCharTimes(line);
      expect(times).toHaveLength(Array.from(line.words.map((w) => w.w).join(' ')).length);
      let offset = 0;
      for (const w of line.words) {
        const n = Array.from(w.w).length;
        expect(times[offset]![0]).toBe(w.start);
        expect(times[offset + n - 1]![1]).toBe(w.end);
        offset += n + 1;
      }
    }
  });
  test('landing is on a measured beat; the dive waits, rushes, and parks before the chorus', () => {
    expect(audio.beats).toContain(T.land);
    expect(audio.beats).toContain(T.arrive);
    expect(T.land).toBeGreaterThan(T.keyboard);
    expect(T.land).toBeLessThan(T.dive);
    expect(keyboardState(audio, T.land, T)).toMatchObject({ fall: 1, landing: 1, altitude: 0, dive: 0 });
    expect(keyboardState(audio, T.launch, T).dive).toBe(0);
    expect(keyboardState(audio, T.arrive, T)).toMatchObject({ dive: 1, cursorOnly: true });
    expect(T.end - T.arrive).toBeGreaterThan(0.1);
  });
  test('changing nominal BPM cannot change measured-grid choreography', () => {
    const low = new AudioData({ ...audioJSON, bpm: 40 });
    const high = new AudioData({ ...audioJSON, bpm: 240 });
    expect(resolveCTimes(low, lyrics)).toEqual(resolveCTimes(high, lyrics));
    expect(todoState(low, T.checks[1]! + 0.1, T)).toEqual(todoState(high, T.checks[1]! + 0.1, T));
    expect(keyboardState(low, T.dive + 0.5, T)).toEqual(keyboardState(high, T.dive + 0.5, T));
  });
  test('vocal retiming updates row writing and resolved scene cuts', () => {
    const moved = structuredClone(lyricsJSON);
    for (const l of moved.lines) {
      l.start += 0.12; l.end += 0.12;
      for (const w of l.words) { w.start += 0.12; w.end += 0.12; }
    }
    const changed = resolveCTimes(audio, new Lyrics(moved));
    expect(changed.rowStarts[1]! - T.rowStarts[1]!).toBeCloseTo(0.12);
    expect(changed.checkWords[2]! - T.checkWords[2]!).toBeCloseTo(0.12);
  });
  test('random access does not mutate lyrics or depend on render order', () => {
    const before = JSON.stringify(lyricsJSON);
    for (const fn of [todoState, keyboardState]) {
      const at = T.dive + 0.3, initial = fn(audio, at, T);
      fn(audio, T.end, T); fn(audio, T.todo, T); fn(audio, T.keyboard, T);
      expect(fn(audio, at, T)).toEqual(initial);
    }
    expect(JSON.stringify(lyricsJSON)).toBe(before);
  });
});

test('each C group scene has exactly one discoverable main module', () => {
  const files = [...new Bun.Glob('s*.ts').scanSync({ cwd: new URL('../src/scenes/', import.meta.url).pathname })];
  expect(files.filter((s) => s.startsWith('s06-'))).toEqual(['s06-todo.ts']);
  // The keyboard module is added in the next scene commit.
});
