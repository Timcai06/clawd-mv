import { expect, test } from 'bun:test';
import path from 'node:path';
import boardJSON from '../../storyboard/shots.json';
import audioJSON from '../../data/audio.json';
import { Lyrics } from '../src/engine/lyrics';
import { AudioData } from '../src/engine/audio';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import { printReport } from '../scripts/storyboard-check';

const fixture = Bun.file(path.resolve(import.meta.dir, '../../analysis/work/c1/whisper_turbo_quick.json'));
const available = await fixture.exists();
test.skipIf(!available)('raw Whisper words exercise all 80 shots without repairing the transcript', async () => {
  const whisper: { segments: { text: string; start: number; end: number; words: { word: string; start: number; end: number }[] }[] } = await fixture.json();
  // Preserve original segment boundaries and ASR mistakes: this is not forced alignment.
  const lyrics = new Lyrics({ lines: whisper.segments.map((s) => ({
    text: s.text.trim(), start: s.start, end: s.end,
    words: s.words.map((w) => ({ w: w.word.trim(), start: w.start, end: w.end })),
  })) });
  const board = boardJSON as Storyboard;
  const result = resolveStoryboard(board, lyrics, new AudioData(audioJSON));
  console.log('Raw Whisper transcript + the real beat grid (not the aligned lyrics):');
  printReport(result);
  expect(result.shots).toHaveLength(80);
  expect(result.shots.every((s) => Number.isFinite(s.start))).toBe(true);
  expect(result.shots.filter((s) => s.source === 'anchor').length).toBeGreaterThan(0);
  expect(result.shots.find((s) => s.id === 'S05-3')!.anchorTime).toBeCloseTo(15.9);
  expect(result.shots.find((s) => s.id === 'S08-7')!.source).toBe('fallback');
  // S12-2 anchors the second "run" (sub: 2), so it must come after S12-1's "Run".
  const s121 = result.shots.find((s) => s.id === 'S12-1')!, s122 = result.shots.find((s) => s.id === 'S12-2')!;
  expect(s122.anchorTime!).toBeGreaterThan(s121.anchorTime!);
});
