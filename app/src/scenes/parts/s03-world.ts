// V6 issue form: a displaced height field used by mesh, normals, stamp and type.
import { clamp, ease, lerp, smoothstep, springStep, polylineLengths } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { Rig, orbitCam, mixCam, p3, planeAffine, type Cam, type P3 } from '../../kit/rig';
import { layoutPath, path3, samplePath, pathAt, writeHead, type PathLayout } from '../../kit/pathtext';
import { CUT, exitEnvelope, type Prim, type Rect } from '../../kit/handoff';
import { lerpAffines, type GlyphAffine } from '../../kit/carry';
import { varRun } from '../../kit/vartype';
import type { StrokeText } from '../../engine/stroke';
import { audio, lyrics, T, voice } from './s01-timing';
import { screenAffines } from './s02-world';
import { projectedBox } from './s01-print';
export const PAPER={x0:0.6,z0:0.57,w:17.9,h:10};
export const CAL={x:13.55,z:0.90,w:5.11,h:4.38};
export const STAMP={x:11.9,z:7.66,angle:-0.21,w:8.1,h:3.4,r:0.18,depth:0.6};
export const KEY=p3(-0.8,0.35,-0.3),KEY_NORM=Math.hypot(KEY.x,KEY.y,KEY.z);
const words=lyrics.lines[1]!.words;
export function press(t:number){
  const a=t-T.bug;if(a<0)return 0;if(a<0.03)return a/0.03;if(a<0.17)return 1;
  return clamp(1-springStep(a-0.17,10,0.5));
}
export function stampMask(x:number,z:number){
  const dx=x-STAMP.x,dz=z-STAMP.z,c=Math.cos(STAMP.angle),s=Math.sin(STAMP.angle);
  const qx=Math.abs(c*dx+s*dz)-STAMP.w/2+STAMP.r,qz=Math.abs(-s*dx+c*dz)-STAMP.h/2+STAMP.r;
  const d=Math.hypot(Math.max(qx,0),Math.max(qz,0))+Math.min(Math.max(qx,qz),0)-STAMP.r;
  return 1-smoothstep(-0.15,0.15,d);
}
export function paperY(x:number,z:number,t:number){
  const u=(x-PAPER.x0)/PAPER.w,v=1-(z-PAPER.z0)/PAPER.h;
  return 0.10*(1-Math.cos(Math.PI*u))*0.5+0.18*smoothstep(0.75,1,u)*smoothstep(0.7,1,v)-0.05*stampMask(x,z)*press(t);
}
function sdGradient(x:number,z:number){
  const dx=x-STAMP.x,dz=z-STAMP.z,c=Math.cos(STAMP.angle),s=Math.sin(STAMP.angle),X=c*dx+s*dz,Z=-s*dx+c*dz;
  const qx=Math.abs(X)-STAMP.w/2+STAMP.r,qz=Math.abs(Z)-STAMP.h/2+STAMP.r,ax=Math.max(qx,0),az=Math.max(qz,0),n=Math.hypot(ax,az);
  const gx=(n>0?ax/n:qx>=qz?1:0)*Math.sign(X),gz=(n>0?az/n:qz>qx?1:0)*Math.sign(Z);
  return {d:n+Math.min(Math.max(qx,qz),0)-STAMP.r,x:c*gx-s*gz,z:s*gx+c*gz};
}
const smoothD=(a:number,b:number,x:number)=>{const u=clamp((x-a)/(b-a));return x<=a||x>=b?0:6*u*(1-u)/(b-a);};
export function paperNormal(x:number,z:number,t:number):P3 {
  const u=(x-PAPER.x0)/PAPER.w,v=1-(z-PAPER.z0)/PAPER.h,g=sdGradient(x,z);
  const dent=0.05*press(t)*smoothD(-0.15,0.15,g.d);
  const dx=0.05*Math.PI/PAPER.w*Math.sin(Math.PI*u)+0.18*smoothD(0.75,1,u)/PAPER.w*smoothstep(0.7,1,v)+dent*g.x;
  const dz=-0.18*smoothstep(0.75,1,u)*smoothD(0.7,1,v)/PAPER.h+dent*g.z;
  const n=Math.hypot(dx,1,dz);return p3(-dx/n,1/n,-dz/n);
}
// Formula twins; all constants are emitted from the CPU world rather than copied.
export const S03_GLSL=/* glsl */`
const vec4 PAPER=vec4(${PAPER.x0},${PAPER.z0},${PAPER.w},${PAPER.h});
const vec4 STAMP=vec4(${STAMP.x},${STAMP.z},${STAMP.w},${STAMP.h});
const float STAMP_A=${STAMP.angle},STAMP_R=${STAMP.r};uniform float paperPress;
vec3 stampGradient(vec2 p){
  float c=cos(STAMP_A),s=sin(STAMP_A);vec2 d=p-STAMP.xy;
  vec2 X=vec2(c*d.x+s*d.y,-s*d.x+c*d.y),q=abs(X)-STAMP.zw*0.5+STAMP_R,a=max(q,0.0);
  float n=length(a),dist=n+min(max(q.x,q.y),0.0)-STAMP_R;
  vec2 g=(n>0.0?a/n:(q.x>=q.y?vec2(1,0):vec2(0,1)))*sign(X);
  return vec3(dist,c*g.x-s*g.y,s*g.x+c*g.y);
}
float stampMask(vec2 p){return 1.0-smoothstep(-0.15,0.15,stampGradient(p).x);}
float paperY(float x,float z){
  float u=(x-PAPER.x)/PAPER.z,v=1.0-(z-PAPER.y)/PAPER.w;
  return 0.10*(1.0-cos(3.14159265359*u))*0.5+0.18*smoothstep(0.75,1.0,u)*smoothstep(0.7,1.0,v)-0.05*stampMask(vec2(x,z))*paperPress;
}
float smoothD(float a,float b,float x){float u=clamp((x-a)/(b-a),0.0,1.0);return x<=a||x>=b?0.0:6.0*u*(1.0-u)/(b-a);}
vec3 paperNormal(float x,float z){
  float u=(x-PAPER.x)/PAPER.z,v=1.0-(z-PAPER.y)/PAPER.w;vec3 g=stampGradient(vec2(x,z));
  float dent=0.05*paperPress*smoothD(-0.15,0.15,g.x);
  float dx=0.05*3.14159265359/PAPER.z*sin(3.14159265359*u)+0.18*smoothD(0.75,1.0,u)/PAPER.z*smoothstep(0.7,1.0,v)+dent*g.y;
  float dz=-0.18*smoothstep(0.75,1.0,u)*smoothD(0.7,1.0,v)/PAPER.w+dent*g.z;
  return normalize(vec3(-dx,1.0,-dz));
}`;
export function paperShift(t:number){return 5*(1-ease.outCubic(span(t,T.issue+1/60,afterBeats(audio,T.issue,1))));}
export function paperPoint(x:number,z:number,t:number):P3 {return p3(x+paperShift(t),paperY(x,z,t),z);}
export function paperLight(x:number,z:number,t:number){const n=paperNormal(x,z,t);return clamp(0.18+Math.max(0,(n.x*KEY.x+n.y*KEY.y+n.z*KEY.z)/KEY_NORM));}
let got:PathLayout|undefined,report:PathLayout|undefined,notes:PathLayout|undefined,screen:PathLayout|undefined;
export function titleLayouts(){
  return [got??=layoutPath(words.slice(0,2),{capH:3.156,axes:w=>voice.form(w,w.end).axes}),
    report??=layoutPath(words.slice(3,4),{capH:3.156,axes:w=>voice.form(w,w.end).axes})];
}
export function notesLayout(){return notes??=layoutPath(words.slice(4),{capH:0.508,axes:w=>voice.form(w,w.end).axes});}
export function screenLayout(){return screen??=layoutPath([lyrics.lines[0]!.words[6]!],{capH:0.508,axes:w=>voice.form(w,w.end).axes});}
export function textPath(row:'got'|'report'|'notes'|'screen',t:number,world=true){
  const [x,z]=row==='got'?[0.85,4.806]:row==='report'?[0.85,8.156]:row==='notes'?[4.2,9.72]:[0.85,9.72];
  return samplePath(u=>{const X=x+u*30;return p3(X+(world?paperShift(t):0),paperY(X,z,t)+0.003,z);},240);
}
export function calendarGrid(header=calendarFit().header):Rect {return {x:CAL.x,y:CAL.z+header,w:CAL.w,h:CAL.h-header};}
function boundary(rect:Rect,t:number):P3[]{
  const ps:P3[]=[];for(let i=0;i<=32;i++){const k=i/32;ps.push(paperPoint(rect.x+rect.w*k,rect.y,t),paperPoint(rect.x+rect.w*k,rect.y+rect.h,t),paperPoint(rect.x,rect.y+rect.h*k,t),paperPoint(rect.x+rect.w,rect.y+rect.h*k,t));}return ps;
}
function linearSolve(A:number[][],b:number[]){
  const m=A.map((r,i)=>[...r,b[i]!]);for(let i=0;i<b.length;i++){
    const pivot=i+m.slice(i).map(r=>Math.abs(r[i]!)).indexOf(Math.max(...m.slice(i).map(r=>Math.abs(r[i]!))));
    [m[i],m[pivot]]=[m[pivot]!,m[i]!];const d=m[i]![i]!;if(Math.abs(d)<1e-10)throw new Error('singular calendar fit');
    for(let j=i;j<=b.length;j++)m[i]![j]!/=d;
    for(let k=0;k<b.length;k++)if(k!==i){const f=m[k]![i]!;for(let j=i;j<=b.length;j++)m[k]![j]!-=f*m[i]![j]!;}
  }return m.map(r=>r.at(-1)!);
}
let fit:{cam:Cam;header:number}|undefined;
export function calendarFit(){
  if(fit)return fit;
  const end=T.end-0.1,focal=540/Math.tan(34*Math.PI/360),scale=CUT.grid04.w/CAL.w;
  let q=[CAL.x+CAL.w/2,CAL.z+CAL.h/2+0.5-45/scale,focal/scale+paperY(CAL.x+CAL.w/2,CAL.z+CAL.h/2,end),CAL.h-CAL.w*CUT.grid04.h/CUT.grid04.w];
  const measure=(p:number[])=>{const rig=new Rig();rig.set(orbitCam(p3(p[0]!,0,p[1]!),0,Math.PI/2,p[2]!,34));
    const b=projectedBox(rig,boundary({x:CAL.x,y:CAL.z+p[3]!,w:CAL.w,h:CAL.h-p[3]!},end));return [b.x,b.y,b.w,b.h];};
  const want=[CUT.grid04.x,CUT.grid04.y,CUT.grid04.w,CUT.grid04.h];
  for(let i=0;i<12;i++){const b=measure(q),err=b.map((v,j)=>want[j]!-v);if(Math.max(...err.map(Math.abs))<1e-7)break;
    const J=Array.from({length:4},()=>Array(4).fill(0));
    for(let j=0;j<4;j++){const v=q.slice();v[j]!+=1e-4;const B=measure(v);for(let k=0;k<4;k++)J[k]![j]=(B[k]!-b[k]!)/1e-4;}
    const delta=linearSolve(J,err);q=q.map((v,j)=>v+delta[j]!);
  }
  return fit={cam:orbitCam(p3(q[0]!,0,q[1]!),0,Math.PI/2,q[2]!,34),header:q[3]!};
}
export function circleStroke():StrokeText {
  const grid=calendarGrid(),cw=grid.w/7,rh=grid.h/5,cx=grid.x+6.5*cw,cy=grid.y+4.5*rh,rx=cw*0.65,ry=rh*0.43,angle=-0.3;
  const points=Array.from({length:129},(_,i)=>{const a=i/128*Math.PI*2,x=rx*Math.cos(a),y=ry*Math.sin(a);return {x:(cx+Math.cos(angle)*x-Math.sin(angle)*y)*100,y:(cy+Math.sin(angle)*x+Math.cos(angle)*y)*100};});
  const L=polylineLengths(points),total=L.at(-1)!;return {strokes:[points],charOf:[0],startLen:[0],lens:[L],total,width:rx*200,charRange:[[0,total]],size:100,capHeight:ry*200};
}
export function circleHead(t:number):P3 {
  const st=circleStroke(),p=span(t,words[5]!.start,words[6]!.start),want=st.total*p,L=st.lens[0]!,points=st.strokes[0]!;
  let i=1;while(i<L.length-1&&L[i]!<want)i++;const k=clamp((want-L[i-1]!)/(L[i]!-L[i-1]!)),a=points[i-1]!,b=points[i]!;
  return paperPoint(lerp(a.x,b.x,k)/100,lerp(a.y,b.y,k)/100,t);
}
export function writeHeadWorld(t:number):P3 {
  if(t<words[0]!.start)return paperPoint(PAPER.x0,CAL.z,t);
  if(t>=words[5]!.start&&t<words[6]!.start)return circleHead(t);
  const row=t>=words[4]!.start?'notes':t>=words[3]!.start?'report':'got',lay=row==='notes'?notesLayout():titleLayouts()[row==='report'?1:0]!;
  return pathAt(textPath(row,t),writeHead(lay.glyphs,t,lay.s0));
}
export function cameraAt(t:number):Cam {
  t=Math.min(t,T.end-0.1);if(t<=T.issue+1/60)t=T.issue;const e1=afterBeats(audio,T.issue,1),k=ease.outCubic(span(t,T.issue+1/60,e1)),focal=540/Math.tan(34*Math.PI/360),dist=15.6;
  const entry=orbitCam(p3(PAPER.x0+5+(960-624)/(focal/dist),0,PAPER.z0+PAPER.h/2),0,Math.PI/2,dist,34);
  if(t<=e1)return mixCam(entry,orbitCam(p3(PAPER.x0+PAPER.w/2,0,PAPER.z0+PAPER.h/2),0,1.05,dist,34,-0.032),k);
  const head=writeHeadWorld(Math.min(t,words[5]!.start-1e-6)),center=p3(PAPER.x0+PAPER.w/2,0,PAPER.z0+PAPER.h/2),target=p3(head.x*0.35+center.x*0.65,0,head.z*0.35+center.z*0.65);
  let impulse=0;for(const wd of words)if(t>=wd.start&&t<afterBeats(audio,wd.start,1))impulse+=0.012*Math.exp(-(t-wd.start)/0.1);
  const read=orbitCam(target,0,1.05,dist*(1-impulse),34,-0.032);
  if(t<words[5]!.start)return read;
  const grid=calendarGrid(),cell=paperPoint(grid.x+6.5*grid.w/7,grid.y+4.5*grid.h/5,t),circle=orbitCam(p3(cell.x,0,cell.z),0,1.25,dist*0.85,34,-0.032);
  const E3=mixCam(read,circle,ease.inOutCubic(span(t,words[5]!.start,words[7]!.start)));
  if(t<words[7]!.start)return E3;
  return mixCam(circle,calendarFit().cam,ease.inCubic(span(t,words[7]!.start,T.end-0.1)));
}
export function paperBox(t:number){const rig=new Rig();rig.set(cameraAt(t));return projectedBox(rig,boundary({x:PAPER.x0,y:PAPER.z0,w:PAPER.w,h:PAPER.h},t));}
export function calendarBox(t:number){const rig=new Rig();rig.set(cameraAt(t));return projectedBox(rig,boundary(calendarGrid(),t));}
export function entryPrim(t:number):Prim {
  const rig=new Rig();rig.set(cameraAt(t));const a=rig.proj(...Object.values(paperPoint(PAPER.x0,PAPER.z0,t)) as [number,number,number])!,b=rig.proj(...Object.values(paperPoint(PAPER.x0,PAPER.z0+PAPER.h,t)) as [number,number,number])!;
  // C2 compares the edge clipped to the full-height poster viewport.
  return {kind:'line',x0:a.x,y0:Math.max(0,a.y),x1:b.x,y1:Math.min(1080,b.y),w:1};
}
export function exitPrim(t:number):Prim {return {kind:'rect',...calendarBox(t)};}
export function cursorAt(t:number){const rig=new Rig();rig.set(cameraAt(t));const p=writeHeadWorld(t),q=rig.proj(p.x,p.y,p.z)!;return {x:q.x,y:q.y};}
export function screenOnPaper(t:number):GlyphAffine[]{
  const rig=new Rig();rig.set(cameraAt(t));const lay=screenLayout(),path=textPath('screen',t);
  return lay.glyphs.map((g,i)=>{const p=pathAt(path,g.s),n=paperNormal(p.x-paperShift(t),p.z,t),run=varRun(g.ch,100,voice.form(g.word,t).axes),ux=p3(1,0,0),uy=p3(0,-n.z,n.y);
    const aff=planeAffine(rig,p,ux,uy,lay.capH/run.capH)!;return {...aff,ch:g.ch,i};});
}
export function incomingScreenAffines(t:number):GlyphAffine[]{
  const shared=screenAffines(T.issue);if(t===T.issue)return shared;
  // Finish singing in the shared layout, then settle onto the paper in 120 ms.
  return lerpAffines(shared,screenOnPaper(t),ease.outCubic(span(t,lyrics.lines[0]!.words[6]!.end,lyrics.lines[0]!.words[6]!.end+0.12)));
}
export function stampPose(t:number){
  const at=T.bug,impact=paperPoint(STAMP.x,STAMP.z,at),cam=cameraAt(at-0.12),near=p3(cam.pos.x,cam.pos.y-0.7,cam.pos.z-0.7);
  const fall=ease.inQuad(span(t,at-0.12,at)),lift=ease.outCubic(span(t,at+0.17,at+0.37));
  return {visible:t>=at-0.12&&t<at+0.37,x:lerp(near.x,impact.x,fall),z:lerp(near.z,impact.z,fall),y:lerp(near.y,impact.y+0.08,fall)+lift*9-0.05*press(t),press:press(t),ink:t>=at+0.17};
}
export function calendarNumbers(t:number){return lerp(0.6,0.3,span(t,afterBeats(audio,T.end,-0.5),T.end-1/60));}
export function gain(t:number){return exitEnvelope(t,T.end).gain;}
