// S09's lyric rides the oscilloscope (stage 9 ②, pdoom spacetime.ts drawScope: "the lyric rides
// the wave"). The line is laid out once on the scope's glass, each word in the shape it ends with,
// so written letters stay put; each word rides the live trace as one piece, perched on the highest
// crest under it (pdoom loss.ts lifts a whole word over the spike), and the scan head is the
// writing head: it only advances as far as the letters that have been sung.
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import { hash } from '../../engine/util';
import { Voice, type On } from '../../kit/lyric-moves';
import { drawInscription, fitWidth, headX, inscribe, type Aff, type InGlyph, type Inscription } from '../../kit/inscribe';
import { planeAffine, Rig, p3 } from '../../kit/rig';
import { SCOPE, scopeY } from './s09-scope';

export interface Ride { ins: Inscription; sc: number; sx0: number; voice: Voice }
const SIZE = 96, LINE = 'So I run the tests, I’m waiting for a pass';
/** Gap between the trace (or the crest a word rests on) and the letters' baseline (glass px). */
const GAP = 16;

const cache = new WeakMap<Lyrics, Ride>();
export function rideLayout(audio: AudioData, lyrics: Lyrics): Ride {
  let r = cache.get(lyrics);
  if (!r) {
    const voice = new Voice(lyrics, audio);
    // Each word in the shape it ends with: positions never reflow once written. Without the line
    // (fixtures with missing lyric data) the ride is empty and the head stays at the origin.
    const line = lyrics.lines.find((l) => l.text === LINE);
    const forms = (line?.words ?? []).map((w) => ({ ...voice.form(w, w.end), age: 0, born: 1 }));
    const ins = inscribe(forms, SIZE, { space: 0.24 });
    const sx0 = SCOPE.traceX + 10;
    r = { ins, sc: fitWidth(ins, 1824 - sx0), sx0, voice };
    cache.set(lyrics, r);
  }
  return r;
}

/** The scan head on the glass: idle at the trace origin, then on the newest sung letter. */
export function rideHead(R: Ride, t: number) {
  const first = R.ins.glyphs[0];
  return !first || t < first.t ? SCOPE.traceX : R.sx0 + headX(R.ins, t, R.sc);
}

// The current run's spikes (scopeY's crest at phase 0.83; run 0's phase offset, as in ridgeY).
const PH0 = hash(0, 9, 1) * 0.6;
const crest = (sx: number) => {
  const local = (sx - SCOPE.traceX - 26) / SCOPE.period + PH0;
  const d = (((local - 0.83) % 1) + 1.5) % 1 - 0.5; // signed distance to the nearest crest, in periods
  return Math.exp(-((d / 0.07) ** 2));
};
/**
 * A word rides as one piece (pdoom loss.ts lifts a whole word over the spike): its baseline sits
 * just above the highest crest under it, so a word over a spike is perched on it (the tip hidden
 * behind the letters) and a word between spikes drops back to the trace.
 */
export function wordBaseline(x0: number, x1: number) {
  let lift = 0;
  for (let x = x0 - 6; x <= x1 + 6; x += 4) lift = Math.max(lift, crest(x));
  return SCOPE.y - GAP - 0.85 * 145 * lift;
}
/** Sanity: the trace of run 0 at sx (scopeY), for tests. */
export const traceAt = (sx: number) => scopeY((sx - SCOPE.traceX - 26) / SCOPE.period + PH0);

const wx = (sx: number) => (sx - 960) / 100, wy = (sy: number) => (540 - sy) / 100;
/** The letter's canvas affine on the glass (z = 0) through the rig: on its word's baseline. */
function placeOnGlass(R: Ride, rig: Rig, g: InGlyph): Aff | null {
  const word = R.ins.glyphs.filter((h) => h.wi === g.wi);
  const x0 = R.sx0 + word[0]!.x * R.sc, x1 = R.sx0 + (word.at(-1)!.x + word.at(-1)!.adv) * R.sc;
  const y = wordBaseline(x0, x1), ox = R.sx0 + g.x * R.sc;
  return planeAffine(rig, p3(wx(ox), wy(y), 0), p3(1, 0, 0), p3(0, -1, 0), 0.01);
}

/**
 * Draw the riding line through `rig` (already set to the camera to use). `only` limits the words
 * (S10 finishes "pass" with S09's camera frozen at the cut).
 */
export function drawRide(c: CanvasRenderingContext2D, R: Ride, rig: Rig, t: number, on: On, o: { glow?: CanvasRenderingContext2D; only?: (wi: number) => boolean } = {}) {
  if (!R.ins.glyphs.length) return;
  const line = R.voice.line(LINE);
  // Live heat and stress from the voice; positions from the frozen layout.
  const reveal = headX(R.ins, t, R.sc);
  const ins: Inscription = { ...R.ins, glyphs: R.ins.glyphs.filter((g) => !o.only || o.only(g.wi)).map((g) => ({ ...g, form: R.voice.form(line.words[g.wi]!, t) })) };
  drawInscription(c, ins, t, { on, head: 'scan', reveal, scale: R.sc, place: (g) => placeOnGlass(R, rig, g), glow: o.glow });
}
