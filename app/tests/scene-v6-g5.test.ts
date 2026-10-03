import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { hash } from '../src/engine/util';
import { Voice } from '../src/kit/lyric-moves';
import { SolidText, solidLetterGeometry } from '../src/kit/solidtype';
import { Rig, p3 } from '../src/kit/rig';
import { letterTimes, drawPathText, writeHead, pathAt } from '../src/kit/pathtext';
import { exitEnvelope, CUT, primError } from '../src/kit/handoff';
import { afterBeats } from '../src/kit/time';
import { chorusScore, impactAt, implosionAt, collisionAt } from '../src/scenes/parts/s13-score';
import { BASE_SLABS, SLAB, S13_GLSL, TOP, sinkAt, slabDistance, wallRipple, wallRippleGradient, onSlab,
  cameraAt, slabPose, slabJitter, fitsJump, entryPrim, exitPrim, topIndex, sideWallAt, clawdAt, implosionPoint, collapsePoint, wallDepth, WORD_SLOTS } from '../src/scenes/parts/s13-world';
import { lyricPlans, prefixPose, projectedBox, planePose, pathFor, cursorAt, gitfallLayout } from '../src/scenes/parts/s13-layout';
import { cursorScreenAt } from '../src/scenes/s14-shaft';
import { stackScore } from '../src/scenes/parts/s14-stack';
import { FakeCanvas, withCanvas } from './kit-pathtext.test';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON), voice = new Voice(lyrics, audio);
const T = chorusScore(audio, lyrics), S = stackScore(audio, lyrics), P14 = cursorScreenAt(T.end, S);
const plans = lyricPlans(T, voice);
const rigAt = (t: number) => { const rig = new Rig(); rig.set(cameraAt(audio, t, T)); return rig; };
// Independent scalar translations of S13_GLSL, evaluated with the same constants/uniforms.
// The actual GPU wall uses S13_GLSL; this test checks its mirrored geometry, not a second call to CPU code.
function gpuRipple(p: number[], age: number, hit: number[]) {
  if (age < 0 || age >= 0.3) return 0;
  const r2 = (p[0]! - hit[0]!) ** 2 + (p[1]! - hit[1]!) ** 2, r = Math.sqrt(r2);
  return -0.15 * Math.exp(-r2) * Math.sin(3.141592653589793 * age / 0.3) * Math.sin(8 * r - 28 * age);
}
function gpuBox(p: number[], h: number[]) {
  const q = p.map((v, i) => Math.abs(v) - h[i]!);
  return Math.sqrt(q.reduce((s, v) => s + Math.max(v, 0) ** 2, 0)) + Math.min(Math.max(...q), 0);
}
describe('S13 mathematical world', () => {
  test('200 randomized CPU/GLSL mirror points differ by less than 1e-4', () => {
    expect(S13_GLSL).toContain('float wallRipple'); expect(S13_GLSL).toContain('vec3 onSlab');
    let max = 0;
    for (let i = 0; i < 200; i++) {
      const p = p3(hash(i, 1) * 14 - 7, hash(i, 2) * 12 - 6, hash(i, 3) * 5 - 2.5), age = hash(i, 4) * 0.4 - 0.05;
      const hit = p3(hash(i, 5) * 3 - 1.5, hash(i, 6) * 3 - 1.5, 0);
      const mirror = gpuRipple([p.x, p.y], age, [hit.x, hit.y]);
      max = Math.max(max, Math.abs(wallRipple(p.x, p.y, age, hit) - mirror));
      max = Math.max(max, Math.abs(slabDistance(p, p3(3.6, 0.21, 1.2)) - gpuBox([p.x, p.y, p.z], [3.6, 0.21, 1.2])));
      const normal = wallRippleGradient(p.x, p.y, age, hit);
      const gx = (gpuRipple([p.x + 0.002, p.y], age, [hit.x, hit.y]) - gpuRipple([p.x - 0.002, p.y], age, [hit.x, hit.y])) / 0.004;
      const gy = (gpuRipple([p.x, p.y + 0.002], age, [hit.x, hit.y]) - gpuRipple([p.x, p.y - 0.002], age, [hit.x, hit.y])) / 0.004;
      max = Math.max(max, Math.abs(normal.x - gx), Math.abs(normal.y - gy));
      const pose = slabPose(audio, 76.9, i % (BASE_SLABS + 4), T), q = onSlab(pose, p);
      const v = new THREE.Vector3(p.x * pose.scaleX, p.y, p.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), pose.yaw).add(new THREE.Vector3(pose.center.x, pose.center.y, pose.center.z));
      max = Math.max(max, Math.abs(q.x - v.x), Math.abs(q.y - v.y), Math.abs(q.z - v.z));
    }
    console.log('S13 CPU/GLSL 200-point max error', max); expect(max).toBeLessThan(1e-4);
  });
  test('all world, camera, layout and cursor queries are deterministic under reverse seeks', () => {
    const sample = (t: number) => ({ world: gitfallLayout(audio, lyrics, t, T, voice),
      cursor: cursorAt(audio, t, T, voice, plans, P14), jitter: Array.from({ length: BASE_SLABS + T.slabs.length }, (_, i) => slabJitter(audio, t, i, T)) });
    for (const t of [T.start, 69.89, 73.5, 76.9, 79.7, T.hit2, 85.9, T.end - 1 / 60]) {
      const first = sample(t); sample(T.end); sample(T.start); expect(sample(t)).toEqual(first);
    }
  });
  test('ordinary slabs have specified extents; every insertion sinks the stack exactly 0.42', () => {
    expect(SLAB).toEqual({ w: 7.2, h: 0.42, d: 2.4 });
    for (const s of T.slabs) expect(sinkAt(s.at + s.duration, T) - sinkAt(s.at, T)).toBeCloseTo(0.42, 8);
    expect(TOP(T.hit1 + 0.2, T)).toBeCloseTo(2.4, 8);
  });
});
describe('S13 word/beat choreography', () => {
  test('prefix and three fix impacts equal the authored word onsets', () => {
    const prefixTimes = plans.prefixes.map(p => p.word.start);
    for (const t of prefixTimes) expect(T.impacts.some(i => i.at === t)).toBe(true);
    const fixes = T.slabs.filter(s => s.kind === 'fix');
    expect(fixes.map(s => s.at)).toEqual([T.lines[1]!.words[0]!.start, T.lines[1]!.words[2]!.start, T.lines[1]!.words[4]!.start]);
    expect(new Set(fixes.map(s => s.hash)).size).toBe(3); expect(fixes.map(s => s.clay)).toEqual([false, false, true]);
    expect(T.slabs[0]!.hash).toBe('9e1c4ab');
  });
  test('the eight prefix solids contact their actual carrier exactly at word.start', () => {
    for (const p of plans.prefixes) {
      const rig = rigAt(p.word.start), at = prefixPose(audio, p.word.start, p, T, rig).at;
      expect(prefixPose(audio, p.word.start - 1e-8, p, T, rig).visible).toBe(false);
      if (!p.second) {
        const hit = WORD_SLOTS[p.slot]!; expect(at.z).toBe(wallDepth(hit.x, hit.y, p.word.start, T));
      } else {
        const slab = slabPose(audio, p.word.start, topIndex(T.pickup2 - 1e-6, T) - p.slot, T, rig);
        expect(at).toEqual(onSlab(slab, p3(-p.width / 2, -p.capH / 2, SLAB.d / 2 - 0.08)));
      }
    }
    expect(cursorAt(audio, T.start, T, voice, plans, P14)).toEqual({ x: 885, y: 540, r: 8 });
  });
  test('L4 hits equal onset plus in-word grid beats; MIT supersedes its nearby beat within a frame', () => {
    const grid = audio.beats.filter(t => t > T.commit2.start && t < T.commit2.end);
    const repeat = T.slabs.filter(s => s.words[0]!.gi === T.commit2.gi);
    expect(repeat).toHaveLength(grid.length + 1); expect(repeat[0]!.at).toBe(T.commit2.start);
    repeat.slice(1).forEach((s, i) => expect(Math.abs(s.at - grid[i]!)).toBeLessThan(1 / 60));
    expect(repeat.some(s => s.at === T.hit2)).toBe(true);
    expect(repeat.map(s => s.duration)).toEqual([0.18, 0.12, 0.08, 0.08]);
    console.log('S13 L4 impacts', repeat.map(s => s.at));
  });
  test('three transparent echoes arrive on half-beats after MIT', () => {
    expect(T.echoes).toHaveLength(3);
    T.echoes.forEach((t, i) => expect(audio.beatAt(t) - audio.beatAt(T.hit1)).toBeCloseTo((i + 1) / 2, 9));
  });
  test('level-two exact peak displacement 13/18 upgrades S08 7/10; inversion lasts 2/3 frame indices', () => {
    expect(13).toBeGreaterThan(7); expect(18).toBeGreaterThan(10);
    for (const p of plans.prefixes) {
      expect(impactAt(p.word.start, T).amplitude).toBe(13);
      expect(Math.hypot(...impactAt(p.word.start, T).shake)).toBeCloseTo(13, 8);
    }
    expect(impactAt(T.hit2, T).amplitude).toBe(18);
    expect(T.impacts.find(i => i.at === T.hit2)!.invertFrames).toBe(3);
    expect(T.impacts.filter(i => i.at !== T.hit2).every(i => i.invertFrames === 2)).toBe(true);
  });
  test('every displayed first glyph waits for its word; reserved paths use the end axes', () => {
    for (const line of T.lines) for (const word of line.words) {
      expect(letterTimes(word)[0]!.t0).toBeGreaterThanOrEqual(word.start);
      expect(voice.form(word, word.start - 1e-8).born).toBe(0);
    }
    for (const path of plans.paths) for (const word of path.words) {
      const first = path.layout.glyphs.find(g => g.word.gi === word.gi)!;
      expect(first.t0).toBeGreaterThanOrEqual(word.start);
    }
    for (const p of plans.planes) expect(p.axes).toEqual(voice.form(p.word, p.word.end).axes);
  });
  test('tower jitters return to neutral after 0.3s; fits jumps stay within +/-0.15', () => {
    for (let i = 0; i < BASE_SLABS + T.slabs.length; i++) {
      expect(slabJitter(audio, 76.9, i, T)).toEqual(slabJitter(audio, 76.9, i, T));
      expect(slabJitter(audio, T.pickup2, i, T)).toEqual({ x: 0, yaw: 0 });
      expect(Math.abs(slabJitter(audio, 76.9, i, T).x)).toBeLessThanOrEqual(0.125);
      expect(Math.abs(fitsJump(audio, 76.9, i, T))).toBeLessThanOrEqual(0.15);
    }
  });
});
describe('S13 actual projected composition', () => {
  test('the tower is below frame initially and rises into the right third for first COMMIT', () => {
    const initial = rigAt(T.start), first = slabPose(audio, T.start, BASE_SLABS - 1, T);
    expect(initial.proj(first.center.x, first.center.y + first.height / 2, first.center.z)!.y).toBeGreaterThan(1080);
    const t = T.hit1 + 0.05, rig = rigAt(t), top = slabPose(audio, t, topIndex(t, T), T);
    const x = rig.proj(top.center.x, top.center.y, top.center.z)!.x;
    console.log('S13 B tower centre x', x); expect(x).toBeGreaterThanOrEqual(1280); expect(x).toBeLessThan(1920);
  });
  test('all four wall words are inside the frame before first MIT (real extruded letter bounds)', () => {
    const t = T.commit1.start - 0.01, rig = rigAt(t);
    for (const p of plans.prefixes.filter(p => !p.second)) {
      const solid = new SolidText(p.word.w.toUpperCase(), { capH: p.capH, depth: 0.6, bevel: 0.035,
        axes: p.axes, material: new THREE.MeshBasicMaterial(), curveSegments: 3 });
      const pose = prefixPose(audio, t, p, T, rig); solid.group.position.set(pose.at.x, pose.at.y, pose.at.z);
      const b = projectedBox(rig, solid.letters.flatMap(l => solid.letterCorners(l.i)));
      console.log('S13 A solid bounds', p.word.w, b);
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(1920);
      expect(b.y).toBeGreaterThanOrEqual(0); expect(b.y + b.h).toBeLessThanOrEqual(1080);
      solid.dispose();
    }
  });
  test('L4 reserved COMMIT geometry is at least 55% at every contact, including unborn glyphs', () => {
    for (const [event, s] of T.slabs.entries()) if (s.words[0]!.gi === T.commit2.gi) {
      const rig = rigAt(s.at), pose = slabPose(audio, s.at, BASE_SLABS + event, T, rig);
      const solid = new SolidText('COMMIT', { capH: 2.4, depth: 0.9, axes: { ...voice.form(T.commit2, T.commit2.end).axes, wght: 900 },
        bevel: 0.035, material: new THREE.MeshBasicMaterial(), curveSegments: 3 });
      solid.group.position.set(pose.center.x, pose.center.y, pose.center.z); solid.group.rotation.y = pose.yaw; solid.group.scale.x = pose.scaleX;
      for (const letter of solid.letters) {
        letter.mesh.geometry = solidLetterGeometry(letter.ch, { ...voice.form(T.commit2, s.at).axes, wght: 900 }, 2.4, 0.9, 0.035, 3);
        solid.setLetter(letter.i, { d: p3(-solid.width / 2, -pose.height / 2 + SLAB.h, 0.3) });
      }
      const b = projectedBox(rig, solid.letters.flatMap(l => solid.letterCorners(l.i)));
      console.log('S13 E COMMIT bounds', s.at, b); expect(b.w).toBeGreaterThanOrEqual(1920 * 0.55); solid.dispose();
    }
  });
  test('fix fronts project to 60-90px cap heights; tests use 0.7-unit stand paths and 50-110px', () => {
    for (const p of plans.planes.filter(p => p.carrier === 'fix')) {
      const t = Math.max(T.fixes + 0.3, p.word.start + 0.15), rig = rigAt(t), at = planePose(audio, t, p, T, rig).at;
      const a = rig.proj(at.x, at.y - p.capH / 2, at.z)!, b = rig.proj(at.x, at.y + p.capH / 2, at.z)!;
      const cap = Math.hypot(b.x - a.x, b.y - a.y);
      console.log('S13 fix cap px', p.word.w, cap); expect(cap).toBeGreaterThanOrEqual(60); expect(cap).toBeLessThanOrEqual(90);
    }
    for (const p of plans.paths.filter(p => p.kind === 'tests')) {
      expect(p.layout.capH).toBe(0.7);
      const t = 76.9, rig = rigAt(t), path = pathFor(audio, t, p, T, rig);
      const at = pathAt(path, 0), cap = rig.proj(at.x, at.y, at.z)!.s * p.layout.capH;
      expect(cap).toBeGreaterThanOrEqual(50); expect(cap).toBeLessThanOrEqual(110);
    }
  });
  test('D pulls back to contain the whole physical tower', () => {
    const t = 76.9, rig = rigAt(t), points = [];
    for (let i = 0; i <= topIndex(t, T); i++) {
      const pose = slabPose(audio, t, i, T, rig);
      for (const x of [-3.6, 3.6]) for (const y of [-pose.height / 2, pose.height / 2]) for (const z of [-1.2, 1.2]) points.push(onSlab(pose, p3(x, y, z)));
    }
    const b = projectedBox(rig, points); console.log('S13 D whole tower bounds', b);
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(1920);
    expect(b.y).toBeGreaterThanOrEqual(0); expect(b.y + b.h).toBeLessThanOrEqual(1080);
  });
  test('local/CI stop with a gap around tower and Clawd; machine crushes x to 0.3 and ejects Clawd', () => {
    const local = sideWallAt(T.split + 0.5, true, T), ci = sideWallAt(T.split + 0.5, false, T);
    expect(ci.x - local.x - 30).toBe(8);
    expect(collisionAt(T.machine.start + 0.2, T)).toBe(1);
    expect(slabPose(audio, T.machine.start + 0.2, 0, T).scaleX).toBeCloseTo(0.3, 8);
    const t = T.machine.start + 0.2, rig = rigAt(t), cp = clawdAt(audio, t, T, rig);
    expect(rig.proj(cp.x, cp.y, cp.z)!.y).toBeLessThan(0);
  });
  test('local and CI sung words stay in frame at lyric scale once their carriers arrive', () => {
    for (const p of plans.planes.filter(p => p.carrier !== 'fix')) {
      const t = Math.max(T.split + 0.55, p.word.end - 0.03), rig = rigAt(t), pose = planePose(audio, t, p, T, rig);
      const width = p.width * voice.form(p.word, t).axes.wdth / p.axes.wdth;
      const b = projectedBox(rig, [0, width].flatMap(x => [-p.capH / 2, p.capH / 2].map(y => p3(pose.at.x + x, pose.at.y + y, pose.at.z))));
      console.log('S13 wall lyric bounds', p.word.w, b);
      expect(b.x).toBeGreaterThanOrEqual(0); expect(b.x + b.w).toBeLessThanOrEqual(1920);
      expect(b.y).toBeGreaterThanOrEqual(0); expect(b.y + b.h).toBeLessThanOrEqual(1080);
      expect(b.h).toBeGreaterThanOrEqual(50); expect(b.h).toBeLessThanOrEqual(110);
    }
  });
});
describe('S13 cut contracts and carry', () => {
  test('C12 actual projected wall edge matches DIAG13 within two pixels', () => {
    const target = { kind: 'line' as const, ...CUT.diag13, w: 2 };
    const err = primError(entryPrim(T.start, audio, T), target);
    console.log('S13 C12 entry error', err); expect(err.px).toBeLessThanOrEqual(2); expect(err.size).toBe(0);
  });
  test('C13 uses unchanged S14 actual cursor centre; all geometry collapses there by last frame', () => {
    const rig = rigAt(T.end - 1 / 60), anchor = implosionPoint(rig, P14);
    const p = collapsePoint(p3(-10, 20, 4), T.end - 1 / 60, T, anchor), q = rig.proj(p.x, p.y, p.z)!;
    expect(Math.hypot(q.x - P14.x, q.y - P14.y)).toBeLessThan(1e-6);
    expect(exitPrim(T.end - 1 / 60, P14)).toMatchObject({ kind: 'point', x: P14.x, y: P14.y, r: 8 });
    console.log('S13 P14 actual cursor', P14);
  });
  test('no machine carry: its letters participate in implosion, despite voice extending 57ms past cut', () => {
    expect(T.machine.end).toBeGreaterThan(T.end);
    expect(plans.planes.some(p => p.word.gi === T.machine.gi && p.carrier === 'ci')).toBe(true);
    expect(implosionAt(T.end - 1 / 60, T)).toBe(1);
    expect(S.words.some(e => e.word.gi === T.machine.gi)).toBe(false);
  });
  test('last 100ms camera is exactly stationary; gain peaks at two and shake/push stop', () => {
    const camera = cameraAt(audio, T.end - 0.1, T);
    for (const t of [T.end - 0.09, T.end - 1 / 60, T.end]) {
      expect(cameraAt(audio, t, T)).toEqual(camera);
      expect(impactAt(t, T).shake).toEqual([0, 0]); expect(impactAt(t, T).zoom).toBe(0);
    }
    expect(exitEnvelope(T.end, T.end, 2).gain).toBe(2);
  });
  test('actual projected slab descent in the pre-exit beat is 140px/beat +/-10%', () => {
    const t = afterBeats(audio, T.end, -0.7), next = afterBeats(audio, t, 0.001), i = topIndex(t, T);
    const A = rigAt(t), B = rigAt(next), a = slabPose(audio, t, i, T, A).center, b = slabPose(audio, next, i, T, B).center;
    const speed = (B.proj(b.x, b.y, b.z)!.y - A.proj(a.x, a.y, a.z)!.y) / 0.001;
    console.log('S13 projected fall px/beat', speed); expect(speed).toBeGreaterThanOrEqual(126); expect(speed).toBeLessThanOrEqual(154);
  });
  test('front-face lamination pitch before implosion is exactly 36 projected pixels', () => {
    const t = afterBeats(audio, T.end, -0.7), rig = rigAt(t), slab = slabPose(audio, t, 0, T, rig);
    const a = onSlab(slab, p3(0, 0, SLAB.d / 2)), b = onSlab(slab, p3(0, SLAB.h, SLAB.d / 2));
    const pitch = rig.proj(a.x, a.y, a.z)!.y - rig.proj(b.x, b.y, b.z)!.y;
    console.log('S13 projected pitch px', pitch); expect(pitch).toBeCloseTo(36, 8);
  });
  test('path cursor is the projected letter writeHead and follows the same displaced top board', () => withCanvas(() => {
    const t = 75.3, p = plans.paths.find(p => p.kind === 'tests' && p.row === 0)!, rig = rigAt(t);
    const path = pathFor(audio, t, p, T, rig), q = pathAt(path, writeHead(p.layout.glyphs, t)), head = rig.proj(q.x, q.y, q.z)!;
    const cursor = cursorAt(audio, t, T, voice, plans, P14);
    expect(cursor.x).toBe(head.x); expect(cursor.y).toBe(head.y);
    const draw = drawPathText(new FakeCanvas().ctx, rig, path, p.layout, t,
      { mode: 'stand', base: 'paper', on: 'ink', axes: (g, tb) => voice.form(g.word, tb).axes });
    expect(draw.head!.x).toBe(cursor.x); expect(draw.head!.y).toBe(cursor.y);
  }));
  test('sung stand letters remain on their old board through F and collapse with the world', () => {
    const plan = plans.paths.find(p => p.kind === 'tests' && p.row === 0)!;
    const t = T.end - 1 / 60 - 0.033, rig = rigAt(t), anchor = implosionPoint(rig, P14);
    const original = pathFor(audio, t, plan, T, rig), collapsed = pathFor(audio, t, plan, T, rig, anchor);
    const scale = 1 - implosionAt(t, T);
    expect(scale).toBeGreaterThan(0); expect(scale).toBeLessThan(1);
    expect(collapsed.length).toBeCloseTo(original.length * scale, 8);
    for (const [i, point] of collapsed.pts.entries()) expect(point).toEqual(collapsePoint(original.pts[i]!, t, T, anchor));
    expect(plan.layout.glyphs.every(g => g.t0 < T.split)).toBe(true);
    expect(pathFor(audio, T.split + 0.5, plan, T, rig).length).toBeGreaterThan(0);
  });
});
