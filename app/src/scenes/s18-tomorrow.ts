import { PrintOverlay } from '../kit/print-overlay';
import { drawNote } from '../kit/note';
import { GlowLayer, postFor } from '../kit/ground';
// S18: measured kf-S18 layout. Dawn is a binary ink/paper screen, never a colour gradient.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, clearRT, W } from '../engine/gl';
import { F, font } from '../engine/type';
import { ease, hash, lerp } from '../engine/util';
import { css } from '../theme';
import { glowDraw, Voice, drawSet, setLine } from '../kit/lyric-moves';
import { drawCredits, drawSignature } from '../kit/credits';
import * as Clawd from '../kit/clawd';
import { blink, drawCursor } from '../kit/cursor';
import { afterBeats, beatsSince, span } from '../kit/time';
import { Lens } from '../kit/lens';
import { resolveOutroTimes, outroState, outroCredits, starState, S18_LAYOUT, CONSTELLATION_EDGES, type OutroTimes } from './parts/s18-score';
import { DAWN_PAPER_GLSL, S18_PAPER } from './parts/s18-print';

// Cap heights for Archivo; label is the pre-conversion Plex Mono font size (px).
export const LYRIC_SIZE = 80;
export const TYPE_LEVELS = { giant: null, lyric: 54.88, label: 20 } as const;

class TomorrowWorld {
  layer = new Layer2D();
  glow = new GlowLayer();
  print = new PrintOverlay('dawnPaper(p, dawn)', { dawn: { value: 0 } }, 'uniform float dawn;\n' + DAWN_PAPER_GLSL);
  nightMask = new FSPass(`uniform float dawn; ${DAWN_PAPER_GLSL}
    void main() { vec2 p = vec2(FRAG_PX.x,1080.0-FRAG_PX.y);
      fragColor=vec4(vec3(1.0-dawnPaper(p,dawn)),1.0); }`, { dawn: { value: 0 } },
    { blending: THREE.CustomBlending, transparent: true });
  paper = new FSPass(S18_PAPER, { dawn: { value: 0 }, glowOnly: { value: 0 } });
  times: OutroTimes;
  voice: Voice;
  users = 0;
  constructor(ctx: SceneCtx) {
    const m = this.nightMask.mat;
    m.blendSrc = THREE.DstColorFactor; m.blendDst = THREE.ZeroFactor;
    m.blendSrcAlpha = THREE.ZeroFactor; m.blendDstAlpha = THREE.OneFactor;
    this.times = resolveOutroTimes(ctx.audio, ctx.lyrics);
    this.voice = new Voice(ctx.lyrics, ctx.audio);
  }
  lens = new Lens();
  dispose() { this.glow.dispose(); this.print.dispose(); this.nightMask.mat.dispose(); this.lens.dispose(); this.layer.texture.dispose(); this.paper.mat.dispose(); }
}
const worlds = new WeakMap<THREE.WebGLRenderer, TomorrowWorld>();

export default class S18Tomorrow extends Scene {
  private world!: TomorrowWorld;
  override init() {
    this.world = worlds.get(this.ctx.renderer) ?? new TomorrowWorld(this.ctx);
    worlds.set(this.ctx.renderer, this.world); this.world.users++;
  }
  override dispose() {
    if (--this.world.users === 0) { this.world.dispose(); worlds.delete(this.ctx.renderer); }
  }

