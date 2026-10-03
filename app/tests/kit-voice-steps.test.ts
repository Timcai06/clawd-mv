// G4: a long note steps its stretch on the beat instead of creeping.
import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON), v = new Voice(lyrics, audio);
const words = lyrics.lines.flatMap((l) => l.words);

describe('Voice.stepped (G4)', () => {
  test('short notes keep the smooth stretch', () => {
    const short = words.find((w) => w.end - w.start < 0.3)!;
    expect(v.stepped(short, short.start + 0.1)).toBeNull();
  });
  test('long notes step: monotonic, flat between beats, full at the end', () => {
    const long = words.filter((w) => v.stepped(w, w.start) !== null);
    expect(long.length).toBeGreaterThan(5);
    for (const w of long) {
      let last = -1;
      for (let t = w.start; t <= w.end + 0.2; t += 1 / 120) {
        const p = v.stepped(w, t)!;
        expect(p).toBeGreaterThanOrEqual(last - 1e-9); last = p;
      }
      expect(v.stepped(w, w.end + 0.2)).toBeCloseTo(1, 6);
      // a held plateau: 0.1 s after a beat boundary the level does not move until the next one
      const b = Math.floor(audio.beatAt(w.start)) + 1, at = audio.timeOfBeat(b);
      if (at + 0.2 < w.end && audio.timeOfBeat(b + 1) > at + 0.2) expect(v.stepped(w, at + 0.1)).toBeCloseTo(v.stepped(w, at + 0.19)!, 3);
    }
  });
});
