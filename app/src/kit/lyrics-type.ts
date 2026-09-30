import type { AudioData } from '../engine/audio';
import { Lyrics } from '../engine/lyrics';
import { F, fitSize, font, glyphX, plain, smart } from '../engine/type';
import { ease, keys } from '../engine/util';
import { css, INK_SOFT } from '../theme';
import type { Box } from './icons';
import { afterBeats } from './time';

export interface LyricWordState {
  text: string;
  /** Character offsets in the complete display string, including its punctuation. */
  from: number;
  to: number;
  status: 'sung' | 'singing' | 'unsung';
  progress: number;
  revealed: boolean;
}

export interface LyricsTypeState {
  lineIndex: number;
  style: 'small' | 'hook';
  text: string;
  visible: boolean;
  /** Exclusive display endpoint; short gaps never truncate the sung line. */
  hideAt: number;
  words: LyricWordState[];
  impact: { wordIndex: number; at: number; visible: boolean; scale: number; y: number } | null;
}

/** Audio supplies only the measured half-beat hold; word and impact times stay unsnapped. */
export function lyricsTypeState(lyrics: Lyrics, t: number, audio: AudioData): LyricsTypeState {
  const line = lyrics.lastLine(t);
  if (!line) return { lineIndex: -1, style: 'small', text: '', visible: false, hideAt: 0, words: [], impact: null };
  const hook = /^i need one (more|last) commit$/i.test(plain(line.text).trim());
  const display = (s: string) => hook ? smart(s).toUpperCase() : plain(s);
  const text = display(line.text), next = lyrics.lines[line.i + 1];
  const hideAt = next ? Math.max(line.end, afterBeats(audio, next.start, -0.5)) : afterBeats(audio, line.end, 0.5);
  let cursor = 0;
  const words = line.words.map((w): LyricWordState => {
    const token = display(w.w), from = text.indexOf(token, cursor);
    if (from < 0) throw new Error(`Lyric token missing from line ${line.i}: ${w.w}`);
    cursor = from + token.length;
    return { text: token, from, to: cursor, status: t >= w.end ? 'sung' : t >= w.start ? 'singing' : 'unsung',
      progress: Lyrics.wordProgress(w, t), revealed: t >= w.start };
  });
  let impact: LyricsTypeState['impact'] = null;
  if (hook) {
    const wordIndex = words.findIndex((w) => w.text === 'COMMIT');
    const at = line.words[wordIndex]?.syl?.[1]?.[0];
    // A missing stress anchor must be fixed in the data, never guessed from a beat or word start.
    if (at === undefined) throw new Error(`Missing COMMIT second syllable in lyric line ${line.i}`);
    impact = { wordIndex, at, visible: t >= at,
      scale: keys(t, [[at, 1.42], [at + 0.09, 0.96, ease.outCubic], [at + 0.17, 1, ease.outCubic]]),
      y: keys(t, [[at, -56], [at + 0.09, 4, ease.outCubic], [at + 0.17, 0, ease.outCubic]]) };
  }
  return { lineIndex: line.i, style: hook ? 'hook' : 'small', text, visible: t < hideAt, hideAt, words, impact };
}

/** Small mono lyric, left aligned to the caller's grid intersection. No time or data reads. */
/** `on`: the ground the text sits on (default paper); text flips to paper on INK / CLAY grounds. */
export function drawLyricsLine(c: CanvasRenderingContext2D, box: Box, state: LyricsTypeState, on: 'paper' | 'ink' | 'clay' = 'paper'): void {
  const fg = on === 'paper' ? 'ink' : 'paper';
  if (!state.visible || !(box.width > 0 && box.height > 0)) return;
  const family = F.mono(500), size = fitSize(state.text, family, box.width, Math.min(32, box.height * 0.55));
  const baseline = box.y + box.height / 2 + size * 0.35;
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.font = font(family, size);
  c.fillStyle = css(fg, INK_SOFT.mid); c.fillText(state.text, box.x, baseline);
  c.fillStyle = css(fg);
  state.words.forEach((word, i) => {
    if (word.progress <= 0) return;
    const left = glyphX(state.text, word.from, family, size);
    const right = glyphX(state.text, word.progress === 1 ? (state.words[i + 1]?.from ?? state.text.length) : word.to, family, size);
    c.save(); c.beginPath(); c.rect(box.x + left, box.y, (right - left) * word.progress, box.height); c.clip();
    // Clip the complete kerned run instead of measuring/drawing disconnected prefixes.
    c.fillText(state.text, box.x, baseline); c.restore();
  });
  c.restore();
}

/** Pickup words appear at their onsets; the clay word slams at the supplied stress state. */
export function drawLyricsHook(c: CanvasRenderingContext2D, box: Box, state: LyricsTypeState, on: 'paper' | 'ink' | 'clay' = 'paper'): void {
  if (!state.visible || !state.impact || !(box.width > 0 && box.height > 0)) return;
  const s = Math.min(box.width / 1920, box.height / 660), family = F.archivo(100, 900);
  c.save(); c.beginPath(); c.rect(box.x, box.y, box.width, box.height); c.clip();
  c.translate(box.x, box.y); c.scale(s, s);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = css(on === 'paper' ? 'ink' : 'paper'); c.font = font(family, 108);
  const pickup = state.text.slice(0, state.words[state.impact.wordIndex].from).trimEnd();
  for (const word of state.words.slice(0, state.impact.wordIndex)) {
    if (word.revealed) c.fillText(word.text, 80 + glyphX(pickup, word.from, family, 108), 152);
  }
  if (state.impact.visible) {
    c.translate(48, 580 + state.impact.y); c.scale(state.impact.scale, state.impact.scale);
    c.fillStyle = css(on === 'clay' ? 'paper' : 'clay'); c.font = font(family, fitSize('COMMIT', family, 1920, 540));
    c.fillText('COMMIT', 0, 0);
  }
  c.restore();
}
