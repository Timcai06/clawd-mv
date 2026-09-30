// E-group score: resolve the editorial source once, never duplicate song seconds.
import type { AudioData } from '../../engine/audio';
import { Lyrics, type Line } from '../../engine/lyrics';
import { F, font, glyphX, plain } from '../../engine/type';
import { ease, lerp } from '../../engine/util';
import { css, type ThemeKey } from '../../theme';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { resolveStoryboard, type Storyboard, type ResolvedShot } from '../../storyboard';
import board from '../../../../storyboard/shots.json';

export function sceneScore(audio: AudioData, lyrics: Lyrics, scene: string): ResolvedShot[] {
  return resolveStoryboard(board as Storyboard, lyrics, audio).shots.filter((s) => s.scene === scene);
}

export interface ChorusScore {
  shots: ResolvedShot[];
  start: number; hit1: number; fixes: number; tests: number;
  pickup2: number; hit2: number; split: number; collision: number; end: number;
  clayEnd1: number; clayEnd2: number;
}

export function chorusScore(audio: AudioData, lyrics: Lyrics): ChorusScore {
  const shots = sceneScore(audio, lyrics, 'S13');
  const at = (i: number) => shots[i]!.start;
  // Return to INK on a measured downbeat, including the very short second impact shot.
  const clayEnd = (hit: number) => audio.downbeats.find((t) => t > hit + 0.08) ?? afterBeats(audio, hit, 1);
  return { shots, start: at(0), hit1: at(1), fixes: at(2), tests: at(3), pickup2: at(4),
    hit2: at(5), split: at(6), collision: at(7), end: shots.at(-1)!.end,
    clayEnd1: clayEnd(at(1)), clayEnd2: clayEnd(at(5)) };
}

export interface ChorusState {
  kind: 'ink' | 'clay'; frozen: boolean; clock: number; impact: number;
  second: boolean; rowCount: number; scroll: number; testMode: boolean;
  split: boolean; crush: number; eject: number;
}

/** The waterfall clock stops during pickups; background fibres and the cursor stay alive. */
export function chorusState(audio: AudioData, t: number, T: ChorusScore): ChorusState {
  const frozen = t < T.hit1 || (t >= T.pickup2 && t < T.hit2);
  const clock = t < T.hit1 ? T.start : frozen ? T.pickup2 : t;
  const b = Math.max(0, beatsSince(audio, clock, T.hit1));
  const last = t >= T.hit2 ? T.hit2 : T.hit1;
  const impact = t < last ? 0 : Math.pow(0.5, beatsSince(audio, t, last) / 0.22);
  const clay = (t >= T.hit1 && t < T.clayEnd1) || (t >= T.hit2 && t < T.clayEnd2);
  // A commit arrives per grid beat; the second accent forces an overflow of the whole log.
  const rowCount = t < T.hit1 ? 0 : 1 + Math.floor(b + 1e-6) + (t >= T.hit2 ? 24 : 0);
  const whole = Math.floor(b + 1e-6), phase = b - whole;
  const scroll = whole + ease.outExpo(span(phase, 0, 0.42));
  const crush = ease.inExpo(span(t, T.collision, afterBeats(audio, T.collision, 0.42)));
  return { kind: clay ? 'clay' : 'ink', frozen, clock, impact, second: t >= T.hit2,
    rowCount, scroll, testMode: t >= T.tests && t < T.pickup2,
    split: t >= T.split, crush, eject: ease.outCubic(span(t, afterBeats(audio, T.collision, 0.35), T.end)) };
}

/** Unique, seek-independent commit identifiers; no frame counters or random mutable state. */
export function commitId(i: number): string {
  return ((Math.imul(i + 1, 0x45d9f3b) ^ 0x8c4e1f0) >>> 0).toString(16).padStart(8, '0').slice(0, 7);
}

export function machineLine(lyrics: Lyrics, t: number, from: number, to: number): Line | null {
  const line = lyrics.lastLine(t);
  return line && line.start >= from && line.start < to && t < line.end + 0.2 ? line : null;
}

/** A single kerned run with word wipes. The caller supplies its in-world placement. */
export function inscribe(c: CanvasRenderingContext2D, line: Line, t: number, x: number, y: number,
  size: number, width: number, dim: ThemeKey = 'paper', sung: ThemeKey = 'clay', mono = false) {
  const text = mono ? plain(line.text) : line.text;
  const family = mono ? F.mono(500) : F.archivo(width, 700);
  c.save(); c.font = font(family, size); c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillStyle = css(dim, 0.28); c.fillText(text, x, y);
  let cursor = 0;
  for (const word of line.words) {
    const token = mono ? plain(word.w) : word.w;
    const from = text.indexOf(token, cursor);
    if (from < 0) continue;
    cursor = from + token.length;
    const p = Lyrics.wordProgress(word, t);
    if (p <= 0) continue;
    const a = glyphX(text, from, family, size), b = glyphX(text, cursor, family, size);
    c.save(); c.beginPath(); c.rect(x + a, y - size, (b - a) * p, size * 1.3); c.clip();
    c.fillStyle = css(sung); c.fillText(text, x, y); c.restore();
  }
  c.restore();
}

export function label(c: CanvasRenderingContext2D, text: string, x: number, y: number,
  size = 18, alpha = 1, color: ThemeKey = 'paper') {
  c.font = font(F.mono(500), size); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = css(color, alpha); c.fillText(text, x, y);
}

export const mix = (a: number, b: number, p: number) => lerp(a, b, ease.inOutCubic(p));
