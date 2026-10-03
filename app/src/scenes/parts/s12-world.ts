// V6 copier world. Analytic poses are shared by meshes, text, camera and tests; y is up.
import { clamp, ease, hash, mulberry32, lerp } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { Rig, orbitCam, mixCam, p3, type P3 } from '../../kit/rig';
import { CUT, HANDOFF, type Prim } from '../../kit/handoff';
import { Voice } from '../../kit/lyric-moves';
import { varRun } from '../../kit/vartype';
import { runInkBounds } from '../../kit/pathtext';
import { handoffBoxes } from './s09-type';
import type { X9Times } from '../s09-z-shared';
export const SHEET={w:2.1,h:2.97},PITCH=2.4,NUM_PITCH=1.25;
export function copies(v:Voice) {
  return v.line('Run it again, run it again, again').words.filter(w=>/^(run|again)[,]?$/i.test(w.w));
}
export function numberTimes(v:Voice) {
  const words=v.line('Clear the cache and count to ten').words,count=words[4]!,ten=words[6]!;
  return [...Array.from({length:10},(_,i)=>lerp(count.start,ten.start,i/9)),ten.start+0.55*(ten.end-ten.start)];
}
// Four fixed octave harmonics are an fbm field; exactly the same constants feed TS and GLSL.
export function paperY(x:number,z:number) {
  let sum=0,amp=0.005,f=2;
  for(let i=0;i<4;i++){sum+=amp*Math.sin(x*f+0.7*i)*Math.cos(z*f-0.4*i);amp*=0.5;f*=2;}
  return 0.025+sum;
}
export const PAPER_GLSL=`
float paperY(float x,float z) {
 float sum=0.0,amp=0.005,f=2.0;
 for(int i=0;i<4;i++){sum+=amp*sin(x*f+0.7*float(i))*cos(z*f-0.4*float(i));amp*=0.5;f*=2.0;}
 return 0.025+sum;
}
`;
export function scraperX(v:Voice,t:number) {
  const line=v.line('Clear the cache and count to ten');return lerp(-5,24,ease.inOutQuad(span(t,line.words[0]!.start,line.words[2]!.end)));
}
export function collisionAt(v:Voice,k:number) {
  const line=v.line('Clear the cache and count to ten'),u=clamp((k*PITCH-3+5)/29);
  const inverse=u<0.5?Math.sqrt(u/2):1-Math.sqrt((1-u)/2);
  return lerp(line.words[0]!.start,line.words[2]!.end,inverse);
}
export function sheetAt(v:Voice,k:number,t:number) {
  const word=copies(v)[k],born=word?.start??Infinity,seed=mulberry32(1200+k),roll=(seed()-0.5)*0.08;
  const enter=ease.outExpo(clamp((t-born)/0.35)),age=Math.max(0,t-collisionAt(v,k));
  return {visible:t>=born,x:k*PITCH+(1-enter)*20+age*24,y:0.03+age*8,z:0,
    rx:age*5,ry:roll+age*2,rz:age*3};
}
export function scanAt(v:Voice,t:number) {
  const events=copies(v),k=events.reduce((last,w,i)=>t>=w.start-0.1?i:last,-1);
  if(k<0)return {visible:false,k:0,p:p3()};
  const at=events[k]!.start,u=ease.inOutQuad(span(t,at-0.1,at+0.25));
  return {visible:t<=at+0.25,k,p:p3(k*PITCH,0.08,lerp(1.7,-1.7,u))};
}
export function numberAt(v:Voice,k:number,t:number) {
  const at=numberTimes(v)[k]!,capH=1.6*(k===10?1.15:1);
  const axes={wdth:k===9?Math.round(v.form(v.line('Clear the cache and count to ten').words[6]!,t).axes.wdth*2)/2:75,wght:900};
  return {at,visible:t>=at,x:(k-5)*NUM_PITCH,y:0,z:-3,capH,axes,
    rx:-Math.PI/2*(1-ease.outBack(clamp((t-at)/0.18))),fail:k===10 && t>=at+0.18 && t<at+0.18+2/60};
}
export function rightStem(v:Voice) {
  const r=varRun('11',100,{wdth:75,wght:900}),g=r.glyphs[1]!;
  // The right vertical edge is the rightmost straight contour in the second glyph (no bevel).
  const xs=[] as number[];for(let i=0;i<g.o.xy.length;i+=2)xs.push(g.o.xy[i]!);
  return {x:5*NUM_PITCH+(g.x+Math.max(...xs)*0.1)*1.84/r.capH,z:-2.8,h:1.84};
}
export function cameraAt(v:Voice,t:number,T:X9Times) {
  t=Math.min(t,T.end-0.1);
  const events=copies(v),first=events[0]!.start,line=v.line('Clear the cache and count to ten'),count=line.words[4]!.start,ten=line.words[6]!;
  const box=handoffBoxes(HANDOFF.boxes11)[0]!,scale=(box.w+16)/PITCH;
  const top=orbitCam(p3(PITCH*4,0,(540-HANDOFF.boxes11.cy)/scale),0,Math.PI/2-1e-6,1766.2604/scale,34);
  const inclined=orbitCam(p3(0,0,0),0,0.95,5.0,34);
  if(t<first)return mixCam(top,inclined,ease.inOutCubic(span(t,T.rerunStart,first)));
  const k=events.reduce((a,w,i)=>t>=w.start?i:a,0),age=t-events[k]!.start;
  const copy=orbitCam(p3(k*PITCH,0,0),0,0.95,5.0*(1-0.02*Math.exp(-age/0.1)),34);
  if(t<line.words[0]!.start)return copy;
  const wide=orbitCam(p3(scraperX(v,t),0,-1),0,0.95,12,34);
  if(t<count)return mixCam(copy,wide,ease.inOutQuad(span(t,line.words[0]!.start,count)));
  const n=clamp((t-count)/(ten.start-count));
  const low=orbitCam(p3(lerp(-4.5,0,n),0.8,-3),0,0.25,lerp(8,19,n),34);
  const landings=numberTimes(v).map(at=>t-(at+0.18));
  const shake=landings.reduce((sum,age)=>sum+(age>=0&&age<0.1?0.025*Math.exp(-age/0.03)*Math.sin(age*110):0),0);
  low.pos.y+=shake;low.tgt.y+=shake;
  const exitStart=afterBeats(v.audio,T.end,-1),edge=rightStem(v),roll=Math.atan2(250,1080),dist=0.14,px=1766.2604/dist;
  const target=p3(edge.x+75/px*Math.cos(roll),edge.h*0.5+75/px*Math.sin(roll),edge.z);
  const end={pos:p3(target.x,target.y,target.z+dist),tgt:target,fov:34,roll};
  return mixCam(low,end,ease.inCubic(span(t,exitStart,T.end-0.1)));
}
export function slotCorners(v:Voice,k:number,t:number,T:X9Times):P3[] {
  const b=handoffBoxes(HANDOFF.boxes11)[k]!,scale=(b.w+16)/PITCH;
  const u=ease.inOutCubic(span(t,T.rerunStart,copies(v)[0]!.start));
  // The legacy box ratio differs from A4: the EMPTY outline morphs, never a printed A4 sheet.
  const w=lerp(b.w/scale,SHEET.w,u),h=lerp(b.h/scale,SHEET.h,u);
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>p3(k*PITCH+x!*w/2,0.025,z!*h/2));
}
export function projectedSlots(v:Voice,t:number,T:X9Times) {
  const rig=new Rig();rig.set(cameraAt(v,t,T));
  return Array.from({length:9},(_,k)=>{
    const ps=slotCorners(v,k,t,T).map(p=>rig.proj(p.x,p.y,p.z)!);
    const x=Math.min(...ps.map(p=>p.x)),y=Math.min(...ps.map(p=>p.y));
    return {x,y,w:Math.max(...ps.map(p=>p.x))-x,h:Math.max(...ps.map(p=>p.y))-y};
  });
}
export function entryPrim(v:Voice,t:number,T:X9Times):Prim {
  const b=projectedSlots(v,t,T),x=Math.min(...b.map(b=>b.x)),y=Math.min(...b.map(b=>b.y));
  return {kind:'rect',x,y,w:Math.max(...b.map(b=>b.x+b.w))-x,h:Math.max(...b.map(b=>b.y+b.h))-y};
}
export function exitPrim(v:Voice,t:number,T:X9Times):Prim {
  const rig=new Rig();rig.set(cameraAt(v,t,T));const e=rightStem(v);
  const a=rig.proj(e.x,0,e.z)!,b=rig.proj(e.x,e.h,e.z)!;
  const x=(y:number)=>a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y);
  return {kind:'line',x0:x(0),y0:0,x1:x(1080),y1:1080,w:2};
}
export function cursorWorld(v:Voice,t:number) {
  const scan=scanAt(v,t),line=v.line('Clear the cache and count to ten');
  const k=numberTimes(v).reduce((a,at,i)=>t>=at?i:a,0),n=numberAt(v,k,t);
  return t<line.start?scan.p:t<line.words[4]!.start?p3(scraperX(v,t),0.15,0):p3(n.x+0.2,n.capH,n.z+0.2);
}
export function cursorAt(v:Voice,t:number,T:X9Times) {
  const rig=new Rig();rig.set(cameraAt(v,t,T));const p=cursorWorld(v,t);return rig.proj(p.x,p.y,p.z);
}
