// V6 plotter: the pen and the written polylines share exactly one arc-length evaluation.
import type { AudioData } from '../../engine/audio';
import type { Word } from '../../engine/lyrics';
import { strokeText, writtenLength, type StrokeText } from '../../engine/stroke';
import { ease, lerp } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { letterTimes } from '../../kit/pathtext';
import { Rig, mixCam, orbitCam, type P3 } from '../../kit/rig';
import { HANDOFF, type Prim } from '../../kit/handoff';
import { varRun } from '../../kit/vartype';
import { solidLetterGeometry } from '../../kit/solidtype';
import type { CTimes } from './s06-timing';
import { projectedBounds, setCamera, solveLine, solvePoint, type ProjectCam } from './s05-print';
import { mixProject } from './s05-world';

export const PAPER_W=19.2,PAPER_D=10.8;
export const WORLD_GLSL=`
vec3 rowStart(float k) {return vec3(-3.7,0.005,-1.2+1.4*k);}
vec3 rowEnd(float k) {return vec3(3.7,0.005,-1.2+1.4*k);}
vec3 beamCenter(vec3 pen) {return vec3(0.0,0.9,pen.z);}
vec3 carriageCenter(vec3 pen) {return vec3(pen.x,0.75,pen.z);}
`;
export function rowLine(k:number):[P3,P3] {return [{x:-3.7,y:.005,z:-1.2+1.4*k},{x:3.7,y:.005,z:-1.2+1.4*k}];}
export interface Writing {st:StrokeText;times:[number,number][];words:Word[];row:number;origin:P3}
const cache=new WeakMap<CTimes,Writing[]>();
export function writings(T:CTimes):Writing[] {
  const hit=cache.get(T);if(hit)return hit;
  const H=strokeText('H','readable',100),ys=H.strokes.flat().map(p=>p.y),cap=Math.max(...ys)-Math.min(...ys);
  const out=[T.plan.words.slice(0,3),T.plan.words.slice(3,6)].map((words,row)=>{
    const times:[number,number][]=[];
    words.forEach((w,i)=>{letterTimes(w).forEach(g=>times.push([g.t0,g.t1]));if(i<words.length-1)times.push([w.end,w.end]);});
    return {st:strokeText(words.map(w=>w.w).join(' '),'readable',100*.62/cap),times,words,row,origin:{x:-3.55,y:.009,z:rowLine(row)[0].z-.08}};
  });cache.set(T,out);return out;
}
export function strokeHead(st:StrokeText,len:number):{x:number;y:number;stroke:number} | null {
  let head:null|{x:number;y:number;stroke:number}=null;
  for(let i=0;i<st.strokes.length;i++) {
    const s=st.startLen[i]!;if(s>len)break;
    const points=st.strokes[i]!,L=st.lens[i]!,remain=len-s;
    for(let j=1;j<points.length;j++) {
      const k=Math.min(1,Math.max(0,(remain-L[j-1]!)/Math.max(1e-12,L[j]!-L[j-1]!))),A=points[j-1]!,B=points[j]!;
      head={x:lerp(A.x,B.x,k),y:lerp(A.y,B.y,k),stroke:i};if(remain<L[j]!)return head;
    }
  }return head;
}
export function writingAt(t:number,T:CTimes) {
  for(const w of writings(T))if(t>=w.words[0]!.start&&t<=w.words.at(-1)!.end) {
    const len=writtenLength(w.st,w.times,t),head=strokeHead(w.st,len);
    if(!head)return null;
    const ci=w.st.charOf[head.stroke]!,time=w.times[ci]!;
    return {writing:w,len,head,down:t>=time[0]&&t<time[1],point:{x:w.origin.x+head.x,y:w.origin.y,z:w.origin.z+head.y}};
  }return null;
}
export const LANDING:P3={x:-2.6,y:0,z:2.65};
export function checkPoints(k:number):P3[] {const [A]=rowLine(k);return [{x:A.x-.7,y:.012,z:A.z-.22},{x:A.x-.51,y:.012,z:A.z-.02},{x:A.x-.22,y:.012,z:A.z-.42}];}
export function checkPoint(k:number,u:number):P3 {
  const [A,B,C]=checkPoints(k),v=u<.35?u/.35:(u-.35)/.65,P=u<.35?A!:B!,Q=u<.35?B!:C!;
  return {x:lerp(P.x,Q.x,v),y:.012,z:lerp(P.z,Q.z,v)};
}
export function penAt(t:number,a:AudioData,T:CTimes):P3 & {down:boolean} {
  const current=writingAt(t,T);if(current)return {...current.point,y:current.down?0:.18,down:current.down};
  let p:P3={...rowLine(0)[0],y:.18};
  for(const w of writings(T)) {
    if(t<w.words[0]!.start)break;
    const h=strokeHead(w.st,Math.min(w.st.total,writtenLength(w.st,w.times,t)));
    if(h)p={x:w.origin.x+h.x,y:.18,z:w.origin.z+h.y};
    const next=writings(T)[w.row+1];
    if(next&&t>w.words.at(-1)!.end&&t<next.words[0]!.start){const k=ease.inOutQuad(span(t,w.words.at(-1)!.end,next.words[0]!.start));p={x:lerp(p.x,next.origin.x,k),y:.18,z:lerp(p.z,next.origin.z,k)};}
  }
  for(const [k,at] of T.checks.entries()) {
    if(t<at-.12)break;
    const end=afterBeats(a,at,.27),dest=checkPoints(k)[0]!;
    if(t<at){const u=ease.inOutQuad(span(t,at-.12,at));return {x:lerp(p.x,dest.x,u),y:.18,z:lerp(p.z,dest.z,u),down:false};}
    p=checkPoint(k,span(t,at,end));if(t<=end)return {...p,y:0,down:true};
  }
  const done=afterBeats(a,T.checks[2]!,.27),land=T.keyboard-.1;
  if(t>=done){const u=ease.inOutQuad(span(t,done,land));p={x:lerp(p.x,LANDING.x,u),y:t>=land?0:.18,z:lerp(p.z,LANDING.z,u)};}
  return {...p,down:p.y===0};
}
export function checkLight(t:number,T:CTimes) {
  let deg=62;
  for(const [k,at] of T.checks.entries()){if(t<at)break;deg=lerp([62,42,24][k]!,[42,24,11][k]!,ease.outCubic(span(t,at,at+.18)));}
  const e=deg*Math.PI/180,az=-Math.PI/4;
  return {elevation:deg,intensity:.9/Math.sin(e),dir:{x:Math.sin(az)*Math.cos(e),y:Math.sin(e),z:Math.cos(az)*Math.cos(e)}};
}
export function surfaceTone(normal:P3,t:number,T:CTimes,shadow=1){const L=checkLight(t,T);return Math.min(.92,.12+L.intensity*Math.max(0,normal.x*L.dir.x+normal.y*L.dir.y+normal.z*L.dir.z)*shadow);}
export function checkWidth() {const r=varRun('CHECK',100,{wdth:100,wght:900});return r.width*4.2/r.capH;}
export function checkCorners():P3[] {
  const w=checkWidth();return [-w/2,w/2].flatMap(x=>[0,.3].flatMap(y=>[-2.6,-6.8].map(z=>({x,y,z}))));
}
function baseCameraAt(t:number,a:AudioData,T:CTimes):ProjectCam {
  t=t<=T.todo+1/60?T.todo:t;
  const [A,B]=rowLine(0),entry=solveLine(A,B,{x0:588,y0:538,x1:1295,y1:538},.08,1.05,34);
  const p=penAt(t,a,T),u=span(t,T.todo,T.checksCut);
  const writing=orbitCam({x:.6*p.x,y:0,z:.6*p.z},.08,1.05,19*(1-.08*u),34);
  const first=mixProject(entry,writing,u);
  if(t<T.checksCut)return first;
  const far=orbitCam({x:0,y:0,z:-1.8},.08,1.10,15.8,34);
  const overview=mixProject(first,far,ease.inOutCubic(span(t,T.checksCut,afterBeats(a,T.checks[2]!,.27))));
  const last=afterBeats(a,T.keyboard,-1),land=T.keyboard-.1;
  const exit=solvePoint({...LANDING,y:0},170,HANDOFF.pen06,.08,1.2,34,-.26);
  return mixProject(overview,exit,ease.inCubic(span(t,last,land)));
}
export function cameraAt(t:number,a:AudioData,T:CTimes):ProjectCam {
  const c=baseCameraAt(t,a,T);if(t>=T.keyboard-.1)return c;
  let hit=0,dx=0,dy=0;for(const at of T.checks){if(t<at)continue;const age=t-at,k=Math.exp(-age/.1);hit+=k;dx+=5*k*Math.sin(age*83);dy+=5*k*Math.sin(age*107);}
  c.pos={x:c.tgt.x+(c.pos.x-c.tgt.x)*(1-.025*hit),y:c.tgt.y+(c.pos.y-c.tgt.y)*(1-.025*hit),z:c.tgt.z+(c.pos.z-c.tgt.z)*(1-.025*hit)};
  c.offsetX=(c.offsetX??0)+dx;c.offsetY=(c.offsetY??0)+dy;return c;
}
export function rigAt(t:number,a:AudioData,T:CTimes) {const r=new Rig();setCamera(r,cameraAt(t,a,T));return r;}
export function cursorAt(t:number,a:AudioData,T:CTimes) {const p=penAt(t,a,T),q=rigAt(t,a,T).proj(p.x,p.y,p.z)!;return {x:q.x,y:q.y};}
export function entryPrim(t:number,a:AudioData,T:CTimes):Prim {const r=rigAt(t,a,T),[A,B]=rowLine(0),P=r.proj(A.x,A.y,A.z)!,Q=r.proj(B.x,B.y,B.z)!;return {kind:'line',x0:P.x,y0:P.y,x1:Q.x,y1:Q.y,w:3};}
export function exitPrim(t:number,a:AudioData,T:CTimes):Prim {return {kind:'point',...cursorAt(t,a,T),r:6};}
export function exitVelocity(t:number,a:AudioData,T:CTimes) {
  const h=1e-4,P=cursorAt(t-h,a,T),Q=cursorAt(t+h,a,T);
  return {x:(Q.x-P.x)/(2*h),y:(Q.y-P.y)/(2*h),roll:(cameraAt(t+h,a,T).roll-cameraAt(t-h,a,T).roll)/(2*h)};
}
export function checkBounds(t:number,a:AudioData,T:CTimes){return projectedBounds(rigAt(t,a,T),checkCorners(),true);}

