// World-attached typography plans and projection measurements; no DOM required.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Word } from '../../engine/lyrics';
import { ease, hash } from '../../engine/util';
import { Voice } from '../../kit/lyric-moves';
import { span } from '../../kit/time';
import { layoutPath, path3, pathAt, writeHead, type PathLayout, type Path3 } from '../../kit/pathtext';
import { Rig, p3, type P3 } from '../../kit/rig';
import { varRun, type Axes } from '../../kit/vartype';
import { implosionAt, type ChorusScore } from './s13-score';
import { BASE_SLABS, WORD_SLOTS, SLAB, cameraAt, collapsePoint, onSlab, slabPose, topIndex,
  wallDepth, sideWallAt, clawdAt, tailTravel, entryPrim, exitPrim, fitsJump } from './s13-world';

export interface PrefixPlan { word: Word; second: boolean; slot: number; capH: number; axes: Axes; width: number; layout: PathLayout }
export interface PlanePlan { word: Word; carrier: 'fix' | 'local' | 'ci'; event: number; x: number; y: number; capH: number; axes: Axes; width: number; layout: PathLayout }
export interface PathPlan { words: Word[]; kind: 'and' | 'tests'; row: number; layout: PathLayout }
export function lyricPlans(T: ChorusScore, voice: Voice) {
  const metrics = (word: Word, capH: number) => {
    const axes = voice.form(word, word.end).axes, run = varRun(word.w.toUpperCase(), 100, axes);
    return { axes, width: run.width * capH / run.capH,
      layout: layoutPath([word], { capH, axes: w => voice.form(w, w.end).axes, upper: true }) };
  };
  const prefixes: PrefixPlan[] = [0, 3].flatMap((li, n) => T.lines[li]!.words.slice(0, 4).map((word, slot) => {
    const capH = n ? 0.65 : 2.4;
    return { word, second: !!n, slot, capH, ...metrics(word, capH) };
  }));
  const planes: PlanePlan[] = [];
  T.slabs.forEach((s, event) => {
    if (s.kind !== 'fix') return;
    let x = -1.8; // The left 1.4 units are reserved for the machine hash on the same face.
    for (const word of s.words) {
      const m = metrics(word, 0.36);
      planes.push({ word, carrier: 'fix', event, x, y: 0, capH: 0.36, ...m }); x += m.width + 0.16;
    }
  });
  T.lines[4]!.words.forEach((word, i) => {
    const local = i < 3;
    planes.push({ word, carrier: local ? 'local' : 'ci', event: -1, x: local ? 9 : -14.2,
      y: 3 - (local ? i : i - 3) * 1.4, capH: 0.8, ...metrics(word, 0.8) });
  });
  const paths: PathPlan[] = [
    ...[1, 3].map((index, row): PathPlan => ({ words: [T.lines[1]!.words[index]!], kind: 'and', row,
      layout: layoutPath([T.lines[1]!.words[index]!], { capH: 0.36, axes: w => voice.form(w, w.end).axes, upper: true }) })),
    ...[T.lines[2]!.words.slice(0, 3), T.lines[2]!.words.slice(3)].map((words, row): PathPlan => ({
      words, kind: 'tests', row, layout: layoutPath(words, { capH: 0.7, axes: w => voice.form(w, w.end).axes, upper: true, space: 0.24 }) })),
  ];
  return { prefixes, planes, paths };
}
export function prefixPose(audio: AudioData, t: number, p: PrefixPlan, T: ChorusScore, rig: Rig) {
  const descent = 6 * (1 - ease.inQuad(span(t, p.word.start - 0.1, p.word.start)));
  if (p.second) {
    const index = topIndex(T.pickup2 - 1e-6, T) - p.slot;
    const slab = slabPose(audio, t, index, T, rig);
    return { at: onSlab(slab, p3(-p.width / 2, -p.capH / 2, SLAB.d / 2 - 0.08 + descent)),
      yaw: slab.yaw, spin: 0, visible: t >= p.word.start, scaleX: slab.scaleX };
  }
  const hit = WORD_SLOTS[p.slot]!, flight = Math.max(0, t - T.hit1), seed = p.word.gi;
  return { at: p3(hit.x + (hash(seed, 11) - 0.5) * 5 * flight,
    hit.y - 10 * flight * flight, wallDepth(hit.x, hit.y, t, T) + descent + flight),
    yaw: (hash(seed, 12) - 0.5) * flight, spin: (hash(seed, 13) - 0.5) * 5 * flight,
    visible: t >= p.word.start, scaleX: 1 };
}
export function planePose(audio: AudioData, t: number, p: PlanePlan, T: ChorusScore, rig: Rig) {
  if (p.carrier === 'fix') {
    const slab = slabPose(audio, t, BASE_SLABS + p.event, T, rig);
    return { at: onSlab(slab, p3(p.x, p.y, SLAB.d / 2 + 0.015)), yaw: slab.yaw, scaleX: slab.scaleX };
  }
  const wall = sideWallAt(t, p.carrier === 'local', T);
  return { at: p3(wall.x + p.x, wall.y + p.y, wall.z + 0.76), yaw: 0, scaleX: 1 };
}
export function pathFor(audio: AudioData, t: number, p: PathPlan, T: ChorusScore, rig: Rig, anchor?: P3): Path3 {
  const at = p.kind === 'and' ? p.words[0]!.start : Math.min(t, T.pickup2 - 1e-6);
  const index = topIndex(at, T), slab = slabPose(audio, t, index, T, rig);
  const y = slab.height / 2 + 0.02, z = p.kind === 'tests' ? (p.row ? 1 : -0.75) : 0.9;
  const L = p.layout.s1, x = -L / 2;
  const points = [onSlab(slab, p3(x, y, z)), onSlab(slab, p3(x + L, y, z))];
  return path3(anchor ? points.map(q => collapsePoint(q, t, T, anchor)) : points);
}
export function cursorAt(audio: AudioData, t: number, T: ChorusScore, voice: Voice, plans: ReturnType<typeof lyricPlans>, P14: { x: number; y: number }) {
  const rig = new Rig(); rig.set(cameraAt(audio, t, T));
  if (t <= T.start + 1 / 60) return { x: CUT_CURSOR_X, y: 540, r: 8 };
  if (t >= T.collision + 0.2) return { ...P14, r: 8 };
  const path = plans.paths.find(p => t >= p.words[0]!.start && t < p.words.at(-1)!.end);
  if (path) {
    const p = pathAt(pathFor(audio, t, path, T, rig), writeHead(path.layout.glyphs, t));
    const jump = path.words.some(w => w.gi === T.fits.gi) ? fitsJump(audio, t, path.layout.glyphs.filter(g => t >= g.t0).length - 1, T) : 0;
    const q = rig.proj(p.x, p.y + jump, p.z)!; return { x: q.x, y: q.y, r: 8 };
  }
  const prefix = plans.prefixes.find(p => t >= p.word.start && t < p.word.end);
  if (prefix) {
    const pose = prefixPose(audio, t, prefix, T, rig);
    const q = rig.proj(pose.at.x + writeHead(prefix.layout.glyphs, t), pose.at.y, pose.at.z)!;
    return { x: q.x, y: q.y, r: 8 };
  }
  const plane = plans.planes.find(p => t >= p.word.start && t < p.word.end);
  if (plane) {
    const pose = planePose(audio, t, plane, T, rig), form = voice.form(plane.word, t);
    const q = rig.proj(pose.at.x + writeHead(plane.layout.glyphs, t) * form.axes.wdth / plane.axes.wdth, pose.at.y, pose.at.z)!;
    return { x: q.x, y: q.y, r: 8 };
  }
  const slab = slabPose(audio, t, topIndex(t, T), T, rig);
  const p = onSlab(slab, p3(0, slab.height / 2, 1.25)), q = rig.proj(p.x, p.y, p.z)!;
  if (t < T.commit1.start) return { x: CUT_CURSOR_X, y: 540, r: 8 };
  return { x: q.x, y: q.y, r: 8 };
}
const CUT_CURSOR_X = 885;

