// Stage-0 smoke test: proves audio data, lyrics, fonts, beat grid and export all work.
// Shows bar.beat, a beat flash and the current lyric line with per-word karaoke. Delete when real scenes land.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { rgba } from '../engine/palette';
import { F, font } from '../engine/type';
import { Lyrics } from '../engine/lyrics';

export default class Placeholder extends Scene {
  bg = new FSPass(/* glsl */ `uniform float flash; void main(){ fragColor = vec4(mix(C_INK, C_INK2, flash), 1.0); }`, { flash: { value: 0 } });
  text = new Layer2D();

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    this.bg.u.flash!.value = Math.pow(1 - f.beatPhase, 6);
    this.bg.render(renderer, out);

    const c = this.text.ctx;
    this.text.clear();
    c.textBaseline = 'alphabetic';
    c.fillStyle = rgba('ash');
    c.font = font(F.mono(400), 28);
    c.fillText(`CLAWD-MV · STAGE 0 PLACEHOLDER · t ${f.t.toFixed(2)}s · bar ${Math.floor(f.bar) + 1}.${Math.floor(f.beat % 4) + 1}`, 96, 120);

    const line = lyrics.lastLine(f.t);
    if (line && f.t < line.end + 1.5) {
      c.font = font(F.archivo(100, 900), 110);
      let x = 96;
      for (const w of line.words) {
        const k = Lyrics.wordProgress(w, f.t);
        c.fillStyle = k > 0 ? rgba('signal') : rgba('bone', 0.3);
        c.fillText(w.w, x, H / 2 + 40);
        x += c.measureText(w.w + ' ').width;
      }
    }
    c.fillStyle = rgba('bone', 0.9);
    c.fillRect(96, H - 180, (W - 192) * (f.t / this.ctx.audio.duration), 4);
    comp.draw(renderer, this.text.upload(), out);
  }
}