type P2={x:number;z:number};
/** CPU triangle silhouettes use the same shipped outlines and extrusion as SolidText. */
let checkTriangles:P3[][]|undefined,checkFootprint:P2[][]|undefined;
function checkMesh(){
  if(checkTriangles)return {triangles:checkTriangles,footprint:checkFootprint!};
  const run=varRun('CHECK',100,{wdth:100,wght:900}),scale=4.2/run.capH,width=run.width*scale;
  checkTriangles=[];checkFootprint=[];
  for(const g of run.glyphs){const pos=solidLetterGeometry(g.ch,{wdth:100,wght:900},4.2,.25,0).getAttribute('position');
    for(let i=0;i<pos.count;i+=3){const tri=[0,1,2].map(j=>({x:-width/2+g.x*scale+pos.getX(i+j),y:.012+pos.getZ(i+j),z:-2.6-pos.getY(i+j)}));
      checkTriangles.push(tri);if(tri.every(p=>Math.abs(p.y-.262)<1e-6))checkFootprint.push(tri.map(p=>({x:p.x,z:p.z})));}
  }return {triangles:checkTriangles,footprint:checkFootprint};
}
function clipPaper(poly:P2[]):P2[]{
  for(const [axis,bound,sign] of [['x',-PAPER_W/2,1],['x',PAPER_W/2,-1],['z',-PAPER_D/2,1],['z',PAPER_D/2,-1]] as const){
    const out:P2[]=[];for(let i=0;i<poly.length;i++){const A=poly[i]!,B=poly[(i+1)%poly.length]!,da=sign*(A[axis]-bound),db=sign*(B[axis]-bound);
      if(da>=0)out.push(A);if((da>=0)!==(db>=0)){const u=da/(da-db);out.push({x:lerp(A.x,B.x,u),z:lerp(A.z,B.z,u)});}}
    poly=out;if(!poly.length)break;
  }return poly;
}
export function checkShadowPolygons(t:number,T:CTimes){const {dir:L}=checkLight(t,T),mesh=checkMesh();
  return {shadow:mesh.triangles.map(tri=>clipPaper(tri.map(p=>({x:p.x-p.y*L.x/L.y,z:p.z-p.y*L.z/L.y})))).filter(p=>p.length>=3),
    footprint:mesh.footprint.map(clipPaper).filter(p=>p.length>=3)};
}
function intervals(polys:P2[][],z:number):[number,number][]{
  const ranges:[number,number][]=[];for(const poly of polys){const xs:number[]=[];for(let i=0;i<poly.length;i++){const A=poly[i]!,B=poly[(i+1)%poly.length]!;
    if((A.z<=z&&z<B.z)||(B.z<=z&&z<A.z))xs.push(A.x+(B.x-A.x)*(z-A.z)/(B.z-A.z));}
    xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)ranges.push([xs[i]!,xs[i+1]!]);}
  ranges.sort((a,b)=>a[0]-b[0]);const union:[number,number][]=[];for(const range of ranges){const last=union.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else union.push([...range]);}return union;
}
export function paperSamples(t:number,T:CTimes){const polys=checkShadowPolygons(t,T),lit:P3[]=[],shadow:P3[]=[];
  for(let z=-PAPER_D/2+.1;z<PAPER_D/2-.1;z+=.2){const S=intervals(polys.shadow,z),F=intervals(polys.footprint,z);
    for(let x=-PAPER_W/2+.1;x<PAPER_W/2-.1;x+=.2){if(F.some(([a,b])=>x>=a&&x<=b))continue;
      const set=S.some(([a,b])=>x>=a&&x<=b)?shadow:lit;if(set.length<5)set.push({x,y:0,z});if(lit.length===5&&shadow.length===5)return {lit,shadow};}}
  return {lit,shadow};
}
export function paperToneAt(p:P3,t:number,T:CTimes){const {shadow}=checkShadowPolygons(t,T),blocked=intervals(shadow,p.z).some(([a,b])=>p.x>=a&&p.x<=b);return surfaceTone({x:0,y:1,z:0},t,T,blocked?0:1);}
/** Area on the paper, excluding the CHECK solid's own footprint; 0.01-unit scanline quadrature. */
export function checkShadowArea(t:number,T:CTimes,step=.01){const {shadow,footprint}=checkShadowPolygons(t,T);let area=0;
  for(let z=-PAPER_D/2+step/2;z<PAPER_D/2;z+=step){const S=intervals(shadow,z),F=intervals(footprint,z);let width=S.reduce((sum,[a,b])=>sum+b-a,0);
    for(const [a,b] of S)for(const [c,d] of F)width-=Math.max(0,Math.min(b,d)-Math.max(a,c));area+=Math.max(0,width)*step;}
  return area;
}
