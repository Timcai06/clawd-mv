// S11: engraved/toner storm in depth; the complete reference headline shares its placement
// with the second, missing-glyph slam. The missing boxes settle only during the final beat.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { css } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { glowDraw, heatColor, Voice, drawWithMissing } from '../kit/lyric-moves';
import { affine, drawInscription, inscribe, land, type Inscription } from '../kit/inscribe';
import { hash } from '../engine/util';
import { impact } from '../kit/impact';
import { fillRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { beatHit, resolveX9Times, type X9Times } from './s09-z-shared';
import { DeepStorm } from './parts/s11-deep';
import { headlineState, rainView, handoffOut, ROLL } from './parts/s11-layout';
import { toner, handoffBoxes } from './parts/s09-type';
import { drawWhyLine } from './parts/s09-carry';
// Archivo levels are cap heights; Plex label=18 is its CSS font size.
export const TYPE_LEVELS = { giant: 296.352, lyric: 65.856, label: 18 };
class World {
  glow = new GlowLayer();
  ground = new Ground(); storm: DeepStorm; camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 200);
  layer = new Layer2D(); times: X9Times; voice: Voice; users = 0;
  private rows?: Inscription[];
  /** The verse's two rows, each word in its final shape (letters never reflow while they land). */
  rainRows() {
    const line = this.voice.line('Stack traces falling like rain from the sky');
    return this.rows ??= [line.words.slice(0, 3), line.words.slice(3)].map((ws) =>
      inscribe(ws.map((w) => ({ ...this.voice.form(w, w.end), born: 1, age: 0 })), 96));
  }
  constructor(ctx: SceneCtx) {
    this.storm = new DeepStorm(ctx.renderer); this.times = resolveX9Times(ctx); this.voice = new Voice(ctx.lyrics, ctx.audio);
  }
  dispose() { this.glow.dispose(); this.storm.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); }
}
let world: World | undefined;
export default class S11Rain extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, t = f.t, v = w.voice, au = this.ctx.audio;
    const view = rainView(t, au, T), s = headlineState(v, t, T);
    const hit = Math.max(...T.impacts.map(at => beatHit(au, t, at, 0.12)));
    w.ground.render(this.ctx.renderer, out, { kind: 'ink', t, grid: 0, haze: 0.1,
      streaks: 0.3, streakAngle: view.roll, travel: view.b * 0.2 });
    // Integral of the entrance velocity: exactly 220 screen px/beat at the cut.
    const b = view.b, d = 220 * b + 20 * (b <= 1 ? b ** 2 / 2 : b - 0.5);
    w.storm.update(d, 0, 1, hit * 0.3);
    w.camera.position.set(0, 0, view.z); w.camera.up.set(Math.sin(ROLL), Math.cos(ROLL), 0);
    w.camera.lookAt(0, 0, -20); w.camera.updateMatrixWorld();
    const r = this.ctx.renderer; r.setRenderTarget(out); r.render(w.storm.scene, w.camera);
    const stormMat = w.storm.mesh.material as THREE.ShaderMaterial;
    stormMat.uniforms.glowOnly!.value = 1;
    w.glow.renderScene(r, w.storm.scene, w.camera);
    stormMat.uniforms.glowOnly!.value = 0;
    w.layer.clear(); w.glow.clear(); const c = w.layer.ctx;
    // Stage 9 ②: the verse is rain (pdoom loss.ts "drop"). Each letter falls in along the rain and
    // lands in its slot the moment it is sung, trailing a streak; the "Undefined" slam knocks the
    // whole verse out of its rows, and the letters fall on out of frame with the rest of the storm.
    const verse = v.line('Stack traces falling like rain from the sky');
    if (t >= verse.words[0]!.start) {
      const rows = w.rainRows(), slam = T.impacts[0];
      c.save(); c.translate(180, 390); c.rotate(-ROLL);
      rows.forEach((ins, i) => {
        const off = i === 0 ? 0 : 3;
        const dy = (g: Inscription['glyphs'][number]) => {
          const k = land(t, g.t, 0.16), tf = slam + 0.05 * hash(i, g.wi, g.gi, 5), u = Math.max(0, t - tf);
          return -(1 - k) * 220 + 1400 * u + 0.5 * 5200 * u * u;
        };
        const live: Inscription = { ...ins, glyphs: ins.glyphs.map((g) => ({ ...g, form: v.form(verse.words[g.wi + off]!, t) })) };
        drawInscription(c, live, t, { on: 'ink', head: 'scan', place: (g, x) => affine(x, i * 125 + dy(g)), glow: w.glow.ctx });
        // the streak each drop leaves while it falls in
        c.strokeStyle = css('paper', 0.5); c.lineWidth = 2; c.beginPath();
        for (const g of ins.glyphs) {
          const k = land(t, g.t, 0.16);
          if (t < g.t || k >= 0.98) continue;
          const x = g.x + g.adv / 2, top = i * 125 + dy(g) - ins.capH;
          c.moveTo(x, top - 260 * (1 - k)); c.lineTo(x, top - 8);
        }
        c.stroke();
      }); c.restore();
    }
    // C10 (R2): "…like glass" is carried by the glass strip's shards in S10; not re-set here.
    if (s.first.born > 0) {
      c.save(); c.translate(s.x, s.y); c.rotate(s.roll); c.scale(s.sx, s.sy);
      c.globalAlpha = s.first.born * (1 - s.out);
      c.fillStyle = heatColor(s.first.stress ? 'clay' : 'paper', 'ink', s.first.age); fillRun(c, s.run);
      if (s.first.stress) glowDraw(c, w.glow.ctx, g => { g.fillStyle = c.fillStyle; fillRun(g, s.run); });
      if (s.second.born > 0) {
        c.globalAlpha = s.second.born * (1 - s.out);
        drawWithMissing(c, s.run, 0, 0, i => s.second.sung * 10 - i - 0.6, heatColor(s.second.stress ? 'clay' : 'paper', 'ink', s.second.age));
        if (s.second.stress) glowDraw(c, w.glow.ctx, g => drawWithMissing(g, s.run, 0, 0, i => s.second.sung * 10 - i - 0.6, heatColor('clay','ink',s.second.age)));
      }
      c.restore();
      toner(c, s.dominant, 31, 2600);
    }
    if (s.out > 0) {
      // Exactly nine equally spaced .notdef boxes; S12 expands these into its copy row.
      const h = handoffOut(t, au, T);
      c.save(); c.globalAlpha = s.out; c.strokeStyle = css('paper'); c.lineWidth = 4;
      for (const b of handoffBoxes(h)) c.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      c.restore();
    }
    drawWhyLine(c, v, t, 'ink', w.glow.ctx);
    const crab = s.clawd; Clawd.draw(c, crab.x, crab.y, crab.pose, { px: crab.px });
    glowDraw(c, w.glow.ctx, g => Clawd.draw(g, crab.x, crab.y, { ...crab.pose, cells: crab.pose.cells.filter(cell => cell.k === 'O') }, { px: crab.px, alpha: 0.25 }));
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.glow.composite(this.ctx, out, 1.6);
    // Each "Undefined" slams the frame (pdoom hook.ts shake), still for the last 0.1 s.
    const shake = impact(t, T.impacts.map((at, i) => ({ t: at, shake: 12 + 6 * i, kick: 0.03 })), T.rainEnd).shake;
    return { ...postFor('ink'), hud: 0, ca: 0.6, shake };
  }
}
