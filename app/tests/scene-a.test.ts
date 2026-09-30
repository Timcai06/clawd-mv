import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { afterBeats } from '../src/kit/time';
import { bootState, issueState, notifyState, openingTimes } from '../src/scenes/parts/s01-timing';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import board from '../../storyboard/shots.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const T = openingTimes(audio, lyrics);

describe('group A editorial and musical landmarks', () => {
  test('all shot landmarks use the resolved storyboard rather than approximate seconds', () => {
    const cuts = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
    for (const [key, id] of [['start', 'S01-1'], ['welcome', 'S01-2'], ['ping', 'S02-1'],
      ['screen', 'S02-2'], ['issue', 'S03-1'], ['attachment', 'S03-2'], ['end', 'S04-1']] as const)
      expect(T[key]).toBe(cuts.find(s => s.id === id)!.start);
    expect(T.bug).toBe(lyrics.findWords('bug')[0]!.start);
  });
  test('welcome rules, sprite and lines reveal on the measured beat grid', () => {
    expect(bootState(audio, T.welcome, T)).toMatchObject({ frame: 0, pixels: 0, rows: [0, 0, 0, 0] });
    expect(bootState(audio, afterBeats(audio, T.welcome, 3), T)).toMatchObject({ frame: 1, pixels: 1 });
    expect(bootState(audio, afterBeats(audio, T.welcome, 5), T).rows).toEqual([1, 1, 1, 1]);
    expect(bootState(audio, T.ping, T).view.zoom).toBeCloseTo(1.12);
  });
  test('notification flips exactly on the ping cut and passes through into the issue', () => {
    expect(notifyState(audio, T.ping - 1e-5, T).kind).toBe('ink');
    expect(notifyState(audio, T.ping, T)).toMatchObject({ kind: 'paper', pop: 0, push: 0 });
    expect(notifyState(audio, T.screen, T).pop).toBe(1);
    expect(notifyState(audio, T.issue, T)).toMatchObject({ document: 1, push: 1 });
  });
  test('bug stamp follows the vocal and the ring completes before the attachment exit', () => {
    expect(issueState(audio, T.bug - 1e-5, T).stamp).toBe(false);
    expect(issueState(audio, T.bug, T)).toMatchObject({ stamp: true, impact: 1 });
    expect(issueState(audio, T.attachment, T)).toMatchObject({ title: 1, circle: 0 });
    expect(issueState(audio, afterBeats(audio, T.attachment, 1.3), T).circle).toBe(1);
    expect(issueState(audio, T.end, T).view.zoom).toBeCloseTo(2.65);
  });
  test('seek order and nominal BPM do not affect state', () => {
    const other = new AudioData({ ...audioJSON, bpm: 45 });
    for (const fn of [bootState, notifyState, issueState]) {
      const t = (T.start + T.end) / 2, before = fn(audio, t, T);
      fn(audio, T.end, T); fn(audio, T.start, T);
      expect(fn(audio, t, T)).toEqual(before);
      expect(fn(other, t, T)).toEqual(before);
    }
  });
  test('real scenes cannot be displaced by group A helpers during module discovery', () => {
    const files = [...new Bun.Glob('s0[123]-*.ts').scanSync({ cwd: new URL('../src/scenes/', import.meta.url).pathname })];
    for (const id of ['s01', 's02', 's03']) expect(files.filter(file => file.startsWith(id + '-')).length).toBeLessThanOrEqual(1);
  });
});
