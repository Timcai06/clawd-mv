import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { afterBeats } from '../src/kit/time';
import { chorusScore, chorusState, commitId, sceneScore } from '../src/scenes/parts/s13-score';
import { stackPos, stackScore, stackPhase } from '../src/scenes/parts/s14-stack';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const C = chorusScore(audio, lyrics), D = stackScore(audio, lyrics);
const epsilon = 1e-6;

describe('E group score', () => {
  test('both chorus impacts are the exact second aligned syllable', () => {
    const hooks = lyrics.find('I need one more commit');
    expect(C.hit1).toBe(hooks[2].words.at(-1)!.syl![1][0]);
    expect(C.hit2).toBe(hooks[3].words.at(-1)!.syl![1][0]);
    for (const [at, end] of [[C.hit1, C.clayEnd1], [C.hit2, C.clayEnd2]]) {
      expect(chorusState(audio, at - epsilon, C).kind).toBe('ink');
      expect(chorusState(audio, at, C).kind).toBe('clay');
      expect(audio.downbeats).toContain(end);
      expect(chorusState(audio, end, C).kind).toBe('ink');
    }
  });

  test('the resolved cut list supplies every scene boundary', () => {
    const shots = sceneScore(audio, lyrics, 'S14');
    expect(C.end).toBe(D.start);
    expect(D.start).toBe(shots[0]!.start);
    expect(D.near).toBe(lyrics.get('Frame by frame').words.at(-1)!.start);
    expect(D.end).toBe(shots.at(-1)!.end);
  });

  test('changing lyric syllables retimes the impacts and changing near retimes the stop', () => {
    const json = structuredClone(lyricsJSON);
    for (const line of json.lines) for (const w of line.words) {
      if (w.syl) for (const syl of w.syl) { syl[0] += 0.08; syl[1] += 0.08; }
      if (/near/.test(w.w)) { w.start += 0.7; w.end += 0.7; }
    }
    const changed = new Lyrics(json), CC = chorusScore(audio, changed), DD = stackScore(audio, changed);
    expect(CC.hit1 - C.hit1).toBeCloseTo(0.08);
    expect(CC.hit2 - C.hit2).toBeCloseTo(0.08);
    expect(DD.near).toBeGreaterThan(D.near);
  });
});

describe('S13 choreography', () => {
  test('the log freezes during both pickups, then overflows on the second impact', () => {
    expect(chorusState(audio, C.start, C).rowCount).toBe(0);
    const a = chorusState(audio, C.pickup2 + 0.03, C);
    const b = chorusState(audio, C.hit2 - epsilon, C);
    expect(a.frozen && b.frozen).toBe(true);
    expect(a.scroll).toBe(b.scroll);
    expect(a.rowCount).toBe(b.rowCount);
    expect(chorusState(audio, C.hit2, C).rowCount - b.rowCount).toBeGreaterThanOrEqual(24);
  });

  test('commit entries follow the measured variable-tempo beat index', () => {
    for (let i = 1; i <= 6; i++) {
      const t = afterBeats(audio, C.hit1, i);
      expect(chorusState(audio, t, C).rowCount).toBe(i + 1);
    }
    expect(new Set(Array.from({ length: 100 }, (_, i) => commitId(i))).size).toBe(100);
  });

  test('the collision has a separate contact and ejection interval inside the short final shot', () => {
    expect(chorusState(audio, C.collision - epsilon, C).crush).toBe(0);
    const contact = chorusState(audio, afterBeats(audio, C.collision, 0.42), C);
    expect(contact.crush).toBe(1);
    expect(contact.eject).toBeGreaterThan(0);
    expect(chorusState(audio, C.end, C).eject).toBe(1);
  });
});

describe('S14 descent', () => {
  test('falls one frame per step, monotonically, and stops dead exactly on near', () => {
    let last = -1;
    for (let t = D.start; t <= D.end; t += 1 / 120) {
      const pos = stackPos(t, D);
      expect(pos).toBeGreaterThanOrEqual(last - 0.09); last = Math.max(last, pos); // springs may overshoot slightly
    }
    expect(stackPhase(D.near - 1e-4, D).id).not.toBe('stop');
    expect(stackPhase(D.near, D).id).toBe('stop');
    expect(stackPos(D.end, D)).toBeCloseTo(stackPos(D.near + 0.001, D), 6);
    // "quiet down here" falls half as often as "Down the call stack"
    const per = (a: number, b: number) => D.steps.filter((s) => s.t >= a && s.t < b).length / (b - a);
    expect(per(D.quiet, D.frame)).toBeLessThan(per(D.down, D.quiet));
  });

  test('every sung word is set on a frame; held words echo on later frames', () => {
    expect(D.words.filter((w) => !w.echo)).toHaveLength(15);
    expect(D.words.some((w) => w.echo)).toBe(true);
    expect(D.words.find((w) => /near/i.test(w.word.w) && !w.echo)!.block).toBe(D.steps.length);
  });

  test('nominal BPM and arbitrary call order cannot alter either scene', () => {
    const slow = new AudioData({ ...audioJSON, bpm: 40 }), fast = new AudioData({ ...audioJSON, bpm: 240 });
    const Ds = stackScore(slow, lyrics), Df = stackScore(fast, lyrics);
    for (const t of [D.near, C.hit1, D.quiet, C.pickup2, C.hit2, D.down]) {
      expect(chorusState(slow, t, C)).toEqual(chorusState(fast, t, C));
      expect(stackPos(t, Ds)).toBe(stackPos(t, Df));
      const a = stackPos(t, D); stackPos(D.end, D); stackPos(D.start, D);
      expect(stackPos(t, D)).toBe(a);
    }
  });
});

test('one main module per scene keeps automatic timeline discovery unambiguous', () => {
  const files = [...new Bun.Glob('s1[34]-*.ts').scanSync({ cwd: new URL('../src/scenes/', import.meta.url).pathname })].sort();
  expect(files).toEqual(['s13-gitfall.ts', 's14-shaft.ts']);
});
