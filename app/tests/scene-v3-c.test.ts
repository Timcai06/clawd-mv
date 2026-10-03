import { beforeAll, describe, expect, test } from "bun:test";
import { AudioData } from "../src/engine/audio";
import { Lyrics } from "../src/engine/lyrics";
import { loadFonts } from "../src/engine/type";
import { Voice } from "../src/kit/lyric-moves";
import { HANDOFF } from "../src/kit/handoff";
import { afterBeats } from "../src/kit/time";
import { TYPE_LEVELS as S08 } from "../src/scenes/s08-commit";
import { TYPE_LEVELS as S13 } from "../src/scenes/s13-gitfall";
import {
  commitScore,
} from "../src/scenes/parts/s08-layout";
import { chorusScore } from "../src/scenes/parts/s13-score";
import {
  gitfallLayout,
  gitfallBounds,
  handoffIn as in13,
} from "../src/scenes/parts/s13-layout";
import { TOP, SLAB, BASE_SLABS, tailTravel } from '../src/scenes/parts/s13-world';
import { bounds, type Box } from "../src/scenes/parts/s08-print";
import audioJSON from "../../data/audio.json";
import lyricsJSON from "../../data/lyrics.json";

const audio = new AudioData(audioJSON),
  lyrics = new Lyrics(lyricsJSON),
  voice = new Voice(lyrics, audio);
const A = commitScore(audio, lyrics),
  B = chorusScore(audio, lyrics);
// Populate the production outline registry with the actual checked-in font binaries. No Canvas
// measurement mocks: bounds use the interpolated OpenType contours used by the drawing code.
beforeAll(async () => {
  const original = {
    fetch: globalThis.fetch,
    FontFace: (globalThis as any).FontFace,
    document: (globalThis as any).document,
  };
  (globalThis as any).fetch = async (url: string) =>
    new Response(
      await Bun.file(
        new URL(`../public/${url}`, import.meta.url),
      ).arrayBuffer(),
    );
  (globalThis as any).FontFace = class {
    async load() {
      return this;
    }
  };
  (globalThis as any).document = {
    fonts: { add() {}, ready: Promise.resolve() },
  };
  try {
    await loadFonts();
  } finally {
    globalThis.fetch = original.fetch;
    (globalThis as any).FontFace = original.FontFace;
    (globalThis as any).document = original.document;
  }
});
function framing(actual: Box, target: Box) {
  const dx = actual.x + actual.w / 2 - target.x - target.w / 2,
    dy = actual.y + actual.h / 2 - target.y - target.h / 2;
  expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(96);
  expect(Math.abs(actual.w / target.w - 1)).toBeLessThanOrEqual(0.15);
  expect(Math.abs(actual.h / target.h - 1)).toBeLessThanOrEqual(0.15);
  return {
    centre: Math.hypot(dx, dy),
    widthPct: Math.abs(actual.w / target.w - 1) * 100,
    heightPct: Math.abs(actual.h / target.h - 1) * 100,
  };
}
// Original PNGs are 1672x941. Measured outermost coloured edges on the supplied storyboard,
// excluding jump/speed trails and background grain; multiply x by 1920/1672 and y by 1080/941.
// S08 V6 replaces its v3 crop/cursor assertions in scene-v6-g3.test.ts.
// S13: COMMIT [16,28]-[851,819], Clawd [960,208]-[1167,306], panels [508,480]-[1287,785].
const measured = (x: number, y: number, w: number, h: number): Box => ({
  x: (x * 1920) / 1672,
  y: (y * 1080) / 941,
  w: (w * 1920) / 1672,
  h: (h * 1080) / 941,
});
const TARGETS = {
  S13: {
    giant: measured(16, 28, 835, 791),
    clawd: measured(960, 208, 207, 98),
    panels: measured(508, 480, 779, 305),
  },
};
const frameAt = (shots: typeof A.shots, id: string) => {
  const s = shots.find((s) => s.id === id)!;
  return s.start + s.duration * 0.6;
};

