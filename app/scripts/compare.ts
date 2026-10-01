#!/usr/bin/env bun
// Storyboard vs implementation: one sheet per scene, keyframe (left) next to the rendered
// still of the same shot (right), plus a strip of one still per shot of the scene below.
//   bun scripts/compare.ts [--scenes S04,S11] [--tag v1] [--samples 4] [--at 0.6]
// Output: out/compare/<tag>/cmp-SNN.png and index.html. Times come from the resolved storyboard
// (the keyframe's `shot` in storyboard/keyframes.json, at fraction --at of that shot).
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import boardJSON from '../../storyboard/shots.json';
import kfJSON from '../../storyboard/keyframes.json';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';

const argv = process.argv.slice(2);
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const ROOT = path.resolve(import.meta.dir, '../..');
const tag = opt('tag', 'latest')!;
const at = +opt('at', '0.6')!;
const only = opt('scenes')?.split(',');
const out = path.join(ROOT, 'out/compare', tag);
const stillDir = path.join(out, 'stills');
mkdirSync(stillDir, { recursive: true });

const audio = new AudioData(await Bun.file(path.join(ROOT, 'data/audio.json')).json());
const lyrics = new Lyrics(await Bun.file(path.join(ROOT, 'data/lyrics.json')).json());
const shots = resolveStoryboard(boardJSON as Storyboard, lyrics, audio).shots;
const frames = (kfJSON as { frames: { id: string; shot: string }[] }).frames.filter((f) => !only || only.includes(f.id));

const r3 = (t: number) => Math.round(t * 100) / 100; // stills are named with 2 decimals
type Job = { id: string; shot: string; main: number; strip: { id: string; t: number }[] };
const jobs: Job[] = frames.map((f) => {
  const s = shots.find((x) => x.id === f.shot)!;
  const strip = shots.filter((x) => x.scene === f.id).map((x) => ({ id: x.id, t: r3(x.start + x.duration * 0.5) }));
  return { id: f.id, shot: f.shot, main: r3(s.start + s.duration * at), strip };
});
const times = [...new Set(jobs.flatMap((j) => [j.main, ...j.strip.map((s) => s.t)]))].sort((a, b) => a - b);
console.log(`${jobs.length} scenes, ${times.length} stills`);

const r = Bun.spawnSync(['bun', 'scripts/render.ts', 'stills', '--t', times.join(','), '--samples', opt('samples', '4')!, '--out', stillDir],
  { cwd: path.join(ROOT, 'app'), stdout: 'inherit', stderr: 'inherit' });
if (r.exitCode !== 0) throw new Error('render failed');

const spec = jobs.map((j) => ({ ...j, kf: path.join(ROOT, `out/storyboard/v2/kf-${j.id}.png`) }));
await Bun.write(path.join(out, 'jobs.json'), JSON.stringify(spec, null, 1));
const p = Bun.spawnSync(['python3', path.join(ROOT, 'tools/compare_sheet.py'), path.join(out, 'jobs.json'), stillDir, out],
  { stdout: 'inherit', stderr: 'inherit' });
if (p.exitCode !== 0) throw new Error('compose failed');
console.log(path.join(out, 'index.html'));
