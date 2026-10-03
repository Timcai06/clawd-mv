// C-group landmarks come from the edit, vocal alignment and measured percussion.
// These pure functions are shared by both shots and by the nonvisual acceptance tests.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Line } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import boardJSON from '../../../../storyboard/shots.json';
import { HANDOFF } from '../../kit/handoff';

export interface CTimes {
  todo: number; checksCut: number; keyboard: number; dive: number; end: number;
  plan: Line; claws: Line;
  checks: number[]; checkWords: number[];
  rowStarts: number[]; rowEnds: number[];
  land: number; launch: number; arrive: number;
}

export function resolveCTimes(audio: AudioData, lyrics: Lyrics): CTimes {
  const shots = resolveStoryboard(boardJSON as Storyboard, lyrics, audio).shots;
  const cut = (id: string) => shots.find((s) => s.id === id)!.start;
  const plan = lyrics.get('Read the code');
  const claws = lyrics.get('Claws on the keys');
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
  const word = (line: Line, text: string) => line.words.find((w) => norm(w.w) === norm(text))!;
  const checkWords = plan.words.filter((w) => norm(w.w) === 'check').map((w) => w.start);
  const snare = audio.events('snare', afterBeats(audio,cut('S06-2'),-0.6), cut('S07-1'));
  const checks: number[] = [];
  for (const vocal of checkWords) {
    // Use distinct measured snares, in order. The third vocal falls between two hits.
    const prev=checks.at(-1);
    const candidates = snare.filter(([t]) => prev===undefined || t > afterBeats(audio,prev,0.45));
    const nearest = candidates.reduce<[number, number] | undefined>((a, b) =>
      !a || Math.abs(b[0] - vocal) < Math.abs(a[0] - vocal) ? b : a, undefined);
    checks.push(nearest?.[0] ?? vocal);
  }
  const keyboard = cut('S07-1'), dive = cut('S07-2'), end = cut('S08-1');
  const land = audio.beats.find((t) => t >= afterBeats(audio,keyboard,0.45)) ?? afterBeats(audio, keyboard, 1);
  const launch = afterBeats(audio, dive, 0.55);
  // Arrive on the final measured beat, then hold the cursor for the chorus pickup.
  const arrive = audio.beats.filter((t) => t < afterBeats(audio,end,-0.1)).at(-1) ?? afterBeats(audio, end, -0.5);
  return {
    todo: cut('S06-1'), checksCut: cut('S06-2'), keyboard, dive, end, plan, claws,
    checks, checkWords,
    rowStarts: [plan.start, word(plan, 'write').start, word(plan, 'plan').end],
    rowEnds: [word(plan, 'code').end, word(plan, 'plan').end, afterBeats(audio,checks[0]!,-0.06)],
    land, launch, arrive,
  };
}

export function todoState(audio: AudioData, t: number, T: CTimes) {
  const rows = T.rowStarts.map((s, i) => span(t, s, T.rowEnds[i]!));
  const checks = T.checks.map((s) => ease.outCubic(span(t, s, afterBeats(audio, s, 0.27))));
  const strikes = T.checks.map((s) => ease.inOutCubic(span(t, afterBeats(audio, s, 0.28), afterBeats(audio, s, 0.7))));
  let active = -1;
  T.checks.forEach((s, i) => { if (t >= s) active = i; });
  const pulse = active < 0 ? 0 : Math.pow(0.5, Math.max(0, beatsSince(audio, t, T.checks[active]!)) / 0.16);
  return { rows, checks, strikes, active, pulse, completed: checks.filter((p) => p >= 1).length };
}

export function keyboardState(audio: AudioData, t: number, T: CTimes) {
  const fall = ease.inCubic(span(t, T.keyboard, T.land));
  const landing = t >= T.land ? Math.pow(0.5, beatsSince(audio, t, T.land) / 0.16) : 0;
  const back=T.claws.words.at(-1)!;
  const dive = ease.inCubic(span(t,back.start,T.end-1/60));
  const settle = ease.outExpo(span(t, T.dive, T.launch));
  return { fall, landing, dive, settle, wave: audio.beatAt(t),
    typing: t >= T.claws.start, cursorOnly: false,
    altitude: lerp(9, 0, fall),
    camera: {
      x: lerp(lerp(1.5, 3.8, settle), 6.05, dive),
      y: lerp(lerp(18, 6.8, settle), 1.14, dive),
      z: lerp(lerp(12.4, 4.8, settle), 0.8, dive),
      targetX: lerp(lerp(0, 5.0, settle), 6.05, dive),
      targetY: lerp(0, 0.48, dive),
      targetZ: lerp(0, -0.85, dive),
      fov: lerp(42, 30, dive),
    },
  };
}

/** Uniform per-character intervals inside aligned words, including intervening spaces. */
export function lyricCharTimes(line: Line): [number, number][] {
  return line.words.flatMap((w, i) => {
    const n = Array.from(w.w).length;
    const chars: [number, number][] = Array.from({ length: n }, (_, j) =>
      [lerp(w.start, w.end, j / n), lerp(w.start, w.end, (j + 1) / n)]);
    if (i < line.words.length - 1) chars.push([w.end, w.end]);
    return chars;
  });
}

// V3 keeps the front-elevation sheet registered (no zoom impulses changing its
// measured bounding boxes). The pen moves; the paper and large headline do not.
export const TODO_ROWS = [
  { x: 632, y: 559, size: 78, box: { x: 482, y: 502, w: 72, h: 72 } },
  { x: 632, y: 703, size: 78, box: { x: 482, y: 644, w: 72, h: 72 } },
  { x: 740, y: 962, size: 128, box: { x: 482, y: 838, w: 156, h: 150 } },
] as const;

export function checkHeadline(t: number, T: CTimes) {
  const i = T.checkWords.filter(at => at <= t).length - 1;
  if (i < 0) return { born: 0, weight: 300 };
  const at = T.checkWords[i]!;
  return { born: Math.min(1, (t - at) / 0.11), weight: lerp([300, 600, 900][Math.max(0,i-1)]!, [300, 600, 900][i]!, ease.outCubic(span(t, at, T.plan.words.filter(w => w.w.toLowerCase().startsWith('check'))[i]!.end))) };
}

export function handoffIn(t: number, audio: AudioData, T: CTimes) {
  const k = ease.inOutCubic(span(t,T.todo,afterBeats(audio,T.todo,1)));
  return { x0: HANDOFF.strike05.x0, x1: HANDOFF.strike05.x1, y: lerp(HANDOFF.strike05.y,540,k) };
}

/** Cursor's lower-left tip, exactly the point received by S07's first lit key. */
export function handoffOut(t: number, audio: AudioData, T: CTimes) {
  const k = ease.inOutCubic(span(t,afterBeats(audio,T.keyboard,-1),T.keyboard));
  const third = span(t,T.checkWords[2]!,afterBeats(audio,T.checkWords[2]!,1));
  return { x: lerp(lerp(550,671,third),HANDOFF.pen06.x,k), y: lerp(lerp(944,809,third),HANDOFF.pen06.y,k) };
}

export function todoLayout(audio: AudioData, t: number, T: CTimes) {
  // As in kf-S06: a 40% cropped header, a vertical rule, then three ruled rows.
  return { title: { x: -55, y: -62, w: 2040, h: 526 },
    sheet: { x: 424, y: 460, w: 1496, h: 620 }, rows: TODO_ROWS,
    clawd: { x: 710, y: 762, px: 9.4 }, pen: handoffOut(t,audio,T), strike: handoffIn(t,audio,T) };
}
