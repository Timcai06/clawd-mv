import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { afterBeats } from '../src/kit/time';
import { DATES, STREETS, cityState, cityTimes, dateBlock, streetAt } from '../src/scenes/parts/s04-city-model';
import { HERO_ROWS, platformState, platformTimes, projectPlatform } from '../src/scenes/parts/s05-platform-model';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import board from '../../storyboard/shots.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const city = cityTimes(audio, lyrics);
const platform = platformTimes(audio, lyrics);

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

describe('B / code platforms', () => {
  test('the three lenses and next scene boundary use the resolved storyboard', () => {
    const cuts = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
    for (const [key, id] of [['start', 'S05-1'], ['read', 'S05-2'], ['scroll', 'S05-3'], ['end', 'S06-1']] as const)
      expect(platform[key]).toBe(cuts.find((s) => s.id === id)!.start);
    expect(platformState(audio, platform.read - 1e-5, platform).phase).toBe(0);
    expect(platformState(audio, platform.read, platform).phase).toBe(1);
    expect(platformState(audio, platform.scroll, platform).phase).toBe(2);
  });

  test('src, calendar, month.ts start opening one measured beat apart', () => {
    for (let i = 0; i < 3; i++) {
      const at = afterBeats(audio, platform.read, i);
      expect(platform.drawers[i]).toBeCloseTo(at, 7);
      expect(platformState(audio, at - 1e-5, platform).drawers[i]).toBe(0);
      expect(platformState(audio, afterBeats(audio, at, 0.8), platform).drawers[i]).toBe(1);
    }
  });

  test('the reading pass traverses the foreground ledges in source order', () => {
    const seen = new Set<number>();
    let lastX = -Infinity;
    for (let t = platform.scroll; t < platform.end; t += 1 / 240) {
      const s = platformState(audio, t, platform);
      expect(s.walkX).toBeGreaterThanOrEqual(lastX);
      lastX = s.walkX;
      seen.add(s.row);
    }
    expect([...seen]).toEqual([0, 1, 2, 3]);
    const final = platformState(audio, platform.end - 1e-5, platform);
    expect(final.readRows).toBe(HERO_ROWS.length);
    expect(final.travel).toBe(1);
  });

  test('three depth factors move by different amounts under the same camera motion', () => {
    const a = platformState(audio, platform.scroll, platform);
    const b = platformState(audio, platform.end, platform);
    const deltas = [0.22, 0.55, 1].map((factor) => projectPlatform(1000, 800, factor, a).x - projectPlatform(1000, 800, factor, b).x);
    expect(deltas[0]).toBeLessThan(deltas[1]); expect(deltas[1]).toBeLessThan(deltas[2]);
    expect(deltas[0] / deltas[2]).toBeCloseTo(0.22, 7);
    expect(deltas[1] / deltas[2]).toBeCloseTo(0.55, 7);
  });

  test('revised beat grids retime drawers and nominal BPM does not', () => {
    const other = new AudioData({ ...audioJSON, bpm: 280 });
    const t = afterBeats(audio, platform.read, 1.3);
    expect(platformState(other, t, platform)).toEqual(platformState(audio, t, platform));
    const shifted = new AudioData({ ...audioJSON, beats: audioJSON.beats.map((t: number) => t + 0.20),
      downbeats: audioJSON.downbeats.map((t: number) => t + 0.20) });
    const retimed = platformTimes(shifted, lyrics);
    expect(retimed.drawers[1]).toBeCloseTo(afterBeats(shifted, retimed.read, 1), 7);
  });

  test('out-of-order evaluation preserves the source fixtures and camera result', () => {
    const before = JSON.stringify({ lyricsJSON, audioJSON, board });
    const s = platformState(audio, platform.read + 0.30, platform);
    platformState(audio, platform.end, platform); platformState(audio, platform.start, platform);
    expect(platformState(audio, platform.read + 0.30, platform)).toEqual(s);
    expect(JSON.stringify({ lyricsJSON, audioJSON, board })).toBe(before);
  });
});

test('only one discoverable main module exists for each B scene', () => {
  const files = [...new Bun.Glob('s*.ts').scanSync({ cwd: new URL('../src/scenes/', import.meta.url).pathname })];
  expect(files.filter((name) => name.startsWith('s04-'))).toEqual(['s04-calendar.ts']);
  expect(files.filter((name) => name.startsWith('s05-'))).toEqual(['s05-platform.ts']);
});
