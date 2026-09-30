// S03: a formal incident report. Vector type and rules are printed onto live
// paper; a separate rubber-stamp coverage texture is distressed in page space.
// The attachment's marker is the same clay cursor that opened the film.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, makeRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { frameIdx, hash } from '../engine/util';
import { css, lin } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { drawCursor } from '../kit/cursor';
import * as Clawd from '../kit/clawd';
import { openingTimes, issueState } from './parts/s01-timing';
import { mono, project, rule, viewCanvas, WrittenLyric } from './parts/s01-drafting';
import { drawForm, EXTRA, STAMP } from './parts/s03-form';

const INK_FRAG = /* glsl */ `
uniform sampler2D groundTex, formTex, stampTex;
uniform vec3 clay;
uniform vec4 view;          // page centre x/y, zoom, roll
uniform vec4 stamp;         // page centre x/y, scale, visible
uniform float angle;

void main() {
  vec3 base = texture(groundTex, vUv).rgb;
  vec4 printed = texture(formTex, vUv);
  // Fine toner coverage belongs to the page, not the screen or frame number.
  vec2 sp = vec2(vUv.x * 1920.0, (1.0 - vUv.y) * 1080.0);
  vec2 d = (sp - vec2(960.0, 540.0)) / view.z;
  float cs = cos(-view.w), sn = sin(-view.w);
  vec2 page = view.xy + vec2(cs * d.x - sn * d.y, sn * d.x + cs * d.y);
  float toner = 0.985 + 0.015 * snoise(page * 0.45);
  vec3 colour = mix(base, printed.rgb * toner, printed.a);
  // Unlike a tinted rectangular badge, only the letter coverage receives ink.
  vec2 q = (page - stamp.xy) / max(stamp.z, 0.01);
  float ca = cos(-angle), sa = sin(-angle);
  q = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
  vec2 uv = q / vec2(350.0, 150.0) + 0.5;
  if (stamp.w > 0.5 && min(uv.x, uv.y) >= 0.0 && max(uv.x, uv.y) <= 1.0) {
    float coverage = texture(stampTex, vec2(uv.x, 1.0 - uv.y)).a;
    float textureNoise = snoise(q * 0.13 + 7.0) * 0.6 + snoise(q * 0.61 - 3.0) * 0.4;
    float voids = smoothstep(-0.46, -0.15, textureNoise);
    float press = 0.78 + 0.22 * smoothstep(-0.5, 0.5, snoise(q * 0.025 + 19.0));
    colour = mix(colour, clay, coverage * voids * press);
  }
  fragColor = vec4(colour, 1.0);
}`;

class IssueWorld {
  users = 0;
  ground = new Ground();
  groundRT = makeRT();
  form = new Layer2D();
  stamp = new Layer2D(STAMP.w, STAMP.h);
  lines = new LineBatch(1500, { blend: 'normal' });
  paper = new FSPass(INK_FRAG, {
    groundTex: { value: this.groundRT.texture }, formTex: { value: this.form.texture },
    stampTex: { value: this.stamp.texture }, clay: { value: new THREE.Vector3(...lin('clay')) },
    view: { value: new THREE.Vector4(960, 540, 1, 0) },
    stamp: { value: new THREE.Vector4(STAMP.x, STAMP.y, 1, 0) }, angle: { value: STAMP.angle },
  });
  T;
  lyric;
  constructor(ctx: SceneCtx) {
    this.T = openingTimes(ctx.audio, ctx.lyrics);
    this.lyric = new WrittenLyric(ctx.lyrics.get('Got a bug report'), 36);
    const c = this.stamp.ctx;
    c.fillStyle = css('clay'); c.font = font(F.archivo(100, 900), 124);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('BUG', STAMP.w / 2, STAMP.h / 2 + 5);
    this.stamp.upload();
  }
  dispose() {
    this.ground.pass.mat.dispose(); this.ground.pass.mesh.geometry.dispose();
    this.paper.mat.dispose(); this.paper.mesh.geometry.dispose(); this.groundRT.dispose();
    this.form.texture.dispose(); this.stamp.texture.dispose();
    this.lines.geo.dispose(); this.lines.mat.dispose();
  }
}
let shared: IssueWorld | undefined;

