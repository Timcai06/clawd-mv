// World-attached typography plans and projection measurements; no DOM required.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Word } from '../../engine/lyrics';
import { ease, hash } from '../../engine/util';
import { Voice } from '../../kit/lyric-moves';
import { span } from '../../kit/time';
import { layoutPath, path3, pathAt, writeHead, letterTimes, runInkBounds, drawPathText, type PathLayout, type Path3 } from '../../kit/pathtext';
import { SolidText, solidLetterGeometry } from '../../kit/solidtype';
import * as THREE from 'three';
import { Rig, p3, type P3 } from '../../kit/rig';
import { varRun, type Axes } from '../../kit/vartype';
import { implosionAt, type ChorusScore } from './s13-score';
import { BASE_SLABS, WORD_SLOTS, SLAB, cameraAt, collapsePoint, onSlab, slabPose, topIndex,
  wallDepth, sideWallAt, clawdAt, tailTravel, entryPrim, exitPrim, fitsJump, implosionPoint, commitScale, COMMIT_INSET } from './s13-world';

export interface PrefixPlan { word: Word; second: boolean; slot: number; capH: number; axes: Axes; width: number; layout: PathLayout }
export interface PlanePlan { word: Word; carrier: 'fix' | 'local' | 'ci'; event: number; x: number; y: number; capH: number; axes: Axes; width: number; layout: PathLayout }
export interface PathPlan { words: Word[]; kind: 'and' | 'tests'; row: number; layout: PathLayout }
export function lyricPlans(T: ChorusScore, voice: Voice) {
  const metrics = (word: Word, capH: number) => {
    const axes = voice.form(word, word.end).axes, run = varRun(word.w.toUpperCase(), 100, axes), b = runInkBounds(run);
    return { axes, width: (b.x1-b.x0) * capH / run.capH,
      layout: layoutPath([word], { capH, axes: w => voice.form(w, w.end).axes, upper: true }) };
  };
  const prefixes: PrefixPlan[] = [0, 3].flatMap((li, n) => T.lines[li]!.words.slice(0, 4).map((word, slot) => {
    const capH = n ? 0.65 : 2.4;
    return { word, second: !!n, slot, capH, ...metrics(word, capH) };
  }));
  const planes: PlanePlan[] = [];
  T.slabs.forEach((s, event) => {
    if (s.kind !== 'fix') return;
    let x = -1.8; // The left 1.4 units are reserved for the machine hash on the same face.
    for (const word of s.words) {
      const m = metrics(word, 0.285);
      planes.push({ word, carrier: 'fix', event, x, y: 0.035, capH: 0.285, ...m }); x += m.width + 0.16;
    }
  });
  T.lines[4]!.words.forEach((word, i) => {
    const local = i < 3;
    planes.push({ word, carrier: local ? 'local' : 'ci', event: -1, x: local ? (i < 2 ? 11.5 : 9) : (i === 3 ? -10.1 : -14.2),
      y: 3 - (local ? i : i - 3) * 1.4, capH: 0.8, ...metrics(word, 0.8) });
  });
  const paths: PathPlan[] = [
    ...[1, 3].map((index, row): PathPlan => ({ words: [T.lines[1]!.words[index]!], kind: 'and', row,
      layout: layoutPath([T.lines[1]!.words[index]!], { capH: 0.36, axes: w => voice.form(w, w.end).axes, upper: true }) })),
    ...[T.lines[2]!.words.slice(0, 3), T.lines[2]!.words.slice(3)].map((words, row): PathPlan => ({
      words, kind: 'tests', row, layout: layoutPath(words, { capH: 0.7, axes: w => voice.form(w, w.end).axes, upper: true, space: 0.24 }) })),
  ];
  return { prefixes, planes, paths };
}
export function prefixPose(audio: AudioData, t: number, p: PrefixPlan, T: ChorusScore, rig: Rig) {
  const descent = 6 * (1 - ease.inQuad(span(t, p.word.start - 0.1, p.word.start)));
  if (p.second) {
    const index = BASE_SLABS - 1 - p.slot;
    const slab = slabPose(audio, t, index, T, rig);
    const x = p.slot % 2 ? 0.15 : -3.35;
    return { at: onSlab(slab, p3(x, -p.capH / 2, SLAB.d / 2 - 0.08 + descent)),
      yaw: slab.yaw, spin: 0, visible: t >= p.word.start, scaleX: slab.scaleX };
  }
  const hit = WORD_SLOTS[p.slot]!, flight = Math.max(0, t - T.hit1), seed = p.word.gi;
  return { at: p3(hit.x + (hash(seed, 11) - 0.5) * 5 * flight,
    hit.y - 70 * flight * flight, wallDepth(hit.x, hit.y, t, T) + descent + flight),
    yaw: (hash(seed, 12) - 0.5) * flight, spin: (hash(seed, 13) - 0.5) * 5 * flight,
    visible: t >= p.word.start, scaleX: 1 };
}
export function planePose(audio: AudioData, t: number, p: PlanePlan, T: ChorusScore, rig: Rig) {
  if (p.carrier === 'fix') {
    const slab = slabPose(audio, t, BASE_SLABS + p.event, T, rig);
    return { at: onSlab(slab, p3(p.x, p.y, SLAB.d / 2 + 0.015)), yaw: slab.yaw, scaleX: slab.scaleX };
  }
  const wall = sideWallAt(t, p.carrier === 'local', T);
  return { at: p3(wall.x + p.x, wall.y + p.y, wall.z + 0.76), yaw: 0, scaleX: 1 };
}
export function pathFor(audio: AudioData, t: number, p: PathPlan, T: ChorusScore, rig: Rig, anchor?: P3): Path3 {
  const at = p.kind === 'and' ? p.words[0]!.start : Math.min(t, T.pickup2 - 1e-6);
  const index = topIndex(at, T), slab = slabPose(audio, t, index, T, rig);
  const flight=p.kind==='tests'?Math.max(0,t-T.lines[3]!.words[0]!.start):0;
  const y = slab.height / 2 + 0.02 - 1500*flight*flight, z = p.kind === 'tests' ? (p.row ? 1.15 : -1.15) : 0.9;
  const L = p.layout.s1, x = p.kind === 'and' ? (p.row ? 1.4 : -3.3) : -L / 2;
  const points = [onSlab(slab, p3(x, y, z)), onSlab(slab, p3(x + L, y, z))];
  return path3(anchor ? points.map(q => collapsePoint(q, t, T, anchor)) : points);
}
/** Standing letters are buried by the next physical slab, rather than faded in place. */
export function pathCovered(t: number, p: PathPlan, T: ChorusScore): boolean {
  const born = p.kind === 'and' ? p.words[0]!.start : T.pickup2 - 1e-6;
  const index = topIndex(born,T), next = T.slabs[index-BASE_SLABS+1];
  return !!next && t >= next.at;
}
export function cursorAt(audio: AudioData, t: number, T: ChorusScore, voice: Voice, plans: ReturnType<typeof lyricPlans>, P14: { x: number; y: number }) {
  const rig = new Rig(); rig.set(cameraAt(audio, t, T));
  if (t <= T.start + 1 / 60) return { x: CUT_CURSOR_X, y: 540, r: 8 };
  if (t >= T.collision + 0.2) return { ...P14, r: 8 };
  const path = plans.paths.find(p => !pathCovered(t,p,T) && t >= p.words[0]!.start && t < p.words.at(-1)!.end);
  if (path) {
    const p = pathAt(pathFor(audio, t, path, T, rig), writeHead(path.layout.glyphs, t));
    const jump = path.words.some(w => w.gi === T.fits.gi) ? fitsJump(audio, t, path.layout.glyphs.filter(g => t >= g.t0).length - 1, T) : 0;
    const q = rig.proj(p.x, p.y + jump, p.z)!; return { x: q.x, y: q.y, r: 8 };
  }
  const prefix = plans.prefixes.find(p => t >= p.word.start && t < p.word.end);
  if (prefix) {
    const pose = prefixPose(audio, t, prefix, T, rig);
    const q = rig.proj(pose.at.x + writeHead(prefix.layout.glyphs, t), pose.at.y, pose.at.z)!;
    return { x: q.x, y: q.y, r: 8 };
  }
  const plane = plans.planes.find(p => t >= p.word.start && t < p.word.end);
  if (plane) {
    const pose = planePose(audio, t, plane, T, rig), form = voice.form(plane.word, t);
    const q = rig.proj(pose.at.x + writeHead(plane.layout.glyphs, t) * form.axes.wdth / plane.axes.wdth, pose.at.y, pose.at.z)!;
    return { x: q.x, y: q.y, r: 8 };
  }
  const slab = slabPose(audio, t, topIndex(t, T), T, rig);
  const p = onSlab(slab, p3(0, slab.height / 2, 1.25)), q = rig.proj(p.x, p.y, p.z)!;
  if (t < T.commit1.start) return { x: CUT_CURSOR_X, y: 540, r: 8 };
  return { x: q.x, y: q.y, r: 8 };
}
const CUT_CURSOR_X = 885;

