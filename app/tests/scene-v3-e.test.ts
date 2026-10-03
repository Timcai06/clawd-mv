import { describe, expect, test } from 'bun:test';
import * as opentype from 'opentype.js';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import { HANDOFF } from '../src/kit/handoff';
import { afterBeats } from '../src/kit/time';
import * as Clawd from '../src/kit/clawd';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import { TYPE_LEVELS as S14_LEVELS } from '../src/scenes/s14-shaft';
import { TYPE_LEVELS as S15_LEVELS } from '../src/scenes/s15-line42';
import { stackPhase, stackPos, stackScore } from '../src/scenes/parts/s14-stack';
import { handoffOut as shaftOut } from '../src/scenes/s14-shaft';
import type { Box } from '../src/scenes/parts/s15-bounds';
import { handoffIn as monumentIn, handoffOut as monumentOut, heroState, monumentBounds,
  monumentState, freeState, LYRIC_SIZE as MONUMENT_SIZE } from '../src/scenes/parts/s15-layout';
import { resolveFTimes } from '../src/scenes/parts/s15-f-timing';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import board from '../../storyboard/shots.json';
import keyframes from '../../storyboard/keyframes.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON), voice = new Voice(lyrics, audio);
const D = stackScore(audio, lyrics), T = resolveFTimes({ audio, lyrics });
const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
const at = (scene: string) => {
  const id = keyframes.frames.find(f => f.id === scene)!.shot;
  const shot = shots.find(s => s.id === id)!;
  return shot.start + shot.duration * 0.6; // compare.ts's editorial sampling point
};

// Measurements on the ORIGINAL images, not renders. Raster origin is upper left.
// S14: 1672×941. Trace the nearest floating frame's four OUTER corners (423,76),
// (1315,241), (1267,510), (321,280): nearest-frame envelope x321..1315,y76..510.
// The WHOLE shaft continues from that mouth to the raster's bottom: y76..941.
// Trace all orange Clawd pixels, EXCLUDING its plumb cursor: x783..919,y281..362.
// S15: 1672×940. Trace the clipped sculpture silhouette (includes both equal-bar
// halves, excludes chips / ground hatch): x431..1672,y0..768. Trace Clawd INCLUDING
// its extended right arm, excluding chips: x708..875,y542..590.
// Convert x,w by 1920/rasterWidth and y,h by 1080/rasterHeight, independently.
const measured = (x: number, y: number, w: number, h: number, sourceH: number): Box =>
  ({ x: x * 1920 / 1672, y: y * 1080 / sourceH, w: w * 1920 / 1672, h: h * 1080 / sourceH });
const TARGETS = {
  S14: { subject: measured(321, 76, 994, 865, 941), mouth: measured(321, 76, 994, 434, 941), hero: measured(783, 281, 136, 81, 941) },
  S15: { subject: measured(431, 0, 1241, 768, 940), hero: measured(708, 542, 167, 48, 940) },
};

function error(actual: Box, target: Box) {
  return { centre: Math.hypot(actual.x + actual.w / 2 - target.x - target.w / 2,
    actual.y + actual.h / 2 - target.y - target.h / 2),
    width: Math.abs(actual.w / target.w - 1), height: Math.abs(actual.h / target.h - 1) };
}
function composition(name: string, actual: Box, target: Box) {
  const e = error(actual, target);
  expect(e.centre).toBeLessThanOrEqual(96);
  expect(e.width).toBeLessThanOrEqual(0.15); expect(e.height).toBeLessThanOrEqual(0.15);
  console.log(`${name}: actual=${JSON.stringify(actual)} centre=${e.centre.toFixed(3)}px width=${(100 * e.width).toFixed(3)}% height=${(100 * e.height).toFixed(3)}%`);
}

describe('E v3 measured storyboard composition', () => {
  test('S15 solid silhouette and actual extended-arm sprite at S15-5 + 60%', () => {
    const t = at('S15');
    composition('S15 sculpture', monumentBounds(audio, t, T), TARGETS.S15.subject);
    composition('S15 Clawd', heroState(audio, t, T).box, TARGETS.S15.hero);
    expect(monumentState(audio, t, T).paper).toBe(false);
    expect(monumentState(audio, t, T).fracture).toBe(1);
    expect(monumentState(audio, t, T).removal).toBe(0);
  });
});

