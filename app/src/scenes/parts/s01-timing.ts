// Group A landmarks: resolved editorial cuts, and word-aligned stamp onset.
import type { AudioData } from '../../engine/audio';
import { Lyrics } from '../../engine/lyrics';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import { beatsSince, span, wordTime } from '../../kit/time';
import board from '../../../../storyboard/shots.json';
import { AudioData as Audio } from '../../engine/audio';
import { Voice } from '../../kit/lyric-moves';
import audioJSON from '../../../../data/audio.json';
import lyricsJSON from '../../../../data/lyrics.json';

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

// The scene and its pure geometry exports read the same measured song data.
export const audio = new Audio(audioJSON as unknown as ConstructorParameters<typeof Audio>[0]);
export const lyrics = new Lyrics(lyricsJSON);
export const T = openingTimes(audio, lyrics);
export const voice = new Voice(lyrics, audio);

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
