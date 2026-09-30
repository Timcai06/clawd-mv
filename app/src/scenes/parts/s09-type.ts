// Local D-group lyrics belong to the instrument, glass, storm, or copy.
import type { SceneCtx } from '../../engine/scene';
import { F, font, glyphX, fitSize } from '../../engine/type';
import { lyricsTypeState } from '../../kit/lyrics-type';
import { css, type ThemeKey } from '../../theme';

export function sungLine(c: CanvasRenderingContext2D, ctx: SceneCtx, t: number,
  x: number, y: number, width: number, color: ThemeKey, size = 27) {
  const s = lyricsTypeState(ctx.lyrics, t, ctx.audio);
  if (!s.visible) return;
  const family = F.mono(500), px = fitSize(s.text, family, width, size);
  c.save(); c.font = font(family, px); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = css(color, 0.27); c.fillText(s.text, x, y); c.fillStyle = css(color);
  for (const w of s.words) {
    if (w.progress <= 0) continue;
    const left = glyphX(s.text, w.from, family, px), right = glyphX(s.text, w.to, family, px);
    c.save(); c.beginPath(); c.rect(x + left, y - px * 1.2, (right - left) * w.progress, px * 1.6);
    c.clip(); c.fillText(s.text, x, y); c.restore();
  }
  c.restore();
}
export function mono(c: CanvasRenderingContext2D, text: string, x: number, y: number,
  size = 18, color: ThemeKey = 'ink', alpha = 1) {
  c.save(); c.font = font(F.mono(500), size); c.fillStyle = css(color, alpha);
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(text, x, y); c.restore();
}
