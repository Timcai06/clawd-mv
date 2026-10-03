// Musical state for the three blueprint / side-scroll shots. No accumulated animation state.
import type { AudioData } from '../../engine/audio';
import type { Lyrics } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import board from '../../../../storyboard/shots.json';
import { HANDOFF, cam2Point, cam2Rect, mixCam2, type Cam2, type Prim, type Rect } from '../../kit/handoff';
import type { Lyrics as LyricsT } from '../../engine/lyrics';
import { cam06, resolveCTimes } from './s06-timing';
import { clipBox } from './s05-print';

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

// Front elevation in logical pixels. The source ledges are the dominant object; the
// large machine filename is intentionally cropped at the bottom, like kf-S05.
export const SOURCE_LEDGES = [
  { x: -90, y: 433, w: 660, h: 42, depth: 0.22 },
  { x: 150, y: 516, w: 600, h: 64, depth: 0.55 },
  { x: 1290, y: 468, w: 700, h: 70, depth: 0.55 },
  { x: -90, y: 664, w: 1900, h: 120, depth: 1 },
  { x: -70, y: 835, w: 1540, h: 300, depth: 1 },
] as const;

export function platformLayout(audio: AudioData, t: number, T: PlatformTimes) {
  // Register the side scroll at the same 60% shot sample as scripts/compare.ts.
  // v4 motion: one continuous truck to the right across all three shots (slow in, accelerating
  // through "read it all over"), so the strata parallax the whole time instead of three still lenses.
  // It passes through the storyboard frame (offset 0) at the same 60 % sample scripts/compare.ts uses.
  const pan = (u: number) => lerp(-260, 700, ease.inOutQuad(span(u, T.start, T.end))) + 140 * ease.inCubic(span(u, afterBeats(audio, T.end, -2), T.end));
  const offset = pan(t) - pan(T.scroll + (T.end - T.scroll) * 0.6);
  const ledges = SOURCE_LEDGES.map(b => ({ ...b, x: b.x - offset * b.depth }));
  const px = 18.5;
  const incoming = handoffIn(t, audio, T);
  return { ledges, offset, title: { x: -35 - offset, y: 825, w: 1290, h: 320 },
    clawd: incoming, clawdBox: { x: incoming.x, y: incoming.y, w: 16 * incoming.px, h: 5 * incoming.px },
    platformsBox: clipBox({ x: Math.min(...ledges.map(b => b.x)), y: 433,
      w: Math.max(...ledges.map(b => b.x + b.w)) - Math.min(...ledges.map(b => b.x)), h: 702 }),
    px };
}

export function handoffIn(t: number, audio: AudioData, T: PlatformTimes) {
  const k = ease.inOutCubic(span(t, T.start, afterBeats(audio, T.start, 1)));
  // Afterwards Clawd traverses the read platform; register its keyframe position at 60%.
  const anchor = T.scroll + (T.end - T.scroll) * 0.6;
  const walk = t < T.scroll ? 0 : (audio.beatAt(t) - audio.beatAt(anchor)) * 25;
  return { x: lerp(HANDOFF.clawd04.x, 906 + walk, k), y: lerp(HANDOFF.clawd04.y, 566, k), px: lerp(HANDOFF.clawd04.px, 18.5, k) };
}

export function handoffOut(t: number, audio: AudioData, T: PlatformTimes) {
  const k = ease.inOutCubic(span(t, afterBeats(audio, T.end, -1), T.end - 0.1));
  return { x0: lerp(270, HANDOFF.strike05.x0, k), x1: lerp(1020, HANDOFF.strike05.x1, k), y: lerp(712, HANDOFF.strike05.y, k) };
}

/** S05's camera: arrive pushed in on Clawd (S04's push, continued), pull out over 1.5 beats, a punch
 *  on "claws"; the last beat eases into S06's first camera exactly (C5), so the read line's
 *  underline is S06's first strike-through on screen. Held for the last 0.1 s. */
export function cam05(audio: AudioData, lyrics: LyricsT, t: number, T: PlatformTimes): Cam2 {
  const s = platformLayout(audio, t, T);
  const claws = lyrics.get('crack my claws').words.find((x) => /claws/i.test(x.w))!;
  const tIn = ease.outCubic(span(t, T.start, afterBeats(audio, T.start, 1.5)));
  const punch = t >= claws.start ? Math.pow(0.5, (t - claws.start) / 0.09) : 0;
  const fx = lerp(s.clawd.x + 8 * s.clawd.px, 960, tIn), fy = lerp(s.clawd.y, 540, tIn);
  const own: Cam2 = { zoom: lerp(1.45, 1, tIn) + 0.05 * punch, rot: -0.012 * punch, fx, fy, ax: fx, ay: fy };
  const exitK = ease.inCubic(span(t, afterBeats(audio, T.end, -1), T.end - 0.1));
  if (exitK <= 0) return own;
  return mixCam2(own, s06EntryCam(audio, lyrics), exitK);
}
const entryCams = new WeakMap<AudioData, Cam2>();
/** S06's first camera (resolved once per song). */
function s06EntryCam(audio: AudioData, lyrics: LyricsT): Cam2 {
  let k = entryCams.get(audio);
  if (!k) { const T6 = resolveCTimes(audio, lyrics); k = cam06(audio, T6.todo, T6); entryCams.set(audio, k); }
  return k;
}
/** C4: Clawd on S05's first frame (S04 parks its Clawd exactly here). */
export function clawdScreen05(audio: AudioData, lyrics: LyricsT, t: number, T: PlatformTimes): Rect {
  const c = platformLayout(audio, t, T).clawd;
  return cam2Rect(cam05(audio, lyrics, t, T), { x: c.x, y: c.y, w: 16 * c.px, h: 5 * c.px });
}
export function entryPrim05(audio: AudioData, lyrics: LyricsT, t: number, T: PlatformTimes): Prim {
  return { kind: 'rect', ...clawdScreen05(audio, lyrics, t, T) };
}
/** C5: the read line's underline, through S05's camera. */
export function exitPrim05(audio: AudioData, lyrics: LyricsT, t: number, T: PlatformTimes): Prim {
  const k = cam05(audio, lyrics, t, T), s = handoffOut(t, audio, T);
  const a = cam2Point(k, { x: s.x0, y: s.y }), b = cam2Point(k, { x: s.x1, y: s.y });
  return { kind: 'line', x0: a.x, y0: a.y, x1: b.x, y1: b.y, w: 2 * k.zoom };
}
