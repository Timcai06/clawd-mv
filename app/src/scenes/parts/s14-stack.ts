// S14 timing and state (pure; no DOM/GL). The call stack is an infinite vertical stack of frames
// drawn as engineering diagrams; the camera falls one frame per step:
//   instrumental — looking straight down the shaft, the cursor's plumb line lowering, a slow drift
//   "Down the call stack,"       — one frame per beat (3/4 view)
//   "quiet down here"             — one frame every two beats (pulled back, quiet)
//   "Frame by frame, and the bug" — one frame per beat (elevator: tight side elevation)
//   "near"                        — dead stop on daysIn(); line 42 lights clay
// Learned from pdoom's stack (springs, anticipation, phases, words set on the blocks, echoes).
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Word } from '../../engine/lyrics';
import { clamp, ease, springStep } from '../../engine/util';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import board from '../../../../storyboard/shots.json';

/** Frame names from the outermost (top of the shaft) to daysIn (where the fall stops). */
export const FRAMES = [
  'main', 'render', 'renderCalendar', 'renderMonth', 'buildMonth', 'buildWeeks', 'buildWeek',
  'buildDays', 'buildDay', 'dayCell', 'labelFor', 'dateOf', 'daysIn',
] as const;
export const ARGS: Record<string, string> = {
  main: '()', render: '(app)', renderCalendar: '(cal)', renderMonth: '(month)', buildMonth: '(2026, 9)',
  buildWeeks: '(month)', buildWeek: '(w)', buildDays: '(w, from)', buildDay: '(d)', dayCell: '(d)',
  labelFor: '(d)', dateOf: '(d)', daysIn: '(month)',
};

export interface Step { t: number; kind: 'beat' | 'stop' }
export interface StackScore {
  start: number; end: number;
  down: number; quiet: number; frame: number; near: number;
  steps: Step[];
  /** Block (frame index) each sung word is set on; echo blocks repeat a held word. */
  words: { word: Word; block: number; echo: boolean }[];
}

export const LEAD = 0.2; // fraction of a block pre-moved before each step (anticipation)

export function stackScore(audio: AudioData, lyrics: Lyrics): StackScore {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
  const shot = (id: string) => shots.find((s) => s.id === id)!;
  const start = shot('S14-1').start, end = shot('S14-5').end;
  const a = lyrics.get('Down the call stack'), b = lyrics.get('Frame by frame');
  const w = (l: typeof a, s: string) => l.words.find((x) => x.w.toLowerCase().replace(/[^a-z]/g, '') === s)!;
  const down = w(a, 'down').start, quiet = w(a, 'quiet').start, frame = b.words[0]!.start, near = w(b, 'near').start;
  const beats: number[] = [];
  for (let i = Math.ceil(audio.beatAt(start)); audio.timeOfBeat(i) < end; i++) beats.push(audio.timeOfBeat(i));
  const near0 = (t: number) => beats.reduce((p, x) => (Math.abs(x - t) < Math.abs(p - t) ? x : p), beats[0]!);
  const bDown = near0(down), bQuiet = near0(quiet), bFrame = near0(frame);
  const steps: Step[] = [];
  let quietN = 0;
  for (const t of beats) {
    if (t < bDown - 1e-3 || t >= near - 0.25) continue;
    if (t >= bQuiet - 1e-3 && t < bFrame - 1e-3) { if (quietN++ % 2) continue; }
    steps.push({ t, kind: 'beat' });
  }
  steps.push({ t: near, kind: 'stop' });
  const blockAt = (t: number) => steps.filter((s) => s.t <= t).length;
  const sc: StackScore = { start, end, down, quiet, frame, near, steps, words: [] };
  const sung = [...a.words, ...b.words];
  for (const x of sung) {
    const block = x.start >= near - 1e-3 ? steps.length : Math.min(steps.length - 1, blockAt(x.start + 0.12));
    sc.words.push({ word: x, block, echo: false });
  }
  // A held word echoes on the blocks that pass while it is still sounding.
  for (const e of [...sc.words]) {
    const last = Math.min(steps.length - 1, blockAt(e.word.end - 0.05));
    for (let k = e.block + 1; k <= last; k++) if (!sc.words.some((o) => o.block === k && !o.echo)) sc.words.push({ word: e.word, block: k, echo: true });
  }
  return sc;
}

/** Continuous depth (blocks fallen) at t. Spring landings, anticipation, a hard landing on the stop. */
export function stackPos(t: number, S: StackScore): number {
  let p = 0;
  // Dead stop: once "near" lands, every earlier spring is frozen where it was.
  const tb = Math.min(t, S.near);
  for (const s of S.steps) {
    const dt = tb - s.t;
    if (s.kind === 'stop') {
      const a0 = s.t - 0.16;
      if (t >= s.t) p += 1; else if (t > a0) p += ease.inQuad((t - a0) / 0.16);
      continue;
    }
    if (dt > 0) p += LEAD + (1 - LEAD) * clamp(springStep(dt, 3.4, 0.72), 0, 1.08);
    else if (dt > -0.22) p += LEAD * ease.inQuad((dt + 0.22) / 0.22);
  }
  // instrumental intro: a slow drift down the first block
  p += 0.35 * ease.inOutCubic(clamp((t - S.start) / Math.max(0.1, S.down - S.start)));
  return p;
}

export type Phase = 'shaft' | 'down' | 'quiet' | 'elevator' | 'stop';
export function stackPhase(t: number, S: StackScore): { id: Phase; t0: number } {
  const first = S.steps[0]!.t;
  const quietStep = S.steps.find((s) => s.t >= S.quiet - 0.25)?.t ?? S.quiet;
  const frameStep = S.steps.find((s) => s.t >= S.frame - 0.25)?.t ?? S.frame;
  if (t >= S.near) return { id: 'stop', t0: S.near };
  if (t >= frameStep) return { id: 'elevator', t0: frameStep };
  if (t >= quietStep) return { id: 'quiet', t0: quietStep };
  if (t >= first - 0.22) return { id: 'down', t0: first - 0.22 };
  return { id: 'shaft', t0: S.start };
}

/** Landing pulse (decays after each beat step; 0 once stopped). */
export function landPulse(t: number, S: StackScore): number {
  let v = 0;
  for (const s of S.steps) if (s.kind === 'beat' && t >= s.t) v = Math.max(v, Math.pow(0.5, (t - s.t - 0.06) / 0.09) * (t > s.t + 0.06 ? 1 : 0));
  return Math.min(1, v);
}
