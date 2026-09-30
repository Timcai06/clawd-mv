#!/usr/bin/env bun
// Read the same preferred/fallback data files as the engine; never write data/.
import path from 'node:path';
import boardJSON from '../../storyboard/shots.json';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { resolveStoryboard, type Storyboard, type StoryboardResolution } from '../src/storyboard';

export function printReport(result: StoryboardResolution) {
  console.log('shot     start (s)  source    duration (s)  beats');
  for (const shot of result.shots) console.log(
    `${shot.id.padEnd(8)} ${shot.start.toFixed(4).padStart(9)}  ${shot.source.padEnd(8)}  ${shot.duration.toFixed(4).padStart(12)}  ${shot.beats.toFixed(3).padStart(7)}`);
  const fallback = result.shots.filter((shot) => shot.source === 'fallback');
  console.log(`\nShots: ${result.shots.length}; anchors: ${result.shots.length - fallback.length}; fallbacks: ${fallback.length} (${fallback.filter((s) => s.anchor.word === null).length} instrumental)`);
  for (const shot of fallback) console.log(`FALLBACK ${shot.id}: ${shot.reason}`);
  for (const kind of ['short-shot', 'non-increasing'] as const) {
    const issues = result.issues.filter((issue) => issue.kind === kind);
    console.log(`\n${kind}: ${issues.length}`);
    for (const issue of issues) console.log(`  ${issue.message}`);
  }
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dir, '../..');
  const load = async (name: string) => {
    const real = Bun.file(path.join(root, `data/${name}.json`));
    const file = await real.exists() ? real : Bun.file(path.join(root, `data/${name}.approx.json`));
    console.log(`Reading ${file.name}`);
    return file.json();
  };
  const [audioJSON, lyricsJSON] = await Promise.all([load('audio'), load('lyrics')]);
  const audio = new AudioData(audioJSON);
  const board = boardJSON as Storyboard;
  console.log(`Audio: ${audio.duration}s; storyboard: ${board.song.duration}s; beat grid ends: ${audio.beats.at(-1)}s; downbeat grid ends: ${audio.downbeats.at(-1)}s`);
  const result = resolveStoryboard(board, new Lyrics(lyricsJSON), audio);
  printReport(result);
  process.exitCode = result.issues.some((issue) => issue.kind === 'non-increasing') ? 1 : 0;
}