describe('E v3 handoffs are drawn from the shared constants', () => {
  test('S14 final frame endpoints and S15 first frame rule match line14 within 2px', () => {
    const a = shaftOut(), b = monumentIn(T.s15[0]!, audio, T);
    const outError = Math.max(Math.abs(a.x0 - HANDOFF.line14.x0), Math.abs(a.x1 - HANDOFF.line14.x1), Math.abs(a.y - HANDOFF.line14.y));
    expect(outError).toBeLessThanOrEqual(2);
    for (const key of ['x0', 'x1', 'y'] as const) expect(b[key]).toBe(HANDOFF.line14[key]);
    expect(b.clay).toBe(1);
    console.log(`line14: outgoing ${outError.toFixed(3)}px; incoming 0px`);
  });
  test('S15 final frame rigid-piece bounds match domino15 within 2px', () => {
    const a = monumentOut(T.s16[0]! - 1 / 60, audio, T);
    const errors = (['x', 'y', 'w', 'h'] as const).map(k => Math.abs(a[k] - HANDOFF.domino15[k]));
    expect(Math.max(...errors)).toBeLessThanOrEqual(2);
    expect(a.visible).toBe(true);
    expect(monumentOut(afterBeats(audio, T.s16[0]!, -1) - 0.001, audio, T).visible).toBe(false);
    console.log(`domino15: max bound error ${Math.max(...errors).toFixed(3)}px`);
  });
});

describe('E v3 typography, word timing, seek determinism', () => {
  test('three levels use the real Archivo cap-height and 20px Mono label size', async () => {
    const face = opentype.parse(await Bun.file(new URL('../public/fonts/Archivo-w1000-700.ttf', import.meta.url)).arrayBuffer());
    const ratio = (face.tables as any).os2.sCapHeight / face.unitsPerEm;
    for (const [levels, size] of [[S15_LEVELS, MONUMENT_SIZE]] as const) {
      expect(levels.lyric).toBeCloseTo(size * ratio, 4);
      expect(levels.lyric).toBeGreaterThanOrEqual(50); expect(levels.lyric).toBeLessThanOrEqual(110);
      expect(levels.label).toBeGreaterThanOrEqual(14); expect(levels.label).toBeLessThanOrEqual(22);
      expect(levels.lyric / levels.label).toBeGreaterThanOrEqual(2.5);
      // Both scenes have an object as the dominant element, hence no separate giant text tier.
      expect(levels.giant).toBeNull();
    }
  });
  test('S14 levels: lyric and label inside the hierarchy ranges', () => {
    expect(S14_LEVELS.lyric).toBeGreaterThanOrEqual(50); expect(S14_LEVELS.lyric).toBeLessThanOrEqual(110);
    expect(S14_LEVELS.label).toBeGreaterThanOrEqual(14); expect(S14_LEVELS.label).toBeLessThanOrEqual(22);
  });
  test('all owned and crossing words are unborn 10ms before their aligned onset', () => {
    const owned = lyrics.linesIn(D.start, T.s16[0]!);
    const words = owned.flatMap(l => l.words);
    expect(words.length).toBeGreaterThan(40);
    for (const word of words) expect(voice.form(word, word.start - 0.01).born).toBe(0);
    const carried = lyrics.get('But it works on my machine').words.at(-1)!;
    expect(carried.start).toBeLessThan(D.start); expect(carried.end).toBeGreaterThan(D.start);
    expect(voice.form(carried, D.start).born).toBeGreaterThan(0);
    // R1 (docs/CUTS.md): the S16 cut sits on the beat before "One", so the whole line belongs to S16.
    const one = lyrics.get('One goes green').words[0]!;
    expect(one.start).toBeGreaterThanOrEqual(T.s16[0]! - 0.05);
    expect(voice.form(one, T.s16[0]! - 0.06).born).toBe(0);
  });
  test('near stops on the exact voice onset, counter and escape follow their words', () => {
    const near = lyrics.get('Frame by frame').words.at(-1)!;
    expect(D.near).toBe(near.start);
    expect(stackPhase(near.start - 0.01, D).id).not.toBe('stop');
    expect(stackPhase(near.start, D).id).toBe('stop');
    expect(stackPos(D.end, D)).toBe(stackPos(near.start, D));
    expect(T.fortyTwo).toBe(lyrics.get('There it is').words.at(-1)!.start);
    expect(T.snip).toBe(lyrics.get('Snip the extra').words[0]!.start);
    expect(freeState(audio, T.free - 0.01, T).x).toBe(1300);
    expect(freeState(audio, afterBeats(audio, T.free, 0.75), T).x).toBeGreaterThan(1798);
  });
  test('state, layout, and handoffs survive repeated calls and reverse seeks', () => {
    const state = (t: number) => ({ shaft: stackPos(t, D), shape: monumentState(audio, t, T),
      hero: heroState(audio, t, T),
      rule: monumentIn(t, audio, T), piece: monumentOut(t, audio, T), free: freeState(audio, t, T) });
    for (const t of [at('S14'), D.near, at('S15'), T.snip, T.free, T.s16[0]! - 1 / 60]) {
      const a = state(t); expect(state(t)).toEqual(a);
      state(T.s16[0]!); state(D.start); expect(state(t)).toEqual(a);
    }
  });
});
