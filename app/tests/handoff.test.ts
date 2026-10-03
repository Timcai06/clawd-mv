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
import { commitScore, entryPrim08, handoffOut as out08 } from '../src/scenes/parts/s08-layout';
import { resolveX9Times } from '../src/scenes/s09-z-shared';
import { handoffIn as in09, handoffOut as out09 } from '../src/scenes/parts/s09-scope';
import { baseScreen } from '../src/scenes/parts/s09-world';
import { handoffIn as in10 } from '../src/scenes/parts/s10-glass';
import { handoffOut as out11 } from '../src/scenes/parts/s11-layout';
import { handoffIn as in12, handoffOut as out12 } from '../src/scenes/parts/s12-layout';
import { chorusScore } from '../src/scenes/parts/s13-score';
import { entryPrim13, exitPrim13 } from '../src/scenes/parts/s13-layout';
import { stackScore } from '../src/scenes/parts/s14-stack';
import { shaftCursorRect } from '../src/scenes/parts/s14-camera';
import { handoffOut as out14 } from '../src/scenes/s14-shaft';
import { handoffIn as in15, handoffOut as out15 } from '../src/scenes/parts/s15-layout';
import { greenTimes, handoffIn as in16, handoffOut as out16 } from '../src/scenes/parts/s16-green-state';
import { resolveReleaseTimes } from '../src/scenes/parts/s17-release-state';
import { handoffIn as in17, handoffOut as out17 } from '../src/scenes/parts/s17-release-layout';
import { resolveOutroTimes, handoffIn as in18 } from '../src/scenes/parts/s18-score';
import { resolveFTimes } from '../src/scenes/parts/s15-f-timing';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const T = openingTimes(audio, lyrics), C = cityTimes(audio, lyrics), P = platformTimes(audio, lyrics);
const K = resolveCTimes(audio, lyrics), M = commitScore(audio, lyrics);
const X = resolveX9Times({ audio, lyrics } as never), R = chorusScore(audio, lyrics), S = stackScore(audio, lyrics), F15 = resolveFTimes({ audio, lyrics });
const G = greenTimes(audio, lyrics), Rl = resolveReleaseTimes(audio, lyrics), O = resolveOutroTimes(audio, lyrics);
const line = (l: { x0: number; x1: number; y: number }, w = 2): Prim => ({ kind: 'line', x0: l.x0, y0: l.y, x1: l.x1, y1: l.y, w });
const nineteen = (n: { x: number; baseline: number; capH: number }): Prim => ({ kind: 'rect', x: n.x, y: n.baseline - n.capH, w: n.capH, h: n.capH });
const boxes = (b: { cx: number; cy: number; w: number }): Prim => ({ kind: 'rect', x: b.cx - b.w / 2, y: b.cy, w: b.w, h: b.w / 9 });
const nudges = lyrics.lines[0]!.words.slice(4);
const weirdest = lyrics.lines[1]!.words.find((w) => /weirdest/i.test(w.w))!.start;
const FRAME = 1 / 60;

