import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { varRun } from '../src/kit/vartype';
import { deepParticle } from '../src/scenes/parts/s11-deep';
import { loadFonts } from '../src/engine/type';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice, setLine, wrap } from '../src/kit/lyric-moves';
import { afterBeats } from '../src/kit/time';
import { HANDOFF, type Rect } from '../src/kit/handoff';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import { resolveX9Times } from '../src/scenes/s09-z-shared';
import { TYPE_LEVELS as L09 } from '../src/scenes/s09-terminal';
import { TYPE_LEVELS as L10 } from '../src/scenes/s10-redwall';
import { TYPE_LEVELS as L11 } from '../src/scenes/s11-rain';
import { TYPE_LEVELS as L12 } from '../src/scenes/s12-rerun';
import { handoffBoxes, union } from '../src/scenes/parts/s09-type';
import * as scope from '../src/scenes/parts/s09-scope';
import * as glass from '../src/scenes/parts/s10-glass';
import * as rain from '../src/scenes/parts/s11-layout';
import * as count from '../src/scenes/parts/s12-layout';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import boardJSON from '../../storyboard/shots.json';

// Load the real production font bytes; stub only browser registration, never outline metrics.
const saved = { fetch: globalThis.fetch, document: (globalThis as any).document, FontFace: (globalThis as any).FontFace };
try {
  globalThis.fetch = (async (url: string) => new Response(await Bun.file(new URL(`../public/${url}`, import.meta.url)).arrayBuffer())) as any;
  (globalThis as any).FontFace = class { async load() { return this; } };
  (globalThis as any).document = { fonts: { add() {}, ready: Promise.resolve() } };
  await loadFonts();
} finally { Object.assign(globalThis, saved); }
const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON), voice = new Voice(lyrics, audio);
const T = resolveX9Times({ audio, lyrics });
const shots = resolveStoryboard(boardJSON as Storyboard, lyrics, audio).shots;
const at = (id: string) => { const s = shots.find(s => s.id === id)!; return s.start + s.duration * 0.6; };
// Measured from the ORIGINAL 1672×941 PNGs, outermost visible silhouette, ignoring speckle dust.
// x,y,w,h below are image pixels, independently scaled to logical 1920×1080.
// S09: waveform+baseline+echo envelope (14,320)-(1658,610); Clawd (93,727)-(303,815).
// S10: nineteen standing plates including side thickness (67,224)-(1622,775); body (530,799)-(714,871).
// S11: cropped undefined silhouette (135,30)-(1672,590); Clawd (763,821)-(910,881).
// S12: cropped numeric-row union (0,562)-(1672,941); Clawd (1271,693)-(1407,747).
// Canonical Clawd stays 16×5: reference-generated anatomy differs slightly, accounted for by the 15% allowance.
const imageBox = (x: number, y: number, w: number, h: number): Rect => ({ x: x * 1920 / 1672, y: y * 1080 / 941, w: w * 1920 / 1672, h: h * 1080 / 941 });
export const TARGETS = {
  S09: { main: imageBox(14, 320, 1644, 290), clawd: imageBox(93, 727, 210, 88) },
  S10: { main: imageBox(67, 224, 1555, 551), clawd: imageBox(530, 799, 184, 72) },
  S11: { main: imageBox(135, 30, 1537, 560), clawd: imageBox(763, 821, 147, 60) },
  S12: { main: imageBox(0, 562, 1672, 379), clawd: imageBox(1271, 693, 136, 54) },
};
export function boxError(a: Rect, b: Rect) {
  return { center: Math.hypot(a.x + a.w / 2 - b.x - b.w / 2, a.y + a.h / 2 - b.y - b.h / 2),
    width: Math.abs(a.w / b.w - 1) * 100, height: Math.abs(a.h / b.h - 1) * 100 };
}
const actual = {
  S09: scope.scopeState(audio, at('S09-2'), T), S10: glass.glassState(audio, at('S10-2'), T),
  S11: rain.headlineState(voice, at('S11-3'), T), S12: count.countState(voice, at('S12-5'), T),
};
describe('D v3 composition from production geometry / outlines', () => {
  for (const scene of ['S09', 'S10', 'S11', 'S12'] as const) {
    test(`${scene}: main and Clawd center ≤96px, dimensions ≤15%`, () => {
      for (const [a, b] of [[actual[scene].dominant!, TARGETS[scene].main], [actual[scene].clawdBox, TARGETS[scene].clawd]]) {
        const error = boxError(a, b);
        expect(error.center).toBeLessThanOrEqual(96); expect(error.width).toBeLessThanOrEqual(15); expect(error.height).toBeLessThanOrEqual(15);
      }
      expect(actual[scene].dominant!.w * actual[scene].dominant!.h / (1920 * 1080)).toBeGreaterThanOrEqual(0.30);
    });
  }
});
const match = (actual: Record<string, number>, target: Record<string, number>) => {
  for (const [k, n] of Object.entries(target)) expect(Math.abs(actual[k]! - n)).toBeLessThanOrEqual(2);
};
describe('D v3 cut positions (last output frame and first input frame)', () => {
  test('S08→S09 baseline / S09→S10 counter', () => {
    match(scope.handoffIn(T.terminal, audio, T), HANDOFF.base08);
    match(scope.handoffOut(T.terminalEnd - 1 / 60, audio, T), HANDOFF.nineteen09);
    match(glass.handoffIn(T.wallStart, audio, T), HANDOFF.nineteen09);
  });
  test('S10→S11 direction and screen velocity', () => {
    match(glass.handoffOut(T.wallEnd - 1 / 60, audio, T), HANDOFF.fall10);
    match(rain.handoffIn(T.rainStart, audio, T), HANDOFF.fall10);
    const a = afterBeats(audio, T.wallEnd, -0.001), b = T.wallEnd;
    expect((glass.fallTravel(b, audio, T) - glass.fallTravel(a, audio, T)) / 0.001).toBeCloseTo(220, 3);
  });
  test('the actual incoming particle projection falls along the shared vector at 220px/beat', () => {
    const view = rain.rainView(T.rainStart, audio, T);
    const camera = new THREE.PerspectiveCamera(52, 1920 / 1080, 0.1, 200);
    camera.position.set(0, 0, view.z); camera.up.set(Math.sin(view.roll), Math.cos(view.roll), 0);
    camera.lookAt(0, 0, -20); camera.updateMatrixWorld();
    const project = (d: number) => { const p = deepParticle(37, d); return new THREE.Vector3(p.x, p.y, p.z).project(camera); };
    const a = project(0), b = project(0.22);
    expect((b.x - a.x) * 960 / 0.001).toBeCloseTo(Math.sin(HANDOFF.fall10.roll) * 220, 3);
    expect(-(b.y - a.y) * 540 / 0.001).toBeCloseTo(Math.cos(HANDOFF.fall10.roll) * 220, 3);
    expect(rain.rainView(afterBeats(audio, T.rainStart, 0.5), audio, T).z).toBe(view.z);
  });
  test('S11→S12 nine boxes / S12→S13 clay 11', () => {
    match(rain.handoffOut(T.rainEnd - 1 / 60, audio, T), HANDOFF.boxes11);
    match(count.handoffIn(T.rerunStart, audio, T), HANDOFF.boxes11);
    const boxes = handoffBoxes(rain.handoffOut(T.rainEnd - 1 / 60, audio, T));
    const outer = union(boxes.flatMap(b => [[b.x, b.y], [b.x + b.w, b.y + b.h]] as [number, number][]));
    match({ cx: outer.x + outer.w / 2, cy: outer.y + outer.h / 2, w: outer.w, n: boxes.length }, HANDOFF.boxes11);
    match(count.handoffOut(T.end - 1 / 60, audio, T), HANDOFF.eleven12);
    match(count.countState(voice, T.end - 1 / 60, T).digits[10]!.box, HANDOFF.eleven12);
  });
  test('handoffs finish within the final beat and leave keyframe composition untouched', () => {
    expect(rain.handoffOut(afterBeats(audio, T.rainEnd, -1.01), audio, T)).toEqual(rain.handoffOut(T.rainStart, audio, T));
    expect(scope.handoffIn(afterBeats(audio, T.terminal, 1), audio, T).y).toBe(scope.SCOPE.y);
    expect(count.handoffIn(afterBeats(audio, T.rerunStart, 1), audio, T).w).toBe(1760);
  });
});

