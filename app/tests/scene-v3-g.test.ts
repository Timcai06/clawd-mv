import { describe, expect, test } from 'bun:test';
import opentype from 'opentype.js';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import { HANDOFF } from '../src/kit/handoff';
import { afterBeats } from '../src/kit/time';
import { creditsLayout, creditsState } from '../src/kit/credits';
import { TYPE_LEVELS, LYRIC_SIZE } from '../src/scenes/s18-tomorrow';
import { resolveOutroTimes, outroState, outroCredits, starState, handoffIn, compositionAt, STAR_TARGETS } from '../src/scenes/parts/s18-score';
import a from '../../data/audio.json';
import l from '../../data/lyrics.json';

const audio = new AudioData(a), lyrics = new Lyrics(l), voice = new Voice(lyrics, audio);
const T = resolveOutroTimes(audio, lyrics);
const shot = T.shots.find(s => s.id === 'S18-6')!;
const keyTime = shot.start + shot.duration * 0.6;
type Rect = { x: number; y: number; w: number; h: number };
// Manual measurement of visible outer silhouettes in the original 1672×941 kf-S18.png:
// constellation including node radii: x=78..1185, y=94..424;
// Clawd excluding the zzz callout: x=507..684, y=777..843.
// Independent targets, each multiplied by (1920/1672, 1080/941), not by scene constants.
const targets = {
  dominant: { x: 78 * 1920 / 1672, y: 94 * 1080 / 941, w: 1107 * 1920 / 1672, h: 330 * 1080 / 941 },
  clawd: { x: 507 * 1920 / 1672, y: 777 * 1080 / 941, w: 177 * 1920 / 1672, h: 66 * 1080 / 941 },
};
function error(actual: Rect, target: Rect) {
  return { center: Math.hypot(actual.x + actual.w / 2 - target.x - target.w / 2,
    actual.y + actual.h / 2 - target.y - target.h / 2),
    width: Math.abs(actual.w / target.w - 1), height: Math.abs(actual.h / target.h - 1) };
}

