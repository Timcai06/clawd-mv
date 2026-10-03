// V6: screen rays become stars; the actual calendar city receives dawn and the signature.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F, font } from '../engine/type';
import { css, lin, POSTER_POST } from '../theme';
import { lerp } from '../engine/util';
import { drawCredits, AUTHOR } from '../kit/credits';
import { varRun, glyphPath } from '../kit/vartype';
import { Voice } from '../kit/lyric-moves';
import { afterBeats, beatsSince, span } from '../kit/time';
import { planeAffine, p3 } from '../kit/rig';
import { TomorrowCity, CITY, cityHeight, calendarAffine, cursorScreenAt, cursorGainAt, shadowAt, lightAt, signatureGlyphs, SIGNATURE } from './parts/s18-world';
import { resolveOutroTimes, outroCredits, starState, SIGNATURE_LABEL, CODE_LINE, type OutroTimes } from './parts/s18-score';
export const LYRIC_SIZE = 80;
export const TYPE_LEVELS = { giant: null, lyric: 54.88, label: 20 } as const;
class World {
  users = 0; city = new TomorrowCity(); layer = new Layer2D(); stars = new LineBatch(500, { screen2D: true, blend: 'normal' });
  cursor = new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({toneMapped:false,depthTest:false,depthWrite:false,side:THREE.DoubleSide}));
  cursorScene = new THREE.Scene(); cursorCamera = new THREE.OrthographicCamera(0,1920,0,1080,-1,1);
  times: OutroTimes; voice: Voice;
  constructor(ctx: SceneCtx) { this.times = resolveOutroTimes(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio); this.cursorScene.add(this.cursor); }
  dispose() { this.city.dispose(); this.layer.texture.dispose(); this.stars.geo.dispose(); this.stars.mat.dispose(); this.cursor.geometry.dispose(); this.cursor.material.dispose(); }
}
const worlds = new WeakMap<THREE.WebGLRenderer, World>();
export function cursorAt(t: number, audio: SceneCtx['audio'], lyrics: SceneCtx['lyrics'], T = resolveOutroTimes(audio, lyrics)) { return cursorScreenAt(audio, t, T); }
export default class S18Tomorrow extends Scene {
  private w!: World;
  override init() { this.w = worlds.get(this.ctx.renderer) ?? new World(this.ctx); worlds.set(this.ctx.renderer, this.w); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); worlds.delete(this.ctx.renderer); } }
  private starfield(t: number, out: THREE.WebGLRenderTarget) {
    const w = this.w, points = starState(this.ctx.audio, w.voice, t, w.times), lb = w.stars; lb.clear();
    const cold = lin('paper'), hot = lin('hot');
    for (const p of points) if (p.alpha > 0) {
      const rgb = cold.map((c, i) => lerp(c, hot[i]!, p.hot)) as [number, number, number];
      lb.seg2(p.x - p.r, p.y, p.x + p.r, p.y, 2, rgb, p.alpha);
      lb.seg2(p.x, p.y - p.r, p.x, p.y + p.r, 2, rgb, p.alpha);
    }
    const incoming = points.length - w.times.ohs.length;
    for (let i = incoming + 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      if (b.alpha > 0) lb.seg2(a.x, a.y, b.x, b.y, 0.8, cold, Math.min(a.alpha, b.alpha) * 0.4);
    }
    lb.render(this.ctx.renderer, out);
  }
  private roofText(c: CanvasRenderingContext2D, t: number) {
    const w = this.w, T = w.times;
    for (const d of CITY) {
      const aff = planeAffine(w.city.rig, p3(d.x - 0.4, cityHeight(d, this.ctx.audio, t, T) + 0.012, d.z - 0.3), p3(1, 0, 0), p3(0, 0, 1), 0.012);
      if (!aff) continue;
      const light=lightAt(t,T),dir=light.sunK>0?light.sun:light.moon;
      c.save(); c.setTransform(aff.a, aff.b, aff.c, aff.d, aff.e, aff.f); c.font = font(F.mono(600), 55); c.fillStyle = css(t < T.dawn ? 'paper' : 'ink',0.3+0.7*shadowAt(p3(d.x,cityHeight(d,this.ctx.audio,t,T)+0.02,d.z),dir,this.ctx.audio,t,T)); c.fillText(String(d.day), 0, 0); c.restore();
    }
    if (t >= T.shots[5]!.start && t < T.shots[6]!.start) {
      const d = CITY[0]!, aff = planeAffine(w.city.rig, p3(d.x - 1.1, d.height + 0.02, d.z), p3(1, 0, 0), p3(0, 0, 1), 0.009);
      if (aff) { c.save(); c.setTransform(aff.a, aff.b, aff.c, aff.d, aff.e, aff.f); c.font = font(F.mono(500), 22); c.fillStyle = css('ink'); c.fillText('Issue #1032 · calendar', 0, 0); c.restore(); }
    }
  }
  private credits(c: CanvasRenderingContext2D, t: number) {
    const w = this.w, T = w.times, au = this.ctx.audio, at = T.shots[6]!.start;
    const aff = calendarAffine(w.city.rig); if (!aff) return;
    c.save(); c.setTransform(aff.a, aff.b, aff.c, aff.d, aff.e, aff.f);
    // The card is ink printed on the world calendar, with the original credit rows intact.
    // The underlying engraved, noon-lit floor is the paper; this layer prints only ink.
    c.strokeStyle = css('ink', 0.12); c.lineWidth = 1.3;
    for (let i = 0; i <= 7; i++) { c.beginPath(); c.moveTo(i * 1920 / 7, 0); c.lineTo(i * 1920 / 7, 1080); c.stroke(); }
    for (let i = 0; i <= 5; i++) { c.beginPath(); c.moveTo(0, i * 216); c.lineTo(1920, i * 216); c.stroke(); }
    const b = beatsSince(au, t, at);
    c.font = font(F.mono(500), 22); c.fillStyle = css('ink', Math.min(1, Math.max(0, b / 0.6))); c.fillText(SIGNATURE_LABEL, 1920/7, 216);
    c.restore();
    const run=varRun(AUTHOR.latin,100,{wdth:75,wght:900}),k=SIGNATURE.capH/run.capH;
    for(const [i,g] of signatureGlyphs(au,t,T).glyphs.entries()) if(t>=g.at) {
      const raised=calendarAffine(w.city.rig,g.drop);if(!raised)continue;
      c.save();c.setTransform(raised.a,raised.b,raised.c,raised.d,raised.e,raised.f);c.fillStyle=css('ink');
      if(g.latin){c.translate(g.x,g.y);c.scale(k,k);c.fill(glyphPath(run,run.glyphs[i]!));}
      else {c.font=`600 ${SIGNATURE.capH*1.1}px "PingFang SC", sans-serif`;c.fillText(g.ch,g.x,g.y);}
      c.restore();
    }
    c.save();c.setTransform(aff.a,aff.b,aff.c,aff.d,aff.e,aff.f);
    drawCredits(c, { x: 1920/7, y: 666, width: 5*1920/7, height: 194 }, { ...outroCredits(au, t, T), columns: 1 });
    c.font = '500 22px "PingFang SC", sans-serif'; c.fillStyle = css('ink'); c.fillText(CODE_LINE, 1920/7, 864); c.restore();
  }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio, t = f.t, r = this.ctx.renderer, c = w.layer.ctx;
    clearRT(r, out, lin('ink')); w.layer.clear(); w.city.update(au, t, T);
    const loopAt = afterBeats(au, T.end, -2);
    if (t < loopAt) {
      if (t >= T.shots[2]!.start) { w.city.render(r, out); this.roofText(c, t); }
      this.starfield(t, out);
      const exitAt = T.shots[1]!.start, exitEnd = afterBeats(au, exitAt, 1);
      if (t >= exitAt && t < exitEnd) {
        const chars = Math.floor(span(t, exitAt, exitEnd) * 8);
        c.font = font(F.mono(500), 20); c.fillStyle = css('paper', 1 - span(t, afterBeats(au, exitAt, 0.75), exitEnd)); c.fillText('$ exit 0'.slice(0, chars), 96, 870);
        const q=cursorScreenAt(au,t,T);c.fillStyle = css('clay'); c.fillRect(q.x,q.y,q.w,q.h);
      }
      if (t >= T.flatAt) this.credits(c, t);
    }
    this.ctx.comp.draw(r, w.layer.upload(), out);
    if (t >= T.shots[5]!.start) {
      const q = cursorScreenAt(au, t, T);
      w.cursor.position.set(q.x+q.w/2,q.y+q.h/2,0); w.cursor.scale.set(q.w,q.h,1);
      w.cursor.material.color.setRGB(...lin('clay')).multiplyScalar(cursorGainAt(t,T));
      r.setRenderTarget(out); r.clearDepth(); r.render(w.cursorScene,w.cursorCamera);
    }
    const hit = t >= T.shots[5]!.start ? Math.exp(-(t - T.shots[5]!.start) * 24) : 0;
    return { ...POSTER_POST, hud: 0, frame: 0, grain: 0, shake: [6 * hit, 0] as [number, number] };
  }
}
