import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { afterBeats } from '../src/kit/time';
import { chorusScore, chorusState, commitId, sceneScore } from '../src/scenes/parts/s13-score';
import { divePosition, diveScore, diveState } from '../src/scenes/parts/s14-score';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const C = chorusScore(audio, lyrics), D = diveScore(audio, lyrics);
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
    expect([D.start, D.down, D.quiet, D.frames, D.near]).toEqual(shots.map((s) => s.start));
    expect(D.end).toBe(shots.at(-1)!.end);
  });

  test('changing lyric syllables retimes the impacts and changing near retimes the stop', () => {
    const json = structuredClone(lyricsJSON);
    for (const line of json.lines) for (const w of line.words) {
      if (w.syl) for (const syl of w.syl) { syl[0] += 0.08; syl[1] += 0.08; }
      if (/near/.test(w.w)) { w.start += 0.7; w.end += 0.7; }
    }
    const changed = new Lyrics(json), CC = chorusScore(audio, changed), DD = diveScore(audio, changed);
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
  test('holds before Down, descends monotonically, and stops exactly on near', () => {
    expect(divePosition(D.down - epsilon, D)).toBe(0);
    let last = 0;
    for (let t = D.down; t <= D.near; t += 1 / 120) {
      const pos = divePosition(t, D);
      expect(pos).toBeGreaterThanOrEqual(last - epsilon); last = pos;
    }
    const stop = diveState(audio, D.near, D);
    expect(stop.stopped).toBe(true);
    expect(stop.velocity).toBe(0);
    expect(divePosition(D.end, D)).toBe(stop.pos);
    expect(divePosition(D.near - epsilon, D)).toBeLessThan(stop.pos);
  });

  test('near removes travel but preserves the marker reveal and breathing', () => {
    const a = diveState(audio, D.near, D), b = diveState(audio, D.end, D);
    expect(b.pos).toBe(a.pos);
    expect(a.reveal).toBe(0); expect(b.reveal).toBe(1);
    expect(a.breath).not.toBe(b.breath);
  });

  test('nominal BPM and arbitrary call order cannot alter either scene', () => {
    const slow = new AudioData({ ...audioJSON, bpm: 40 }), fast = new AudioData({ ...audioJSON, bpm: 240 });
    for (const t of [D.near, C.hit1, D.quiet, C.pickup2, C.hit2, D.down]) {
      expect(chorusState(slow, t, C)).toEqual(chorusState(fast, t, C));
      expect(diveState(slow, t, D)).toEqual(diveState(fast, t, D));
      const a = diveState(audio, t, D); diveState(audio, D.end, D); diveState(audio, D.start, D);
      expect(diveState(audio, t, D)).toEqual(a);
    }
  });
});

test('one main module per scene keeps automatic timeline discovery unambiguous', () => {
  const files = [...new Bun.Glob('s1[34]-*.ts').scanSync({ cwd: new URL('../src/scenes/', import.meta.url).pathname })].sort();
  expect(files).toEqual(['s13-gitfall.ts', 's14-shaft.ts']);
});
