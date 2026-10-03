// S08 score: editorial anchors and immutable press events, never a render-call clock.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Word } from '../../engine/lyrics';
import { Voice } from '../../kit/lyric-moves';
import { letterTimes, layoutPath, runInkBounds } from '../../kit/pathtext';
import { afterBeats } from '../../kit/time';
import { varRun, type Axes } from '../../kit/vartype';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import board from '../../../../storyboard/shots.json';

export function commitScore(audio: AudioData, lyrics: Lyrics) {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots.filter(s => s.scene === 'S08');
  const voice = new Voice(lyrics, audio);
  const first = voice.line('I need one more commit', 1), second = voice.line('I need one more commit', 2);
  const brackets = voice.line('Every bracket’s gonna fit'), taps = voice.line('Tap-tap-tapping, never quit');
  const machine = voice.line('’Cause it works on my machine');
  const at = (i: number) => shots[i]!.start;
  return {
    shots, first, second, bracketLine: brackets, tapLine: taps, machineLine: machine,
    start: at(0), i1: at(0), hit1: at(1), mit1: at(1), brackets: at(2), brk: at(2), fit: at(3),
    taps: [at(4), at(5), at(6)], tap1: at(4), tap2: at(5), tapping: at(6), quit: at(7),
    pick2: at(8), i2: at(8), hit2: at(9), mit2: at(9), works: at(10), machine: at(11),
    end: shots.at(-1)!.end,
  };
}
export type CommitScore = ReturnType<typeof commitScore>;
export type PressKind = 'giant' | 'commit' | 'letter' | 'tap' | 'bracket' | 'word';
export interface PressEvent {
  id: string; text: string; word: Word; tp: number; approach: number;
  x: number; z: number; rot: number; capH: number; axes: Axes; ink: 'ink' | 'clay' | 'paper';
  kind: PressKind; times: number[]; width: number; baselineX: number; baselineZ: number;
  leg?: number; pair?: number; side?: -1 | 1;
}
export const COMMIT_CAP = 3;
export const LYRIC_CAP = 1.6;
export const TAP_TEXT = 'TAP-TAP-TAPPING';

/** Keep thirteen letter anchors; insert the two hyphens between their neighbours.
 * kit/letterTimes intentionally attaches punctuation to its preceding letter. */
export function tapLetterTimes(word: Word): number[] {
  const times = letterTimes({ ...word, w: TAP_TEXT }, { spread: 1, maxSpan: 2.25 }).map(g => g.t0);
  return times.map((t, i) => TAP_TEXT[i] === '-' ? (t + times[i + 1]!) / 2 : t);
}

export function paperTravel(audio: AudioData, t: number, T: CommitScore): number {
  const b0 = audio.beatAt(T.quit), b1 = audio.beatAt(afterBeats(audio, T.i2, -0.5));
  const b = audio.beatAt(t), forwardSpan = b1 - b0;
  if (b <= b0) return 0;
  // Integral of a cubic speed ramp to six units/beat.
  if (b <= b1) return -1.5 * forwardSpan * ((b - b0) / forwardSpan) ** 4;
  const returnSpan = audio.beatAt(T.mit2) - b1;
  if (t >= T.mit2) return 0;
  // Cubic Hermite return: +6 units/beat at reversal, zero at register, exact origin.
  const u = (b - b1) / returnSpan, initial = -1.5 * forwardSpan;
  return (2*u**3 - 3*u*u + 1)*initial + (u**3 - 2*u*u + u)*returnSpan*6;
}

