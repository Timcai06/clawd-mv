// Six xerox generations and the reference's complete, variable-width number row.
import { HANDOFF } from '../../kit/handoff';
import type { AudioData } from '../../engine/audio';
import { Voice } from '../../kit/lyric-moves';
import { varRun } from '../../kit/vartype';
import { lerp } from '../../engine/util';
import * as Clawd from '../../kit/clawd';
import { enterBeat, exitBeat, runBox, spriteBox, union } from './s09-type';
import { rerunState, type X9Times } from '../s09-z-shared';
export const COPIES = [
  { x: 112, y: 145, w: 290, h: 415, roll: -0.07 },
  { x: 362, y: 160, w: 295, h: 438, roll: -0.08 },
  { x: 610, y: 195, w: 300, h: 440, roll: -0.09 },
  { x: 854, y: 238, w: 320, h: 400, roll: -0.10 },
  { x: 1118, y: 257, w: 296, h: 440, roll: -0.11 },
  { x: 1356, y: 122, w: 488, h: 655, roll: -0.10 },
];
const NUMBERS = [
  { x: -50, w: 190, h: 375 }, { x: 145, w: 140, h: 385 }, { x: 295, w: 145, h: 337 },
  { x: 439, w: 170, h: 302 }, { x: 610, w: 185, h: 275 }, { x: 797, w: 150, h: 260 },
  { x: 956, w: 160, h: 230 }, { x: 1112, w: 150, h: 221 }, { x: 1264, w: 144, h: 189 },
  { x: 1410, w: 230, h: 172 }, { x: HANDOFF.eleven12.x, w: HANDOFF.eleven12.w, h: HANDOFF.eleven12.h },
];
export function handoffIn(t: number, audio: AudioData, T: X9Times) {
  const p = enterBeat(audio, t, T.rerunStart);
  return { cx: HANDOFF.boxes11.cx, cy: lerp(HANDOFF.boxes11.cy, 440, p),
    w: lerp(HANDOFF.boxes11.w, 1760, p), n: HANDOFF.boxes11.n };
}
export function handoffOut(t: number, audio: AudioData, T: X9Times) {
  // Reference 11 already lies at the shared cut rect; keep its ink registered throughout the last beat.
  const p = exitBeat(audio, t, T.end);
  return { x: lerp(NUMBERS[10]!.x, HANDOFF.eleven12.x, p), y: HANDOFF.eleven12.y,
    w: HANDOFF.eleven12.w, h: HANDOFF.eleven12.h };
}
export function countState(v: Voice, t: number, T: X9Times) {
  const temporal = rerunState(v.audio, t, T);
  const line = v.line('Clear the cache and count to ten');
  const count = v.form(line.words[4]!, t), ten = v.form(line.words[6]!, t);
  const number = count.born <= 0 ? 0 : Math.min(temporal.number, ten.born > 0 ? 11 : 9);
  const digits = NUMBERS.slice(0, number).map((p, i) => {
    const form = i >= 9 ? ten : count;
    const run = varRun(String(i + 1), 100, { wdth: form.axes.wdth + (i % 3 - 1) * 12, wght: 900 });
    const raw = runBox(run, 0, 0), target = i === 10 ? handoffOut(t, v.audio, T) : { x: p.x, y: 1031 - p.h, w: p.w, h: p.h };
    const sx = target.w / raw.w, sy = target.h / raw.h;
    const x = target.x - raw.x * sx, y = target.y - raw.y * sy;
    return { run, x, y, sx, sy, color: i === 10 ? 'clay' as const : 'ink' as const,
      box: runBox(run, x, y, sx, sy) };
  });
  const pose = Clawd.pose('A9', { beat: number, beat0: 0, p: temporal.countPhase });
  const bounds = digits.length ? union(digits.flatMap(d => [[d.box.x, d.box.y], [d.box.x + d.box.w, d.box.y + d.box.h]] as [number, number][])) : null;
  const dominant = bounds ? { x: Math.max(0, bounds.x), y: bounds.y,
    w: Math.min(1920, bounds.x + bounds.w) - Math.max(0, bounds.x), h: bounds.h } : null;
  return { number, digits, dominant, clawd: { x: 1450, y: 799, px: 10.7, pose }, clawdBox: spriteBox(1450, 799, 10.7, pose) };
}
