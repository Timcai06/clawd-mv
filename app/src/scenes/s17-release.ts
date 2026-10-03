// V6: world-scale hardware throughout; the original wall is retained from T.every.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { css, lin, POSTER_POST } from '../theme';
import { Voice, heatColor, setLine } from '../kit/lyric-moves';
import { glyphPath } from '../kit/vartype';
import { drawPathText, layoutPath, letterTimes, path3, pathAt, writeHead, type PathLayout, type Path3 } from '../kit/pathtext';
import { WordPlane } from '../kit/wordplane';
import { exitEnvelope } from '../kit/handoff';
import { Rig, p3 } from '../kit/rig';
import { afterBeats, span } from '../kit/time';
import { DeviceWall3D } from './parts/s17-world';
import { resolveReleaseTimes, type ReleaseTimes } from './parts/s17-release-state';
import { buildSwarm, makeRasters, SwarmMesh, cameraAt, devicesAt, devicePoint, freezeWindow, impactAt, IMPACT_PX, commitWidth, commentWidth, commentLine, type Device, type Swarm } from './parts/s17-swarm';
import type { Word } from '../engine/lyrics';
export { IMPACT_PX };
export const TYPE_LEVELS = { giant: 201, lyric: 63.112, label: 20 };
type WordScreen = { plane: WordPlane; word: Word; device: number; glyph?: number; mode: 'intro' | 'merge' | 'free' | 'comment' };
export interface LyricPath { path: Path3; layout: PathLayout; from: number; to: number; name: string }
export function lyricPaths(voice: Voice, T: ReleaseTimes): LyricPath[] {
  const pull = voice.line('Pull request, and that is it'), review = voice.line('Then you wrote, “Looks good to me”');
  const merge = voice.line('Merged to main, and now we’re free'), wall = voice.line('And it works on every machine');
  const make = (name: string, words: Word[], y: number, z: number, from: number, to: number, capH = 1.7): LyricPath => {
    const layout = layoutPath(words, { capH, axes: w => voice.form(w, w.end).axes });
    return { name, layout, path: path3([p3(-layout.s1 / 2, y, z), p3(layout.s1 / 2, y, z)]), from, to };
  };
  return [make('branch', pull.words.slice(0, 2), 8.4, 0.3, pull.start, T.release[4]!.start),
    make('main', pull.words.slice(2), 0.6, 0.3, pull.words[2]!.start, T.release[4]!.start),
    make('wrote', review.words.slice(0, 3), -9.2, 0.3, review.start, T.release[4]!.start),
    make('after-merge', merge.words.slice(3, 6), 1.5, 0.3, merge.words[3]!.start, T.release[6]!.start, 1),
    make('works', wall.words.slice(0, 4), -3.5, 1, wall.start, T.release[7]!.start, 2.3)];
}
export function cursorAt(t: number, audio: SceneCtx['audio'], lyrics: SceneCtx['lyrics'], T = resolveReleaseTimes(audio, lyrics)) {
  const rig = new Rig(); rig.set(cameraAt(audio, lyrics, t, T));
  const merge = lyrics.get('Merged to main, and now we’re free');
  if (t >= merge.words[1]!.start && t <= merge.words[2]!.end + 0.15) {
    const k = span(t, merge.words[1]!.start, merge.words[2]!.end), p = rig.proj((-7 + 15 * k) * 0.6, 0.5, 0.4)!;
    return { x: p.x, y: p.y, h: 12 };
  }
  const active = lyricPaths(new Voice(lyrics, audio), T).filter(p => t >= p.from && t < p.to).at(-1);
  if (active) { const head = pathAt(active.path, writeHead(active.layout.glyphs, t)), p = rig.proj(head.x, head.y, head.z)!; return { x: p.x, y: p.y, h: 12 }; }
  const p = rig.proj(0, 0, 0); return p ? { x: p.x, y: p.y, h: 12 } : { x: 960, y: 540, h: 12 };
}
class World {
  users = 0; layer = new Layer2D(); wall = new DeviceWall3D(); swarmMesh = new SwarmMesh();
  voice: Voice; times: ReleaseTimes; swarm: Swarm; paths: LyricPath[]; words: WordScreen[] = [];
  cursor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.3, 0.08), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...lin('clay')) }));
  comment = new THREE.Mesh(new THREE.BoxGeometry(17.5, 8, 0.18), this.swarmMesh.body.material);
  constructor(ctx: SceneCtx) {
    this.voice = new Voice(ctx.lyrics, ctx.audio); this.times = resolveReleaseTimes(ctx.audio, ctx.lyrics);
    this.paths = lyricPaths(this.voice, this.times); this.swarm = buildSwarm(makeRasters());
    this.times.commitWidth=commitWidth(this.swarm);
    this.swarmMesh.scene.add(this.cursor, this.comment);
    const add = (word: Word, device: number, mode: WordScreen['mode'], glyph?: number, text = word.w, capH = 0.23) => {
      const plane = new WordPlane(text, { capH, axes: this.voice.form(word, word.end).axes, ax: 0.5, ay: 0.5, engrave: mode === 'comment', outline: 0, texCap: 100 });
      this.words.push({ plane, word, device, mode, glyph }); this.swarmMesh.scene.add(plane.mesh);
    };
    this.voice.line('I need one last commit').words.slice(0, 4).forEach((w, i) => add(w, i, 'intro'));
    const merge = this.voice.line('Merged to main, and now we’re free'); let slot = 0;
    merge.words.slice(0, 3).forEach((w, wi) => { Array.from(w.w).forEach((ch, j) => add(w, this.swarm.zipper[slot++]!, 'merge', j, ch)); if (wi < 2) slot++; });
    Array.from(merge.words[6]!.w).forEach((ch, j) => add(merge.words[6]!, this.swarm.free[j]!, 'free', j, ch));
    this.voice.line('Then you wrote, “Looks good to me”').words.slice(3).forEach((w, i) => add(w, i, 'comment', undefined, w.w, 1.5));
  }
  dispose() { for (const x of this.words) x.plane.dispose(); this.cursor.geometry.dispose(); (this.cursor.material as THREE.Material).dispose(); this.comment.geometry.dispose(); this.layer.texture.dispose(); this.wall.dispose(); this.swarmMesh.dispose(); }
}
const worlds = new WeakMap<THREE.WebGLRenderer, World>();
export default class S17Release extends Scene {
  private w!: World;
  override init() { this.w = worlds.get(this.ctx.renderer) ?? new World(this.ctx); worlds.set(this.ctx.renderer, this.w); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); worlds.delete(this.ctx.renderer); } }
  private screenWords(t: number, ds: Device[], cam: ReturnType<typeof cameraAt>) {
    const w = this.w, T = w.times, merge = w.voice.line('Merged to main, and now we’re free'), review = w.voice.line('Then you wrote, “Looks good to me”');
    w.comment.visible = t >= T.release[4]!.start && t < review.end; w.comment.position.set(17, 0, 0.1);
    w.comment.rotation.x = -0.1 * span(t, review.words[6]!.start, review.words[6]!.end);
    if(w.comment.visible) w.comment.scale.x=commentWidth(cam,w.comment.rotation.x)/17.5;
    const comment=commentLine(w.words.filter(s=>s.mode==='comment').map(s=>s.plane.w),17.5*w.comment.scale.x);
    w.cursor.visible = t >= merge.words[1]!.start && t < merge.words[2]!.end + 0.15;
    const k = span(t, merge.words[1]!.start, merge.words[2]!.end); w.cursor.position.set((-7 + 15 * k) * 0.6, 0.5, 0.4);
    for (const s of w.words) {
      const { plane, word } = s;
      const from = s.mode === 'intro' ? T.release[0]!.start : s.mode === 'merge' ? T.release[5]!.start : s.mode === 'free' ? T.release[6]!.start : T.release[4]!.start;
      const to = s.mode === 'intro' ? T.hit : s.mode === 'merge' || s.mode === 'free' ? T.release[7]!.start : review.end;
      const born = s.glyph === undefined ? word.start : letterTimes(word)[s.glyph]!.t0;
      plane.mesh.visible = t >= Math.max(from, born) && t < to; if (!plane.mesh.visible) continue;
      const color=s.mode==='comment'?'ink':'paper';
      plane.set({ prog: s.glyph === undefined ? plane.karaoke(word, t) : 1, aDim: 0, cSung: lin(color), cDone: lin(color), done: span(t, word.end, word.end + 0.4), heat: Math.exp(-Math.max(0, t - born) / 0.28), tone: 0.62 });
      if (s.mode === 'comment') {
        plane.mesh.position.set(comment.x[s.device]!,0,0.25); plane.mesh.rotation.set(w.comment.rotation.x, 0, 0);
        plane.mesh.scale.set(comment.scale*w.voice.form(word,t).axes.wdth/w.voice.form(word,word.end).axes.wdth,comment.scale,1);
      } else {
        const d = ds[s.device]!, p = devicePoint(p3(0, 0, 0.51), d, p3(d.w, d.h, d.d), d.yaw);
        plane.mesh.position.set(p.x, p.y, p.z); plane.mesh.rotation.set(0, d.yaw, 0);
        const scale = d.w * 0.86 * 0.8 / Math.max(0.01, plane.w);
        plane.mesh.scale.set(scale * w.voice.form(word, t).axes.wdth / w.voice.form(word, word.end).axes.wdth, Math.min(scale, d.h * 0.65 / plane.h), 1);
      }
    }
  }
  private wallText(t: number) {
    const w = this.w, c = w.wall.screenCtx, cut = w.times.tomorrow[0]!.start;
    c.clearRect(0, 0, 512, 384);
    const line = w.voice.line('And it works on every machine'), forms = w.voice.forms(line, t).slice(-2), set = setLine(forms, 150);
    c.save(); c.translate(24, 240); c.scale(Math.min(1, 464 / Math.max(1, set.width)), 1);
    for (const [i, x] of set.words.entries()) {
      const word = line.words[i + 4]!, times = letterTimes(word);
      for (const g of x.run.glyphs) {
        const born = Math.min(times[g.i]!.t0, cut - 1 / 60); if (t < born) continue;
        c.fillStyle = heatColor(x.form.stress ? 'ink' : 'paper', 'clay', t - born);
        c.save(); c.translate(x.x + g.x, 0); c.fill(glyphPath(x.run, g)); c.restore();
      }
    } c.restore();
  }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, r = this.ctx.renderer, t = f.t; clearRT(r, out, lin('paper'));
    const cam = cameraAt(this.ctx.audio, this.ctx.lyrics, t, T); w.layer.clear();
    if (t >= T.release[7]!.start) {
      const envelope=exitEnvelope(t,T.tomorrow[0]!.start);
      this.wallText(t); w.wall.setCam(cam);
      w.wall.render(r,out,envelope.still ? 0.9*(envelope.gain-1)/0.25 : Math.pow(0.5,f.beatPhase/0.15));
    } else {
      const ds = devicesAt(w.swarm, this.ctx.audio, this.ctx.lyrics, t, T), freeze = freezeWindow(this.ctx.audio, T);
      if (t >= freeze.end && t < T.release[2]!.start) {
        let j = 0; const mask = w.swarm.rasters.HASH.mask;
        for (let i = 0; i < ds.length && j < mask.length; i++) if (ds[i]!.lit === 0) {
          const p = mask[j++]!, head=56*span(t,freeze.end,Math.min(afterBeats(this.ctx.audio,freeze.end,0.8),T.release[2]!.start));
          ds[i] = { ...ds[i]!, x: (p % 56 - 28) * 0.09, y: -7.5 - Math.floor(p / 56) * 0.09, z: 0, w: 0.07, h: 0.07, lit: p%56<head?1:0 };
        }
      }
      w.swarmMesh.update(ds, cam, t < this.ctx.lyrics.get('I need one last commit').words[1]!.start ? 1 : 1400);
      w.swarmMesh.flash(this.ctx.lyrics.get('I need one last commit').words,t);
      this.screenWords(t, ds, cam); w.swarmMesh.render(r, out);
      if (!w.cursor.visible && w.paths.some(p => t >= p.from && t < p.to)) {
        const p = cursorAt(t, this.ctx.audio, this.ctx.lyrics, T), c = w.layer.ctx; c.fillStyle = css('clay'); c.fillRect(p.x, p.y - p.h, p.h * 0.3, p.h);
      }
    }
    const rig=new Rig();rig.set(cam);
    for(const p of w.paths) if(t>=p.from && t<afterBeats(this.ctx.audio,p.to,1)) {
      const leave=span(t,p.to,afterBeats(this.ctx.audio,p.to,1));
      drawPathText(w.layer.ctx,rig,p.path,p.layout,t,{mode:'stand',base:'paper',on:'ink',axes:(g,t)=>w.voice.form(g.word,t).axes,minPx:50,maxPx:110,
        offset:()=>({d:p3(0,35*leave*leave,2*Math.sin(Math.PI*leave))})});
    }
    this.ctx.comp.draw(r,w.layer.upload(),out);
    return { ...POSTER_POST, grain: 0, hud: 0, frame: 0, ...impactAt(t, T) };
  }
}
