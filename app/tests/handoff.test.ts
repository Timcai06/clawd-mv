// Stage 9 ① (docs/CUTS.md): every cut hands over one screen-space primitive. The outgoing scene's
// exitPrim on its last exported frame and the incoming scene's entryPrim on its first frame must
// agree within 2 px and 2 % (R3); the outgoing primitive also holds still for the last 0.1 s (R4).
import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { primError, type Prim } from '../src/kit/handoff';
import { openingTimes, exitPrim01 } from '../src/scenes/parts/s01-timing';
import { entryPrim02, exitPrim02 } from '../src/scenes/parts/s02-layout';
import { entryPrim03, exitPrim03 } from '../src/scenes/parts/s03-form';
import { cityTimes, entryPrim04, exitPrim04 } from '../src/scenes/parts/s04-city-model';
import { platformTimes, entryPrim05, exitPrim05 } from '../src/scenes/parts/s05-platform-model';
import { resolveCTimes, entryPrim06, exitPrim06 } from '../src/scenes/parts/s06-timing';
import { entryPrim07, exitPrim07 } from '../src/scenes/parts/s07-terrain';
import { commitScore, entryPrim08 } from '../src/scenes/parts/s08-layout';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const T = openingTimes(audio, lyrics), C = cityTimes(audio, lyrics), P = platformTimes(audio, lyrics);
const K = resolveCTimes(audio, lyrics), M = commitScore(audio, lyrics);
const nudges = lyrics.lines[0]!.words.slice(4);
const weirdest = lyrics.lines[1]!.words.find((w) => /weirdest/i.test(w.w))!.start;
const FRAME = 1 / 60;

interface Cut { id: string; at: number; out: (t: number) => Prim; in: (t: number) => Prim }
const CUTS: Cut[] = [
  { id: 'C1 S01→S02 cursor', at: T.ping, out: (t) => exitPrim01(t, audio, T), in: (t) => entryPrim02(t, audio, T, nudges) },
  { id: 'C2 S02→S03 card bar', at: T.issue, out: (t) => exitPrim02(t, audio, T, nudges), in: (t) => entryPrim03(t, audio, T, weirdest) },
  { id: 'C3 S03→S04 month', at: C.start, out: (t) => exitPrim03(t, T, weirdest), in: () => entryPrim04() },
  { id: 'C4 S04→S05 Clawd', at: P.start, out: (t) => exitPrim04(audio, t, C), in: (t) => entryPrim05(audio, lyrics, t, P) },
  { id: 'C5 S05→S06 strike', at: K.todo, out: (t) => exitPrim05(audio, lyrics, t, P), in: (t) => entryPrim06(audio, t, K) },
  { id: 'C6 S06→S07 pen/key', at: K.keyboard, out: (t) => exitPrim06(audio, t, K), in: (t) => entryPrim07(t, audio, K) },
  { id: 'C7 S07→S08 cursor', at: M.start, out: (t) => exitPrim07(t, audio, K), in: (t) => entryPrim08(t, audio, M) },
];

describe('hand-off primitives (docs/CUTS.md, R3/R4)', () => {
  test('the cuts are the scenes\' real boundaries', () => {
    expect(C.end).toBe(P.start); expect(P.end).toBe(K.todo); expect(K.end).toBe(M.start);
    expect(T.end).toBe(C.start);
  });
  for (const cut of CUTS) test(`${cut.id}: last frame before = first frame after (≤ 2 px, ≤ 2 %)`, () => {
    const a = cut.out(cut.at - FRAME), b = cut.in(cut.at);
    const e = primError(a, b);
    console.log(`${cut.id}: ${e.px.toFixed(3)} px, ${(e.size * 100).toFixed(2)} %`);
    expect(e.px).toBeLessThanOrEqual(2);
    expect(e.size).toBeLessThanOrEqual(0.02);
  });
  for (const cut of CUTS.slice(1)) test(`${cut.id}: the outgoing primitive holds for the last 0.1 s`, () => {
    const e = primError(cut.out(cut.at - 0.1 + 1e-4), cut.out(cut.at - FRAME));
    expect(e.px).toBeLessThanOrEqual(0.5);
  });
});
