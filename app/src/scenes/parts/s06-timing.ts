// C-group landmarks come from the edit, vocal alignment and measured percussion.
// These pure functions are shared by both shots and by the nonvisual acceptance tests.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Line } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import boardJSON from '../../../../storyboard/shots.json';

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
  const snare = audio.events('snare', cut('S06-2') - 0.25, cut('S07-1'));
  const checks: number[] = [];
  for (const vocal of checkWords) {
    // Use distinct measured snares, in order. The third vocal falls between two hits.
    const candidates = snare.filter(([t]) => t > (checks.at(-1) ?? -Infinity) + 0.2);
    const nearest = candidates.reduce<[number, number] | undefined>((a, b) =>
      !a || Math.abs(b[0] - vocal) < Math.abs(a[0] - vocal) ? b : a, undefined);
    checks.push(nearest?.[0] ?? Math.max(audio.nearestBeat(vocal), afterBeats(audio, checks.at(-1) ?? vocal, 1)));
  }
  const keyboard = cut('S07-1'), dive = cut('S07-2'), end = cut('S08-1');
  const land = audio.beats.find((t) => t >= keyboard + 0.2) ?? afterBeats(audio, keyboard, 1);
  const launch = afterBeats(audio, dive, 0.55);
  // Arrive on the final measured beat, then hold the cursor for the chorus pickup.
  const arrive = audio.beats.filter((t) => t < end - 0.05).at(-1) ?? afterBeats(audio, end, -0.5);
  return {
    todo: cut('S06-1'), checksCut: cut('S06-2'), keyboard, dive, end, plan, claws,
    checks, checkWords,
    rowStarts: [plan.start, word(plan, 'write').start, word(plan, 'plan').end],
    rowEnds: [word(plan, 'code').end, word(plan, 'plan').end, checks[0]! - 0.025],
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
  const dive = ease.inOutCubic(span(t, T.launch, T.arrive));
  const settle = ease.outExpo(span(t, T.dive, T.launch));
  return { fall, landing, dive, settle, wave: audio.beatAt(t),
    typing: t >= T.dive, cursorOnly: t >= T.arrive,
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
