// Words held across the group D cuts (docs/CUTS.md, R2): the incoming scene finishes the word in
// the outgoing scene's screen layout, using the same function, and never re-sets the whole line.
import type { AudioData } from '../../engine/audio';
import { heatColor, setLine, drawSet, type Voice } from '../../kit/lyric-moves';
import { varRun, fillRun } from '../../kit/vartype';
import type { X9Times } from '../s09-z-shared';
import { scanHeadScreen } from './s09-world';

/** C9: "pass" ends at the scan head (S09, baseline 427, 96 px), revealed as it is sung. S10 calls
 *  this with S09's head frozen at the cut. */
export function drawPass(c: CanvasRenderingContext2D, v: Voice, audio: AudioData, t: number, T: X9Times, on: 'ink' | 'paper') {
  const line = v.line('So I run the tests, I’m waiting for a pass'), word = line.words.at(-1)!;
  const form = v.form(word, t);
  if (form.born <= 0) return;
  const head = scanHeadScreen(audio, Math.min(t, T.terminalEnd - 1 / 60), T);
  const run = varRun(form.text, 96, form.axes), x = head.x - run.width;
  c.save(); c.beginPath(); c.rect(x, 338, run.width * form.sung, 122); c.clip();
  c.fillStyle = heatColor(form.stress ? 'clay' : on === 'ink' ? 'paper' : 'ink', on, form.age);
  fillRun(c, run, x, 427); c.restore();
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