  private stars(c: CanvasRenderingContext2D, t: number) {
    const points = starState(this.ctx.audio, this.world.voice, t, this.world.times);
    c.save(); c.lineWidth = 1.2; c.strokeStyle = css('clay');
    for (const [from, to] of CONSTELLATION_EDGES) {
      const a = points[from]!, b = points[to]!;
      c.globalAlpha = Math.min(a.alpha, b.alpha) * 0.8;
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
    }
    for (const p of points) {
      c.globalAlpha = p.alpha; c.fillStyle = css('clay');
      c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  private calendar(c: CanvasRenderingContext2D, flip: number, textAlpha: number) {
    const { calendar: q, horizon } = S18_LAYOUT;
    const x = q.x, top = q.y + 12, bottom = horizon;
    c.save(); c.lineWidth = 1.3; c.strokeStyle = css('paper');
    c.beginPath(); c.moveTo(x, bottom); c.lineTo(x + 24, top);
    c.lineTo(x + 172, top); c.lineTo(x + 197, bottom); c.stroke();
    // Back and swinging front leaves: two flat printed paper faces.
    c.fillStyle = css('paper'); c.fillRect(x + 31, top + 5, 134, bottom - top - 5);
    c.strokeStyle = css('ink'); c.strokeRect(x + 35, top + 9, 126, bottom - top - 9);
    c.fillStyle = css('ink', textAlpha); c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.font = font(F.mono(600), 20); c.fillText('Oct', x + 98, top + 55);
    c.font = font(F.mono(600), 80); c.fillText('31', x + 98, bottom - 25);
    const skew = 8 + flip * 20;
    c.beginPath(); c.moveTo(x + 174, top + 4); c.lineTo(x + 300, top + 4);
    c.lineTo(x + 310 + skew, bottom - 8); c.lineTo(x + 204, bottom + 3); c.closePath();
    c.fillStyle = css('paper'); c.fill(); c.strokeStyle = css('ink'); c.stroke();
    c.translate(x + 253, top + 58); c.rotate(-0.08);
    c.fillStyle = css('ink', textAlpha); c.font = font(F.mono(600), 20); c.fillText(flip > 0.5 ? 'Nov' : 'Oct', 0, 0);
    c.font = font(F.mono(600), 80); c.fillText(flip > 0.5 ? '1' : '31', 0, 64);
    c.restore();
    // Wire rings and paper fibres, without photographic lighting.
    c.save(); c.lineWidth = 1.3;
    for (const dx of [57, 173, 280]) {
      c.strokeStyle = css('paper'); c.beginPath(); c.ellipse(x + dx, top + 2, 8, 12, 0, Math.PI, Math.PI * 3); c.stroke();
      c.strokeStyle = css('ink'); c.beginPath(); c.ellipse(x + dx, top + 2, 4, 8, 0, Math.PI, Math.PI * 3); c.stroke();
    }
    c.beginPath(); c.rect(x + 35, top + 12, 124, bottom - top - 14); c.clip();
    c.fillStyle = css('ink', 0.12);
    for (let i = 0; i < 400; i++) c.fillRect(x + 35 + hash(i, 181) * 124, top + 12 + hash(i, 182) * 136, 0.6, 0.6);
    c.restore();
  }

  private notification(c: CanvasRenderingContext2D, p: number) {
    if (p <= 0) return;
    const q = S18_LAYOUT.notification, shift = (1 - p) * q.w;
    c.save(); c.translate(shift, 0); c.globalAlpha = p;
    c.transform(1, -0.12, 0, 1, q.x, q.y);
    c.fillStyle = css('paper'); c.fillRect(0, 0, q.w, q.h);
    c.strokeStyle = css('ink'); c.lineWidth = 1.6; c.strokeRect(0, 0, q.w, q.h);
    c.fillStyle = css('ink'); c.fillRect(5, 0, 1, q.h);
    c.font = font(F.mono(500), TYPE_LEVELS.label); c.fillText('Issue #1032', 35, 76);
    c.fillStyle = css('clay'); c.fillRect(226, 44, 14, 35);
    glowDraw(c, this.world.glow.ctx, g => { g.fillStyle = css('clay'); g.fillRect(226,44,14,35); });
    c.restore();
  }

  private sleep(c: CanvasRenderingContext2D, f: Frame, wave: number, showCallout: boolean) {
    const q = S18_LAYOUT.clawd, at = this.world.times.shots[3]!.start;
    const p = Clawd.pose(wave ? 'A13' : 'A1', { beat: f.beat, beat0: this.ctx.audio.beatAt(at), p: 0 });
    // Keep the feet on the reference horizon during the canonical sleep breath.
    Clawd.draw(c, q.x, q.y - p.dy * q.px, p, { px: q.px });
    glowDraw(c, this.world.glow.ctx, g => Clawd.draw(g, q.x, q.y - p.dy * q.px,
      { ...p, cells: p.cells.filter(cell => cell.k === 'O') }, { px: q.px, alpha: 0.25 }));
    if (!showCallout) return;
    c.save(); c.font = font(F.mono(600), TYPE_LEVELS.label); c.fillStyle = css('clay');
    for (let i = 0; i < 3; i++) c.fillText('z', q.x + 161 + i * 28, q.y - 30 - i * 24);
    glowDraw(c, this.world.glow.ctx, g => { g.font = c.font; g.fillStyle = css('clay');
      for (let i = 0; i < 3; i++) g.fillText('z', q.x + 161 + i * 28, q.y - 30 - i * 24); });
    c.restore();
  }

  /**
   * The author card (Tim 2026-10-01: everyone must see at a glance who made this): A FILM BY, then
   * TIM · 蔡任天 dropped in glyph by glyph on eighth notes from the second beat of the last shot,
   * the clay cursor typing after it, held through the fade.
   */
  private signature(c: CanvasRenderingContext2D, f: Frame) {
    const au = this.ctx.audio, at = this.world.times.shots[6]!.start;
    const b = beatsSince(au, f.t, at);
    const label = Math.min(1, Math.max(0, b / 0.6));
    if (label > 0) {
      c.save(); c.globalAlpha = label; c.font = font(F.mono(500), 22); c.fillStyle = css('paper', 0.7);
      c.fillText('A FILM BY  ·  作品', 100, 512); c.restore();
    }
    const right = drawSignature(c, 92, 708, 168, (i) => (b - 1 - i * 0.5) / 0.35, { color: 'paper' });
    if (b > 1) { const cursor = { x: right + 6, y: 708, h: 168, on: b > 4 ? blink(f.beat) : 1 };
      drawCursor(c, cursor); glowDraw(c, this.world.glow.ctx, g => drawCursor(g, cursor)); }
  }

  /**
   * v4 motion: the night is not a still. A slow rise over the constellation and a drift toward the
   * horizon while the stars are named; back to the full frame for the author card (last shot).
   */
  private view(t: number) {
    const T = this.world.times, sig = T.shots[6]!.start;
    const p = span(t, T.start, sig);
    const back = ease.inOutCubic(span(t, afterBeats(this.ctx.audio, sig, -2), sig));
    const zoom = lerp(1 + 0.1 * Math.sin(Math.PI * Math.min(1, p * 1.15)), 1, back);
    return { zoom, fx: lerp(lerp(700, 1100, p), 960, back), fy: lerp(lerp(420, 640, p), 540, back), rot: 0 };
  }

  override render(f: Frame, finalOut: THREE.WebGLRenderTarget) {
    const out = this.world.lens.rt;
    const w = this.world, T = w.times, s = outroState(this.ctx.audio, f.t, T), c = w.layer.ctx;
    clearRT(this.ctx.renderer, out);
    w.paper.u.dawn!.value = s.dawn;
    w.paper.u.glowOnly!.value = 0; w.paper.render(this.ctx.renderer, out);
    w.paper.u.glowOnly!.value = 1;
    w.glow.renderScene(this.ctx.renderer, w.paper.scene, w.paper.cam);
    w.paper.u.glowOnly!.value = 0;
    w.layer.clear(); w.glow.clear();
    this.stars(c, f.t);
    glowDraw(c, w.glow.ctx, g => this.stars(g, f.t));
    c.fillStyle = css('paper', 0.8); c.fillRect(0, S18_LAYOUT.horizon, W, 1);
    c.fillRect(855, S18_LAYOUT.horizon + 12, W - 855, 1);
    this.calendar(c, s.flip, 1);
    this.sleep(c, f, s.wave, s.shot !== 6);
    if (s.shot !== 6) this.notification(c, s.notification);
    { const q = S18_LAYOUT.clawd;
      drawNote(c, { ax: q.x + 8 * q.px, ay: q.y - 6, x: q.x + 8 * q.px + 40, y: q.y - 120, text: 'fig. 18', sub: 'Clawd, resting', t0: T.shots[3]!.start + 0.5, t1: T.shots[6]!.start, on: 'ink' }, f.t); }
    // C17 (R2): "machine" ends 0.06 s after the cut; S17 sings it out, S18 does not re-set the line.
    if (s.shot === 1) {
      const chars = Math.floor(Math.min(1, s.b / 1.5) * 6);
      c.fillStyle = css('paper', 0.6); c.font = font(F.mono(), TYPE_LEVELS.label);
      c.fillText('exit 0'.slice(0, chars), 96, 870);
    }
    if (s.shot === 6) {
      this.signature(c, f);
      drawCredits(c, { x: 96, y: 742, width: 840, height: 170 }, { ...outroCredits(this.ctx.audio, f.t, T), columns: 1 });
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.print.pass.u.dawn!.value = s.dawn; w.print.render(this.ctx.renderer, out);
    // Remove the dawn PAPER coverage from the clay glow canvas before its HDR composite.
    w.nightMask.u.dawn!.value = s.dawn;
    w.glow.composite(this.ctx, out, 1.6, w.nightMask);
    w.lens.film(this.ctx.renderer, finalOut, this.view(f.t));
    return { ...postFor('ink'), ca: 0.6, grain: 0.012, hud: 0, fade: s.fade };
  }
}
