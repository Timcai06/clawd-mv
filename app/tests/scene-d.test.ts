import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { resolveX9Times, rerunState } from '../src/scenes/s09-z-shared';
import { scopePoint } from '../src/scenes/s09-terminal';
import { glassTriangles, glassShardState, GLASS } from '../src/scenes/parts/s10-glass';
import { stormParticle, STORM } from '../src/scenes/parts/s11-storm';
import { copySettings } from '../src/scenes/parts/s12-copy';
import { countTypography } from '../src/scenes/s12-rerun';
import { afterBeats } from '../src/kit/time';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), T = resolveX9Times({ audio, lyrics: new Lyrics(lyricsJSON) });

describe('D group v2 geometry and temporal contracts', () => {
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
  test('every shard is intact before fracture and falls clear at the end', () => {
    for (let row = 0; row < 19; row++) for (let piece = 0; piece < 8; piece++) {
      const intact = glassShardState(row, piece, 0);
      for (const key of ['x', 'y', 'z'] as const) expect(intact[key]).toBeCloseTo(0);
      expect(intact.alpha).toBe(1);
      const atEnd = glassShardState(row, piece, 1);
      expect(atEnd.y).toBeGreaterThan(1800); expect(atEnd.alpha).toBeCloseTo(0);
      const original = glassShardState(row, piece, 0.4);
      glassShardState(row, piece, 1); glassShardState(row, piece, 0);
      expect(glassShardState(row, piece, 0.4)).toEqual(original);
    }
  });
  test('scope sweep is periodic in measured beats, and its impulse is at every progress dot', () => {
    for (const b of [0, 0.16, 1.4, 3.2, 7.8]) {
      const a = scopePoint(b), c = scopePoint(b + 8);
      expect(a[0]).toBeCloseTo(c[0]); expect(a[1]).toBeCloseTo(c[1]);
    }
    expect(scopePoint(0.16)[1]).toBeLessThan(scopePoint(0)[1] - 90);
  });
  test('storm has separate depth, speed, blur rows, and the line-42 trace in every band', () => {
    for (let layer = 0; layer < 3; layer++) {
      const particles = Array.from({ length: STORM.perLayer }, (_, i) => stormParticle(layer * STORM.perLayer + i, 2));
      expect(new Set(particles.map(p => p.line))).toEqual(new Set([0, 1, 2]));
      expect(particles.every(p => p.layer === layer)).toBe(true);
    }
    const far = stormParticle(0, 0), near = stormParticle(84, 0);
    expect(near.z).toBeGreaterThan(far.z); expect(near.width).toBeGreaterThan(far.width);
    const ds = [0, 42, 84].map(i => Math.abs(stormParticle(i, 0.1).y - stormParticle(i, 0).y));
    expect(ds[1]).toBeGreaterThan(ds[0]); expect(ds[2]).toBeGreaterThan(ds[1]);
    const p = stormParticle(37, 5); stormParticle(37, 100); expect(stormParticle(37, 5)).toEqual(p);
  });
  test('copy degradation increases per actual run and the cache wipe restores clean toner', () => {
    const copies = [0, 1, 2].map(run => copySettings(run, false));
    for (const key of ['drift', 'dropout', 'bands'] as const) {
      expect(copies[1][key]).toBeGreaterThan(copies[0][key]);
      expect(copies[2][key]).toBeGreaterThan(copies[1][key]);
      expect(copySettings(2, true)[key]).toBe(0);
    }
  });
  test('eleven widens and holds; the assertion survives to the scene end', () => {
    const early = countTypography(11, 1, 0), held = countTypography(11, 1, 1);
    expect(early.width).toBe(62); expect(held.width).toBe(125); expect(held.weight).toBe(900);
    expect(rerunState(audio, afterBeats(audio, T.eleven, 1), T).number).toBe(11);
    expect(rerunState(audio, T.end - 1 / 60, T).number).toBe(11);
    expect(audio.beatAt(T.end) - audio.beatAt(T.eleven)).toBeGreaterThanOrEqual(1.5 - 1e-6);
  });
});