export function pressEvents(audio: AudioData, lyrics: Lyrics, T = commitScore(audio, lyrics), voice = new Voice(lyrics, audio)): PressEvent[] {
  const events: PressEvent[] = [];
  const add = (word: Word, text: string, tp: number, x: number, z: number, capH: number, kind: PressKind,
    extra: Partial<PressEvent> = {}) => {
    const axes = { ...voice.form(word, word.end).axes, ...(kind === 'commit' || kind === 'bracket' ? { wght: 900 } : {}) };
    if (word === T.first.words[0] || word === T.second.words[0]) axes.wght = 900;
    const run = varRun(text, 100, extra.axes ?? axes), ink = runInkBounds(run), scale = capH / run.capH;
    const width = (ink.x1 - ink.x0)*scale;
    events.push({ id: `${kind}-${events.length}`, word, text, tp, approach: 0.14, x,
      z: z-paperTravel(audio,tp,T), rot: 0, capH, axes, kind, width,
      baselineX: -width/2-ink.x0*scale, baselineZ: -(ink.y0+ink.y1)*scale/2,
      ink: voice.isStressed(word) ? 'clay' : 'ink',
      times: letterTimes({ ...word, w: text }).map(g => g.t0), ...extra });
  };
  const positions = [[0,0],[-14,-6],[9,-8],[-6,5]], positions2 = [[12,4],[-10,7],[4,-9],[-15,2]];
  for (const [repeat, line] of [T.first,T.second].entries()) {
    line.words.slice(0,4).forEach((word,i) => {
      const [x,z] = (repeat ? positions2 : positions)[i]!;
      const capH=repeat ? [0.5,0.4,3.1,0.3][i]! : i === 0 ? 6 : 3.1;
      add(word,word.w.toUpperCase(),word.start,x!,z!,capH,'giant',
        { rot: (repeat ? -1 : 1)*[0,-0.05,0.04,-0.02][i]!, ink: i === 0 ? 'clay' : 'ink',
          times:Array.from(word.w,() => word.start) });
    });
    const word = line.words.at(-1)!;
    add(word,'COMMIT',repeat ? T.mit2 : T.mit1,repeat ? 0.06*COMMIT_CAP : 0,repeat ? 0.04*COMMIT_CAP : 0,COMMIT_CAP,'commit',
      { approach: (repeat ? T.mit2 : T.mit1)-word.start, rot: repeat ? -0.006 : 0, ink: 'paper',
        times:Array.from('COMMIT',() => repeat ? T.mit2 : T.mit1) });
  }
  const commit = events.find(e => e.kind === 'commit')!;
  const cap = COMMIT_CAP*1.15;
  for (let k = 0; k < 3; k++) for (const side of [-1,1] as const) {
    const text = ['()','{}','[]'][k]![side === -1 ? 0 : 1]!;
    const word = T.bracketLine.words[1]!;
    add(word,text,afterBeats(audio,T.brk,k),side*(commit.width/2+1.25+k*1.5),0,cap,'bracket',
      { pair: k, side, approach: afterBeats(audio,T.brk,k)-afterBeats(audio,T.brk,k-0.75), ink: 'ink', axes: { wdth: 100,wght: 900 } });
  }
  const row = (words: Word[], z: number, kind: PressKind) => {
    // Reserve the largest lyric cap in the row; individual physical caps are
    // solved against the actual press-time camera by printingWorld.
    const cap=1.5,layout = layoutPath(words,{ capH:cap, axes: w => voice.form(w,w.end).axes, upper: true });
    for (const g of layout.glyphs) add(g.word,g.ch,g.t0,-layout.s1/2+g.s+g.w/2,z,cap,kind,
      { approach: 0.08, ink: 'ink', times: [g.t0],baselineX:-g.w/2,baselineZ:cap/2 });
  };
  row(T.bracketLine.words,3.6,'letter');
  const tap = T.tapLine.words[0]!, tapRun = varRun(TAP_TEXT,100,voice.form(tap,tap.end).axes);
  const tapSlot=2.2,s = tapSlot/tapRun.capH, tapWidth = tapRun.width*s;
  tapLetterTimes(tap).forEach((tp,i) => {
    const g = tapRun.glyphs[i]!;
    add(tap,g.ch,tp,-tapWidth/2+(g.x+g.adv/2)*s,10,tapSlot,'tap',
      { approach: 0.05, times: [tp], leg: [0,2,1,3][i%4]!,baselineX:-g.adv*s/2,baselineZ:tapSlot/2 });
  });
  for (const [i,word] of T.tapLine.words.slice(1).entries()) add(word,word.w.toUpperCase(),word.start,i ? 7 : -7,12.2,LYRIC_CAP,'word');
  for (const [i,word] of T.machineLine.words.slice(0,3).entries()) add(word,word.w.toUpperCase(),i === 2 ? word.end : word.start,[-13,-5,5][i]!,8,LYRIC_CAP,'word',
    { ink: 'ink', approach: i === 2 ? word.end-word.start : 0.14 });
  return events.sort((a,b) => a.tp-b.tp || a.id.localeCompare(b.id));
}

export function bracketTarget(e: PressEvent, t: number, T: CommitScore) {
  const fit = T.bracketLine.words.at(-1)!.start;
  const gap = e.pair === 2 && t < fit ? 0.6*(1-Math.max(0,Math.min(1,(t-e.tp)/(fit-e.tp)))) : 0;
  return { x: e.x+(e.side ?? 1)*gap, z: e.z };
}
