// S11 keyframe composition and cut contracts: actual Archivo outline + canonical sprite bounds.
import { HANDOFF } from '../../kit/handoff';
import { Voice } from '../../kit/lyric-moves';
import { varRun } from '../../kit/vartype';
import type { AudioData } from '../../engine/audio';
import type { X9Times } from '../s09-z-shared';
import { beatsSince } from '../../kit/time';
import { lerp } from '../../engine/util';
import { exitBeat, enterBeat, runBox, spriteBox } from './s09-type';
import * as Clawd from '../../kit/clawd';
export const ROLL = HANDOFF.fall10.roll;
export function handoffIn(t: number, audio: AudioData, T: X9Times) {
  const p = enterBeat(audio, t, T.rainStart);
  return { roll: HANDOFF.fall10.roll, pxPerBeat: lerp(HANDOFF.fall10.pxPerBeat, 240, p) };
}
export function handoffOut(t: number, audio: AudioData, T: X9Times) {
  const p = exitBeat(audio, t, T.rainEnd);
  return { cx: lerp(1060, HANDOFF.boxes11.cx, p), cy: lerp(358, HANDOFF.boxes11.cy, p),
    w: lerp(1850, HANDOFF.boxes11.w, p), n: HANDOFF.boxes11.n };
}
export function rainView(t: number, audio: AudioData, T: X9Times) {
  const b = Math.max(0, beatsSince(audio, t, T.rainStart));
  return { b, z: lerp(14, 10, Math.min(1, Math.max(0, b - 1) / 13)), roll: handoffIn(t, audio, T).roll };
}
export function headlineState(v: Voice, t: number, T: X9Times) {
  const line = v.line('Undefined, undefined, and I don’t know why');
  const first = v.form(line.words[0]!, t, { minWidth: 87.5, maxWidth: 112.5, rest: 860 });
  const second = v.form(line.words[1]!, t, { minWidth: 87.5, maxWidth: 112.5, rest: 860 });
  const active = second.born > 0 ? second : first;
  const run = varRun('undefined', 480, { wdth: active.axes.wdth, wght: Math.max(800, active.axes.wght) });
  const out = exitBeat(v.audio, t, T.rainEnd), box = handoffOut(t, v.audio, T);
  const sx = box.w / run.width, sy = lerp(0.9, 0.5, out), roll = lerp(-ROLL, 0, out);
  const x = lerp(135, box.cx - box.w / 2, out), y = lerp(284, box.cy + run.capH * sy / 2, out);
  const pose = Clawd.pose('A7', { beat: v.audio.beatAt(t), beat0: v.audio.beatAt(T.rainStart), p: 0 });
  return { run, x, y, sx, sy, roll, first, second, out,
    dominant: clippedBox(runBox(run, x, y, sx, sy, roll)),
    clawd: { x: 865, y: 948, px: 11.8, pose }, clawdBox: spriteBox(865, 948, 11.8, pose) };
}

function clippedBox(b: { x: number; y: number; w: number; h: number }) {
  const x = Math.max(0, b.x), y = Math.max(0, b.y);
  return { x, y, w: Math.min(1920, b.x + b.w) - x, h: Math.min(1080, b.y + b.h) - y };
}

