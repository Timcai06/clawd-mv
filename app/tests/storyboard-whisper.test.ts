import { expect, test } from 'bun:test';
import path from 'node:path';
import boardJSON from '../../storyboard/shots.json';
import audioJSON from '../../data/audio.json';
import { Lyrics } from '../src/engine/lyrics';
import { AudioData } from '../src/engine/audio';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import { printReport } from '../scripts/storyboard-check';

// Committed copy of analysis/work/c1/whisper_turbo_quick.json (gitignored), so this runs in every checkout.
const fixture = Bun.file(path.resolve(import.meta.dir, 'fixtures/whisper-c1.json'));
test('raw Whisper words exercise all 80 shots without repairing the transcript', async () => {
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
  // Look the anchor word up in the transcript instead of hard-coding its time.
  const s052 = result.shots.find((s) => s.id === 'S05-2')!;
  const said = whisper.segments.flatMap((s) => s.words).find((w) => w.word.trim().toLowerCase() === s052.anchor!.word!.toLowerCase())!;
  expect(s052.anchorTime).toBeCloseTo(said.start);
  expect(result.shots.find((s) => s.id === 'S08-7')!.source).toBe('fallback');
  // S12-2 anchors the second "run" (sub: 2), so it must come after S12-1's "Run".
  const s121 = result.shots.find((s) => s.id === 'S12-1')!, s122 = result.shots.find((s) => s.id === 'S12-2')!;
  expect(s122.anchorTime!).toBeGreaterThan(s121.anchorTime!);
});