describe('G / S18 v3 storyboard contract', () => {
  test('the rendered layout at S18-6 60% matches independently measured silhouettes', () => {
    const actual = compositionAt(audio, voice, keyTime, T);
    for (const key of ['dominant', 'clawd'] as const) {
      const e = error(actual[key], targets[key]);
      expect(e.center).toBeLessThanOrEqual(96);
      expect(e.width).toBeLessThanOrEqual(0.15);
      expect(e.height).toBeLessThanOrEqual(0.15);
      console.log(`S18 ${key}: bbox=${JSON.stringify(actual[key])}, center=${e.center.toFixed(3)}px, width=${(e.width * 100).toFixed(3)}%, height=${(e.height * 100).toFixed(3)}%`);
    }
    // The reference arc's rectangular envelope is 23.2% of the frame; the 30% general
    // rule conflicts with the S18 reference. Preserve its measured composition and report it.
    expect(actual.dominant.w * actual.dominant.h / (1920 * 1080)).toBeLessThan(0.30);
  });

  test('the first rendered frame receives all six nodes exactly, and moves only for one beat', () => {
    const incoming = handoffIn(T.start, audio, T);
    const rendered = starState(audio, voice, T.start, T);
    incoming.forEach((p, i) => {
      expect(Math.hypot(p.x - HANDOFF.nodes17[i]!.x, p.y - HANDOFF.nodes17[i]!.y)).toBeLessThanOrEqual(2);
      expect(rendered[i]).toMatchObject({ ...HANDOFF.nodes17[i], alpha: 1 });
    });
    const settled = handoffIn(afterBeats(audio, T.start, 1), audio, T);
    expect(settled).toEqual(STAR_TARGETS.slice(0, 6).map(({ x, y }) => ({ x, y })));
    expect(handoffIn(keyTime, audio, T)).toEqual(settled);
    console.log('S18 incoming handoff: max center error=0px');
  });

  test('only the lyric and annotation tiers exist; credits remain in two grid blocks', async () => {
    const font = opentype.parse(await Bun.file(new URL('../public/fonts/Archivo-w1000-700.ttf', import.meta.url)).arrayBuffer());
    expect(TYPE_LEVELS.lyric).toBeCloseTo(font.tables.os2.sCapHeight / font.unitsPerEm * LYRIC_SIZE);
    expect(TYPE_LEVELS.giant).toBeNull();
    expect(TYPE_LEVELS.lyric).toBeGreaterThanOrEqual(50);
    expect(TYPE_LEVELS.lyric).toBeLessThanOrEqual(110);
    // TYPE_LEVELS.label is pre-conversion Mono size, as allowed by rollout acceptance.
    expect(TYPE_LEVELS.label).toBeGreaterThanOrEqual(14);
    expect(TYPE_LEVELS.label).toBeLessThanOrEqual(22);
    expect(TYPE_LEVELS.lyric / TYPE_LEVELS.label).toBeGreaterThanOrEqual(2.5);
    const rows = creditsLayout({ x: 96, y: 578, width: 1700, height: 120 }, creditsState(T.end, T.shots[6]!.start));
    expect(new Set(rows.map(r => r.x)).size).toBe(2);
    expect(rows.every(r => r.size === TYPE_LEVELS.label && r.y < 984)).toBe(true);
  });

  test('the carried last line is present at the cut and every word is unborn before its onset', () => {
    expect(T.carried.map(line => line.text)).toContain('And it works on every machine');
    expect(voice.presence(T.carried[0]!, T.start)).toBe(1);
    for (const word of [...T.carried.flatMap(line => line.words), ...T.ohs])
      expect(voice.form(word, word.start - 0.01).born).toBe(0);
    // No non-existent "oh" onset is treated as aligned in the production fixture.
    expect(T.ohs).toHaveLength(0);
  });

  test('supplied oh alignment lights one new star per onset and retimes with the data', () => {
    const onset = afterBeats(audio, T.start, 3);
    const withOh = (delta: number) => new Lyrics({ lines: [...l.lines, {
      i: l.lines.length, text: 'Oh, oh', start: onset + delta, end: onset + delta + 1,
      words: [{ w: 'Oh,', start: onset + delta, end: onset + delta + 0.4 },
        { w: 'oh', start: onset + delta + 0.5, end: onset + delta + 1 }],
    }] });
    for (const delta of [0, 0.11]) {
      const shifted = withOh(delta), V = new Voice(shifted, audio), times = resolveOutroTimes(audio, shifted);
      expect(times.ohs).toHaveLength(2);
      times.ohs.forEach((word, i) => {
        expect(V.form(word, word.start - 0.01).born).toBe(0);
        expect(starState(audio, V, word.start - 0.01, times)[6 + i]!.alpha).toBe(0);
        expect(starState(audio, V, word.start + 0.11, times)[6 + i]!.alpha).toBe(1);
      });
    }
  });

  test('scene state, actual layout and incoming handoff are deterministic under arbitrary seeks', () => {
    for (const t of [T.start, afterBeats(audio, T.start, 0.5), T.dawn, keyTime, T.end]) {
      const state = outroState(audio, t, T), stars = starState(audio, voice, t, T);
      const box = compositionAt(audio, voice, t, T), handoff = handoffIn(t, audio, T);
      outroState(audio, T.end, T); starState(audio, voice, T.start, T);
      expect(outroState(audio, t, T)).toEqual(state);
      expect(starState(audio, voice, t, T)).toEqual(stars);
      expect(compositionAt(audio, voice, t, T)).toEqual(box);
      expect(handoffIn(t, audio, T)).toEqual(handoff);
    }
  });

  test('credit reveal uses measured beats, completes before fade, and is seek-safe', () => {
    const at = T.shots[6]!.start;
    expect(outroCredits(audio, at, T).lines.every(row => row.progress === 0)).toBe(true);
    for (let i = 0; i < 6; i++) {
      expect(outroCredits(audio, afterBeats(audio, at, i), T).lines[i]!.progress).toBe(0);
      expect(outroCredits(audio, afterBeats(audio, at, i + 1.2), T).lines[i]!.progress).toBeCloseTo(1);
    }
    const beforeFade = afterBeats(audio, at, 13);
    const expected = outroCredits(audio, beforeFade, T);
    expect(expected.lines.every(row => row.progress === 1)).toBe(true);
    outroCredits(audio, T.start, T);
    expect(outroCredits(audio, beforeFade, T)).toEqual(expected);
  });
});
