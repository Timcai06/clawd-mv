import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { normalizeAnchor, resolveStoryboard, type Anchor, type Shot, type Storyboard } from '../src/storyboard';
import { clawdPose, PIXELS } from '../src/scenes/animatic-clawd';

const audio = new AudioData({ duration: 20, bpm: 120, fps: 100, beats: [0, 0.5, 1, 1.6, 2.2, 2.8, 3.4, 4], downbeats: [0, 2.2, 4], sections: [], features: {}, onsets: {} });
const shot = (anchor: Anchor, t = 3): Shot => ({ id: 'test', scene: 'S01', t, anchor, clawd: 'A3', camera: '', visual: '' });
const board = (shots: Shot[]): Storyboard => ({ song: { file: '', duration: 20 }, scenes: [], shots });
const lyrics = new Lyrics({ lines: [
  { text: '“Tap-tap-tapping,” — don’t quit!', start: 0.2, end: 3, words: [{ w: 'Tap-tap-tapping,', start: 0.2, end: 1.4 }, { w: "don't", start: 1.7, end: 2 }, { w: 'quit!', start: 2.5, end: 3 }] },
  { text: 'Tap tap tapping, don\'t quit.', start: 4.1, end: 6, words: [{ w: 'Tap', start: 4.1, end: 4.5 }, { w: 'tap', start: 4.5, end: 5 }, { w: 'tapping,', start: 5, end: 5.4 }] },
] });
const anchor: Anchor = { line: "Tap-tap-tapping, don't quit", word: 'tap', occ: 1, snap: 'none' };
const resolve = (a: Anchor, ly = lyrics) => resolveStoryboard(board([shot(a)]), ly, audio).shots[0]!;

describe('storyboard anchors', () => {
  test('normalizes quotes, punctuation, case, whitespace and dashes without stemming', () => {
    expect(normalizeAnchor('“FIX,” — Don’t!')).toBe(normalizeAnchor('fix don\'t'));
    expect(normalizeAnchor('Tap‑tap–tapping')).toBe('tap tap tapping');
    expect(normalizeAnchor('tap')).not.toBe(normalizeAnchor('tapping'));
  });
  test('uses exact lines, 1-based line occurrences and exact word occurrences', () => {
    expect(resolve(anchor).start).toBeCloseTo(0.2);
    expect(resolve({ ...anchor, occ: 2, sub: 2 }).start).toBeCloseTo(4.5);
    expect(resolve({ ...anchor, line: 'Tap' }).source).toBe('fallback');
    expect(resolve({ ...anchor, occ: 3 }).reason).toContain('2 exact normalized matches');
  });
  test('splits hyphenated word duration equally but preserves whole-compound lookup', () => {
    expect(resolve({ ...anchor, sub: 2 }).start).toBeCloseTo(0.6);
    expect(resolve({ ...anchor, word: 'tapping' }).start).toBeCloseTo(1);
    expect(resolve({ ...anchor, word: 'tap-tap-tapping' }).start).toBeCloseTo(0.2);
    const missing = resolve({ ...anchor, sub: 3 });
    expect(missing.source).toBe('fallback');
    expect(missing.reason).toContain('2 exact matches');
  });
  test('syl picks an aligned syllable start and never guesses one', () => {
    const hook = new Lyrics({ lines: [{ text: 'I need one more commit', start: 1, end: 3, words: [
      { w: 'commit', start: 2, end: 2.8, syl: [[2, 2.4], [2.4, 2.8]] }, { w: 'more', start: 1.6, end: 1.9 }] }] });
    const a: Anchor = { line: 'I need one more commit', word: 'commit', syl: 2, snap: 'none' };
    expect(resolve(a, hook).start).toBeCloseTo(2.4);
    expect(resolve({ ...a, syl: 1 }, hook).start).toBeCloseTo(2);
    expect(resolve({ ...a, syl: 3 }, hook).source).toBe('fallback');
    expect(resolve({ ...a, word: 'more' }, hook).source).toBe('fallback'); // no aligned syllables
  });
  test('snaps first, then offsets using the variable beat grid', () => {
    expect(resolve({ ...anchor, word: "don't", snap: 'beat' }).start).toBe(1.6);
    expect(resolve({ ...anchor, word: "don't", snap: 'downbeat' }).start).toBe(2.2);
    expect(resolve({ ...anchor, word: "don't", snap: 'beat', offset_beats: 1.5 }).start).toBeCloseTo(2.5);
    expect(resolve({ ...anchor, snap: 'beat', offset_beats: -0.5 }).start).toBeCloseTo(-0.25);
  });
  test('fallback and instrumental times snap without adding a lyric offset', () => {
    expect(resolve({ ...anchor, word: 'missing', snap: 'beat', offset_beats: 2 }).start).toBe(2.8);
    expect(resolve({ word: null, snap: 'downbeat' }).start).toBe(2.2);
    expect(resolve({ word: null, snap: 'none' }).start).toBe(3);
  });
  test('case folding does not imply the second Run without sub: 2', () => {
    const ly = new Lyrics({ lines: [{ text: 'Run it again, run it again', start: 1, end: 3, words: [{ w: 'Run', start: 1, end: 1.2 }, { w: 'run', start: 2, end: 2.2 }] }] });
    const a: Anchor = { line: 'run it again run it again', word: 'run', snap: 'none' };
    expect(resolve(a, ly).start).toBe(1);
    expect(resolve({ ...a, sub: 2 }, ly).start).toBe(2);
  });
  test('records collapsed cuts, backwards cuts and sub-beat durations without sorting', () => {
    const shots = [0, 0.25, 0.25, 0.1].map((t, i) => ({ ...shot({ word: null, snap: 'none' }, t), id: `s${i}` }));
    const result = resolveStoryboard(board(shots), lyrics, audio);
    expect(result.shots.map((s) => s.start)).toEqual([0, 0.25, 0.25, 0.1]);
    expect(result.issues.filter((i) => i.kind === 'non-increasing')).toHaveLength(2);
    expect(result.issues.filter((i) => i.kind === 'short-shot')).toHaveLength(3);
    expect(result.shots.at(-1)!.end).toBe(audio.duration);
  });
  test('reports exactly one beat as valid and keeps missing-grid times finite', () => {
    const empty = new AudioData({ duration: 5, bpm: 120, fps: 100, beats: [], downbeats: [], sections: [], features: {}, onsets: {} });
    const result = resolveStoryboard(board([shot({ word: null, snap: 'beat' }, 0), shot({ word: null, snap: 'none' }, 0.5)]), lyrics, empty);
    expect(result.issues).toEqual([]);
    expect(result.shots[0]!.start).toBe(0);
    expect(resolveStoryboard(board([shot({ ...anchor, offset_beats: 1 })]), lyrics, empty).shots[0]!.start).toBeCloseTo(0.7);
  });
});

test('canonical 16 by 5 Clawd and required actions remain deterministic when seeking', () => {
  expect(PIXELS).toHaveLength(5);
  expect(PIXELS.every((row) => row.length === 16)).toBe(true);
  const base = clawdPose('A2', 0, 2, 0, 0);
  expect(clawdPose('A1', 0, 0, 0, 0).length).toBe(base.length + 2);
  for (const action of ['A3', 'A6', 'A8']) {
    const a = clawdPose(action, 0.13, 0.13, 0.1, 0.3);
    const b = clawdPose(action, 0.5, 0.5, 0.5, 0.5);
    expect(a).not.toEqual(b);
    expect(clawdPose(action, 0.13, 0.13, 0.1, 0.3)).toEqual(a);
  }
});
