import { beforeAll, describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { loadFonts } from '../src/engine/type';
import { Voice } from '../src/kit/lyric-moves';
import { headX, inscribe, letterSpan } from '../src/kit/inscribe';
import { impact } from '../src/kit/impact';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON), voice = new Voice(lyrics, audio);
const oldFetch = globalThis.fetch, oldDoc = (globalThis as any).document, oldFace = (globalThis as any).FontFace;
beforeAll(async () => {
  (globalThis as any).FontFace = class { async load() { return this; } };
  (globalThis as any).document = { fonts: { add() {}, ready: Promise.resolve() } };
  globalThis.fetch = (async (url: any) => new Response(await Bun.file(new URL('../public/' + String(url), import.meta.url)).arrayBuffer())) as typeof fetch;
  try { await loadFonts(); } finally { globalThis.fetch = oldFetch; (globalThis as any).document = oldDoc; (globalThis as any).FontFace = oldFace; }
});

describe('kit/inscribe: letters written by a head', () => {
  const line = lyrics.get('Got a bug report, the weirdest I’ve seen');
  test('every letter has its own moment inside its word, never before the word', () => {
    const ins = inscribe(voice.forms(line, line.end), 120);
    for (const g of ins.glyphs) {
      expect(g.t).toBeGreaterThanOrEqual(g.form.t0);
      expect(g.t).toBeLessThanOrEqual(g.form.t0 + letterSpan(g.form) + 1e-9);
    }
    for (let i = 1; i < ins.glyphs.length; i++) expect(ins.glyphs[i]!.t).toBeGreaterThanOrEqual(ins.glyphs[i - 1]!.t);
    // a long word is not written in one frame
    const report = ins.glyphs.filter((g) => /report/.test(g.form.text));
    expect(report.at(-1)!.t - report[0]!.t).toBeGreaterThan(0.3);
  });
  test('the head sits on the newest letter and only moves forward', () => {
    let last = -Infinity;
    for (let t = line.start - 0.1; t < line.end + 0.2; t += 1 / 60) {
      const ins = inscribe(voice.forms(line, t), 120), x = headX(ins, t);
      const newest = ins.glyphs.filter((g) => t >= g.t).at(-1);
      if (newest) { expect(x).toBeGreaterThanOrEqual(newest.x - 1e-6); expect(x).toBeLessThanOrEqual(newest.x + newest.adv + 1e-6); }
      // layouts reflow as held words widen, so allow the widening, but never a jump backwards of a letter
      expect(x).toBeGreaterThan(last - 40);
      last = x;
    }
  });
  test('deterministic: the same t gives the same layout', () => {
    const t = line.start + 0.9;
    const a = inscribe(voice.forms(line, t), 120), b = inscribe(voice.forms(line, t), 120);
    expect(a.glyphs.map((g) => [g.x, g.t])).toEqual(b.glyphs.map((g) => [g.x, g.t]));
  });
});

describe('kit/impact', () => {
  test('a hit shakes and decays, and everything is still for the last 0.1 s', () => {
    const hits = [{ t: 1, shake: 20, kick: 0.05, swap: true }];
    expect(impact(0.99, hits).kick).toBe(0);
    const at = impact(1.001, hits);
    expect(at.kick).toBeGreaterThan(0.04); expect(at.swap).toBe(true);
    expect(impact(1 + 3 / 60, hits).swap).toBe(false);
    expect(impact(1.5, hits).kick).toBeLessThan(0.001);
    expect(impact(1.01, hits, 1.05)).toEqual({ shake: [0, 0], kick: 0, swap: false });
  });
});