export function projectedBox(rig: Rig, pts: P3[]) {
  const p = pts.map(q => rig.proj(q.x, q.y, q.z)).filter(q => q !== null);
  if (!p.length) return { x: 0, y: 0, w: 0, h: 0 };
  const x = Math.min(...p.map(p => p.x)), y = Math.min(...p.map(p => p.y));
  return { x, y, w: Math.max(...p.map(p => p.x)) - x, h: Math.max(...p.map(p => p.y)) - y };
}
export function gitfallLayout(audio: AudioData, lyrics: Lyrics, t: number, T: ChorusScore, voice = new Voice(lyrics, audio)) {
  const rig = new Rig(); rig.set(cameraAt(audio, t, T));
  return { camera: cameraAt(audio, t, T), slabs: Array.from({ length: BASE_SLABS + T.slabs.length }, (_, i) => slabPose(audio, t, i, T, rig)),
    clawd: clawdAt(audio, t, T, rig), plans: lyricPlans(T, voice), travel: tailTravel(audio, t, T), implosion: implosionAt(t, T) };
}
export function gitfallBounds(audio: AudioData, lyrics: Lyrics, t: number, T: ChorusScore) {
  const rig = new Rig(); rig.set(cameraAt(audio, t, T));
  const voice = new Voice(lyrics, audio), plans = lyricPlans(T, voice);
  return { prefixes: plans.prefixes.map(p => {
    const pose = prefixPose(audio, t, p, T, rig);
    return projectedBox(rig, [0, p.width].flatMap(x => [0, p.capH].flatMap(y => [0, 0.4].map(z => p3(pose.at.x + x, pose.at.y + y, pose.at.z + z)))));
  }) };
}
export const handoffIn = entryPrim;
export const handoffOut = exitPrim;

