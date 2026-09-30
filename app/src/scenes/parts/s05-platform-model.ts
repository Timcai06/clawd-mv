// Musical state for the three blueprint / side-scroll shots. No accumulated animation state.
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import board from '../../../../storyboard/shots.json';

export interface PlatformTimes {
  start: number;
  read: number;
  scroll: number;
  end: number;
  drawers: [number, number, number];
}

export function platformTimes(audio: AudioData, lyrics: Lyrics): PlatformTimes {
  const cuts = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
  const at = (id: string) => cuts.find((s) => s.id === id)!.start;
  const read = at('S05-2');
  return { start: at('S05-1'), read, scroll: at('S05-3'), end: at('S06-1'),
    drawers: [read, afterBeats(audio, read, 1), afterBeats(audio, read, 2)] };
}

export const DRAWERS = [
  { label: 'src', x: 500, y: 580, width: 960, source: 'ROOT', parent: -1 },
  { label: 'calendar', x: 740, y: 770, width: 980, source: 'MODULE', parent: 0 },
  { label: 'month.ts', x: 980, y: 960, width: 1220, source: 'SOURCE', parent: 1 },
] as const;

export const HERO_ROWS = [
  { line: 20, x: 650, y: 1160, width: 1830 },
  { line: 22, x: 1450, y: 1390, width: 1860 },
  { line: 36, x: 2310, y: 1190, width: 2140 },
  { line: 37, x: 3300, y: 1430, width: 1690 },
] as const;

export function platformState(audio: AudioData, t: number, T: PlatformTimes) {
  const phase = t < T.read ? 0 : t < T.scroll ? 1 : 2;
  const b = Math.max(0, beatsSince(audio, t, T.start));
  const readB = Math.max(0, beatsSince(audio, t, T.read));
  const scrollB = Math.max(0, beatsSince(audio, t, T.scroll));
  const p = span(t, T.scroll, T.end);
  const travel = ease.inOutCubic(span(p, 0.10, 0.94));
  const walkX = lerp(HERO_ROWS[0].x + 160, HERO_ROWS[3].x + 760, travel);
  const row = Math.min(3, Math.floor(travel * 4));
  const rowP = travel * 4 - row;
  const prev = HERO_ROWS[Math.max(0, row - 1)]!;
  const here = HERO_ROWS[row]!;
  const walkY = lerp(prev.y, here.y, ease.outExpo(span(rowP, 0, 0.35)));
  const drawers = T.drawers.map((at) => ease.outExpo(span(beatsSince(audio, t, at), 0, 0.72)));
  const pull = ease.outExpo(span(b, 2.8, 3.8));
  return {
    phase,
    drawers,
    // Three distinct lenses. Phase changes occur only at the storyboard's measured cuts.
    camX: phase === 0 ? 960 : phase === 1 ? lerp(950, 1240, ease.inOutCubic(span(readB, 0.15, 1.85))) : walkX + 470,
    camY: phase === 0 ? 532 : phase === 1 ? lerp(615, 885, ease.inOutCubic(span(readB, 0.15, 1.85))) : lerp(1190, 1275, travel),
    zoom: phase === 0 ? lerp(2.5, 2.0, pull) : phase === 1 ? 1.02 : 0.89,
    walkX: phase === 0 ? 920 : phase === 1 ? lerp(730, 1290, span(readB, 0, 2)) : walkX,
    walkY: phase === 0 ? 632 : phase === 1 ? lerp(580, 960, ease.inOutCubic(span(readB, 0, 2))) : walkY,
    row,
    readRows: phase === 2 ? row + 1 : 0,
    travel,
    claw: phase === 0 ? span(b, 0, 4) : 0,
    scrollB,
  };
}

export function projectPlatform(x: number, y: number, factor: number, s: ReturnType<typeof platformState>) {
  return {
    x: 960 + (x - s.camX * factor) * s.zoom,
    y: 540 + (y - s.camY * factor) * s.zoom,
  };
}