describe('D v3 type / vocal onsets / crossing lines / determinism', () => {
  test('declared cap heights: lyrics 50–110, labels 14–22, giants ≥200 and ≥2.5×lyrics', () => {
    for (const L of [L09, L10, L11, L12]) {
      expect(L.lyric).toBeGreaterThanOrEqual(50); expect(L.lyric).toBeLessThanOrEqual(110);
      expect(L.label).toBeGreaterThanOrEqual(14); expect(L.label).toBeLessThanOrEqual(22);
      expect(L.lyric).toBe(varRun('H', 96, { wdth: 100, wght: 700 }).capH);
      expect(L.lyric / L.label).toBeGreaterThanOrEqual(2.5);
      if (L.giant !== null) { expect(L.giant).toBeGreaterThanOrEqual(200); expect(L.giant / L.lyric).toBeGreaterThanOrEqual(2.5); }
    }
    // Reference exception: S09/S10's 140px measurement readout is specified by nineteen09;
    // those scenes have physical/instrument protagonists rather than giant lyric typography.
    expect(HANDOFF.nineteen09.capH).toBe(140);
  });
  test('EVERY word intersecting these scenes is unborn before its own aligned onset', () => {
    for (const line of lyrics.linesIn(T.terminal, T.end)) for (const word of line.words)
      expect(voice.form(word, word.start - 0.01).born).toBe(0);
  });
  test('words already sung on both sides of every cut remain available, no scene-local clock', () => {
    for (const cut of [T.terminal, T.wallStart, T.rainStart, T.rerunStart]) {
      const line = lyrics.lines.find(l => l.start < cut && l.end > cut)!;
      expect(line).toBeDefined();
      const sung = voice.forms(line, cut).filter(f => f.born > 0);
      expect(sung.length).toBeGreaterThan(0);
      const nextVoice = new Voice(lyrics, audio);
      for (const f of voice.forms(line, cut - 1 / 60).filter(f => f.born > 0))
        expect(nextVoice.form(f.word, cut).born).toBeGreaterThanOrEqual(f.born);
    }
  });
  test('cross-cut lyric rows fit the 96px horizontal safe area at their real font size', () => {
    for (const cut of [T.terminal, T.wallStart, T.rainStart, T.rerunStart]) {
      const line = lyrics.lines.find(l => l.start < cut && l.end > cut)!;
      for (const set of wrap(voice.forms(line, cut), 96, 1728)) expect(set.width).toBeLessThanOrEqual(1728);
    }
  });
  test('count ten never appears before ten; eleven is clay and all eleven persist', () => {
    expect(count.countState(voice, T.ten - 0.01, T).number).toBeLessThan(10);
    const all = count.countState(voice, at('S12-5'), T);
    expect(all.digits.length).toBe(11); expect(all.digits[10]!.color).toBe('clay');
    expect(count.COPIES.length).toBe(6);
  });
  test('same t, repeated and after seeking elsewhere, produces identical real layouts', () => {
    const states = [
      (t: number) => scope.scopeState(audio, t, T), (t: number) => glass.glassState(audio, t, T),
      (t: number) => rain.headlineState(voice, t, T), (t: number) => count.countState(voice, t, T),
    ];
    states.forEach((state, i) => {
      const t = [at('S09-2'), at('S10-2'), at('S11-3'), at('S12-5')][i]!, initial = state(t);
      expect(state(t)).toEqual(initial); state(T.end); state(T.terminal); expect(state(t)).toEqual(initial);
    });
  });
});
if (process.env.D_REPORT) for (const scene of ['S09', 'S10', 'S11', 'S12'] as const)
  console.log(scene, JSON.stringify({ actual: { main: actual[scene].dominant, clawd: actual[scene].clawdBox },
    errors: { main: boxError(actual[scene].dominant!, TARGETS[scene].main), clawd: boxError(actual[scene].clawdBox, TARGETS[scene].clawd) } }));

