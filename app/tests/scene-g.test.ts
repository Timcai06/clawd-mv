import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { afterBeats } from '../src/kit/time';
import { CREDIT_LINES } from '../src/kit/credits';
import { pose } from '../src/kit/clawd';
import { resolveReleaseTimes, releaseState, WALL_CELLS } from '../src/scenes/parts/s17-release-state';
import { resolveOutroTimes, outroState, outroCredits, starState } from '../src/scenes/parts/s18-score';
import { Voice } from '../src/kit/lyric-moves';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const T = resolveReleaseTimes(audio, lyrics), eps = 1e-6;
const O = resolveOutroTimes(audio, lyrics), voice = new Voice(lyrics, audio);

describe('G editorial and musical timing', () => {
  test('all nine release shots and seven outro shots are covered without a gap', () => {
    expect(T.release.map(s => s.id)).toEqual(Array.from({ length: 9 }, (_, i) => `S17-${i + 1}`));
    expect(T.tomorrow.map(s => s.id)).toEqual(Array.from({ length: 7 }, (_, i) => `S18-${i + 1}`));
    const shots = [...T.release, ...T.tomorrow];
    for (let i = 0; i < shots.length - 1; i++) expect(shots[i]!.end).toBe(shots[i + 1]!.start);
    expect(T.end).toBe(audio.duration);
  });

  test('world hardware impact begins on the second syllable and keeps its paper ground', () => {
    const commit = lyrics.get('I need one last commit').words.at(-1)!;
    expect(T.hit).toBe(commit.syl![1]![0]);
    expect(T.hit).not.toBe(audio.nearestBeat(T.hit));
    expect(releaseState(audio, T.hit - eps, T).ground).toBe('paper');
    expect(releaseState(audio, T.hit, T)).toMatchObject({ ground: 'paper', impact: 1, shot: 1 });
    expect(releaseState(audio, T.release[2]!.start, T).ground).toBe('paper');
  });

  test('a shifted alignment retimes the stressed syllable without retaining song seconds', () => {
    const shifted = structuredClone(lyricsJSON);
    const line = shifted.lines.find(l => l.text === 'I need one last commit')!;
    line.start += 0.11; line.end += 0.11;
    for (const word of line.words) {
      word.start += 0.11; word.end += 0.11;
      if ('syl' in word && word.syl) for (const syllable of word.syl) { syllable[0] += 0.11; syllable[1] += 0.11; }
    }
    expect(resolveReleaseTimes(audio, new Lyrics(shifted)).hit - T.hit).toBeCloseTo(0.11);
  });

  test('zipper progress follows to.start through main.end', () => {
    expect(releaseState(audio, T.zipStart - eps, T).merge).toBe(0);
    expect(releaseState(audio, T.zipStart, T).merge).toBe(0);
    expect(releaseState(audio, (T.zipStart + T.zipEnd) / 2, T).merge).toBeCloseTo(0.5);
    expect(releaseState(audio, T.zipEnd, T).merge).toBe(1);
  });

  test('the canonical wall completes before the final one-beat reveal and cranes during the preceding shot', () => {
    expect(WALL_CELLS).toEqual(pose(null, { beat: 0, beat0: 0, p: 0 }).cells);
    expect(WALL_CELLS.filter(cell => cell.k === 'D')).toHaveLength(2);
    const at = T.release[7]!.start, final = T.release[8]!.start;
    expect(releaseState(audio, at, T).wallLit).toBe(WALL_CELLS.length - 2);
    expect(releaseState(audio, final, T).wallLit).toBe(WALL_CELLS.length - 2);
    expect(releaseState(audio, final, T).wallZoom).toBeLessThan(1.4);
    expect(releaseState(audio, T.tomorrow[0]!.start - eps, T).wallZoom).toBeCloseTo(0.82);
  });

  test('dawn coverage and calendar turn use the measured downbeat within the calendar shot', () => {
    expect(audio.downbeats.some(t => Math.abs(t - T.dawn) < eps)).toBe(true);
    expect(T.dawn).toBeGreaterThan(T.tomorrow[4]!.start);
    expect(T.dawn).toBeLessThan(T.tomorrow[5]!.start);
    expect(outroState(audio, afterBeats(audio, O.dawn, -4), O).dawn).toBe(0);
    expect(outroState(audio, O.dawn, O).dawn).toBe(0);
    expect(outroState(audio, afterBeats(audio, O.shots[4]!.start, 4) + 0.6, O).flip).toBe(1);
    expect(outroState(audio, O.shots[5]!.start, O).dawn).toBe(1);
  });

  test('the printed star map remains on the night side through the dawn shot', () => {
    expect(starState(audio, voice, O.start, O).slice(0, 6).every(p => p.alpha === 1)).toBe(true);
    expect(starState(audio, voice, O.dawn, O).filter(p => p.at <= O.dawn).every(p => p.alpha === 1)).toBe(true);
    expect(starState(audio, voice, O.shots[5]!.start, O).filter(p => p.at <= O.shots[5]!.start).every(p => p.alpha === 1)).toBe(true);
  });

  test('credit rows finish before the cursor-only loop and global fade stays off', () => {
    const at = T.tomorrow[6]!.start;
    const beforeFade = afterBeats(audio, at, 13);
    expect(outroCredits(audio, beforeFade, O).lines.every(row => row.progress === 1)).toBe(true);
    expect(CREDIT_LINES.some(line => line.includes('Every frame drawn by code'))).toBe(true);
    expect(outroState(audio, beforeFade, O).fade).toBe(0);
    expect(outroState(audio, O.end, O).fade).toBe(0);
    expect(outroState(audio, O.end - 1/60, O).loop).toBe(1);
  });

  test('nominal BPM changes do not alter the measured-grid animation', () => {
    const slow = new AudioData({ ...audioJSON, bpm: 40 });
    const fast = new AudioData({ ...audioJSON, bpm: 240 });
    for (const t of [T.hit, T.release[5]!.start + 0.3, T.dawn, T.end - 1]) {
      expect(releaseState(slow, t, T)).toEqual(releaseState(fast, t, T));
      expect(outroState(slow, t, O)).toEqual(outroState(fast, t, O));
    }
  });

  test('state calculations remain unchanged under out-of-order seeks', () => {
    for (const state of [releaseState]) {
      for (const t of [T.hit + 0.2, T.release[5]!.start + 0.4, T.dawn + 0.2]) {
        const expected = state(audio, t, T);
        state(audio, T.end, T); state(audio, 0, T);
        expect(state(audio, t, T)).toEqual(expected);
      }
    }
  });
});
