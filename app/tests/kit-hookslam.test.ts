import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { currentWord, pickupHits, slamScale, strobe } from '../src/kit/hookslam';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const first = lyrics.find('I need one more commit')[0]!, last = lyrics.get('I need one last commit');

describe('kit/hookslam: the chorus pickup', () => {
  test('one word at a time, each from its own onset; COM until the hit', () => {
    const ws = first.words, commit = ws.at(-1)!, hit = commit.start + 0.4;
    expect(currentWord(first, ws[0]!.start - 0.01, hit)).toBeNull();
    for (let i = 0; i < ws.length - 1; i++) {
      expect(currentWord(first, ws[i]!.start + 0.001, hit)!.i).toBe(i);
      expect(currentWord(first, ws[i]!.start - 0.001, hit)?.i ?? -1).toBeLessThan(i);
    }
    expect(currentWord(first, commit.start + 0.01, hit)!.text).toBe('COM');
    expect(currentWord(first, hit, hit)).toBeNull();
    expect(currentWord(first, commit.start)).toBeNull(); // default: stop at commit
  });
  test('levels escalate: shake grows, level 3 re-slams held words on the beat', () => {
    const shakes = ([1, 2, 3] as const).map((l) => pickupHits(l, audio, first)[0]!.shake!);
    expect(shakes[0]!).toBeLessThan(shakes[1]!); expect(shakes[1]!).toBeLessThan(shakes[2]!);
    expect(pickupHits(3, audio, last).length).toBeGreaterThan(pickupHits(1, audio, last).length);
    expect(pickupHits(3, audio, last).some((h) => h.swap)).toBe(false); // level 3 strobes instead
    const w = last.words[2]!, t = w.start + 0.05;
    expect(slamScale(3, audio, t, w.start)).toBeGreaterThan(slamScale(1, audio, t, w.start));
  });
  test('level 3 strobes the ground on the 8ths only during the pickup', () => {
    const t = last.words[2]!.start + 0.01, b = audio.beatAt(t);
    const seen = new Set([0, 0.5, 1, 1.5].map((d) => strobe(3, last, t, b + d, 'clay')));
    expect(seen.size).toBe(3);
    expect(strobe(3, last, last.words.at(-1)!.end + 1, b, 'clay')).toBe('clay');
    expect(strobe(2, last, t, b, 'clay')).toBe('clay');
  });
});