if (process.env.D_REPORT) console.log('TYPE', { lyric: varRun('H', 96, {wdth: 100, wght: 700}).capH, giant: actual.S11.run.capH * actual.S11.sy,
  previousLineWidth: setLine(voice.forms(voice.line("So I run the tests, I’m waiting for a pass"), T.wallStart), 96).width,
  passAt: voice.line("So I run the tests, I’m waiting for a pass").words.at(-1)!.start });

if (process.env.D_REPORT) {
  const cases: [Record<string, number>, Record<string, number>][] = [
    [scope.handoffIn(T.terminal, audio, T), HANDOFF.base08],
    [scope.handoffOut(T.terminalEnd - 1 / 60, audio, T), HANDOFF.nineteen09],
    [glass.handoffIn(T.wallStart, audio, T), HANDOFF.nineteen09],
    [glass.handoffOut(T.wallEnd - 1 / 60, audio, T), HANDOFF.fall10],
    [rain.handoffIn(T.rainStart, audio, T), HANDOFF.fall10],
    [rain.handoffOut(T.rainEnd - 1 / 60, audio, T), HANDOFF.boxes11],
    [count.handoffIn(T.rerunStart, audio, T), HANDOFF.boxes11],
    [count.handoffOut(T.end - 1 / 60, audio, T), HANDOFF.eleven12],
    [count.countState(voice, T.end - 1 / 60, T).digits[10]!.box, HANDOFF.eleven12],
  ];
  console.log('HANDOFF_MAX_ERROR', Math.max(...cases.flatMap(([a, b]) => Object.entries(b).map(([k, n]) => Math.abs(a[k]! - n)))));
}