export type InkBox = { word: Word; carrier: string; box: ReturnType<typeof projectedBox> };
/** Uses actual font ink extrema, SolidText extrusion and drawPathText's own affine bounds. */
export function lyricInkBoxes(audio: AudioData, t: number, T: ChorusScore, voice: Voice,
  plans: ReturnType<typeof lyricPlans>, c: CanvasRenderingContext2D, P14: {x:number;y:number}) {
  const rig = new Rig(); rig.set(cameraAt(audio,t,T));
  const anchor = implosionPoint(rig,P14), result: InkBox[] = [], k=1-implosionAt(t,T);
  if(k===0)return result;
  const push = (word: Word,carrier: string,box: ReturnType<typeof projectedBox>) => {
    if(box.w>0 && box.h>0 && box.x+box.w>0 && box.x<1920 && box.y+box.h>0 && box.y<1080)result.push({word,carrier,box});
  };
  const solidBounds = (word:Word, capH:number, depth:number, at:P3, yaw:number, spin:number, scaleX:number, commit=false) => {
    const axes = voice.form(word,word.end).axes, current=voice.form(word,t).axes;
    const material=new THREE.MeshBasicMaterial(),solid=new SolidText(word.w.toUpperCase(),{capH,depth,axes:commit?{...axes,wght:900}:axes,
      bevel:0.035,curveSegments:3,material});
    solid.group.position.set(at.x,at.y,at.z);solid.group.rotation.set(0,yaw,spin);solid.group.scale.x=scaleX;
    const times=letterTimes({...word,w:word.w.toUpperCase()}), points:P3[]=[];
    for(const l of solid.letters){
      l.mesh.geometry=solidLetterGeometry(l.ch,commit?{...current,wght:900}:current,capH,depth,0.035,3);
      if(commit)solid.setLetter(l.i,{d:p3(-solid.width/2,-1.41+SLAB.h-COMMIT_INSET,0.2)});
      if(t>=times[l.i]!.t0)points.push(...solid.letterCorners(l.i));
    }
    const b=projectedBox(rig,points.map(p=>collapsePoint(p,t,T,anchor)));
    solid.dispose();material.dispose();
    return b;
  };
  for(const p of plans.prefixes){const pose=prefixPose(audio,t,p,T,rig);if(pose.visible)
    push(p.word,'solid',solidBounds(p.word,p.capH,p.second?0.3:0.6,pose.at,pose.yaw,pose.spin,pose.scaleX));}
  T.slabs.forEach((s,event)=>{if(s.kind!=='commit')return;const p=slabPose(audio,t,BASE_SLABS+event,T,rig);
    const axes=voice.form(s.words[0]!,s.words[0]!.end).axes,run=varRun('COMMIT',100,{...axes,wght:900});
    const width=run.width*2.4/run.capH;
    if(p.visible)push(s.words[0]!,'commit',solidBounds(s.words[0]!,2.4,0.9,p.center,p.yaw,0,p.scaleX*commitScale(t,event,width,T),true));});
  for(const p of plans.planes){
    if(t<p.word.start)continue;
    const pose=planePose(audio,t,p,T,rig), run=varRun(p.word.w.toUpperCase(),100,p.axes), ink=runInkBounds(run);
    const scale=p.capH/run.capH, sx=pose.scaleX*voice.form(p.word,t).axes.wdth/p.axes.wdth;
    const pts=[0,(ink.x1-ink.x0)*scale*sx].flatMap(x=>[(-ink.y0-run.capH/2)*scale,(-ink.y1-run.capH/2)*scale].map(y=>
      collapsePoint(p3(pose.at.x+Math.cos(pose.yaw)*x,pose.at.y+y,pose.at.z-Math.sin(pose.yaw)*x),t,T,anchor)));
    push(p.word,p.carrier,projectedBox(rig,pts));
  }
  for(const p of plans.paths){
    if(pathCovered(t,p,T))continue;
    const path=pathFor(audio,t,p,T,rig,anchor);
    for(const word of p.words){
      const drawn=drawPathText(c,rig,path,p.layout,t,{mode:'stand',base:p.kind==='tests'?'ink':'paper',on:p.kind==='tests'?'clay':'ink',
        axes:(g,tb)=>voice.form(g.word,tb).axes,pop:0.1,minPx:0,maxPx:110,
        offset:(g,tb)=>g.word.gi===word.gi?{d:p3(0,g.word.gi===T.fits.gi?fitsJump(audio,tb,g.i,T)*k:0,0)}:null});
      if(drawn.bbox)push(word,p.kind,drawn.bbox);
    }
  }
  return result;
}