export default class S03Issue extends Scene {
  private w!: IssueWorld;
  override init() { this.w = shared ??= new IssueWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); shared = undefined; } }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.T, au = this.ctx.audio, s = issueState(au, f.t, T), v = s.view;
    w.ground.render(this.ctx.renderer, w.groundRT, {
      kind: 'paper', t: f.t, camX: v.x - 960 + f.beat * 2.5, camY: v.y - 540,
      zoom: v.zoom, grid: 0.28, cell: 72, kick: f.a.kick, halftone: 0.4, pitch: 12,
    });
    w.form.clear(); w.lines.clear();
    const c = w.form.ctx;
    c.save(); viewCanvas(c, v);
    drawForm(c, s.title, f.beat);
    const p = Clawd.pose('A3', { beat: f.beat, beat0: au.beatAt(T.issue), p: s.title });
    Clawd.draw(c, 646, 195, p, { px: 12 });
    if (s.title < 1) {
      c.font = font(F.archivo(100, 700), 60);
      const title = 'Calendar shows October 32'.slice(0, Math.floor(25 * s.title));
      drawCursor(c, { x: 292 + c.measureText(title).width, y: 297, h: 48 });
    }
    // The incident number becomes a running acquisition index in the margin.
    mono(c, '1031 / 01', 288, 824, 15, 'ink', 0.6);
    c.restore();

    // On the attachment cut, dictation becomes a plate label above the enlarged
    // figure. Its timing stays vocal; its baseline stays within the safe area.
    if (f.t < T.attachment) {
      w.lyric.draw(c, f.t, 288, 936);
    } else {
      mono(c, 'INCIDENT 1031 / REPORTER', 180, 110, 16, 'ink', 0.6);
      w.lyric.draw(c, f.t, 180, 164);
    }

    (w.paper.u.view!.value as THREE.Vector4).set(v.x, v.y, v.zoom, v.roll);
    (w.paper.u.stamp!.value as THREE.Vector4).set(STAMP.x, STAMP.y + s.stampLift, s.stampScale, s.stamp ? 1 : 0);
    w.paper.u.formTex!.value = w.form.upload();
    w.paper.render(this.ctx.renderer, out);

    if (s.circle > 0) {
      // A single plotted loop, followed by its lead-out to the next scene.
      const n = 96;
      for (let i = 0; i < n; i++) {
        const a = i / n, b = Math.min(s.circle, (i + 1) / n);
        if (a >= s.circle) break;
        const point = (k: number): [number, number] => {
          const angle = -Math.PI / 2 + Math.PI * 2 * k;
          const r = EXTRA.r + 1.1 * Math.sin(angle * 3 + 1.2);
          return [EXTRA.x + r * Math.cos(angle), EXTRA.y + r * Math.sin(angle)];
        };
        rule(w.lines, v, point(a), point(b), 0.95, 'clay', 2.6);
      }
      const angle = -Math.PI / 2 + Math.PI * 2 * s.circle;
      const head = project(v, EXTRA.x + EXTRA.r * Math.cos(angle), EXTRA.y + EXTRA.r * Math.sin(angle));
      // Draw the pen after the ink compositor, so it remains sharp and untextured.
      w.form.clear();
      drawCursor(c, { x: head[0], y: head[1] + 9 * v.zoom, h: 19 * v.zoom });
      this.ctx.comp.draw(this.ctx.renderer, w.form.upload(), out);
      w.lines.render(this.ctx.renderer, out);
    }
    const sh = 12 * s.impact, fi = frameIdx(f.t);
    return {
      ...postFor('paper'), hud: 0, grain: 0.022, bloom: 0,
      shake: [sh * (hash(fi, 1031) - 0.5) * 2, sh * (hash(fi, 1032) - 0.5) * 2] as [number, number],
    };
  }
}
