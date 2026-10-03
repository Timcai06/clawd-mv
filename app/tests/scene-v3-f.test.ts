import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { loadFonts } from '../src/engine/type';
import { Voice } from '../src/kit/lyric-moves';
import { varRun } from '../src/kit/vartype';
import { pose } from '../src/kit/clawd';
import { HANDOFF, type Rect } from '../src/kit/handoff';
import { afterBeats } from '../src/kit/time';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import { TYPE_LEVELS as RELEASE_LEVELS } from '../src/scenes/s17-release';
import { bounds, greenTimes, greenState, handoffIn as greenIn, handoffOut as greenOut } from '../src/scenes/parts/s16-green-state';
import { printedPoints, printTransform } from '../src/scenes/parts/s16-print';
import { resolveReleaseTimes } from '../src/scenes/parts/s17-release-state';
import { wallCells, DIFF_BOXES, releaseLayout, handoffIn as releaseIn, handoffOut as releaseOut } from '../src/scenes/parts/s17-release-layout';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import board from '../../storyboard/shots.json';
import keyframes from '../../storyboard/keyframes.json';

// Use the shipped OpenType outlines in Bun; only FontFace registration is replaced.
// No Canvas, synthetic font metrics or render screenshot is used for these measurements.
const oldFetch = globalThis.fetch, oldDocument = globalThis.document, oldFontFace = globalThis.FontFace;
try {
  globalThis.document = { fonts: { add() {}, ready: Promise.resolve() } } as any;
  globalThis.FontFace = class { async load() { return this; } } as any;
  globalThis.fetch = (async (url: string) => new Response(await Bun.file(
    new URL(`../public/${url}`, import.meta.url)).arrayBuffer())) as any;
  await loadFonts();
} finally {
  globalThis.fetch = oldFetch; globalThis.document = oldDocument; globalThis.FontFace = oldFontFace;
}

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON), voice = new Voice(lyrics, audio);
const G = greenTimes(audio, lyrics), R = resolveReleaseTimes(audio, lyrics);
const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
const at = (scene: string) => {
  const shot = shots.find(s => s.id === keyframes.frames.find(f => f.id === scene)!.shot)!;
  return shot.start + shot.duration * 0.6;
};
const clip = (r: Rect): Rect => {
  const x = Math.max(0, r.x), y = Math.max(0, r.y);
  return { x, y, w: Math.min(1920, r.x + r.w) - x, h: Math.min(1080, r.y + r.h) - y };
};
function mascot(action: 'A7' | null, s: { x: number; y: number; px: number }): Rect {
  const cells = pose(action, { beat: 0, beat0: 0, p: 0 }).cells;
  return bounds(cells.flatMap(cell => [{ x: s.x + cell.x * s.px, y: s.y + cell.y * s.px },
    { x: s.x + (cell.x + 1) * s.px + 0.35, y: s.y + (cell.y + 1) * s.px + 0.35 }]));
}
function error(actual: Rect, target: Rect) {
  return { centerPx: Math.hypot(actual.x + actual.w / 2 - target.x - target.w / 2,
    actual.y + actual.h / 2 - target.y - target.h / 2),
    widthPct: Math.abs(actual.w / target.w - 1) * 100, heightPct: Math.abs(actual.h / target.h - 1) * 100 };
}
const measured = (x: number, y: number, w: number, h: number): Rect =>
  ({ x: x * 1920 / 1672, y: y * 1080 / 941, w: w * 1920 / 1672, h: h * 1080 / 941 });

// Target PNGs are 1672×941. Manually read min/max pixel coordinates on the reference,
// then multiply x/w by 1920/1672 and y/h by 1080/941. Visible ink/solid bounds exclude
// registration rules, motion strokes, arrows and cast-shadow strokes. Printed text uses
// a conservative OpenType control hull (bearings and descenders included), clipped to frame.
const targets = {
  green: measured(0, 0, 1335, 441), dominoes: measured(159, 405, 1457, 480),
  clawd16: measured(1304, 290, 217, 84), wall: measured(27, 32, 1619, 425),
  deleted: measured(42, 479, 1560, 249), added: measured(42, 695, 1360, 238),
  clawd17: measured(1051, 417, 156, 56),
};
const g = greenState(audio, lyrics, voice, at('S16'), G), r = releaseLayout(audio, lyrics, at('S17'), R);
const actual = {
  wall: bounds(wallCells().flatMap(c => [{ x: c.x, y: c.y }, { x: c.x + c.w, y: c.y + c.h }])),
  deleted: bounds(printedPoints(varRun('- d <= days', 340, { wdth: 100, wght: 900 }), DIFF_BOXES[0]!)),
  added: bounds(printedPoints(varRun('+ d < days', 340, { wdth: 100, wght: 900 }), DIFF_BOXES[1]!)),
  clawd17: mascot(null, r.clawd),
};
const metrics = Object.fromEntries(Object.entries(actual).map(([key, box]) =>
  [key, { actual: box, target: targets[key as keyof typeof targets], error: error(box, targets[key as keyof typeof targets]) }]));