import { clamp, ease, springStep, hash } from '../../engine/util';
import { afterBeats } from '../../kit/time';
import { Rig, p3 } from '../../kit/rig';
import { layoutPath, path3, pathAt, type PathGlyph } from '../../kit/pathtext';
import { carryLayout, type CarrySpec } from '../../kit/carry';
import { handoffBoxes, union } from './s09-type';
import type { Prim } from '../../kit/handoff';
import { glassShards } from './s10-glass';
export function rainCamera(audio:AudioData,t:number,T:X9Times) {
  const v=rainView(Math.min(t,T.rainEnd-0.1),audio,T);
  return {pos:p3(0,0,v.z),tgt:p3(0,0,-20),roll:-ROLL,fov:52};
}
export function rainLyrics(v:Voice) {
  const words=v.line('Stack traces falling like rain from the sky').words;
  return [words.slice(0,4),words.slice(4)].map((words,row)=>({
    layout:layoutPath(words,{capH:1,axes:w=>v.form(w,w.end).axes,space:0.26}),
    path:path3([p3(-8,2-row*1.4,-7),p3(-8+50*Math.cos(ROLL),2-row*1.4-50*Math.sin(ROLL),-7)])
  }));
}
export function fallLetter(audio:AudioData,g:PathGlyph,t:number) {
  const age=Math.max(0,t-g.t0),dt=afterBeats(audio,g.t0,0.45)-g.t0,grav=18/(dt*dt);
  const name=g.word.w.toLowerCase();
  let height=9-0.5*grav*age*age;
  if(name==='sky')height=0.8*age;
  else if(age>=dt && name!=='falling')height=age-dt>=0.1?0:0.1*Math.sin(Math.PI*(age-dt)/0.1)*(1-springStep(age-dt,10,0.5));
  return {d:p3(0,height,0),height,land:g.t0+dt,age,draw:t>=g.t0 && height>-25 && height<25,
    splash:name==='rain' && age>=dt && age<dt+0.25,alpha:name==='rain' && age>=dt?0:1};
}
export function hangingLyrics(v:Voice) {
  const words=v.line('Undefined, undefined, and I don’t know why').words.slice(2);
  const layout=layoutPath(words,{capH:0.66,space:0.24,axes:w=>v.form(w,w.end).axes});
  const start=960-layout.s1*50;
  return {layout,path:path3([p3((start-960)/100,(540-632)/100,0),p3((start-960)/100+40,(540-632)/100,0)]),start};
}
export function hangingRig() {const r=new Rig();r.set({pos:p3(0,0,17.662604),tgt:p3(),roll:0,fov:34});return r;}
export function whyCarry(v:Voice):CarrySpec {
  const {layout,start}=hangingLyrics(v),word=v.line('Undefined, undefined, and I don’t know why').words.at(-1)!;
  const axes=v.form(word,word.end).axes,run=varRun(word.w,100,axes);
  const ink=run.glyphs[0]!.o.xy,scale=66/run.capH;
  // CarrySpec anchors the ink, whereas layoutPath anchors the advance origin.
  const first=layout.glyphs.find(g=>g.word===word)!;
  const b=runInkBounds(run);
  return {text:word.w,size:66,axes,x:start+first.s*100+b.x0*scale,y:632,color:'clay'};
}
export function exitPrim(_t:number):Prim {
  const boxes=handoffBoxes(HANDOFF.boxes11),b=union(boxes.flatMap(b=>[[b.x,b.y],[b.x+b.w,b.y+b.h]]));
  return {kind:'rect',...b};
}
export function glassIncoming(v:Voice,T:X9Times,t:number) {
  const shards=glassShards(v,T,T.rainStart),b=v.audio.beatAt(t)-v.audio.beatAt(T.rainStart);
  const gone=t>=afterBeats(v.audio,T.rainStart,0.5);
  // Carry fragments accelerate out once their preserved entry velocity has been handed over.
  const travel=220*b+12000*b*b*b;
  const dx=Math.sin(ROLL)*travel,dy=Math.cos(ROLL)*travel;
  return shards.map(s=>({...s,draw:!gone,aff:{...s.aff,e:s.aff.e+dx,f:s.aff.f+dy},triangle:s.triangle.map(p=>({...p,x:p.x+dx,y:p.y+dy}))}));
}
export function cursorAt(v:Voice,t:number,T:X9Times) {
  const word=v.line('Stack traces falling like rain from the sky').words.filter(w=>w.start<=t).at(-1);
  const rig=new Rig();rig.set(rainCamera(v.audio,t,T));
  if(t>=T.impacts[0]) {
    const h=hangingLyrics(v),g=h.layout.glyphs.filter(g=>g.t0<=t).at(-1);
    const q=g?pathAt(h.path,g.s+g.w):p3(-5,-0.92,0);return hangingRig().proj(q.x,q.y,q.z)!;
  }
  const rows=rainLyrics(v),row=rows.find(r=>r.layout.glyphs.some(g=>g.word===word))??rows[0]!;
  const g=row.layout.glyphs.find(g=>g.word===word)??row.layout.glyphs[0]!,p=pathAt(row.path,g.s),off=fallLetter(v.audio,g,t);
  return rig.proj(p.x,p.y+off.height,p.z)!;
}
import { runInkBounds } from '../../kit/pathtext';

import { letterTimes } from '../../kit/pathtext';
export function whyFrame(v:Voice,t:number) {
  const spec=whyCarry(v),word=v.line('Undefined, undefined, and I don’t know why').words.at(-1)!,times=letterTimes(word);
  return carryLayout(spec).filter(g=>t>=times[g.i]!.t0).map(g=>{
    const k=clamp((t-times[g.i]!.t0)/0.12);
    return {...g,c:g.c*k,d:g.d*k,f:spec.y-spec.size*(1-k)};
  });
}

// The rain-plane analytic displacement, mirrored for GPU clients without editing DeepStorm.
export const RAIN_GLSL=`
float fallHeight(float age,float dt,bool falling,bool sky) {
 if(sky)return 0.8*age;
 if(age<dt||falling)return 9.0-9.0*age*age/(dt*dt);
 float u=age-dt;
 if(u>=0.1)return 0.0;
 float w=6.28318530718*10.0;
 float residual=exp(-0.5*w*u)*cos(w*sqrt(0.75)*u);
 return 0.1*sin(3.14159265359*u/0.1)*residual;
}
`;
