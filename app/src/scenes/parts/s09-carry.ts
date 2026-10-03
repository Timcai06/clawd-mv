// Words held across the group D cuts (docs/CUTS.md, R2): the incoming scene finishes the word in
// the outgoing scene's screen layout, using the same function, and never re-sets the whole line.
import type { AudioData } from '../../engine/audio';
import type { Voice } from '../../kit/lyric-moves';
import { affine, drawInscription, headX, inscribe, type Inscription } from '../../kit/inscribe';
import { drawCursor } from '../../kit/cursor';
import type { X9Times } from '../s09-z-shared';
import { cameraAt } from './s09-world';
import { drawRide } from './s09-ride';
import { Rig } from '../../kit/rig';

let frozen: Rig | undefined;
/** C9: "pass" is still being written at the cut; S10 finishes it on S09's glass, with S09's camera
 *  frozen at the cut (same function as S09's own lyric, parts/s09-ride.ts). */
export function drawPass(c: CanvasRenderingContext2D, _v: Voice, audio: AudioData, t: number, T: X9Times, on: 'ink' | 'paper') {
  const rig = (frozen ??= new Rig()); rig.set(cameraAt(audio, T.terminalEnd - 1 / 60, T));
  const last = T.ride.ins.glyphs.at(-1)!.wi;
  drawRide(c, T.ride, rig, t, on, { only: (wi) => wi === last });
}

/** C11: "and I don't know why", typed a letter at a time under the "undefined" headline, on its
 *  tilt (stage 9 ②; it used to be a centred caption at the bottom). With `onlyLast` (S12's first
 *  beat) just "why" is drawn, in its own slot, so S12 finishes the held word in S11's layout. */
export const WHY = { x: 150, y: 650, rot: 0.2, size: 96 } as const;
export function drawWhyLine(c: CanvasRenderingContext2D, v: Voice, t: number, on: 'ink' | 'paper', glow?: CanvasRenderingContext2D, onlyLast = false) {
  const line = v.line('Undefined, undefined, and I don’t know why'), words = line.words.slice(2);
  if (t < words[0]!.start) return;
  const fin = inscribe(words.map((w) => ({ ...v.form(w, w.end), born: 1, age: 0 })), WHY.size);
  const last = words.length - 1;
  const live: Inscription = { ...fin, glyphs: fin.glyphs.filter((g) => !onlyLast || g.wi === last).map((g) => ({ ...g, form: v.form(words[g.wi]!, t) })) };
  const cs = Math.cos(WHY.rot), sn = Math.sin(WHY.rot);
  drawInscription(c, live, t, { on, head: 'type', glow, seed: 59, place: (_g, x) => affine(WHY.x + cs * x, WHY.y + sn * x, WHY.rot) });
  if (!onlyLast && t < fin.glyphs.at(-1)!.t + 0.3) {
    const hx = headX(fin, t) + 6;
    c.save(); c.translate(WHY.x + cs * hx, WHY.y + sn * hx); c.rotate(WHY.rot); drawCursor(c, { x: 0, y: 0, h: fin.capH }); c.restore();
  }
}