describe('F v3 reference composition', () => {
  for (const key of Object.keys(actual) as (keyof typeof actual)[]) test(key, () => {
    const e = error(actual[key], targets[key]);
    expect(e.centerPx).toBeLessThanOrEqual(96);
    expect(e.widthPct).toBeLessThanOrEqual(15); expect(e.heightPct).toBeLessThanOrEqual(15);
  });
  test('the dominant artwork covers thirty percent of the frame', () => {
    expect(actual.wall.w * actual.wall.h / (1920 * 1080)).toBeGreaterThanOrEqual(0.3);
  });
  test('the canonical wall keeps all occupied cells and exactly two eyes', () => {
    expect(wallCells()).toHaveLength(pose(null, { beat: 0, beat0: 0, p: 0 }).cells.length);
    expect(wallCells().filter(c => c.k === 'D')).toHaveLength(2);
  });
});

describe('F v3 cut registration', () => {
  const rectDistance = (a: Rect, b: Rect) => Math.max(...(['x', 'y', 'w', 'h'] as const).map(k => Math.abs(a[k] - b[k])));
  test('S15 → S16 starts at the snipped bar, and the visible first face uses it', () => {
    expect(rectDistance(greenIn(G.start, audio, G), HANDOFF.domino15)).toBeLessThanOrEqual(2);
    expect(greenState(audio, lyrics, voice, G.start, G).cards[0]!.face).toEqual(greenIn(G.start, audio, G));
  });
  test('S16 → S17 registers the outgoing face and incoming flood', () => {
    expect(rectDistance(greenOut(G.end - 1 / 60, audio, G), HANDOFF.domino16)).toBeLessThanOrEqual(2);
    expect(rectDistance(greenState(audio, lyrics, voice, G.end - 1 / 60, G).cards[18]!.face,HANDOFF.domino16)).toBeLessThanOrEqual(2);
    expect(rectDistance(releaseIn(R.release[0]!.start, audio, R), HANDOFF.domino16)).toBeLessThanOrEqual(2);
  });
  test('S17 → S18 retains all six graph node positions', () => {
    releaseOut(R.release.at(-1)!.end - 1 / 60, audio, R).forEach((p, i) =>
      expect(Math.hypot(p.x - HANDOFF.nodes17[i]!.x, p.y - HANDOFF.nodes17[i]!.y)).toBeLessThanOrEqual(2));
  });
  test('handoff movement is confined to one measured beat', () => {
    expect(releaseIn(afterBeats(audio, R.release[0]!.start, 1), audio, R)).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  });
  test('the rendered face geometry follows the handoff throughout the beat', () => {
    for (const fraction of [0.1, 0.35, 0.7]) {
      const incoming = G.start + (G.triggers[0]!-G.start)*fraction;
      expect(rectDistance(greenState(audio, lyrics, voice, incoming, G).cards[0]!.face,
        greenIn(incoming, audio, G))).toBeLessThan(0.001);
      const outgoing = G.outgoingStart + (G.outgoingEnd - G.outgoingStart) * fraction;
      expect(rectDistance(greenState(audio, lyrics, voice, outgoing, G).cards[18]!.face,
        greenOut(outgoing, audio, G))).toBeLessThan(0.001);
    }
  });
});

