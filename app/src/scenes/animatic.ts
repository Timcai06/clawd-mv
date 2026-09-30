// A plain, data-driven timing sheet. One shared canvas avoids 80 full-size textures.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { Lyrics, type Line } from '../engine/lyrics';
import type { ResolvedShot, StoryScene } from '../storyboard';
import { clawdPose } from './animatic-clawd';

const FONT = 'system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';
let shared: Layer2D | undefined;
let users = 0;

function wrap(c: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const char of text) {
    if (line && c.measureText(line + char).width > width) { lines.push(line); line = ''; }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}

export default class Animatic extends Scene {
  // Even malformed, overlapping source windows must never create a dissolve.
  override handlesTransition = true;
  private layer!: Layer2D;
  private shot!: ResolvedShot;
  private scene!: StoryScene;
  private description: string[] = [];
  private camera: string[] = [];
  private gray = 180;
  private startBeat = 0;
  private landing = 0;

  override init() {
    this.layer = shared ??= new Layer2D();
    users++;
    this.shot = this.ctx.params.shot;
    this.scene = this.ctx.params.scene;
    this.gray = 152 + ((this.ctx.params.sceneIndex * 7) % 18) * 5;
    const c = this.layer.ctx;
    c.font = `44px ${FONT}`;
    this.description = wrap(c, this.shot.visual, 1220);
    c.font = `34px ${FONT}`;
    this.camera = wrap(c, `镜头运动：${this.shot.camera}`, 1220);
    this.startBeat = this.ctx.audio.beatAt(this.ctx.start);
    this.landing = this.ctx.audio.downbeats.find((t) => t > this.ctx.start + 1e-6)
      ?? this.ctx.start + 4 * 60 / this.ctx.audio.bpm;
  }

  private drawLyrics(c: CanvasRenderingContext2D, line: Line | null, t: number) {
    c.font = `40px ${FONT}`;
    if (!line) { c.fillStyle = '#444'; c.fillText('（器乐 / 当前无歌词）', 80, 840); return; }
    let x = 80, y = 840;
    for (const word of line.words) {
      const width = c.measureText(word.w).width;
      if (x + width > W - 80) { x = 80; y += 58; }
      const progress = Lyrics.wordProgress(word, t);
      const active = t >= word.start && t < word.end;
      c.fillStyle = active ? '#222' : progress >= 1 ? '#777' : '#aaa';
      c.fillRect(x - 5, y - 40, width + 10, 50);
      c.fillStyle = active ? '#fff' : '#111';
      c.fillText(word.w, x, y);
      c.fillStyle = '#111';
      c.fillRect(x, y + 12, width * progress, 3);
      x += width + c.measureText(' ').width + 12;
    }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, lyrics } = this.ctx;
    const c = this.layer.ctx;
    this.layer.clear(`rgb(${this.gray},${this.gray},${this.gray})`);
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.fillStyle = '#111';
    c.font = `60px ${FONT}`;
    c.fillText(`${this.shot.id}  ${this.scene.name}`, 80, 110);
    c.font = `28px ${FONT}`;
    c.fillText('画面描述', 80, 208);
    c.font = `44px ${FONT}`;
    this.description.forEach((text, i) => c.fillText(text, 80, 274 + i * 60));
    c.font = `34px ${FONT}`;
    this.camera.forEach((text, i) => c.fillText(text, 80, 610 + i * 46));
    c.fillText(`Clawd 动作：${this.shot.clawd ?? '—（无）'}`, 80, 724);

    c.font = `28px ${FONT}`;
    c.fillText(`Clawd · ${this.shot.clawd ?? '无动作'}`, 1410, 392);
    c.fillStyle = '#ddd';
    c.fillRect(1380, 420, 460, 324);
    c.fillStyle = '#333';
    const progress = Math.min(1, Math.max(0, f.p));
    const pose = clawdPose(this.shot.clawd, f.beat, f.beat - this.startBeat, progress,
      f.lt / Math.max(1e-6, this.landing - this.ctx.start));
    for (const pixel of pose) c.fillRect(1430 + pixel.x * 22, 586 + pixel.y * 22, 22, 22);

    this.drawLyrics(c, lyrics.lineAt(f.t), f.t);
    c.fillStyle = '#111';
    c.font = `30px ${FONT}`;
    c.fillText(`小节 ${Math.floor(f.bar) + 1} · 拍 ${Math.floor(((f.beat % 4) + 4) % 4) + 1}     ${f.t.toFixed(2)} s     镜头 ${f.lt.toFixed(2)} / ${this.shot.duration.toFixed(2)} s`, 80, 975);
    if (this.shot.source === 'fallback') {
      c.font = `24px ${FONT}`;
      c.textAlign = 'right';
      c.fillText('回退 t', W - 80, 60);
      c.textAlign = 'left';
    }
    c.fillStyle = '#888'; c.fillRect(80, H - 60, W - 160, 12);
    c.fillStyle = '#222'; c.fillRect(80, H - 60, (W - 160) * progress, 12);
    comp.draw(renderer, this.layer.upload(), out, { mode: 'replace' });
    return { bloom: 0, halation: 0, ca: 0, grain: 0, vignette: 0, hud: 0 };
  }

  override dispose() {
    if (--users === 0) { this.layer.texture.dispose(); shared = undefined; }
  }
}
