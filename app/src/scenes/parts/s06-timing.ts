// C-group landmarks come from the edit, vocal alignment and measured percussion.
// These pure functions are shared by both shots and by the nonvisual acceptance tests.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Line } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import boardJSON from '../../../../storyboard/shots.json';
import { HANDOFF, cam2Point, type Cam2, type Prim } from '../../kit/handoff';

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
    // Distinct measured snares, in order, within 0.3 s of the sung check. Since the cut moved to the
    // line break (docs/CUTS.md, R1) the third check has no snare before the cut: it lands on the next
    // eighth after the previous check, so the three checks accelerate into the cut (R4).
    const prev=checks.at(-1);
    const candidates = snare.filter(([t]) => (prev===undefined || t > afterBeats(audio,prev,0.45)) && Math.abs(t - vocal) < 0.3);
    const nearest = candidates.reduce<[number, number] | undefined>((a, b) =>
      !a || Math.abs(b[0] - vocal) < Math.abs(a[0] - vocal) ? b : a, undefined);
    checks.push(nearest?.[0] ?? afterBeats(audio, prev ?? vocal, 0.5));
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
  // A strike finishes 0.1 s before the cut at the latest (the third check sits an eighth before it).
  const strikes = T.checks.map((s) => {
    const end = Math.min(afterBeats(audio, s, 0.7), T.keyboard - 0.1);
    return ease.inOutCubic(span(t, Math.min(afterBeats(audio, s, 0.28), end - 0.08), end));
  });
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

/** When the plotter finishes check i: 0.4 beat after the sung check, the third one 1 beat after
 *  but never later than 0.1 s before the keyboard cut, where its flick ends at the hand-off point. */
export function checkFinish(audio: AudioData, T: CTimes, i: number, at: number) {
  return i === 2 ? Math.min(afterBeats(audio, at, 1), T.keyboard - 0.1) : afterBeats(audio, at, 0.4);
}
/** Cursor's lower-left tip, exactly the point received by S07's first lit key. */
export function handoffOut(t: number, audio: AudioData, T: CTimes) {
  const k = ease.inOutCubic(span(t,afterBeats(audio,T.keyboard,-1),T.keyboard-0.1));
  const third = span(t,T.checkWords[2]!,checkFinish(audio,T,2,T.checkWords[2]!));
  return { x: lerp(lerp(550,671,third),HANDOFF.pen06.x,k), y: lerp(lerp(944,809,third),HANDOFF.pen06.y,k) };
}

export function todoLayout(audio: AudioData, t: number, T: CTimes) {
  // As in kf-S06: a 40% cropped header, a vertical rule, then three ruled rows.
  return { title: { x: -55, y: -62, w: 2040, h: 526 },
    sheet: { x: 424, y: 460, w: 1496, h: 620 }, rows: TODO_ROWS,
    clawd: { x: 710, y: 762, px: 9.4 }, pen: handoffOut(t,audio,T), strike: handoffIn(t,audio,T) };
}

/** S06's camera. The sheet is filmed, not pinned: a slow push on the pen; a punch toward each box on
 *  its check; an entry settle; and the last beat dives into the pen tip, parking it on screen at
 *  HANDOFF.pen06, where S07's first key lights (C6, docs/CUTS.md). Held for the last 0.1 s. */
export function cam06(audio: AudioData, t: number, T: CTimes): Cam2 {
  const punch=T.checks.reduce((a,at,i)=>a+(t>=at?[0.05,0.07,0.13][i]!*Math.pow(0.5,(t-at)/0.1):0),0);
  const tilt=T.checks.reduce((a,at,i)=>a+(t>=at?[0.012,-0.014,0.02][i]!*Math.pow(0.5,(t-at)/0.14):0),0);
  const drift=ease.inOutQuad(span(t,T.todo,T.keyboard));
  const dive=ease.inCubic(span(t,afterBeats(audio,T.keyboard,-1),T.keyboard-0.1));
  const entry=1-ease.outCubic(span(t,T.todo,afterBeats(audio,T.todo,1.2)));
  const pen=handoffOut(t,audio,T);
  return { zoom: 1+0.14*drift+punch+0.25*entry+1.6*dive, rot: tilt-0.015*entry, fx: pen.x, fy: pen.y,
    ax: lerp(lerp(pen.x,960,0.2*drift),HANDOFF.pen06.x,dive), ay: lerp(lerp(pen.y,540,0.2*drift),HANDOFF.pen06.y,dive)-30*entry };
}
/** C5: the first strike-through, through S06's camera. */
export function entryPrim06(audio: AudioData, t: number, T: CTimes): Prim {
  const k=cam06(audio,t,T),s=handoffIn(t,audio,T),a=cam2Point(k,{x:s.x0,y:s.y}),b=cam2Point(k,{x:s.x1,y:s.y});
  return { kind:'line', x0:a.x, y0:a.y, x1:b.x, y1:b.y, w:2*k.zoom };
}
/** C6: the pen tip on screen. */
export function exitPrim06(audio: AudioData, t: number, T: CTimes): Prim {
  const p=cam2Point(cam06(audio,t,T),handoffOut(t,audio,T));
  return { kind:'point', x:p.x, y:p.y, r:6 };
}