describe('F v3 voice, hierarchy and seeking', () => {
  test('the printed glyphs meet the declared minimum capital heights', () => {
    for (const [i, box] of DIFF_BOXES.entries()) {
      const run = varRun(i ? '+ d < days' : '- d <= days', 340, { wdth: 100, wght: 900 });
      expect(run.capH * printTransform(run, box).sy).toBeGreaterThanOrEqual(RELEASE_LEVELS.giant);
    }
  });
  for (const [name, levels] of [['S17', RELEASE_LEVELS]] as const) test(`${name} type levels`, () => {
    expect(levels.lyric).toBeGreaterThanOrEqual(50); expect(levels.lyric).toBeLessThanOrEqual(110);
    expect(levels.label).toBeGreaterThanOrEqual(14); expect(levels.label).toBeLessThanOrEqual(22);
    expect(levels.giant).toBeGreaterThanOrEqual(200); expect(levels.giant / levels.lyric).toBeGreaterThanOrEqual(2.5);
    expect(levels.lyric / levels.label).toBeGreaterThanOrEqual(2.5);
  });
  test('all sung and carried words remain unborn before their actual vocal onset', () => {
    for (const line of lyrics.lines.filter(l => l.end >= G.start && l.start < R.release.at(-1)!.end))
      for (const word of line.words) expect(voice.form(word, word.start - 0.01).born).toBe(0);
  });
  test('cuts preserve the already-sung words in crossing lines', () => {
    const crossed = [G.start, ...R.release.map(s => s.start)].filter(t => lyrics.lineAt(t)?.start! < t);
    expect(crossed.length).toBeGreaterThan(3);
    for (const t of crossed) {
      const line = lyrics.lineAt(t)!;
      const born = voice.forms(line, t).filter(f => f.t0 < t);
      expect(born.length).toBeGreaterThan(0);
      expect(born.every(f => f.born > 0)).toBe(true);
    }
  });
  test('all nineteen plaques pass without manufacturing a twentieth card', () => {
    const end = greenState(audio, lyrics, voice, G.end - 1 / 60, G);
    expect(end.cards).toHaveLength(19); expect(end.passed).toBe(19);
    G.triggers.forEach((t, i) => {
      expect(greenState(audio, lyrics, voice, t - 0.000001, G).passed).toBe(i);
      expect(greenState(audio, lyrics, voice, t, G).passed).toBe(i + 1);
    });
  });
  test('review survives the cut to the merge shot and main joins on its aligned word', () => {
    const line = voice.line('Then you wrote, “Looks good to me”');
    expect(releaseLayout(audio, lyrics, R.release[5]!.start, R).review).toBe(true);
    expect(releaseLayout(audio, lyrics, line.end, R).review).toBe(false);
    const main = voice.line('Merged to main, and now we’re free').words[2]!;
    expect(releaseLayout(audio, lyrics, main.start - 0.01, R).join).toBe(0);
    expect(releaseLayout(audio, lyrics, afterBeats(audio, main.end, 1), R).join).toBe(1);
  });
  test('state is independent of evaluation order and nominal BPM', () => {
    const other = new AudioData({ ...audioJSON, bpm: 40 });
    for (const t of [G.start, at('S16'), G.end - 1 / 60]) {
      const expected = greenState(audio, lyrics, voice, t, G);
      greenState(audio, lyrics, voice, G.end, G); greenState(audio, lyrics, voice, G.start, G);
      expect(greenState(audio, lyrics, voice, t, G)).toEqual(expected);
      expect(greenState(other, lyrics, voice, t, G)).toEqual(expected);
    }
    for (const t of R.release.map(s => s.start + s.duration * 0.6)) {
      const expected = releaseLayout(audio, lyrics, t, R);
      releaseLayout(audio, lyrics, R.end, R); releaseLayout(audio, lyrics, 0, R);
      expect(releaseLayout(audio, lyrics, t, R)).toEqual(expected);
      expect(releaseLayout(other, lyrics, t, R)).toEqual(expected);
    }
  });
  test('S16 and S17 each have one discoverable main scene file', () => {
    const files = [...new Bun.Glob('s*.ts').scanSync({ cwd: new URL('../src/scenes/', import.meta.url).pathname })];
    expect(files.filter(f => f.startsWith('s16-'))).toEqual(['s16-green.ts']);
    expect(files.filter(f => f.startsWith('s17-'))).toEqual(['s17-release.ts']);
  });
});

console.log('F v3 geometry measurements:', JSON.stringify(metrics));
console.log('F v3 capital heights:', JSON.stringify({ lyric: varRun('H', 92, { wdth: 100, wght: 900 }).capH,
  diff: DIFF_BOXES.map((box, i) => { const run = varRun(i ? '+ d < days' : '- d <= days', 340, { wdth: 100, wght: 900 }); return run.capH * printTransform(run, box).sy; }) }));
