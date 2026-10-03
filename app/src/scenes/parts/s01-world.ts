// V6 cold boot: one mathematical world, shared by the SDF, light and letters.
import * as THREE from 'three';
import clawdJSON from '../../../../reference/clawd/clawd.json';
import { clamp, ease, lerp } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { exitEnvelope, type Prim } from '../../kit/handoff';
import { Rig, mixCam, orbitCam, p3, type Cam, type P3 } from '../../kit/rig';
import { layoutPath, path3, pathAt, type PathGlyph, type PathLayout } from '../../kit/pathtext';
import { varRun } from '../../kit/vartype';
import type { GlyphAffine } from '../../kit/carry';
import { audio, lyrics, T, voice, bootState } from './s01-timing';
import { iStemRect } from './s02-layout';
import { boxCorners, projectedBox } from './s01-print';

export const FRAME = { cx:0,y0:0.62,w:9.6,h:4.79,bar:0.07,depth:0.18 };
export const FRAME_PATH={length:2*(FRAME.w+FRAME.h),edges:[FRAME.h,FRAME.w,FRAME.w,FRAME.h],starts:[0,FRAME.h,FRAME.h+FRAME.w,FRAME.h+2*FRAME.w]};
export const VOX = 0.364;
export const CUR = {x:0,y:0,z:1.25,w:0.18,h:0.40,d:0.06};
export const LYRIC_CAP = 0.42;
export interface WorldBox { c:P3; h:P3; id:number }
export function sdBox(p:P3,h:P3):number {
  const x=Math.abs(p.x)-h.x,y=Math.abs(p.y)-h.y,z=Math.abs(p.z)-h.z;
  return Math.hypot(Math.max(x,0),Math.max(y,0),Math.max(z,0))+Math.min(Math.max(x,y,z),0);
}
export function worldBoxes(t:number):WorldBox[] {
  const s=bootState(audio,t,T), r=s.frame, out:WorldBox[]=[];
  const put=(x:number,y:number,z:number,hx:number,hy:number,hz:number,id=1)=>{
    if(hx>0&&hy>0&&hz>0)out.push({c:p3(x,y,z),h:p3(hx,hy,hz),id});
  };
  // Clip each edge at its true arc-length fraction of the perimeter.
  const ks=FRAME_PATH.edges.map((length,i)=>clamp((r*FRAME_PATH.length-FRAME_PATH.starts[i]!)/length));
  const x0=-FRAME.w/2,x1=FRAME.w/2,y0=FRAME.y0,y1=y0+FRAME.h;
  put(x0,y0+FRAME.h*ks[0]!/2,0,FRAME.bar,FRAME.h*ks[0]!/2,FRAME.depth);
  put(x0+FRAME.w*ks[1]!/2,y1,0,FRAME.w*ks[1]!/2,FRAME.bar,FRAME.depth);
  put(x0+FRAME.w*ks[2]!/2,y0,0,FRAME.w*ks[2]!/2,FRAME.bar,FRAME.depth);
  put(x1,y0+FRAME.h*ks[3]!/2,0,FRAME.bar,FRAME.h*ks[3]!/2,FRAME.depth);
  if(r>0)for(const x of [-4.2,4.2])put(x,y0/2,0,0.02,y0/2,0.02);
  const frameEnd=afterBeats(audio,T.welcome,1.4);
  const back=ease.outCubic(span(t,frameEnd,afterBeats(audio,frameEnd,0.5)));
  put(0,y0+FRAME.h*back/2,-0.16,FRAME.w/2,FRAME.h*back/2,0.01,2);
  // A1 closes the eye pixels. Reveal individual cells, merge only contiguous
  // cells of equal depth within one row (no silhouette-changing rounded union).
  const cells=clawdJSON.terminal_welcome.pixels.flatMap((row,y)=>Array.from(row).flatMap((ch,x)=>ch==='.'?[]:[{x,y}]));
  const count=Math.floor(cells.length*s.pixels), active=new Set(cells.slice(0,count).map(c=>c.y*16+c.x));
  for(let row=0;row<5;row++)for(let x=0;x<16;){
    if(!active.has(row*16+x)){x++;continue;}
    const limb=row===4||x<2||x>13, start=x++;
    while(x<16&&active.has(row*16+x)&&(row===4||x<2||x>13)===limb)x++;
    put((start+x-16)*VOX/2,y0+FRAME.bar+(4-row+0.5)*VOX,0,(x-start)*VOX/2,VOX/2,(limb?1:2)*VOX,3);
  }
  return out;
}
export function sdWorld(p:P3,t=T.ping-1/60):number {
  let d=p.y;
  for(const b of worldBoxes(t))d=Math.min(d,sdBox(p3(p.x-b.c.x,p.y-b.c.y,p.z-b.c.z),b.h));
  return d;
}
// The generated box uniforms are identical on CPU and GPU. Tests independently
// translate this primitive and union in JS at 200 seeded points per time.
export const S01_GLSL=/* glsl */`
uniform vec3 boxC[32],boxH[32];uniform float boxID[32];uniform int boxN;
float sdBoxW(vec3 p,vec3 h){vec3 q=abs(p)-h;return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0);}
float map(vec3 p,out float id){
  float d=p.y;id=0.0;
  for(int i=0;i<32;i++){if(i>=boxN)break;float b=sdBoxW(p-boxC[i],boxH[i]);if(b<d){d=b;id=boxID[i];}}
  return d;
}`;
export function blink(t:number):number {
  const frameEnd=afterBeats(audio,T.welcome,1.4);
  if((t>=T.welcome&&t<=frameEnd)||t>=afterBeats(audio,T.ping,-1))return 1;
  const b=audio.beatAt(t),floor=Math.floor(b),off=audio.timeOfBeat(floor+0.55);
  return b-floor<=0.55?1:Math.exp(-(t-off)/0.09);
}
export function flare(t:number):number {
  return ease.inCubic(span(t,lyrics.lines[0]!.words[2]!.start,T.ping-1/60));
}
export function cameraAt(t:number):Cam {
  // Freeze the entire camera value, including its kick-driven breath.
  t=Math.min(t,T.ping-0.1);
  const a=afterBeats(audio,T.welcome,-1.5),b=afterBeats(audio,T.welcome,3),lean=afterBeats(audio,T.ping,-2);
  const micro=orbitCam(p3(CUR.x,CUR.h/2,CUR.z),0.25,0.12,lerp(1.6,1.35,span(t,T.start,a)),28);
  // Width fit includes the bars and front depth. The specified target is kept;
  // its vertical location cannot also fit WELCOME_BOX (see final report).
  const focal=540/Math.tan(34*Math.PI/360),dist=focal*(FRAME.w+2*FRAME.bar)/960+FRAME.depth;
  const wide=orbitCam(p3(0,2.95,0),0,0.05,dist,34);
  if(t<a)return micro;
  if(t<b){const u=span(t,a,b),k=ease.inOutCubic(u);const c=mixCam(micro,wide,k);
    const yaw=u<0.25?0.25+0.07*Math.sin(u/0.25*Math.PI/2):0.32*Math.cos((u-0.25)/0.75*Math.PI/2);
    const d=Math.hypot(c.pos.x-c.tgt.x,c.pos.y-c.tgt.y,c.pos.z-c.tgt.z);
    return orbitCam(c.tgt,yaw,lerp(0.12,0.05,k),d,c.fov);
  }
  const k=span(t,b,lean), breath=1+0.004*audio.hit('kick',t,0.08)*Math.cos(audio.beatAt(t)*Math.PI*2);
  const close=0.5-0.5*Math.cos(Math.PI*span(t,lean,T.ping-0.1));
  return orbitCam(wide.tgt,lerp(0,-0.03,k),0.05,dist*breath*lerp(1,0.94,close),34);
}
const rig=new Rig();
export function frameBox(t=afterBeats(audio,T.welcome,4)) {
  rig.set(cameraAt(t));return projectedBox(rig,boxCorners(p3(0,FRAME.y0+FRAME.h/2,0),p3(FRAME.w/2+FRAME.bar,FRAME.h/2+FRAME.bar,FRAME.depth)));
}
export function clawdBox(t=afterBeats(audio,T.welcome,4)) {
  rig.set(cameraAt(t));return projectedBox(rig,worldBoxes(t).filter(b=>b.id===3).flatMap(b=>boxCorners(b.c,b.h)));
}
export const lyricPath=path3([p3(-4.6,0,2.3),p3(30,0,2.3)]);
let first:PathLayout|undefined,continued:PathLayout|undefined;
export function line01Layout():PathLayout { return first??=layoutPath(lyrics.lines[0]!.words.slice(0,3),{capH:LYRIC_CAP,axes:w=>voice.form(w,w.end).axes}); }
export function continuedLayout():PathLayout { return continued??=layoutPath([...lyrics.lines[0]!.words.slice(0,3),...lyrics.lines[0]!.words.slice(4)],{capH:LYRIC_CAP,axes:w=>voice.form(w,w.end).axes}); }
/** Same stand-mode affine as pathtext, including animated font cap metrics. */
export function standAffine(g:PathGlyph,t:number,camTime=t):GlyphAffine {
  rig.set(cameraAt(camTime));const a=pathAt(lyricPath,g.s),b=pathAt(lyricPath,g.s+g.w),qa=rig.proj(a.x,a.y,a.z)!,qb=rig.proj(b.x,b.y,b.z)!;
  const run=varRun(g.ch,100,voice.form(g.word,t).axes),end=varRun(g.ch,100,voice.form(g.word,g.word.end).axes);
  const angle=Math.atan2(qb.y-qa.y,qb.x-qa.x),sx=Math.hypot(qb.x-qa.x,qb.y-qa.y)/end.glyphs[0]!.adv;
  const sy=0.5*(qa.s+qb.s)*LYRIC_CAP/run.capH;
  return {a:Math.cos(angle)*sx,b:Math.sin(angle)*sx,c:-Math.sin(angle)*sy,d:Math.cos(angle)*sy,e:qa.x,f:qa.y,ch:g.ch,i:g.i};
}
export function line01Affines():GlyphAffine[] {return line01Layout().glyphs.map(g=>standAffine(g,T.ping-1/60));}
export function line01Next(i:number,t=T.ping-1/60):GlyphAffine {
  const g=continuedLayout().glyphs[line01Layout().glyphs.length+i];if(!g)throw new RangeError(`continuation glyph ${i}`);
  return standAffine(g,t,T.ping-1/60);
}
export function cursorPoints(t:number):P3[] {
  rig.set(cameraAt(t));const aStart=lyrics.lines[0]!.words[2]!.start,squashEnd=afterBeats(audio,aStart,0.25);
  const squash=ease.outQuad(span(t,aStart,squashEnd)),grow=ease.outExpo(span(t,squashEnd,T.ping-1/60));
  const w=CUR.w*lerp(1,1.25,squash),h=CUR.h*lerp(1,0.6,squash);
  const base=[p3(-w/2,h,CUR.z+CUR.d/2),p3(w/2,h,CUR.z+CUR.d/2),p3(w/2,0,CUR.z+CUR.d/2),p3(-w/2,0,CUR.z+CUR.d/2)];
  if(!grow)return base;
  const stem=iStemRect(), depth=new THREE.Vector3(CUR.x,CUR.h/2,CUR.z).applyMatrix4(rig.cam.matrixWorldInverse).z;
  const target=[[stem.x,stem.y],[stem.x+stem.w,stem.y],[stem.x+stem.w,stem.y+stem.h],[stem.x,stem.y+stem.h]].map(([x,y])=>{
    const v=new THREE.Vector3((x!/1920)*2-1,1-y!/540,0).unproject(rig.cam),dir=v.sub(rig.cam.position).normalize();
    const forward=new THREE.Vector3(0,0,-1).applyQuaternion(rig.cam.quaternion);
    const p=rig.cam.position.clone().addScaledVector(dir,-depth/dir.dot(forward));return p3(p.x,p.y,p.z);
  });
  return base.map((p,i)=>p3(lerp(p.x,target[i]!.x,grow),lerp(p.y,target[i]!.y,grow),lerp(p.z,target[i]!.z,grow)));
}
export function cursorSolidPoints(t:number):P3[] {
  const front=cursorPoints(t),a=front[0]!,b=front[1]!,d=front[3]!,ux=p3(b.x-a.x,b.y-a.y,b.z-a.z),uy=p3(a.x-d.x,a.y-d.y,a.z-d.z);
  const cross=p3(ux.y*uy.z-ux.z*uy.y,ux.z*uy.x-ux.x*uy.z,ux.x*uy.y-ux.y*uy.x),length=Math.hypot(cross.x,cross.y,cross.z);
  const n=p3(cross.x/length,cross.y/length,cross.z/length);
  return [...front,...front.map(p=>p3(p.x-n.x*CUR.d,p.y-n.y*CUR.d,p.z-n.z*CUR.d))];
}
export function cursorCenter(t:number):P3 {
  const ps=cursorSolidPoints(t);return p3(ps.reduce((s,p)=>s+p.x,0)/8,ps.reduce((s,p)=>s+p.y,0)/8,ps.reduce((s,p)=>s+p.z,0)/8);
}
export function cursorBox(t:number) {rig.set(cameraAt(t));return projectedBox(rig,cursorSolidPoints(t));}
export function cursorAt(t:number) {const b=cursorBox(t);return {x:b.x+b.w/2,y:b.y+b.h/2};}
export function exitPrim(t:number):Prim {return {kind:'rect',...cursorBox(t)};}
/** E excludes ambient, which is added separately to the engraved surface. */
export function lightAt(p:P3,t:number,n:P3=p3(0,1,0)):number {
  const l=cursorCenter(t),d=p3(l.x-p.x,l.y-p.y,l.z-p.z),len=Math.max(1e-9,Math.hypot(d.x,d.y,d.z)),dir=p3(d.x/len,d.y/len,d.z/len);
  let sh=1;const ro=p3(p.x+n.x*0.01,p.y+n.y*0.01,p.z+n.z*0.01);
  for(const b of worldBoxes(t)){
    const lo=[b.c.x-b.h.x,b.c.y-b.h.y,b.c.z-b.h.z],hi=[b.c.x+b.h.x,b.c.y+b.h.y,b.c.z+b.h.z],origin=[ro.x,ro.y,ro.z],direction=[dir.x,dir.y,dir.z];
    let near=-Infinity,far=Infinity;
    for(let i=0;i<3;i++){const inv=1/(direction[i]||1e-20),a=(lo[i]!-origin[i]!)*inv,c=(hi[i]!-origin[i]!)*inv;near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));}
    if(far>Math.max(near,0.001)&&near<len)return 0;
    const travel=clamp(near,0.03,len),q=p3(ro.x+dir.x*travel-b.c.x,ro.y+dir.y*travel-b.c.y,ro.z+dir.z*travel-b.c.z);
    sh=Math.min(sh,10*Math.max(0,sdBox(q,b.h))/travel);
  }
  return blink(t)*(1+3*flare(t))*Math.max(0,n.x*dir.x+n.y*dir.y+n.z*dir.z)/(len*len+0.35)*clamp(sh);
}
export function lyricAlpha(p:P3,t:number) {return 0.3+0.7*clamp(lightAt(p,t));}
export function cursorGain(t:number) {return blink(t)*(1+3*flare(t))*exitEnvelope(t,T.ping).gain;}
