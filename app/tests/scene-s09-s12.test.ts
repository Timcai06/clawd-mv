import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { afterBeats, beatsSince } from '../src/kit/time';
import { textRainDrops } from '../src/kit/textrain';
import { redwallState, rainState, rerunState, resolveX9Times, terminalState } from '../src/scenes/s09-z-shared';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import boardJSON from '../../storyboard/shots.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const T = resolveX9Times({ audio, lyrics });
const eps = 1e-5;

describe('X9 aligned landmarks', () => {
  test('repeated words use their own vocal onsets, independent of snapped shot cuts', () => {
    const undefinedLine = lyrics.get('Undefined, undefined');
    expect(T.impacts).toEqual(undefinedLine.words.slice(0, 2).map((w) => w.start));
    const run = lyrics.get('Run it again');
    expect(T.runs).toEqual([run.words[0].start, run.words[3].start, run.words[6].start]);
    expect(T.nineteen).toBe(lyrics.get('Nineteen red').start);
    expect(T.clear).toBe(lyrics.get('Clear the cache').start);
    const cuts = resolveStoryboard(boardJSON as Storyboard, lyrics, audio).shots;
    expect(T.terminal).toBe(cuts.find((s) => s.id === 'S09-1')!.start);
    expect(T.end).toBe(cuts.find((s) => s.id === 'S13-1')!.start);
    expect(T.nineteen).not.toBe(cuts.find((s) => s.id === 'S10-1')!.start);
  });
  test('changed alignment retimes every repeat instead of retaining song seconds', () => {
    const fixture = structuredClone(lyricsJSON);
    for (const line of fixture.lines) {
      line.start += 0.07; line.end += 0.07;
      for (const w of line.words) { w.start += 0.07; w.end += 0.07; }
    }
    const shifted = resolveX9Times({ audio, lyrics: new Lyrics(fixture) });
    for (const key of ['waiting', 'nineteen', 'shatter', 'stack', 'sky', 'why', 'clear', 'cache', 'count', 'ten'] as const)
      expect(shifted[key] - T[key]).toBeCloseTo(0.07);
    T.runs.forEach((t, i) => expect(shifted.runs[i] - t).toBeCloseTo(0.07));
    T.impacts.forEach((t, i) => expect(shifted.impacts[i] - t).toBeCloseTo(0.07));
  });
  test('missing lyric data uses storyboard t values', () => {
    const missing = resolveX9Times({ audio, lyrics: new Lyrics({ lines: [] }) });
    for (const [key, id] of [['waiting', 'S09-2'], ['nineteen', 'S10-1'], ['shatter', 'S10-2'], ['count', 'S12-5']] as const)
      expect(missing[key]).toBe(boardJSON.shots.find((s) => s.id === id)!.t);
  });
});

describe('X9 scene events', () => {
  test('terminal enters from below, finishes typing before the waiting lyric, and adds one dot per measured beat', () => {
    expect(terminalState(audio, T.terminal, T)).toMatchObject({ rise: 0, chars: 0, dots: 0 });
    expect(terminalState(audio, T.waiting, T)).toMatchObject({ rise: 1, chars: 8, dots: 1 });
    for (let n = 1; n <= 5; n++) {
      const at = afterBeats(audio, T.waiting, n);
      expect(terminalState(audio, at - eps, T).dots).toBe(n);
      expect(terminalState(audio, at, T).dots).toBe(n + 1);
    }
  });
  test('nineteen rows arrive within a beat and fracture only at shattering', () => {
    expect(redwallState(audio, T.nineteen - eps, T).rows).toBe(0);
    expect(redwallState(audio, T.nineteen, T).rows).toBe(1);
    expect(redwallState(audio, afterBeats(audio, T.nineteen, 0.8), T).rows).toBe(19);
    expect(redwallState(audio, T.shatter - eps, T).fracture).toBe(0);
    expect(redwallState(audio, afterBeats(audio, T.shatter, 1), T).fracture).toBeGreaterThan(0);
    expect(redwallState(audio, T.wallEnd - eps, T).fracture).toBe(1);
  });
  test('both word falls land on their own onset and the line-42 hint survives in the rain', () => {
    for (const [i, at] of T.impacts.entries()) {
      expect(rainState(audio, at - eps, T).impacts[i].fall).toBeLessThan(1);
      expect(rainState(audio, at, T).impacts[i]).toMatchObject({ visible: true, fall: 1, squash: 1 });
    }
    const rain = rainState(audio, T.sky, T);
    expect(textRainDrops({ x: 0, y: 0, width: 2880, height: 1620 }, rain).some((d) => d.text === 'at daysIn (month.ts:42)')).toBe(true);
    expect(rainState(audio, T.why, T).pull).toBe(0);
    expect(rainState(audio, T.rainEnd, T).pull).toBe(1);
  });
  test('nonuniform beat grids drive events without consulting the nominal BPM', () => {
    const a = new AudioData({ ...audioJSON, bpm: 40 });
    const b = new AudioData({ ...audioJSON, bpm: 240 });
    const t = afterBeats(audio, T.waiting, 2.5);
    expect(terminalState(a, t, T)).toEqual(terminalState(b, t, T));
    expect(rerunState(a, T.ten, T)).toEqual(rerunState(b, T.ten, T));
  });
  test('arbitrary seek order leaves states and input lyrics unchanged', () => {
    const before = JSON.stringify(lyricsJSON);
    for (const state of [terminalState, redwallState, rainState, rerunState]) {
      const first = state(audio, T.ten, T);
      state(audio, T.end, T); state(audio, 0, T);
      expect(state(audio, T.ten, T)).toEqual(first);
    }
    expect(JSON.stringify(lyricsJSON)).toBe(before);
  });
});

test('the real scene module wins the timeline prefix lookup before the shared helper', async () => {
  const files = [...new Bun.Glob('s*.ts').scanSync({ cwd: new URL('../src/scenes/', import.meta.url).pathname })].sort();
  for (const [id, file] of [['s09', 's09-terminal.ts'], ['s10', 's10-redwall.ts'], ['s11', 's11-rain.ts'], ['s12', 's12-rerun.ts']])
    expect(files.find((name) => name.startsWith(id + '-'))).toBe(file);
});