export function projectedBox(rig: Rig, pts: P3[]) {
  const p = pts.map(q => rig.proj(q.x, q.y, q.z)).filter(q => q !== null);
  if (!p.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...p.map(p => p.x)), y = Math.min(...p.map(p => p.y));
  return { x, y, w: Math.max(...p.map(p => p.x)) - x, h: Math.max(...p.map(p => p.y)) - y };
}
export function gitfallLayout(audio: AudioData, lyrics: Lyrics, t: number, T: ChorusScore, voice = new Voice(lyrics, audio)) {
  const rig = new Rig(); rig.set(cameraAt(audio, t, T));
  return { camera: cameraAt(audio, t, T), slabs: Array.from({ length: BASE_SLABS + T.slabs.length }, (_, i) => slabPose(audio, t, i, T, rig)),
    clawd: clawdAt(audio, t, T, rig), plans: lyricPlans(T, voice), travel: tailTravel(audio, t, T), implosion: implosionAt(t, T) };
}
export function gitfallBounds(audio: AudioData, lyrics: Lyrics, t: number, T: ChorusScore) {
  const rig = new Rig(); rig.set(cameraAt(audio, t, T));
  const voice = new Voice(lyrics, audio), plans = lyricPlans(T, voice);
  return { prefixes: plans.prefixes.map(p => {
    const pose = prefixPose(audio, t, p, T, rig);
    return projectedBox(rig, [0, p.width].flatMap(x => [0, p.capH].flatMap(y => [0, 0.4].map(z => p3(pose.at.x + x, pose.at.y + y, pose.at.z + z)))));
  }) };
}
export const handoffIn = entryPrim;
export const handoffOut = exitPrim;
