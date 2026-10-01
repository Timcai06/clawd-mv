// Fixed low-angle projection calibrated from the solid faces in kf-S15.
// Extrusion is expressed as separate top/front/end polygons (not a font outline).
import type { AudioData } from '../../engine/audio';
import * as Clawd from '../../kit/clawd';
import { HANDOFF } from '../../kit/handoff';
import { afterBeats, span } from '../../kit/time';
import { ease, hash, lerp } from '../../engine/util';
import { bounds, spriteBounds, type Point } from './s14-layout';
import type { FTimes } from './s15-f-timing';

export const LYRIC_SIZE = 98;
export const TYPE_LEVELS = { giant: null, lyric: 67.228, label: 20 } as const; // Archivo sCapHeight 686/1000.
export type Face = { points: Point[]; density: number; group: number; slope: number };
const point = (p: number[]): Point => ({ x: p[0]! * 1920 / 1672, y: p[1]! * 1080 / 940 });
const face = (p: number[][], density: number, group = 0, slope = -0.65): Face => ({ points: p.map(point), density, group, slope });

export const SCULPTURE: Face[] = [
  // Upper stroke: its far end deliberately bleeds out of the top and right of the image.
  face([[594,244],[1710,-218],[1835,-174],[725,290]], 0.16),
  face([[725,290],[1835,-174],[1835,-26],[725,436]], 0.68, 0, 0.35),
  face([[594,244],[725,290],[725,436],[594,389]], 0.56, 0, 1.35),
  // Downward stroke joins the same thick tip, with a paper top and engraved front.
  face([[725,290],[844,291],[1770,591],[1645,620]], 0.18),
  face([[725,290],[1645,620],[1770,621],[1770,758],[725,436]], 0.43),
  // Long equal stroke. The shader cuts a jagged gap; both faces keep their thickness.
  face([[431,615],[493,584],[1575,584],[1637,615]], 0.15, 1),
  face([[431,615],[1637,615],[1637,765],[431,765]], 0.51, 1),
  face([[1637,615],[1690,583],[1690,746],[1637,765]], 0.43, 1, 1.25),
];

export const STONES: Face[] = Array.from({ length: 28 }, (_, i) => {
  const x = 906 + (hash(i, 42, 1) - 0.5) * 275;
  const y = 784 - hash(i, 42, 2) * 35;
  const w = 5 + hash(i, 42, 3) * 26, h = 5 + hash(i, 42, 4) * 13;
  return face([[x,y-h],[x+w,y-h*0.65],[x+w*0.7,y+h*0.2],[x-w*0.15,y]], 0.30, 2);
});

export function monumentState(audio: AudioData, t: number, T: FTimes) {
  const reveal = ease.outExpo(span(t, T.s15[2]!, afterBeats(audio, T.s15[2]!, 1)));
  const fracture = ease.outExpo(span(t, T.snip, afterBeats(audio, T.snip, 0.65)));
  const removal = ease.inOutCubic(span(t, T.s15[5]!, afterBeats(audio, T.free, 0.6)));
  const paper = t >= T.s15[5]!;
  const scale = t < T.s15[3]! ? lerp(0.86, 1, reveal) : 1;
  return { reveal, fracture, removal, paper, scale,
    barY: removal * 520, barRoll: removal * 0.28,
    piece: handoffOut(t, audio, T),
  };
}

export function monumentBounds(audio: AudioData, t: number, T: FTimes) {
  const state = monumentState(audio, t, T);
  return bounds(SCULPTURE.flatMap(f => f.points.map(p => {
    const x = p.x - 1040, y = p.y - 780;
    const q = f.group === 1 ? {
      x: 1040 + x * Math.cos(state.barRoll) - y * Math.sin(state.barRoll),
      y: 780 + state.barY + x * Math.sin(state.barRoll) + y * Math.cos(state.barRoll),
    } : p;
    return { x: 1260 + (q.x - 1260) * state.scale, y: 570 + (q.y - 570) * state.scale };
  })), true);
}

export function heroState(audio: AudioData, t: number, T: FTimes) {
  const cutting = t >= T.snip && t < T.s15[5]!;
  // The arm remains extended through the cut shot, then releases on October.
  const pose = Clawd.pose(cutting ? 'A10' : 'A3', {
    beat: cutting ? 1 / 3 : audio.beatAt(t), beat0: 0, p: 0, reach: 3, travel: 0,
  });
  const px = 10.2, cx = 902, cy = 650;
  return { pose, px, cx, cy, box: spriteBounds(pose, cx, cy, px) };
}

/** The incoming shaft rule is also the actual source-comment rule on the first frame. */
export function handoffIn(t: number, audio: AudioData, T: FTimes) {
  const fade = ease.outExpo(span(t, T.s15[0]!, afterBeats(audio, T.s15[0]!, 1)));
  return { ...HANDOFF.line14, clay: 1 - fade };
}

/** A rigid 70×210 stone rotates from a horizontal snip into the next scene's first domino. */
export function handoffOut(t: number, audio: AudioData, T: FTimes) {
  const start = afterBeats(audio, T.s16[0]!, -1);
  const k = ease.outExpo(span(t, start, T.s16[0]!));
  const angle = lerp(-Math.PI / 2, 0, k);
  const cx = lerp(1175, HANDOFF.domino15.x + HANDOFF.domino15.w / 2, k);
  const cy = lerp(395, HANDOFF.domino15.y + HANDOFF.domino15.h / 2, k);
  const w = Math.abs(Math.cos(angle)) * 70 + Math.abs(Math.sin(angle)) * 210;
  const h = Math.abs(Math.sin(angle)) * 70 + Math.abs(Math.cos(angle)) * 210;
  return { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy, angle, visible: t >= start };
}

export function freeState(audio: AudioData, t: number, T: FTimes) {
  const escape = ease.outExpo(span(t, T.free, afterBeats(audio, T.free, 0.75)));
  return { x: lerp(1300, 1815, escape), baseline: lerp(445, 220, escape), roll: lerp(0, -0.25, escape) };
}
