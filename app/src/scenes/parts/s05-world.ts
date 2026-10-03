// V6 source cliff. All movement is evaluated from aligned words and the measured beat grid.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Word } from '../../engine/lyrics';
import { clamp, ease, lerp, mulberry32, springStep } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { MONTH_SOURCE } from '../../kit/content';
import { Voice } from '../../kit/lyric-moves';
import { letterTimes, layoutPath, path3, runInkBounds } from '../../kit/pathtext';
import { Rig, mixCam, orbitCam, type P3 } from '../../kit/rig';
import { varRun } from '../../kit/vartype';
import { HANDOFF, CUT, type Prim } from '../../kit/handoff';
import { platformTimes, type PlatformTimes } from './s05-platform-model';
import { boxCorners, projectedBounds, setCamera, solveLine, solvePoint, type Box3, type ProjectCam } from './s05-print';

export const CW=.14, VOXEL=.16;
export const LIGHT=new Float64Array([-.5,.8,.6].map(v=>v/Math.hypot(.5,.8,.6)));
export const AMBIENT=.12,LIGHT_INTENSITY=(.90-AMBIENT)/LIGHT[2]!;
export function surfaceTone(normal:P3,shadow=1){return Math.min(.92,AMBIENT+LIGHT_INTENSITY*Math.max(0,normal.x*LIGHT[0]!+normal.y*LIGHT[1]!+normal.z*LIGHT[2]!)*shadow);}
export const WORLD_GLSL=`
vec3 ledgeLo(float i,float indent) { return vec3(-6.0+indent*0.14,-0.5*(i-18.0)-0.12,0.0); }
vec3 ledgeHi(float i,float indent,float len) { return vec3(-6.0+(indent+len)*0.14,-0.5*(i-18.0)+0.12,0.35); }
vec3 drawerLo(float k,float outAmount) { return vec3(-6.0+2.6*k,2.6-1.15*k,outAmount); }
vec3 drawerHi(float k,float outAmount) { return drawerLo(k,outAmount)+vec3(4.4,0.9,1.2); }
vec3 stoneOrigin(float j) { return vec3(-0.4+2.1*j,-1.2-0.55*j,0.0); }
`;
export const SOURCE_ROWS=Array.from({length:27},(_,j)=>j+18).filter(i=>MONTH_SOURCE[i]?.trim());
// The fixture calls this line 42 (one based); its array index is 41.
export const FINAL_ROW=MONTH_SOURCE.findIndex(s=>s.includes('for (let d = 0; d <= days; d++)'));
export function ledgeBox(i:number):Box3 {
  const text=MONTH_SOURCE[i] ?? '',indent=text.length-text.trimStart().length,len=text.trimStart().length;
  return {lo:{x:-6+indent*CW,y:-.5*(i-18)-.12,z:0},hi:{x:-6+(indent+len)*CW,y:-.5*(i-18)+.12,z:.35}};
}
export function drawerOut(k:number,t:number,a:AudioData,T:PlatformTimes) {
  return 1.2*ease.outExpo(span(t,T.drawers[k]!,afterBeats(a,T.drawers[k]!,.7)));
}
export function drawerBox(k:number,t:number,a:AudioData,T:PlatformTimes):Box3 {
  const lo={x:-6+2.6*k,y:2.6-1.15*k,z:drawerOut(k,t,a,T)};
  return {lo,hi:{x:lo.x+4.4,y:lo.y+.9,z:lo.z+1.2}};
}
export function wallShadowAt(p:P3,t:number,a:AudioData,l:Lyrics,T=platformTimes(a,l)){
  const boxes=[...SOURCE_ROWS.map(ledgeBox),...[0,1,2].map(k=>drawerBox(k,t,a,T)),...stoneWords(l).flatMap((w,j)=>t>=w.start?[wordStone(j,l,a)]:[])];
  for(const b of boxes){let near=0,far=Infinity;for(const [axis,i] of [['x',0],['y',1],['z',2]] as const){const origin=p[axis]+LIGHT[i]!*.002,dir=LIGHT[i]!;
    const A=(b.lo[axis]-origin)/dir,B=(b.hi[axis]-origin)/dir;near=Math.max(near,Math.min(A,B));far=Math.min(far,Math.max(A,B));}
    if(far>near&&far>0)return 0;}
  return 1;
}
export function cliffSamples(t:number,a:AudioData,l:Lyrics,T=platformTimes(a,l)){
  const b=drawerBox(0,t,a,T),lit=Array.from({length:5},(_,i)=>({x:lerp(b.lo.x+.3,b.hi.x-.3,(i+.5)/5),y:b.lo.y+.45,z:b.hi.z}));
  const shadow=lit.map(p=>({x:p.x-p.z*LIGHT[0]!/LIGHT[2]!,y:p.y-p.z*LIGHT[1]!/LIGHT[2]!,z:0}));return {lit,shadow};
}
export function stoneWords(l:Lyrics) { return l.get('crack my claws').words.slice(5); }
export function wordStone(j:number,l:Lyrics,a:AudioData):Box3 {
  const w=stoneWords(l)[j]!,axes=new Voice(l,a).form(w,w.end).axes,run=varRun(w.w.toUpperCase(),100,axes);
  const lo={x:-.4+2.1*j,y:-1.2-.55*j,z:0},ink=runInkBounds(run);
  return {lo,hi:{x:lo.x+(ink.x1-ink.x0)*.55/run.capH,y:lo.y+.55,z:.4}};
}
const centerTop=(b:Box3):P3=>({x:(b.lo.x+b.hi.x)/2,y:b.hi.y,z:(b.lo.z+b.hi.z)/2});
export function landingAt(j:number,a:AudioData,l:Lyrics) {
  const words=stoneWords(l),w=words[j]!;
  return Math.min(afterBeats(a,w.start,.4),words[j+1]?.start ?? Infinity);
}
export function stoneSink(j:number,t:number,a:AudioData,l:Lyrics) {
  const at=landingAt(j,a,l);if(t<at)return 0;
  return -.04*(1-springStep((t-at)/.16));
}
/** Drawer landings also compress Clawd, until the sung word-stone route takes over. */
export function clawdSquish(t:number,a:AudioData,l:Lyrics,T=platformTimes(a,l)) {
  const words=stoneWords(l),firstWord=words[0]!.start;
  const landings=[1,2].map(k=>afterBeats(a,afterBeats(a,T.drawers[k-1]!,.7),.45)).filter(at=>at<firstWord);
  landings.push(...words.map((_,j)=>landingAt(j,a,l)));
  const at=landings.filter(at=>at<=t).at(-1);
  return at===undefined?0:.15*Math.exp(-(t-at)/.07);
}
export function clawdAt(t:number,a:AudioData,l:Lyrics,T=platformTimes(a,l)):P3 {
  let at=centerTop(drawerBox(0,t,a,T));
  for(let k=1;k<3;k++) {
    const start=afterBeats(a,T.drawers[k-1]!,.7),end=afterBeats(a,start,.45);
    if(t<start)break;
    const to=centerTop(drawerBox(k,t,a,T)),u=span(t,start,end);
    at={x:lerp(at.x,to.x,u),y:lerp(at.y,to.y,u)+.7*4*u*(1-u),z:lerp(at.z,to.z,u)};
  }
  for(const [j,w] of stoneWords(l).entries()) {
    if(t<w.start)break;
    const u=span(t,w.start,landingAt(j,a,l)),to=centerTop(wordStone(j,l,a));to.y+=stoneSink(j,t,a,l);
    at={x:lerp(at.x,to.x,u),y:lerp(at.y,to.y,u)+.6*4*u*(1-u),z:lerp(at.z,to.z,u)};
  }
  return at;
}
export function crackPath():P3[] {
  const rng=mulberry32(505),ds=Array.from({length:6},()=>({x:.4+rng()*.15,y:-.05-rng()*.025}));
  const scale=2.6/ds.reduce((s,p)=>s+Math.hypot(p.x,p.y),0),points:P3[]=[{x:-4.92,y:3.32,z:1.203}];
  for(const d of ds){const p=points.at(-1)!;points.push({x:p.x+d.x*scale,y:p.y+d.y*scale,z:p.z});}return points;
}
export function crackProgress(t:number,l:Lyrics) {
  const at=l.get('crack my claws').words[2]!.start;return span(t,at,at+.24);
}
export function reading(t:number,a:AudioData,l:Lyrics,T=platformTimes(a,l)) {
  const start=l.get('crack my claws').words[6]!.start;
  const steps=Math.max(1,Math.floor((a.beatAt(T.end-.1)-a.beatAt(start))*2));
  // Seven available half-beats cannot read all 25 rows. Read the last available rows in order.
  const rows=SOURCE_ROWS.filter(i=>i<=FINAL_ROW).slice(-(steps+1));
  const i=Math.min(rows.length-1,Math.max(0,Math.floor((a.beatAt(t)-a.beatAt(start))*2)));
  const at=afterBeats(a,start,i*.5),p=t<start?0:ease.inOutQuad(span(t,at,Math.min(afterBeats(a,at,.4),T.end-.1)));
  return {row:rows[i]!,p,start,at,rows};
}
export function cursorAt(t:number,a:AudioData,l:Lyrics,T=platformTimes(a,l)):P3 {
  const s=reading(t,a,l,T),b=ledgeBox(s.row);return {x:lerp(b.lo.x,b.hi.x,s.p),y:b.lo.y-.03,z:.357};
}
export function underline(row:number):[P3,P3] {
  const b=ledgeBox(row);return [{x:b.lo.x,y:b.lo.y-.03,z:.357},{x:b.hi.x,y:b.lo.y-.03,z:.357}];
}
export function leadLayouts(l:Lyrics,a:AudioData) {
  const v=new Voice(l,a),words=l.get('crack my claws').words;
  return [words.slice(0,3),words.slice(3,5)].map(ws=>layoutPath(ws,{capH:.3,axes:w=>v.form(w,w.end).axes,upper:true}));
}
export function leadLayout(l:Lyrics,a:AudioData) {return leadLayouts(l,a)[0]!;}
export function leadPath(t:number,a:AudioData,T:PlatformTimes,row=0) {
  const b=drawerBox(0,t,a,T),z=b.hi.z-row*.5;
  return path3([{x:b.lo.x,y:b.hi.y,z},{x:b.hi.x,y:b.hi.y,z}]);
}
export function cameraAt(t:number,a:AudioData,l:Lyrics,T=platformTimes(a,l)):ProjectCam {
  const beat1=afterBeats(a,T.start,5/3),p=clawdAt(t,a,l,T),center={x:p.x,y:p.y+VOXEL*2.5,z:p.z+.32};
  if(t<=beat1) {
    const u=ease.outQuad(span(t,T.start,beat1)),px=lerp(CUT.clawd04px,14,u);
    return solvePoint(center,px/VOXEL,{x:lerp(1204,930,u),y:lerp(440.5,520,u)},0,0,34);
  }
  const crack=l.get('crack my claws').words[2]!,hit=t>=crack.start?Math.exp(-(t-crack.start)/.1):0;
  const close=solvePoint(center,lerp(14,32,ease.inOutCubic(span(t,beat1,T.read)))/VOXEL/(1-.03*hit),{x:930,y:520},lerp(-.1,.1,span(t,beat1,T.read)),.12,34);
  close.offsetX=(close.offsetX??0)+4*Math.sin((t-crack.start)*83)*hit;
  close.offsetY=(close.offsetY??0)+4*Math.sin((t-crack.start)*107)*hit;
  if(t<T.read)return close;
  const stair=orbitCam({x:-.7,y:.7,z:1},.1,.42,17,34);
  if(t<T.scroll)return mixCam(close,stair,ease.inOutCubic(span(t,T.read,T.scroll)));
  const follow=stoneCamera(t,a,l,p);
  const [A,B]=underline(FINAL_ROW),exit=solveLine(A,B,{x0:HANDOFF.strike05.x0,y0:538,x1:HANDOFF.strike05.x1,y1:538},.35,.12,34);
  const end=T.end-.1,last=afterBeats(a,T.end,-1);
  return mixProject(follow,exit,ease.inCubic(span(t,last,end)));
}
export function mixProject(a:ProjectCam,b:ProjectCam,k:number):ProjectCam {
  return {...mixCam(a,b,k),offsetX:lerp(a.offsetX??0,b.offsetX??0,k),offsetY:lerp(a.offsetY??0,b.offsetY??0,k)};
}
export function rigAt(t:number,a:AudioData,l:Lyrics) {const r=new Rig();setCamera(r,cameraAt(t,a,l));return r;}
export function entryPrim(t:number,a:AudioData,l:Lyrics):Prim {
  const p=clawdAt(t,a,l),r=rigAt(t,a,l),box={lo:{x:p.x-1.28,y:p.y,z:p.z-.32},hi:{x:p.x+1.28,y:p.y+.8,z:p.z+.32}};
  return {kind:'rect',...projectedBounds(r,boxCorners(box))};
}
export function exitPrim(t:number,a:AudioData,l:Lyrics):Prim {
  const r=rigAt(t,a,l),[A,B]=underline(FINAL_ROW),s=reading(t,a,l),end={...B,x:lerp(A.x,B.x,s.row===FINAL_ROW?s.p:0)};
  const P=r.proj(A.x,A.y,A.z)!,Q=r.proj(end.x,end.y,end.z)!;
  return {kind:'line',x0:P.x,y0:P.y,x1:Q.x,y1:Q.y,w:3};
}
export function stoneBounds(t:number,a:AudioData,l:Lyrics) {
  return projectedBounds(rigAt(t,a,l),stoneWords(l).flatMap((w,j)=>boxCorners(wordStone(j,l,a))));
}
/** Fit the complete, unclipped stair hull with a 48 px safety inset. */
export function stoneCamera(t:number,a:AudioData,l:Lyrics,p=clawdAt(t,a,l)):ProjectCam {
  const points=stoneWords(l).flatMap((_,j)=>{const b=wordStone(j,l,a),dy=stoneSink(j,t,a,l);return boxCorners({lo:{...b.lo,y:b.lo.y+dy},hi:{...b.hi,y:b.hi.y+dy}});});
  const target={x:p.x+1.2,y:p.y,z:p.z},r=new Rig();let lo=1,hi=40,c:ProjectCam=orbitCam(target,.35,.12,20,34,.3);
  for(let i=0;i<36;i++){c=orbitCam(target,.35,.12,(lo+hi)/2,34,.3);setCamera(r,c);const b=projectedBounds(r,points);
    if(b.w>1824||b.h>984)lo=(lo+hi)/2;else hi=(lo+hi)/2;}
  setCamera(r,c);const b=projectedBounds(r,points);c.offsetX=b.x+b.w/2-960;c.offsetY=b.y+b.h/2-540;return c;
}
export function stoneLetters(w:Word,t:number) {return letterTimes(w).map(g=>({visible:t>=g.t0,z:ease.outExpo(span(t,g.t0,g.t0+.12))}));}
