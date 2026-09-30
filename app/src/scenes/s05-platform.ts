// S05 — a source-code cross section. Three independently parallaxed code strata,
// a file tree drawn as an engineering blueprint, and Clawd walking the readable lines.
// Large changes use the storyboard cuts; all smaller moves use the measured beat grid.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, W, H } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { Lyrics, type Line } from '../engine/lyrics';
import { F, font, layout } from '../engine/type';
import { ease, lerp } from '../engine/util';
import { css, lin } from '../theme';
import { GlowLayer, postFor } from '../kit/ground';
import { blink, drawCursor } from '../kit/cursor';
import { MONTH_SOURCE, MONTH_PATH } from '../kit/content';
import { tokenizeLines, type Token } from '../kit/syntax';
import { beatsSince, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { DRAWERS, HERO_ROWS, platformState, platformTimes, projectPlatform, type PlatformTimes } from './parts/s05-platform-model';

const PAPER = lin('paper'), CLAY = lin('clay');

// A blueprint field, with the layer registration travelling at three different speeds.
// It stays active during the claw close-up as well as during the scrolling shot.
const BLUEPRINT = /* glsl */ `
uniform vec3 ink, paper, clay;
uniform float t, pan, dive, zoom, kick, speed;
float rule(float p, float period, float width) {
  float d = abs(fract(p / period + 0.5) - 0.5) * period;
  return 1.0 - smoothstep(width * 0.5, width * 0.5 + 0.8 / PX_SCALE, d);
}
void main() {
  vec2 px = FRAG_PX;
  vec3 c = ink;
  for (int i = 0; i < 3; i++) {
    float layer = float(i);
    float depth = 0.15 + layer * 0.21;
    vec2 q = (px - vec2(960.0, 540.0)) / zoom + vec2(pan, -dive) * depth;
    float pitch = 84.0 + layer * 28.0;
    float fine = max(rule(q.x, pitch, 0.65), rule(q.y, pitch, 0.65));
    float major = max(rule(q.x, pitch * 4.0, 1.0), rule(q.y, pitch * 4.0, 1.0));
    c = mix(c, paper, fine * (0.012 + layer * 0.012) + major * (0.022 + kick * 0.04));
    // Registration strokes sliding only during the camera's snaps, not a random particle field.
    float column = floor(q.y / 14.0);
    float id = hash12(vec2(column, layer + 19.0));
    float stroke = step(0.984, id) * rule(q.y, 14.0, 0.75);
    stroke *= smoothstep(0.70, 0.92, fract(q.x / 960.0 - pan * 0.0003 + id));
    c = mix(c, paper, stroke * speed * 0.10);
  }
  // Faint depth haze is allowed on INK; there is no light source, reflection or lens flare.
  float haze = 0.021 * (0.5 + 0.5 * snoise(vec3(vUv * 3.0, t * 0.07)));
  c = mix(c, paper, haze);
  float scan = rule(px.x - t * 28.0 - pan * 0.04, 840.0, 1.1);
  c = mix(c, clay, scan * 0.025);
  fragColor = vec4(c, 1.0);
}`;

interface CodeRow {
  x: number; y: number; width: number; line: number;
  factor: number; opacity: number; size: number;
}

const STRATA = [
  { factor: 0.22, opacity: 0.18, size: 22, pitch: 94, baseY: 245, baseX: -1150, width: 1240, count: 22 },
  { factor: 0.55, opacity: 0.37, size: 30, pitch: 168, baseY: 410, baseX: -930, width: 1700, count: 18 },
] as const;

class PlatformWorld {
  users = 0;
  times: PlatformTimes;
  background = new FSPass(BLUEPRINT, {
    ink: { value: new THREE.Vector3(...lin('ink')) },
    paper: { value: new THREE.Vector3(...PAPER) }, clay: { value: new THREE.Vector3(...CLAY) },
    t: { value: 0 }, pan: { value: 0 }, dive: { value: 0 }, zoom: { value: 1 }, kick: { value: 0 }, speed: { value: 0 },
  });
  lines = new LineBatch(12000, { blend: 'normal' });
  text = new Layer2D();
  glow = new GlowLayer();
  tokens = tokenizeLines(MONTH_SOURCE);
  rows: CodeRow[] = [];

  constructor(ctx: SceneCtx) {
    this.times = platformTimes(ctx.audio, ctx.lyrics);
    for (const layer of STRATA) {
      for (let i = 0; i < layer.count; i++) {
        this.rows.push({
          x: layer.baseX + (i % 4) * 970,
          y: layer.baseY + Math.floor(i / 4) * layer.pitch,
          width: layer.width + (i % 3) * 110,
          line: 1 + ((i * 3 + Math.round(layer.factor * 10)) % MONTH_SOURCE.length),
          factor: layer.factor, opacity: layer.opacity, size: layer.size,
        });
      }
    }
  }

  dispose() {
    this.background.mat.dispose(); this.lines.geo.dispose(); this.lines.mat.dispose();
    this.text.texture.dispose(); this.glow.layer.texture.dispose();
  }
}

let world: PlatformWorld | undefined;
type State = ReturnType<typeof platformState>;

export default class S05Platform extends Scene {
  private w!: PlatformWorld;

  override init() {
    this.w = world ??= new PlatformWorld(this.ctx); this.w.users++;
  }

  override dispose() {
    if (this.w && --this.w.users === 0) { this.w.dispose(); world = undefined; }
  }

  private line(s: State, ax: number, ay: number, bx: number, by: number, factor: number,
    width = 1, alpha = 0.6, color = PAPER) {
    const a = projectPlatform(ax, ay, factor, s), b = projectPlatform(bx, by, factor, s);
    // Cull before filling the GPU batch; the foreground world is wider than the frame.
    if (Math.max(a.x, b.x) < -20 || Math.min(a.x, b.x) > W + 20 || Math.max(a.y, b.y) < -20 || Math.min(a.y, b.y) > H + 20) return;
    this.w.lines.seg2(a.x, a.y, b.x, b.y, width, color, alpha);
  }

  private arrow(s: State, ax: number, ay: number, bx: number, by: number, factor: number, alpha: number) {
    this.line(s, ax, ay, bx, by, factor, 1.2, alpha);
    const angle = Math.atan2(by - ay, bx - ax);
    for (const side of [-1, 1]) {
      this.line(s, bx, by, bx - Math.cos(angle + side * 0.5) * 12,
        by - Math.sin(angle + side * 0.5) * 12, factor, 1.2, alpha);
    }
  }

  private structure(s: State, row: CodeRow, read = false) {
    const { x, y, width: rw, factor, opacity } = row;
    const alpha = read ? 0.92 : opacity;
    // A code line is a ledge in section: a top surface, sparse support ribs, then a foot.
    this.line(s, x - 80, y + 4, x + rw, y + 4, factor, read ? 2.1 : 1.05, alpha);
    this.line(s, x - 80, y + 20, x + rw, y + 20, factor, 0.8, opacity * 0.55);
    for (let k = 0; k <= Math.floor(rw / 140); k++) {
      const xx = x - 60 + k * 140;
      this.line(s, xx, y + 21, xx + 19, y + 40, factor, 0.75, opacity * 0.40);
    }
    this.line(s, x - 80, y + 4, x - 80, y + 45, factor, 1.0, alpha * 0.65);
    this.line(s, x + rw, y + 4, x + rw, y + 45, factor, 1.0, alpha * 0.65);
    if (read) {
      const to = Math.min(x + rw, s.walkX + 210);
      if (to > x - 80) this.line(s, x - 80, y + 4, to, y + 4, factor, 2.2, 0.95, CLAY);
    }
  }

  private code(c: CanvasRenderingContext2D, s: State, row: CodeRow, read = false) {
    const p = projectPlatform(row.x, row.y, row.factor, s);
    const size = row.size * s.zoom;
    if (p.y < 0 || p.y > H + 80 || p.x > W || p.x + row.width * s.zoom < 0) return;
    const tokens: readonly Token[] = this.w.tokens[row.line - 1] ?? [];
    const cell = size * 0.60;
    c.font = font(F.mono(400), size); c.textBaseline = 'alphabetic';
    // The row number is not a UI gutter: it is a blueprint station marker for the ledge.
    c.fillStyle = css('paper', row.opacity * 0.75);
    c.fillText(String(row.line).padStart(2, '0'), p.x - 66 * s.zoom, p.y - 14 * s.zoom);
    for (const token of tokens) {
      const alpha = token.kind === 'comment' ? row.opacity * 0.56 : read ? 0.96 : row.opacity;
      c.fillStyle = css('paper', alpha);
      c.font = font(F.mono(token.kind === 'keyword' ? 600 : 400), size);
      c.fillText(token.text, p.x + token.start * cell, p.y - 14 * s.zoom);
    }
  }

  private strata(s: State) {
    const c = this.w.text.ctx;
    for (const row of this.w.rows) { this.structure(s, row); this.code(c, s, row); }
    // Foreground code remains actual month.ts content, rather than invented decorative text.
    HERO_ROWS.forEach((r, i) => {
      const row: CodeRow = { ...r, factor: 1, opacity: s.phase === 2 && i < s.readRows ? 0.9 : 0.50, size: 42 };
      const read = s.phase === 2 && i < s.readRows;
      this.structure(s, row, read); this.code(c, s, row, read);
      const p = projectPlatform(r.x, r.y + 77, 1, s);
      if (p.y > 250 && p.y < H - 50 && p.x > -300 && p.x < W) {
        c.font = font(F.mono(400), 14 * s.zoom); c.fillStyle = css('paper', 0.36);
        c.fillText(['buildMonth()', 'daysIn()', 'enumerate()', 'return dates'][i]!, p.x, p.y);
      }
    });
    if (s.phase === 0) {
      // The opening macro shot has a plain source ledge beneath the canonical sprite.
      this.structure(s, { x: 450, y: 632, width: 1410, line: 20, factor: 1, opacity: 0.85, size: 30 });
    }
  }

  private fileTree(f: Frame, s: State) {
    const c = this.w.text.ctx;
    for (let i = 0; i < DRAWERS.length; i++) {
      const node = DRAWERS[i]!, k = s.drawers[i]!;
      if (k <= 0) continue;
      const x = node.x - (1 - k) * 360, y = node.y;
      const visibleWidth = node.width * k;
      const p = projectPlatform(x, y, 1, s);
      // An open section, not a framed imitation editor panel.
      this.line(s, x, y, x + visibleWidth, y, 1, 1.8, 0.9);
      this.line(s, x, y, x, y - 90 * k, 1, 1, 0.55);
      this.line(s, x, y - 90 * k, x + 28, y - 90 * k, 1, 1, 0.55);
      this.line(s, x, y + 16, x + visibleWidth, y + 16, 1, 0.7, 0.25);
      // A ghost registration line shows how far the drawer slid out.
      for (let d = 0; d < 6; d++) {
        const xx = node.x - 290 + d * 44;
        this.line(s, xx, y + 47, xx + 22, y + 47, 1, 0.85, 0.28 * k);
      }
      if (i > 0) {
        const parent = DRAWERS[i - 1]!;
        this.line(s, parent.x + 28, parent.y + 20, parent.x + 28, y - 45, 1, 1.0, 0.45 * k);
        this.arrow(s, parent.x + 28, y - 45, x - 22, y - 45, 1, 0.45 * k);
      }
      c.save();
      c.globalAlpha = k;
      c.fillStyle = css('paper'); c.font = font(F.mono(500), 43 * s.zoom);
      c.fillText(node.label, p.x + 24 * s.zoom, p.y - 24 * s.zoom);
      c.fillStyle = css('paper', 0.38); c.font = font(F.mono(400), 13 * s.zoom);
      c.fillText(`${node.source} / ${String(i + 1).padStart(2, '0')}`, p.x + 26 * s.zoom, p.y + 45 * s.zoom);
      if (i === 2) {
        c.fillStyle = css('paper', 0.58); c.font = font(F.mono(400), 22 * s.zoom);
        c.fillText('export function buildMonth(year, month)', p.x + 385 * s.zoom, p.y - 27 * s.zoom);
        this.arrow(s, x + 64, y + 56, x + 64, HERO_ROWS[0].y - 66, 1, 0.45 * k);
      }
      c.restore();
      const q = projectPlatform(x + visibleWidth, y, 1, s);
      drawCursor(c, { x: q.x, y: q.y - 6, h: 27 * s.zoom, on: blink(f.beat, k < 0.98) });
      drawCursor(this.w.glow.ctx, { x: q.x, y: q.y - 6, h: 27 * s.zoom, on: blink(f.beat, k < 0.98) });
    }
  }

  private character(f: Frame, s: State) {
    const w = this.w;
    const action = s.phase === 0 ? 'A10' : 'A5';
    const p = Clawd.pose(action, {
      beat: f.beat, beat0: this.ctx.audio.beatAt(w.times.start),
      p: s.travel, travel: 0, reach: 4, look: 1,
    });
    const pt = projectPlatform(s.walkX, s.walkY, 1, s);
    const px = s.phase === 0 ? 13 * s.zoom : 9 * s.zoom;
    const x = pt.x - Clawd.W * px / 2, y = pt.y - Clawd.H * px;
    Clawd.draw(w.text.ctx, x, y, p, { px, eye: css('ink') });
    // Only the clay cells are submitted to the glow layer; eye holes never glow.
    Clawd.draw(w.glow.ctx, x, y, p, { px, eye: css('clay', 0), body: css('clay', 0.58) });
    if (s.phase === 0) {
      const c = w.text.ctx;
      const b = beatsSince(this.ctx.audio, f.t, w.times.start);
      const accent = Math.max(0, 1 - (b - Math.floor(b)) * 3);
      const tip = x + (Clawd.W + 4) * px;
      c.fillStyle = css('paper', 0.8); c.font = font(F.mono(400), 19);
      c.fillText('CLAW / READY', 1360, 380);
      // Fine registration / reach dimensions connect the macro to the later blueprint.
      w.lines.seg2(tip + 18, pt.y - 2 * px, 1310, 397, 1, PAPER, 0.45);
      w.lines.seg2(1310, 397, 1560, 397, 1, PAPER, 0.45);
      w.lines.seg2(x - 18, y - 16, x - 18, pt.y + 20, 1, PAPER, 0.3);
      for (const yy of [y - 16, pt.y + 20]) w.lines.seg2(x - 29, yy, x - 7, yy, 1, PAPER, 0.3);
      // Tiny beat-locked marks, never a second invented sprite pose.
      for (let k = 0; k < 3; k++) {
        const xx = tip + 14 + k * 22;
        w.lines.seg2(xx, y + 12 - k * 7, xx + 7, y - 5 - k * 7, 1, PAPER, accent * (1 - k * 0.2));
      }
    }
  }

  private lyricLine(c: CanvasRenderingContext2D, line: Line, f: Frame, x: number, y: number, size: number) {
    const family = F.mono(500), lay = layout(line.text, family, size);
    c.font = font(family, size); c.textBaseline = 'alphabetic';
    c.fillStyle = css('paper', 0.34); c.fillText(line.text, x, y);
    let start = 0;
    for (const word of line.words) {
      const at = line.text.indexOf(word.w, start);
      if (at < 0) continue;
      const left = lay.glyphs[at]?.x ?? 0;
      const right = lay.glyphs[at + word.w.length]?.x ?? lay.width;
      const progress = Lyrics.wordProgress(word, f.t);
      if (progress > 0) {
        c.save(); c.beginPath(); c.rect(x + left - 0.5, y - size, (right - left + 1) * progress, size * 1.3); c.clip();
        c.fillStyle = css('paper'); c.fillText(line.text, x, y); c.restore();
      }
      start = at + word.w.length;
    }
    const progress = Lyrics.lineCharProgress(line, f.t);
    const glyph = lay.glyphs[Math.min(lay.glyphs.length - 1, Math.floor(progress))];
    return x + (progress >= line.text.length ? lay.width : glyph?.x ?? 0);
  }

  private lyrics(f: Frame, s: State) {
    const c = this.w.text.ctx;
    const line = this.ctx.lyrics.lineAt(f.t) ?? this.ctx.lyrics.lastLine(f.t);
    if (!line || f.t > line.end + 0.6) return;
    // Lyrics occupy a source comment on the drawing's header rule, with a typing caret.
    const x = 122, y = 194;
    c.fillStyle = css('paper', 0.32); c.font = font(F.mono(400), 24); c.fillText('//', x, y);
    const head = this.lyricLine(c, line, f, x + 56, y, 30);
    const on = blink(f.beat, f.t >= line.start && f.t < line.end);
    drawCursor(c, { x: head + 12, y: y + 2, h: 29, on });
    drawCursor(this.w.glow.ctx, { x: head + 12, y: y + 2, h: 29, on });
    if (s.phase === 2) {
      // The comment's physical ruler becomes the foreground scan rail as the camera scrolls.
      this.w.lines.seg2(100, 218, 1780, 218, 0.75, PAPER, 0.13);
      const scanX = lerp(120, 1740, s.travel);
      this.w.lines.seg2(120, 218, scanX, 218, 1.6, CLAY, 0.8);
    }
  }

  private register(f: Frame, s: State) {
    const c = this.w.text.ctx;
    c.font = font(F.mono(500), 17); c.fillStyle = css('paper', 0.55);
    c.fillText(MONTH_PATH, 100, 104);
    c.fillStyle = css('paper', 0.33); c.font = font(F.mono(400), 14);
    c.fillText(['SOURCE PREPARATION', 'FILE TREE / EXPANDED SECTION', 'READING / HORIZONTAL SECTION'][s.phase]!, 100, 130);
    this.w.lines.seg2(100, 148, 1760, 148, 0.85, PAPER, 0.18);
    c.font = font(F.mono(400), 14);
    c.fillText('BACK / 0.22', 100, 929); c.fillText('MID / 0.55', 320, 929); c.fillText('SOURCE / 1.00', 550, 929);
    c.fillText(`month.ts / ${s.phase === 2 ? String(HERO_ROWS[s.row]!.line).padStart(2, '0') : '00'}`, 1520, 929);
    // Physical depth registration lines have distinct relative motion, also during the hold.
    for (let i = 0; i < 3; i++) {
      const factor = [0.22, 0.55, 1][i]!;
      const phase = (this.ctx.audio.beatAt(f.t) * 18 + s.camX * factor * 0.12) % 200;
      const y = 953 + i * 14;
      this.w.lines.seg2(100, y, 1770, y, 0.65, PAPER, 0.10);
      for (let k = 0; k < 9; k++) {
        const x = 105 + k * 190 + phase;
        if (x < 1770) this.w.lines.seg2(x, y - 4, x, y + 4, 0.8, PAPER, 0.30);
      }
    }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, s = platformState(this.ctx.audio, f.t, w.times);
    w.text.clear(); w.glow.clear(); w.lines.clear();
    this.strata(s); this.fileTree(f, s); this.character(f, s); this.lyrics(f, s); this.register(f, s);
    // Derive speed from the analytic path, never from the previous rendered frame.
    const before = platformState(this.ctx.audio, f.t - 1 / 120, w.times);
    const speed = Math.min(1, Math.abs(s.camX - before.camX) / 40 + Math.abs(s.camY - before.camY) / 12);
    const u = w.background.u;
    u.t!.value = f.t; u.pan!.value = s.camX; u.dive!.value = s.camY; u.zoom!.value = s.zoom;
    u.kick!.value = f.a.kick; u.speed!.value = speed;
    w.background.render(this.ctx.renderer, out);
    w.lines.render(this.ctx.renderer, out);
    this.ctx.comp.draw(this.ctx.renderer, w.text.upload(), out);
    w.glow.composite(this.ctx, out, 1.55);
    return { ...postFor('ink'), hud: 0, bloom: 0.48, bloomRadius: 0.65, bloomKnee: 0.08, bloomThreshold: 1.0,
      grain: 0.025, vignette: 0.10 };
  }
}
