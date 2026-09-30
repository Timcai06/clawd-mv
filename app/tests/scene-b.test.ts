import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { afterBeats } from '../src/kit/time';
import { DATES, STREETS, cityState, cityTimes, dateBlock, streetAt } from '../src/scenes/parts/s04-city-model';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import board from '../../storyboard/shots.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const city = cityTimes(audio, lyrics);

describe('B / calendar city', () => {
  test('scene cues come from resolved shots, including the next scene boundary', () => {
    const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
    expect(city).toEqual({ start: shots.find((s) => s.id === 'S04-1')!.start,
      rise: shots.find((s) => s.id === 'S04-2')!.start,
      end: shots.find((s) => s.id === 'S05-1')!.start });
  });

  test('October begins on Thursday, ends on Saturday, and the extra day starts a sixth row', () => {
    expect(DATES).toHaveLength(32);
    expect(dateBlock(1)).toMatchObject({ column: 4, row: 0 });
    expect(dateBlock(31)).toMatchObject({ column: 6, row: 4 });
    expect(dateBlock(32)).toMatchObject({ column: 0, row: 5 });
    expect(new Set(DATES.map((d) => `${d.x},${d.z}`)).size).toBe(32);
    for (let day = 1; day <= 31; day++) {
      const d = dateBlock(day);
      expect(STREETS.points.some((p) => p[0] === d.x && p[2] > d.z && p[2] < d.z + 1.8)).toBe(true);
    }
    for (let i = 1; i < STREETS.points.length; i++) {
      const a = STREETS.points[i - 1]!, b = STREETS.points[i]!;
      expect(a[0] === b[0] || a[2] === b[2]).toBe(true);
    }
  });

  test('32 stays underground until its cut, springs up, and remains visible for the hold', () => {
    expect(cityState(audio, city.rise - 1e-5, city)).toMatchObject({ rising: false, lift: 0 });
    expect(cityState(audio, city.rise, city)).toMatchObject({ rising: true, lift: 0, travel: 1 });
    expect(cityState(audio, afterBeats(audio, city.rise, 0.6), city).lift).toBeGreaterThan(1);
    expect(cityState(audio, city.end - 1e-5, city).roof32).toBeCloseTo(dateBlock(32).height);
  });

  test('one fresh roof per measured beat; route completes all dates before the impossible day', () => {
    for (let n = 0; n < 3; n++) {
      const at = afterBeats(audio, city.start, n);
      expect(cityState(audio, at, city).accented).toBe(n + 1);
    }
    expect(cityState(audio, city.rise, city).visited).toBe(31);
    expect(streetAt(0)).toEqual(STREETS.points[0]!);
    expect(streetAt(1)).toEqual(STREETS.points.at(-1)!);
  });

  test('nominal BPM and seek history do not affect geometry or animation', () => {
    const otherBpm = new AudioData({ ...audioJSON, bpm: 42 });
    const t = afterBeats(audio, city.rise, 0.7);
    const a = cityState(audio, t, city);
    cityState(audio, city.end, city); cityState(audio, city.start, city);
    expect(cityState(audio, t, city)).toEqual(a);
    expect(cityState(otherBpm, t, city)).toEqual(a);
  });
});
