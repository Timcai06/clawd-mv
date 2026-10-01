// Projected upright test plates + engraved angular fragments. Projection is closed-form,
// not a simulation; the same vertices drive Canvas drawing and the composition tests.
import { hash, lerp } from '../../engine/util';
import type { AudioData } from '../../engine/audio';
import type { X9Times } from '../s09-z-shared';
import { HANDOFF } from '../../kit/handoff';
import { exitBeat, enterBeat, union, spriteBox } from './s09-type';
import * as Clawd from '../../kit/clawd';
export type Point = [number, number];
export const GLASS = { rows: 19, pieces: 8, width: 170, height: 620 };
export function glassTriangles(row: number) {
  const w = GLASS.width, h = GLASS.height;
  const center: Point = [w * (0.32 + hash(row, 11) * 0.36), h * (0.25 + hash(row, 12) * 0.5)];
  const ring: Point[] = [[0, 0], [w * 0.4, 0], [w, 0], [w, h * 0.55],
    [w, h], [w * 0.6, h], [0, h], [0, h * 0.45]];
  return ring.map((p, i) => [center, p, ring[(i + 1) % ring.length]!] as const);
}
/** A row of equal-world-height plates, progressively foreshortened toward the right vanishing point. */
export function plateAt(row: number) {
  const depth = 1 + row * 0.18;
  const x = 76 + 1714 * (row * 0.06 / (1 + row * 0.06)) / (1.08 / 2.08);
  const y = 258 + 610 * (1 - 1 / depth), w = 170 / depth, bottom = 880 + 10 / depth;
  const quad: Point[] = [[x, y], [x + w, y + 64 / depth], [x + w, bottom], [x, bottom + 8 / depth]];
  return { row, x, y, w, h: bottom - y, depth, quad };
}
export function glassShardState(row: number, piece: number, fracture: number) {
  const id = row * 8 + piece, p = plateAt(row);
  const release = Math.max(0, (fracture - row * 0.008) / (1 - row * 0.008));
  return { x: (hash(id, 5) - 0.5) * 220 * release / Math.sqrt(p.depth),
    y: (-120 + hash(id, 6) * 390) * release / Math.sqrt(p.depth),
    z: (hash(id, 7) - 0.5) * release * 80,
    rz: (hash(id, 8) - 0.5) * release * 1.8, release, alpha: 1 };
}
export function glassState(audio: AudioData, t: number, T: X9Times) {
  // A plate's broken lower face stays scattered throughout the shattering shot.
  const fracture = Math.min(1, Math.max(0, (audio.beatAt(t) - audio.beatAt(T.shatter)) / 2.5));
  const plates = Array.from({ length: 19 }, (_, row) => plateAt(row));
  const pose = Clawd.pose('A8', { beat: audio.beatAt(t), beat0: audio.beatAt(T.nineteen), p: fracture });
  return { plates, fracture, dominant: union(plates.flatMap(p => [...p.quad, [p.quad[0]![0] - 9 / p.depth, p.quad[0]![1] + 4] as Point, [p.quad[3]![0] - 9 / p.depth, p.quad[3]![1] + 4] as Point])),
    clawd: { x: 600, y: 914, px: 15, pose }, clawdBox: spriteBox(600, 914, 15, pose) };
}
export function handoffIn(t: number, audio: AudioData, T: X9Times) {
  const p = enterBeat(audio, t, T.wallStart);
  return { x: lerp(HANDOFF.nineteen09.x, 80, p), baseline: lerp(HANDOFF.nineteen09.baseline, 204, p), capH: 140 };
}
export function handoffOut(t: number, audio: AudioData, T: X9Times) {
  const p = exitBeat(audio, t, T.wallEnd);
  return { roll: lerp(0.12, HANDOFF.fall10.roll, p), pxPerBeat: lerp(160, HANDOFF.fall10.pxPerBeat, p) };
}
export function fallTravel(t: number, audio: AudioData, T: X9Times) {
  const b = Math.max(0, audio.beatAt(t) - audio.beatAt(T.wallEnd) + 1);
  // Integral of the cubic velocity ramp: derivative reaches exactly 220px/beat at the cut.
  const u = Math.min(1, b / 0.9);
  const integral = u <= 0.5 ? u ** 4 : u + (1 - u) ** 4 - 0.5;
  return 160 * b + 60 * 0.9 * integral + 60 * Math.max(0, b - 0.9);
}
