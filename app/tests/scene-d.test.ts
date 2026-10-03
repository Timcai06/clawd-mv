import { Voice } from '../src/kit/lyric-moves';
import { numberTimes } from '../src/scenes/parts/s12-world';
import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { resolveX9Times, rerunState } from '../src/scenes/s09-z-shared';
import { scopeY } from '../src/scenes/parts/s09-scope';
import { glassTriangles, glassShardState, GLASS } from '../src/scenes/parts/s10-glass';
import { deepParticle, DEEP } from '../src/scenes/parts/s11-deep';
import { xeroxSettings } from '../src/scenes/parts/s12-copy';
import { afterBeats } from '../src/kit/time';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), T = resolveX9Times({ audio, lyrics: new Lyrics(lyricsJSON) });

describe('D group source geometry and print materials', () => {
  test('all 19 triangulations partition one plate without holes or overlaps', () => {
    for (let row = 0; row < 19; row++) {
      const pieces = glassTriangles(row);
      expect(pieces.length).toBe(8);
      const area = pieces.reduce((sum, [a, b, c]) => sum + Math.abs(
        (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2, 0);
      expect(area).toBeCloseTo(GLASS.width * GLASS.height, 6);
      for (const tri of pieces) for (const [x, y] of tri) {
        expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(GLASS.width);
        expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(GLASS.height);
      }
    }
  });
  test('every shard begins intact, releases deterministically, and remains for the reference debris cloud', () => {
    for (let row = 0; row < 19; row++) for (let piece = 0; piece < 8; piece++) {
      const intact = glassShardState(row, piece, 0);
      for (const key of ['x', 'y', 'z'] as const) expect(intact[key]).toBeCloseTo(0);
      expect(intact.alpha).toBe(1);
      const atEnd = glassShardState(row, piece, 1);
      expect(atEnd.release).toBeCloseTo(1); expect(atEnd.alpha).toBe(1);
      expect(Number.isFinite(atEnd.y)).toBe(true);
      const original = glassShardState(row, piece, 0.4);
      glassShardState(row, piece, 1); glassShardState(row, piece, 0);
      expect(glassShardState(row, piece, 0.4)).toEqual(original);
    }
  });
  test('the actual waveform repeats, with a spike and undershoot in each measured cycle', () => {
    for (const phase of [0, 0.16, 1.4, 3.2, 7.8]) expect(scopeY(phase)).toBeCloseTo(scopeY(phase + 8));
    expect(scopeY(0.83)).toBeLessThan(scopeY(0) - 90);
    expect(scopeY(0.4)).toBeGreaterThan(scopeY(0) + 60);
  });
  test('the rendered deep field contains trace lines, clay bars and different depth scales', () => {
    const particles = Array.from({ length: DEEP.count }, (_, id) => deepParticle(id, 0));
    expect(new Set(particles.filter(p => !p.bar).map(p => p.line))).toEqual(new Set([0, 1, 2]));
    expect(particles.some(p => p.bar)).toBe(true);
    expect(Math.max(...particles.map(p => p.z)) - Math.min(...particles.map(p => p.z))).toBeGreaterThan(70);
    const p = deepParticle(37, 5); deepParticle(37, 100); expect(deepParticle(37, 5)).toEqual(p);
  });
  test('five V6 generations increase toner density, blur, enlargement and rotation', () => {
    const copies = Array.from({ length: 5 }, (_, gen) => xeroxSettings(gen));
    for (let i = 1; i < copies.length; i++) for (const key of ['density', 'blur', 'scale', 'rotation'] as const)
      expect(copies[i]![key]).toBeGreaterThan(copies[i - 1]![key]);
  });
  test('the V6 extra eleven uses the held ten midpoint', () => {
    const lyrics=new Lyrics(lyricsJSON),voice=new Voice(lyrics,audio),ten=lyrics.get('Clear the cache and count to ten').words[6]!;
    expect(numberTimes(voice)[10]).toBe(ten.start+0.55*(ten.end-ten.start));
  });
});
