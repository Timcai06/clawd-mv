// Words held across the group D cuts (docs/CUTS.md, R2): the incoming scene finishes the word in
// the outgoing scene's screen layout, using the same function, and never re-sets the whole line.
import type { AudioData } from '../../engine/audio';
import { heatColor, setLine, drawSet, type Voice } from '../../kit/lyric-moves';
import { varRun, fillRun } from '../../kit/vartype';
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

/** C11: "and I don't know why" as S11 sets it (centred, baseline 1040, 96 px). With `onlyLast`
 *  (S12's first beat) just "why" is drawn, in its own slot. */
export function drawWhyLine(c: CanvasRenderingContext2D, v: Voice, t: number, on: 'ink' | 'paper', glow?: CanvasRenderingContext2D, onlyLast = false) {
  const line = v.line('Undefined, undefined, and I don’t know why');
  let rest = v.forms(line, t).slice(2);
  if (onlyLast) rest = rest.map((f, i) => (i < rest.length - 1 ? { ...f, born: 0 } : f));
  const set = setLine(rest, 96);
  drawSet(c, set, 960 - set.width / 2, 1040, { on, glow });
}
