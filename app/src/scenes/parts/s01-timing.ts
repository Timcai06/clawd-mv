// Group A landmarks: editorial cuts from the storyboard, impacts from the vocal.
import type { AudioData } from '../../engine/audio';
import { Lyrics } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import { afterBeats, beatsSince, span } from '../../kit/time';
import board from '../../../../storyboard/shots.json';

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
    end: cut('S04-1'), bug: lyrics.findWords('bug')[0]?.start ?? cut('S03-1'),
  };
}

export interface View { x: number; y: number; zoom: number; roll: number }
export const wideView: View = { x: 960, y: 540, zoom: 1, roll: 0 };
export function mixView(a: View, b: View, k: number): View {
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k),
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), k)), roll: lerp(a.roll, b.roll, k) };
}

export function bootState(audio: AudioData, t: number, T: OpeningTimes) {
  const b = Math.max(0, beatsSince(audio, t, T.welcome));
  return {
    frame: span(b, 0, 1.4), pixels: span(b, 0.65, 3.0),
    rows: Array.from({ length: 4 }, (_, i) => span(b, 1.2 + i, 2 + i)),
    view: mixView(wideView, { x: 960, y: 505, zoom: 1.12, roll: 0 }, ease.inOutCubic(span(b, 1.5, 7))),
  };
}

export function notifyState(audio: AudioData, t: number, T: OpeningTimes) {
  const push = ease.inOutCubic(span(t, afterBeats(audio, T.screen, 0.3), T.issue));
  const focus = ease.outExpo(span(t, T.ping, T.screen));
  const close: View = { x: 1330, y: 762, zoom: 1.28, roll: 0 };
  return {
    kind: t < T.ping ? 'ink' as const : 'paper' as const,
    pop: span(t, T.ping, afterBeats(audio, T.ping, 0.65)), push,
    view: mixView(mixView(wideView, close, focus), { x: 1330, y: 762, zoom: 5.8, roll: 0 }, push),
    document: ease.outExpo(span(push, 0.35, 0.75)),
  };
}

export function issueState(audio: AudioData, t: number, T: OpeningTimes) {
  const elapsed = Math.max(0, beatsSince(audio, t, T.bug));
  const push = ease.inOutCubic(span(t, afterBeats(audio, T.attachment, 0.25), T.end));
  return {
    title: span(t, T.issue, afterBeats(audio, T.issue, 1.4)),
    stamp: t >= T.bug, stampScale: 1 + 1.6 * (1 - ease.outExpo(span(elapsed, 0, 0.5))),
    stampLift: t >= T.bug ? 0 : -180,
    impact: t >= T.bug ? Math.pow(0.5, elapsed / 0.15) : 0,
    circle: ease.inOutCubic(span(t, T.attachment, afterBeats(audio, T.attachment, 1.3))),
    view: mixView(wideView, { x: 1008, y: 784, zoom: 2.65, roll: -0.018 }, push),
  };
}