interface Cut { id: string; at: number; out: (t: number) => Prim; in: (t: number) => Prim }
const CUTS: Cut[] = [
  { id: 'C1 S01→S02 cursor', at: T.ping, out: (t) => exitPrim01(t, audio, T), in: (t) => entryPrim02(t, audio, T, nudges) },
  { id: 'C2 S02→S03 card bar', at: T.issue, out: (t) => exitPrim02(t, audio, T, nudges), in: (t) => entryPrim03(t, audio, T, weirdest) },
  { id: 'C3 S03→S04 month', at: C.start, out: (t) => exitPrim03(t, T, weirdest, audio), in: () => entryPrim04() },
  { id: 'C4 S04→S05 Clawd', at: P.start, out: (t) => exitPrim04(audio, t, C), in: (t) => entryPrim05(audio, lyrics, t, P) },
  { id: 'C5 S05→S06 strike', at: K.todo, out: (t) => exitPrim05(audio, lyrics, t, P), in: (t) => entryPrim06(audio, t, K) },
  { id: 'C6 S06→S07 pen/key', at: K.keyboard, out: (t) => exitPrim06(audio, t, K), in: (t) => entryPrim07(t, audio, K) },
  { id: 'C7 S07→S08 cursor', at: M.start, out: (t) => exitPrim07(t, audio, K), in: (t) => entryPrim08(t, audio, M) },
  { id: 'C8 S08→S09 baseline', at: X.terminal, out: (t) => line(out08(t, audio, M)),
    in: (t) => { const b = baseScreen(audio, t, X, in09(t, audio, X)); return { kind: 'line', ...b, w: 2 }; } },
  { id: 'C9 S09→S10 19', at: X.wallStart, out: (t) => nineteen(out09(t, audio, X)), in: (t) => nineteen(in10(t, audio, X)) },
  { id: 'C11 S11→S12 boxes', at: X.rerunStart, out: (t) => boxes(out11(t, audio, X)), in: (t) => boxes(in12(t, audio, X)) },
  { id: 'C12 S12→S13 clay 11', at: R.start, out: (t) => ({ kind: 'rect', ...out12(t, audio, X) }), in: (t) => entryPrim13(t, audio, R) },
  { id: 'C13 S13→S14 cursor', at: S.start, out: (t) => exitPrim13(t, audio, lyrics, R), in: (t) => ({ kind: 'rect', ...shaftCursorRect(S, t) }) },
  { id: 'C14 S14→S15 line', at: F15.s15[0]!, out: () => line(out14()), in: (t) => line(in15(t, audio, F15)) },
  { id: 'C15 S15→S16 domino', at: G.start, out: (t) => { const r = out15(t, audio, F15); return { kind: 'rect', x: r.x, y: r.y, w: r.w, h: r.h }; },
    in: (t) => ({ kind: 'rect', ...in16(t, audio, G) }) },
  { id: 'C16 S16→S17 face', at: Rl.release[0]!.start, out: (t) => ({ kind: 'rect', ...out16(t, audio, G) }), in: (t) => ({ kind: 'rect', ...in17(t, audio, Rl) }) },
  { id: 'C17 S17→S18 nodes', at: O.start, out: (t) => ({ kind: 'points', pts: out17(t, audio, Rl) }), in: (t) => ({ kind: 'points', pts: in18(t, audio, O) }) },
];

describe('hand-off primitives (docs/CUTS.md, R3/R4)', () => {
  test('the cuts are the scenes\' real boundaries', () => {
    expect(C.end).toBe(P.start); expect(P.end).toBe(K.todo); expect(K.end).toBe(M.start);
    expect(T.end).toBe(C.start);
    expect(M.end).toBe(X.terminal); expect(X.terminalEnd).toBe(X.wallStart); expect(X.rainEnd).toBe(X.rerunStart);
    expect(X.end).toBe(R.start); expect(R.end).toBe(S.start); expect(S.end).toBe(F15.s15[0]!);
    expect(F15.s16[0]!).toBe(G.start); expect(G.end).toBe(Rl.release[0]!.start); expect(O.start).toBeGreaterThan(G.end);
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

import { stutterTime } from '../src/scenes/parts/s12-layout';
describe('S12 "again" stutter', () => {
  test('identity outside the word, continuous at both ends, three passes from the onset', () => {
    const s = 10, e = 11;
    expect(stutterTime(9.9, s, e)).toBe(9.9); expect(stutterTime(11.2, s, e)).toBe(11.2);
    expect(stutterTime(s + 1e-6, s, e)).toBeCloseTo(s, 4); expect(stutterTime(e - 1e-6, s, e)).toBeCloseTo(e, 4);
    // each pass restarts at the onset
    expect(stutterTime(s + 0.45 + 1e-6, s, e)).toBeCloseTo(s, 4);
    expect(stutterTime(s + 0.78 + 1e-6, s, e)).toBeCloseTo(s, 4);
  });
});
