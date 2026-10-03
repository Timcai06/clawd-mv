// S09's riding lyric (stage 9 ②): the scan head is the writing head, and words sit on the trace.
import { beforeAll, describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { loadFonts } from '../src/engine/type';
import { resolveX9Times } from '../src/scenes/s09-z-shared';
import { scopeHead, SCOPE } from '../src/scenes/parts/s09-scope';
import { rideHead, traceAt, wordBaseline } from '../src/scenes/parts/s09-ride';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const oldFetch = globalThis.fetch, oldDoc = (globalThis as any).document, oldFace = (globalThis as any).FontFace;
beforeAll(async () => {
  (globalThis as any).FontFace = class { async load() { return this; } };
  (globalThis as any).document = { fonts: { add() {}, ready: Promise.resolve() } };
  globalThis.fetch = (async (url: any) => new Response(await Bun.file(new URL('../public/' + String(url), import.meta.url)).arrayBuffer())) as typeof fetch;
  try { await loadFonts(); } finally { globalThis.fetch = oldFetch; (globalThis as any).document = oldDoc; (globalThis as any).FontFace = oldFace; }
});

describe('S09 lyric rides the scope', () => {
  test('the scan head waits at the origin, then never passes the newest sung letter', () => {
    const T = resolveX9Times({ audio, lyrics } as never), R = T.ride;
    expect(scopeHead(T.terminal, T)).toBe(SCOPE.traceX);
    let last = -Infinity;
    for (let t = T.terminal; t < T.terminalEnd; t += 1 / 60) {
      const x = scopeHead(t, T);
      expect(x).toBeGreaterThanOrEqual(last - 1e-9); last = x;
      const sung = R.ins.glyphs.filter((g) => t >= g.t).at(-1);
      if (sung) expect(x).toBeLessThanOrEqual(R.sx0 + (sung.x + sung.adv) * R.sc + 1e-6);
      expect(x).toBe(rideHead(R, t));
    }
    // the whole line fits the glass
    expect(R.sx0 + R.ins.width * R.sc).toBeLessThanOrEqual(1824 + 1e-6);
  });
  test('a word rests on the crest under it: above the trace except the hidden spike tip', () => {
    const T = resolveX9Times({ audio, lyrics } as never), R = T.ride;
    for (let wi = 0; wi <= R.ins.glyphs.at(-1)!.wi; wi++) {
      const g = R.ins.glyphs.filter((h) => h.wi === wi);
      const x0 = R.sx0 + g[0]!.x * R.sc, x1 = R.sx0 + (g.at(-1)!.x + g.at(-1)!.adv) * R.sc;
      const base = wordBaseline(x0, x1);
      let top = Infinity;
      for (let x = x0; x <= x1; x += 2) top = Math.min(top, traceAt(x));
      expect(base).toBeLessThanOrEqual(SCOPE.y);
      expect(top - base).toBeGreaterThan(-24); // at most the spike's last 24 px sit behind the letters
    }
  });
});
