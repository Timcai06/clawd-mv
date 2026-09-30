import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import type { AudioData } from '../engine/audio';
import { F, font } from '../engine/type';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawLyricsHook, drawLyricsLine, lyricsTypeState } from '../kit/lyrics-type';

/** Count from the measured downbeat phase, including the opening pickup as bar zero. */
export function lyricsMeter(audio: AudioData, t: number) {
  const barIndex = Math.floor(audio.barAt(t));
  const beat = Math.floor(audio.beatAt(t) - audio.beatAt(audio.downbeats[0]) + 1e-7);
  return { bar: barIndex + 1, beat: ((beat % 4) + 4) % 4 + 1 };
}

/** The entire master timeline: no shot snapping, loops or manually corrected lyric times. */
export default class GalleryLyrics extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx, { lyrics, audio } = this.ctx;
    this.layer.clear(css('paper'));
    c.fillStyle = css('ink', INK_SOFT.faint);
    for (let i = 0; i <= 12; i++) c.fillRect(80 + i * (W - 160) / 12, 0, 1, H);
    for (const y of [160, 864, 984]) c.fillRect(0, y, W, 1);
    c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 48); c.fillText('WORKS ON MY MACHINE', 80, 96);
    const meter = lyricsMeter(audio, f.t);
    c.font = font(F.mono(500), 24); c.fillText(`BAR ${String(meter.bar).padStart(2, '0')}  /  BEAT ${meter.beat}`, 1253, 96);
    const state = lyricsTypeState(lyrics, f.t, audio);
    if (state.style === 'hook') drawLyricsHook(c, { x: 0, y: 200, width: W, height: 660 }, state);
    else drawLyricsLine(c, { x: 80, y: 480, width: W - 160, height: 120 }, state);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 20);
    c.fillText(`${f.t.toFixed(3)} s / ${audio.duration.toFixed(3)} s`, 80, 1032);
    c.fillText(`LINE ${state.visible ? String(state.lineIndex + 1).padStart(2, '0') : '—'} / ${lyrics.lines.length}`, 1253, 1032);
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
