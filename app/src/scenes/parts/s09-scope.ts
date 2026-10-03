// Screen-space instrument geometry, measured against kf-S09 (1672×941 → 1920×1080).
import type { AudioData } from '../../engine/audio';
import { HANDOFF } from '../../kit/handoff';
import * as Clawd from '../../kit/clawd';
import { lerp } from '../../engine/util';
import { enterBeat, exitBeat, spriteBox, union } from './s09-type';
import type { X9Times } from '../s09-z-shared';

export const SCOPE = { x0: 16, x1: 1904, y: 575, traceX: 108, period: 208 };
export function scopeY(local: number) {
  const phase = ((local % 1) + 1) % 1;
  return SCOPE.y - 145 * Math.exp(-(((phase - 0.83) / 0.07) ** 2))
    + 70 * Math.exp(-(((phase - 0.4) / 0.15) ** 2));
}
export function scopeState(audio: AudioData, t: number, T: X9Times) {
  const head = scopeHead(t, T);
  const traces = [-60, -30, 0, 30, 60].map((offset, e) => {
    const points: [number, number][] = [];
    for (let x = SCOPE.traceX; x <= head; x += 2) {
      const local = ((x - SCOPE.traceX - e * 13) / SCOPE.period % 1 + 1) % 1;
      points.push([x, scopeY(local) + offset]);
    }
    return points;
  });
  const pose = Clawd.pose('A4', { beat: audio.beatAt(t), beat0: audio.beatAt(T.terminal), p: 0 });
  return { head, traces, clawd: { x: 90, y: 842, px: 17.2, pose },
    dominant: union([[16, SCOPE.y], [1904, SCOPE.y], ...traces.flat()]),
    clawdBox: spriteBox(90, 842, 17.2, pose) };
}
export function handoffIn(t: number, audio: AudioData, T: X9Times) {
  const p = enterBeat(audio, t, T.terminal);
  return { ...HANDOFF.base08, y: lerp(HANDOFF.base08.y, SCOPE.y, p) };
}
export function handoffOut(t: number, audio: AudioData, T: X9Times) {
  const p = exitBeat(audio, t, T.terminalEnd);
  return { x: HANDOFF.nineteen09.x, baseline: lerp(232, HANDOFF.nineteen09.baseline, p),
    capH: lerp(140, HANDOFF.nineteen09.capH, p) };
}

/** Pure head-only query for birth-time sampling, without allocating echo traces. */
export function scopeHead(t: number, T: X9Times) {
  const key = T.scopeKey;
  // Head reaches the reference's x=1468 near the storyboard anchor, then continues right.
  const phase = Math.max(0, Math.min(1, (t - T.waiting) / (key - T.waiting)));
  const head = t <= key ? lerp(108, 1468, phase) : lerp(1468, 1824, Math.min(1, (t - key) / (T.terminalEnd - key)));
  return head;
}