describe("group C v3 framing", () => {
  test("S13 uses physical laminations rather than the old warped reference quad", () => {
    expect(SLAB).toEqual({ w: 7.2, h: 0.42, d: 2.4 });
    const s = gitfallLayout(audio, lyrics, B.hit1 + 0.2, B);
    expect(s.slabs).toHaveLength(BASE_SLABS + B.slabs.length);
    expect(TOP(B.hit1 + 0.2, B)).toBeCloseTo(2.4, 8);
  });
  test("only three declared type levels, measured as cap heights except Mono label font size", () => {
    for (const s of [S08, S13]) {
      expect(s.lyric).toBeGreaterThanOrEqual(50);
      expect(s.lyric).toBeLessThanOrEqual(110);
      expect(s.label).toBeGreaterThanOrEqual(14);
      expect(s.label).toBeLessThanOrEqual(22);
      expect(s.giant).toBeGreaterThanOrEqual(200);
      expect(s.giant / s.lyric).toBeGreaterThanOrEqual(2.5);
      expect(s.lyric / s.label).toBeGreaterThanOrEqual(2.5);
    }
  });
});
describe("group C handoffs", () => {
  test("S13 receives the full-height diagonal clay edge", () => {
    const p = in13(B.start, audio, B);
    expect(p.kind).toBe('line');
    if (p.kind === 'line') {
      expect(p.x0).toBeCloseTo(1010, 7); expect(p.x1).toBeCloseTo(760, 7);
      expect(p.y0).toBeCloseTo(0, 7); expect(p.y1).toBeCloseTo(1080, 7);
    }
  });
  test("S13 tail keeps the specified screen travel before the point implosion", () => {
    const t = afterBeats(audio, B.end, -0.8), next = afterBeats(audio, t, 0.001);
    expect((tailTravel(audio, next, B) - tailTravel(audio, t, B)) / 0.001).toBeCloseTo(140, 7);
  });
});
describe("group C voice and seeking", () => {
  test("S13 second pickup does not freeze its world clock", () => {
    const a = gitfallLayout(audio, lyrics, B.pickup2 + 0.01, B, voice);
    const b = gitfallLayout(audio, lyrics, B.hit2 - 0.01, B, voice);
    expect(a.camera).not.toEqual(b.camera);
  });
  test("every overlapping word, including a phrase crossing either cut, is unborn before onset", () => {
    for (const T of [A, B])
      for (const line of lyrics.linesIn(T.start, T.end))
        for (const word of line.words)
          expect(voice.form(word, word.start - 0.01).born).toBe(0);
    for (const T of [A, B])
      expect(
        voice.forms(lyrics.lastLine(T.end)!, T.end).some((f) => f.born > 0),
      ).toBe(true);
  });
  test("layout, bounds and handoffs are seek-independent and use the variable beat grid", () => {
    for (const t of [
      frameAt(B.shots, "S13-7"),
      B.start,
      B.hit2,
      B.end - 1 / 60,
    ]) {
      const s = gitfallLayout(audio, lyrics, t, B, voice),
        b = gitfallBounds(audio, lyrics, t, B);
      gitfallLayout(audio, lyrics, B.end, B, voice);
      gitfallLayout(audio, lyrics, B.start, B, voice);
      expect(gitfallLayout(audio, lyrics, t, B, voice)).toEqual(s);
      expect(gitfallBounds(audio, lyrics, t, B)).toEqual(b);
      expect(
        gitfallLayout(
          new AudioData({ ...audioJSON, bpm: 240 }),
          lyrics,
          t,
          B,
          voice,
        ),
      ).toEqual(s);
      expect(in13(t, audio, B)).toEqual(in13(t, audio, B));
    }
  });
  test("no legacy lyric renderer remains in the group C main files", async () => {
    for (const file of ["s08-commit.ts", "s13-gitfall.ts"]) {
      const source = await Bun.file(
        new URL(`../src/scenes/${file}`, import.meta.url),
      ).text();
      expect(source).not.toMatch(
        /lyricsTypeState|sungLine|drawLyricsLine|drawLyricsHook|X9Lyrics/,
      );
    }
  });
});
