// Group A landmarks: resolved editorial cuts, and word-aligned stamp onset.
import type { AudioData } from '../../engine/audio';
import { Lyrics } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import { afterBeats, beatsSince, span, wordTime } from '../../kit/time';
import board from '../../../../storyboard/shots.json';
import { HANDOFF, lensRect, type Prim } from '../../kit/handoff';
import type { LensView } from '../../kit/lens';

export interface OpeningTimes {
  start: number; welcome: number; ping: number; screen: number;
  issue: number; attachment: number; end: number; bug: number;
  /** When each typed column of "Nine o'clock, a" strikes (the prompt line, stage 9 ②). */
  typed: number[];
}

/** The welcome frame's prompt line: "> " then the typed lyric, Plex Mono (the typed-input voice). */
export const PROMPT = { x: 582, base: 650, size: 56 };
export const PROMPT_ADV = PROMPT.size * 0.6, PROMPT_TEXT_X = PROMPT.x + 2 * PROMPT_ADV;

export function openingTimes(audio: AudioData, lyrics: Lyrics): OpeningTimes {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
  const cut = (id: string) => shots.find(s => s.id === id)!.start;
  // Typed columns: letters spread over each word as in kit/inscribe (80 %, at most 0.7 s); spaces
  // take a column and strike with the next word.
  const typed: number[] = [];
  lyrics.lines[0]!.words.slice(0, 3).forEach((w, i) => {
    const chars = Array.from(w.w), span = Math.min(0.8 * (w.end - w.start), 0.7);
    if (i > 0) typed.push(w.start);
    chars.forEach((_, j) => typed.push(w.start + span * j / chars.length));
  });
  return {
    typed,
    start: cut('S01-1'), welcome: cut('S01-2'), ping: cut('S02-1'),
    screen: cut('S02-2'), issue: cut('S03-1'), attachment: cut('S03-2'),
    end: cut('S04-1'), bug: wordTime(lyrics, "Got a bug report, the weirdest I’ve seen", 'bug')!,
  };
}

export interface View { x: number; y: number; zoom: number; roll: number }
export const wideView: View = { x: 960, y: 540, zoom: 1, roll: 0 };
export function bootState(audio: AudioData, t: number, T: OpeningTimes) {
  const b = Math.max(0, beatsSince(audio, t, T.welcome));
  return {
    frame: span(b, 0, 1.4), pixels: span(b, 0.65, 3.0),
    rows: Array.from({ length: 4 }, (_, i) => span(b, 1.2 + i, 2 + i)),
    view: wideView,
  };
}

// Geometry in logical px, measured from kf-S01 (1672×941). The render consumes these values.
export const WELCOME_BOX = { x: 480, y: 209, w: 960, h: 479 };
export const BOOT_CLAWD = { x: 670, y: 403, px: 36.4 };
/** The terminal cursor: it waits at the prompt, then is the typing head; after "a" it rests on
 *  the shared cursor (C1), reached before the last 0.1 s. */
export function handoffOut(t: number, _audio: AudioData, T: OpeningTimes) {
  const col = T.typed.filter((x) => x <= t).length;
  return { x: PROMPT_TEXT_X + col * PROMPT_ADV, y: HANDOFF.cursor01.y, h: HANDOFF.cursor01.h };
}
export function bootBounds(audio: AudioData, t: number, T: OpeningTimes) {
  const s = bootState(audio, t, T);
  // A14 holds the body still (only the eyes move), so the measured box is the base sprite.
  return { dominant: { ...WELCOME_BOX }, clawd: { x: BOOT_CLAWD.x, y: BOOT_CLAWD.y,
    w: 16 * BOOT_CLAWD.px, h: 5 * BOOT_CLAWD.px }, revealed: s.pixels };
}

// ── C1 (docs/CUTS.md): S01 → S02 on "ping" ────────────────────────────────────────────────────────
/** The shared cursor block (drawCursor's rect at HANDOFF.cursor01) and its centre. */
export const CURSOR01 = { x: HANDOFF.cursor01.x, y: HANDOFF.cursor01.y, w: HANDOFF.cursor01.h * 0.55, h: HANDOFF.cursor01.h };
export const CURSOR01_C = { x: CURSOR01.x + CURSOR01.w / 2, y: CURSOR01.y + CURSOR01.h / 2 };
/** S02's hit zoom on the ping; S01 pushes in to exactly this so the cut is seamless. */
export const PING_ZOOM = 1.14;

/** S01's lens: tight on the lone cursor, a long pull-back as the welcome frame draws, then a push
 *  into the cursor (inCubic over the last two beats, held for the last 0.1 s) to S02's hit zoom. */
export function view01(t: number, audio: AudioData, T: OpeningTimes): LensView {
  const cur = handoffOut(T.start, audio, T), cy = cur.y + cur.h;
  const back = ease.inOutCubic(span(t, afterBeats(audio, T.welcome, -1.5), afterBeats(audio, T.welcome, 3)));
  const p0 = afterBeats(audio, T.ping, -2);
  if (t >= p0) {
    const push = ease.inCubic(span(t, p0, T.ping - 0.1));
    return { zoom: 1 + (PING_ZOOM - 1) * push, fx: CURSOR01_C.x, fy: CURSOR01_C.y };
  }
  return { zoom: lerp(2.6, 1, back), fx: lerp(cur.x + 10, 960, back), fy: lerp(cy - 20, 540, back), ax: 960, ay: 540, rot: 0.02 * (1 - back) };
}
export function exitPrim01(t: number, audio: AudioData, T: OpeningTimes): Prim {
  const c = handoffOut(t, audio, T);
  return { kind: 'rect', ...lensRect(view01(t, audio, T), { x: c.x, y: c.y, w: c.h * 0.55, h: c.h }) };
}
