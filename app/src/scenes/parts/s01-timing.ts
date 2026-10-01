// Group A landmarks: resolved editorial cuts, and word-aligned stamp onset.
import type { AudioData } from '../../engine/audio';
import { Lyrics } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import { afterBeats, beatsSince, span, wordTime } from '../../kit/time';
import board from '../../../../storyboard/shots.json';
import { HANDOFF } from '../../kit/handoff';

export interface OpeningTimes {
  start: number; welcome: number; ping: number; screen: number;
  issue: number; attachment: number; end: number; bug: number;
}

export function openingTimes(audio: AudioData, lyrics: Lyrics): OpeningTimes {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
  const cut = (id: string) => shots.find(s => s.id === id)!.start;
  return {
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
/** The final output frame reaches the shared cursor before the cut. */
export function handoffOut(t: number, audio: AudioData, T: OpeningTimes) {
  const k = ease.inOutCubic(span(t, afterBeats(audio, T.ping, -1), T.ping - 1 / 60));
  return { x: lerp(952, HANDOFF.cursor01.x, k), y: lerp(619, HANDOFF.cursor01.y, k), h: lerp(34, HANDOFF.cursor01.h, k) };
}
export function bootBounds(audio: AudioData, t: number, T: OpeningTimes) {
  const s = bootState(audio, t, T);
  // A1's whole-body breathing offset is used in both the draw and the measured box.
  const dy = Math.floor(audio.beatAt(t) / 2) % 2;
  return { dominant: { ...WELCOME_BOX }, clawd: { x: BOOT_CLAWD.x, y: BOOT_CLAWD.y + dy * BOOT_CLAWD.px,
    w: 16 * BOOT_CLAWD.px, h: 5 * BOOT_CLAWD.px }, revealed: s.pixels };
}