import { CUT, type Prim } from '../../kit/handoff';
import { carryDrift, carryLayout, lerpAffines, type CarrySpec } from '../../kit/carry';
import { layoutPath, path3, runInkBounds } from '../../kit/pathtext';
import { Rig, p3 } from '../../kit/rig';
import { Voice } from '../../kit/lyric-moves';
import { clamp, ease } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { varRun } from '../../kit/vartype';
import { cameraAt, wx, wy } from './s09-world';
import { affineBounds, pathAffines } from './s09-type';
export const entryPrim = (_t: number): Prim => ({ kind: 'line', x0: 0, y0: 540, x1: 1920, y1: 540, w: 2 });
export function exitPrim(_t: number): Prim {
  const r = varRun('19',100,{wdth:100,wght:900});
  return {kind:'rect',x:96,y:92,w:r.width*140/r.capH,h:140};
}
export const scopeCamera = (audio: AudioData,t: number,T: X9Times) => cameraAt(audio,Math.min(t,T.terminalEnd-0.1),T);
export function scanHead(audio: AudioData,t: number,T: X9Times) {
  if(t < T.waiting) return 0;
  const b = Math.max(0,audio.beatAt(t)-audio.beatAt(T.waiting));
  return (b-Math.floor(b))*1920;
}
export function scanArrival(audio: AudioData,T: X9Times,s: number) {
  return afterBeats(audio,T.waiting,clamp((96+s*100)/1920));
}
export function lastScan(audio: AudioData,T: X9Times,s: number,t: number) {
  const phase=clamp((96+s*100)/1920), b=audio.beatAt(t)-audio.beatAt(T.waiting);
  return afterBeats(audio,T.waiting,Math.floor(b-phase)+phase);
}
const lyricCache=new WeakMap<Voice,{T:X9Times,value:{layout:ReturnType<typeof layoutPath>;path:ReturnType<typeof path3>;pass:import('../../engine/lyrics').Word}}>();
export function scopeLyrics(v: Voice,T: X9Times) {
  const cached=lyricCache.get(v);if(cached?.T===T)return cached.value;
  const words=v.line('So I run the tests, I’m waiting for a pass').words;
  const layout=layoutPath(words,{capH:0.66,space:0.23,axes:w=>v.form(w,w.end).axes,
    notBefore:s=>scanArrival(v.audio,T,s)});
  const pass=words.at(-1)!, gs=layout.glyphs.filter(g=>g.word===pass);
  // Keep the full line on the glass; pass follows a with 0.32 em of ink clearance.
  const before=layout.glyphs.filter(g=>g.word!==pass), last=before.at(-1)!;
  const prevRun=varRun(last.ch,100,v.form(last.word,last.word.end).axes);
  const passRun=varRun(pass.w,100,v.form(pass,pass.end).axes),m=0.66/passRun.capH;
  const target=last.s+runInkBounds(prevRun).x1*m+0.32*100*m-runInkBounds(varRun(gs[0]!.ch,100,v.form(pass,pass.end).axes)).x0*m;
  const delta=target-gs[0]!.s;for(const g of gs)g.s+=delta;layout.s1+=delta;
  const rig=new Rig();rig.set(scopeCamera(v.audio,T.terminalEnd-1/60,T));
  let start=wx(96);
  // Translate the whole row, never scale the letters, to preserve the right safety margin.
  for(let i=0;i<24;i++){
    const path=path3([p3(start,wy(427),0),p3(start+40,wy(427),0)]);
    const own=layoutPath([pass],{capH:0.66,axes:v.form(pass,pass.end).axes});
    own.glyphs.forEach(g=>g.s+=gs[0]!.s);
    const aff=pathAffines(rig,path,own,v.form(pass,pass.end).axes,p3(0,0,1));
    const box=affineBounds(pass.w,v.form(pass,pass.end).axes,aff);
    const run=varRun(pass.w,100,v.form(pass,pass.end).axes),ink=runInkBounds(run),size=Math.abs(aff[0]!.d)*run.capH;
    let right=Math.max(box.x+box.w,box.x+(ink.x1-ink.x0)*size/run.capH);
    const moving=new Rig();for(const t of [48.45,48.68]){moving.set(scopeCamera(v.audio,t,T));const b=affineBounds(pass.w,v.form(pass,pass.end).axes,pathAffines(moving,path,own,v.form(pass,pass.end).axes,p3(0,0,1)));right=Math.max(right,b.x+b.w);}
    const excess=right-1824;if(excess<=1e-7)break;
    const p=rig.proj(start+gs[0]!.s,wy(427),0)!,q=rig.proj(start+gs[0]!.s+0.01,wy(427),0)!;
    start-=excess/((q.x-p.x)/0.01);
  }
  const value={layout,path:path3([p3(start,wy(427),0),p3(start+40,wy(427),0)]),pass};lyricCache.set(v,{T,value});return value;
}
export function passCarry(v: Voice,T: X9Times): CarrySpec {
  const {layout,path,pass}=scopeLyrics(v,T), axes=v.form(pass,pass.end).axes;
  const own=layoutPath([pass],{capH:0.66,axes}), s=layout.glyphs.find(g=>g.word===pass)!.s;
  for(const g of own.glyphs)g.s+=s;
  const rig=new Rig();rig.set(scopeCamera(v.audio,T.terminalEnd-1/60,T));
  const aff=pathAffines(rig,path,own,axes,p3(0,0,1)),box=affineBounds(pass.w,axes,aff);
  const run=varRun(pass.w,100,axes),size=Math.abs(aff[0]!.d)*run.capH;
  return {text:pass.w,size,axes,x:box.x,y:aff[0]!.f,color:'clay'};
}
export function passWorldAffines(v: Voice,T: X9Times,t: number) {
  const {layout,path,pass}=scopeLyrics(v,T), axes=v.form(pass,pass.end).axes;
  const own=layoutPath([pass],{capH:0.66,axes}),s=layout.glyphs.find(g=>g.word===pass)!.s;
  for(const g of own.glyphs)g.s+=s;
  const rig=new Rig();rig.set(scopeCamera(v.audio,t,T));return pathAffines(rig,path,own,axes,p3(0,0,1));
}
export function machineCarry(v: Voice,t: number,T:X9Times) {
  const word=v.lyrics.lines.flatMap(l=>l.words).find(w=>w.w.replace(/[^a-z]/gi,'').toLowerCase()==='machine' && w.start<T.terminal && w.end>T.terminal)!;
  const spec:CarrySpec={...CUT.machine08,axes:v.form(word,word.end).axes};
  const k=t>=word.end+0.12?1:ease.inCubic(clamp((t-word.end)/0.12));
  return {spec,alpha:t>=word.end+0.12?0:1,aff:carryDrift(spec,t,0.2).map(g=>({...g,b:g.b*(1-k),d:g.d*(1-k),f:540+(g.f-540)*(1-k)}))};
}
export function cursorAt(audio: AudioData,t: number,T: X9Times) {
  const rig=new Rig();rig.set(scopeCamera(audio,t,T));const x=t<T.waiting?0:scanHead(audio,t,T);
  return rig.proj(wx(x),wy(handoffIn(t,audio,T).y),0)!;
}

/** Exactly the affines used by the pass renderer and its geometric acceptance. */
export function passFrame(v:Voice,T:X9Times,t:number) {
  const start=afterBeats(v.audio,T.terminalEnd,-0.5);
  return lerpAffines(passWorldAffines(v,T,t),carryLayout(passCarry(v,T)),ease.inOutCubic(span(t,start,T.terminalEnd-0.1)));
}
