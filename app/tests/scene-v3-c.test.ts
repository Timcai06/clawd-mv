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
  commitLayout,
  commitBounds,
  handoffIn as in08,
  handoffOut as out08,
} from "../src/scenes/parts/s08-layout";
import { chorusScore } from "../src/scenes/parts/s13-score";
import {
  gitfallLayout,
  gitfallBounds,
  handoffIn as in13,
  handoffOut as out13,
  logTravel,
} from "../src/scenes/parts/s13-layout";
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
// S08: COMMIT cropped envelope [0,264]-[1672,743], Clawd [873,127]-[1050,217].
// S13: COMMIT [16,28]-[851,819], Clawd [960,208]-[1167,306], panels [508,480]-[1287,785].
const measured = (x: number, y: number, w: number, h: number): Box => ({
  x: (x * 1920) / 1672,
  y: (y * 1080) / 941,
  w: (w * 1920) / 1672,
  h: (h * 1080) / 941,
});
const TARGETS = {
  S08: {
    giant: measured(0, 264, 1672, 479),
    clawd: measured(873, 127, 177, 90),
  },
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
  test("S08-2 ink and sprite envelopes reproduce measured reference bounds", () => {
    const t = frameAt(A.shots, "S08-2"),
      b = commitBounds(audio, lyrics, t, A);
    const errors = {
      giant: framing(b.giant, TARGETS.S08.giant),
      clawd: framing(b.clawd, TARGETS.S08.clawd),
    };
    console.log(
      "S08 bounds",
      JSON.stringify({ t, actual: b, target: TARGETS.S08, errors }),
    );
    expect((b.giant.w * b.giant.h) / (1920 * 1080)).toBeGreaterThanOrEqual(0.3);
  });
  test("S13-7 perspective ink, sprite and collision envelopes reproduce measured reference bounds", () => {
    const t = frameAt(B.shots, "S13-7"),
      b = gitfallBounds(audio, lyrics, t, B);
    const errors = {
      giant: framing(b.giant, TARGETS.S13.giant),
      clawd: framing(b.clawd, TARGETS.S13.clawd),
      panels: framing(b.panels, TARGETS.S13.panels),
    };
    console.log(
      "S13 bounds",
      JSON.stringify({ t, actual: b, target: TARGETS.S13, errors }),
    );
    expect((b.giant.w * b.giant.h) / (1920 * 1080)).toBeGreaterThanOrEqual(0.3);
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
  test("S08 receives the existing centred 72px cursor at its first frame", () => {
    expect(in08(A.start, audio, A)).toEqual({ x: 940.2, y: 576, h: 72 });
  });
  test("S08 last exported frame is the S09 baseline and transition is restricted to the last beat", () => {
    expect(out08(A.end - 1 / 60, audio, A)).toEqual(HANDOFF.base08);
    expect(out08(afterBeats(audio, A.end, -1), audio, A)).toEqual({
      x0: 1138,
      x1: 1650,
      y: 940,
    });
    expect(out08(A.start, audio, A)).toEqual(
      out08(afterBeats(audio, A.end, -1), audio, A),
    );
  });
  test("S13 starts at clay 11 and reaches its half field in the first beat", () => {
    expect(in13(B.start, audio, B)).toEqual(HANDOFF.eleven12);
    expect(in13(afterBeats(audio, B.start, 1), audio, B)).toEqual({
      x: 0,
      y: 0,
      w: 1096,
      h: 1080,
    });
  });
  test("S13 exports the constant row pitch and speed on its last frame", () => {
    expect(out13(B.end - 1 / 60, audio, B)).toEqual(HANDOFF.fall13);
    const last = B.end - 1 / 60,
      next = afterBeats(audio, last, 0.001);
    expect(
      (logTravel(next, audio, B) - logTravel(last, audio, B)) / 0.001,
    ).toBeCloseTo(HANDOFF.fall13.pxPerBeat, 5);
  });
});
describe("group C voice and seeking", () => {
  test("S13 freezes the rendered log travel and sprite pose during both pickups", () => {
    for (const [start, hit] of [
      [B.start, B.hit1],
      [B.pickup2, B.hit2],
    ]) {
      const a = gitfallLayout(audio, lyrics, start! + 0.01, B, voice);
      const b = gitfallLayout(audio, lyrics, hit! - 0.01, B, voice);
      expect(a.travel).toBe(b.travel);
      expect(a.clawd.pose).toEqual(b.clawd.pose);
    }
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
      frameAt(A.shots, "S08-2"),
      A.start,
      A.hit2,
      A.end - 1 / 60,
    ]) {
      const s = commitLayout(audio, lyrics, t, A, voice),
        b = commitBounds(audio, lyrics, t, A);
      commitLayout(audio, lyrics, A.end, A, voice);
      commitLayout(audio, lyrics, A.start, A, voice);
      expect(commitLayout(audio, lyrics, t, A, voice)).toEqual(s);
      expect(commitBounds(audio, lyrics, t, A)).toEqual(b);
      expect(
        commitLayout(
          new AudioData({ ...audioJSON, bpm: 40 }),
          lyrics,
          t,
          A,
          voice,
        ),
      ).toEqual(s);
      expect(out08(t, audio, A)).toEqual(out08(t, audio, A));
    }
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
      expect(out13(t, audio, B)).toEqual(out13(t, audio, B));
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
