// Resolve editorial intent without repairing or reordering the source data.
import type { AudioData } from './engine/audio';
import type { Lyrics, Line } from './engine/lyrics';

export interface Anchor {
  line?: string;
  occ?: number;
  word: string | null;
  sub?: number;
  /** 1-based syllable of the word (uses the aligned `syl` spans), e.g. 2 = the stressed -MIT of com-MIT. */
  syl?: number;
  /** 'cut' = pdoom's timeline cut(): the last beat at/before the word's start + 50 ms (pdoom's dense
   *  tolerance: a beat up to 50 ms after the first word is preferred to cutting the previous line's last
   *  word in half), so a scene boundary sits between lines (docs/reference/pdoom-transitions-lyrics.md, R1). */
  snap: 'downbeat' | 'beat' | 'none' | 'cut';
  offset_beats?: number;
}
export interface Shot {
  id: string;
  scene: string;
  t: number;
  anchor: Anchor;
  clawd: string | null;
  camera: string;
  visual: string;
}
export interface StoryScene { id: string; name: string; section: string; t0: number; set: string }
export interface Storyboard {
  song: { file: string; duration: number };
  scenes: StoryScene[];
  shots: Shot[];
}
export interface ResolvedShot extends Shot {
  start: number;
  end: number;
  duration: number;
  beats: number;
  source: 'anchor' | 'fallback';
  reason?: string;
  anchorTime?: number;
}
export interface TimingIssue {
  kind: 'non-increasing' | 'short-shot';
  id: string;
  nextId?: string;
  message: string;
}
export interface StoryboardResolution { shots: ResolvedShot[]; issues: TimingIssue[] }

// Apostrophes do not create word boundaries; dashes and other punctuation do.
export function normalizeAnchor(text: string): string {
  return text.normalize('NFKC').toLowerCase()
    .replace(/['\u2018\u2019\u02bc\uFF07"\u201c\u201d]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function wordTimes(line: Line, query: string, syl?: number): number[] {
  const q = normalizeAnchor(query);
  return line.words.flatMap((word) => {
    // Whole compounds remain addressable (e.g. forty-two). With `syl`, a word without that
    // aligned syllable does not match (no guessing where a syllable starts).
    if (normalizeAnchor(word.w) === q) {
      if (!syl) return [word.start];
      const s = word.syl?.[syl - 1];
      return s ? [s[0]] : [];
    }
    if (syl) return [];
    const parts = word.w.split(/[-\u2010-\u2015\u2212]/u).filter((p) => normalizeAnchor(p));
    if (parts.length < 2) return [];
    return parts.flatMap((part, i) => normalizeAnchor(part) === q
      ? [word.start + (word.end - word.start) * i / parts.length] : []);
  });
}

function snapTime(t: number, snap: Anchor['snap'], audio: AudioData): number {
  if (snap === 'none') return t;
  if (snap === 'cut') {
    const b = audio.beats;
    let best = b[0] ?? t;
    for (const p of b) if (p <= t + 0.05) best = p; else break;
    return best;
  }
  const grid = snap === 'downbeat' ? audio.downbeats : audio.beats;
  // An absent grid cannot provide a measured snap. Ties go to the earlier point.
  return grid.reduce((best, point) => Math.abs(point - t) < Math.abs(best - t) ? point : best, grid[0] ?? t);
}

function offsetTime(t: number, beats: number, audio: AudioData): number {
  if (!beats) return t;
  const grid = audio.beats;
  if (grid.length < 2) return t + beats * 60 / audio.bpm;
  const i = audio.beatAt(t) + beats;
  // Use the same local extrapolation as beatAt, even beyond the measured grid.
  if (i < 0) return grid[0]! + i * (grid[1]! - grid[0]!);
  if (i > grid.length - 1) return grid.at(-1)! + (i - grid.length + 1) * (grid.at(-1)! - grid.at(-2)!);
  return audio.timeOfBeat(i);
}

export function resolveStoryboard(board: Storyboard, lyrics: Lyrics, audio: AudioData): StoryboardResolution {
  const starts = board.shots.map((shot) => {
    const a = shot.anchor;
    let reason: string | undefined;
    let anchorTime: number | undefined;
    if (a.word === null) reason = 'instrumental: anchor.word is null; use t';
    else {
      const lines = lyrics.lines.filter((line) => normalizeAnchor(line.text) === normalizeAnchor(a.line ?? ''))
        .sort((x, y) => x.start - y.start);
      const occ = a.occ ?? 1;
      const line = lines[occ - 1];
      if (!line) reason = `line occurrence ${occ} missing (${lines.length} exact normalized matches): ${a.line}`;
      else {
        const times = wordTimes(line, a.word, a.syl);
        anchorTime = times[(a.sub ?? 1) - 1];
        if (anchorTime === undefined) reason = `word occurrence ${a.sub ?? 1} missing (${times.length} exact matches): ${a.word}`;
      }
    }
    // The fallback t already describes the intended cut; do not offset it twice.
    const start = anchorTime === undefined ? snapTime(shot.t, a.snap, audio)
      : offsetTime(snapTime(anchorTime, a.snap, audio), a.offset_beats ?? 0, audio);
    return { ...shot, start, source: anchorTime === undefined ? 'fallback' as const : 'anchor' as const, reason, anchorTime };
  });
  const issues: TimingIssue[] = [];
  const shots = starts.map((shot, i): ResolvedShot => {
    const next = starts[i + 1];
    const end = next?.start ?? audio.duration;
    const beats = audio.beatAt(end) - audio.beatAt(shot.start);
    if (next && end <= shot.start) issues.push({
      kind: 'non-increasing', id: shot.id, nextId: next.id,
      message: `${shot.id} ${shot.start.toFixed(4)}s -> ${next.id} ${end.toFixed(4)}s`,
    });
    if (beats < 1 - 1e-6) issues.push({
      kind: 'short-shot', id: shot.id, nextId: next?.id,
      message: `${shot.id}: ${(end - shot.start).toFixed(4)}s / ${beats.toFixed(3)} beats`,
    });
    return { ...shot, end, duration: end - shot.start, beats };
  });
  return { shots, issues };
}
