// V6 G6: y-up mathematical world; GPU displacement and CPU queries share these constants.
import * as THREE from 'three';
import { clamp, ease, lerp, springStep } from '../../engine/util';
import { Rig, mixCam, orbitCam, p3, lerp3, type P3, type Cam } from '../../kit/rig';
import { HANDOFF, exitEnvelope, type Rect, type Prim } from '../../kit/handoff';
import { span } from '../../kit/time';
import type { GreenTimes } from './s16-green-state';

export const D = { w: 0.7, h: 2.1, d: 0.22 } as const;
export const RADIUS = 14, ARC = 0.62, MAX_TILT = Math.PI / 2 - 0.08;
export const FALL_SECONDS = 0.24;
export const KEY_LIGHT = p3(-Math.cos(22*Math.PI/180)/Math.sqrt(2), Math.sin(22*Math.PI/180), -Math.cos(22*Math.PI/180)/Math.sqrt(2));
export function arcAt(i: number): P3 {
  const a = lerp(-ARC, ARC, i / 18);
  return p3(RADIUS*Math.sin(a), 0, -RADIUS+RADIUS*Math.cos(a));
}
export function yawAt(i: number): number { return lerp(-ARC, ARC, i / 18)+Math.PI/2; }
export function tangentAt(i: number): P3 {
  const a = lerp(-ARC, ARC, i / 18); return p3(Math.cos(a),0,-Math.sin(a));
}
// First contact: the advancing top-front corner reaches the next board's near plane.
// The next board is rotated by the arc increment, so its near plane is evaluated exactly.
export function hitAngle(i: number): number {
  const A = arcAt(i), B = arcAt(i+1), f = tangentAt(i), n = tangentAt(i+1);
  const gap = (B.x-A.x)*n.x+(B.z-A.z)*n.z-D.d/2;
  const pivot = D.d/2*(f.x*n.x+f.z*n.z);
  return Math.asin(clamp((gap-pivot)/(D.h*(f.x*n.x+f.z*n.z)),-1,1));
}
export function hitDelay(i: number): number { return FALL_SECONDS*Math.sqrt(hitAngle(i)/MAX_TILT); }
export function tiltAt(i: number, t: number, T: GreenTimes): number {
  const age = t-T.triggers[i]!, duration = i === 18 ? 0.6 : FALL_SECONDS;
  if (age <= 0) return 0;
  if (age <= duration) return MAX_TILT*ease.inQuad(age/duration);
  // A small, analytic, seek-safe rebound around the resting angle.
  return MAX_TILT+0.012*(springStep(age-duration,6,0.55)-1)*Math.min(1,(age-duration)/0.03);
}
export function dominoPoint(i: number, q: P3, theta: number): P3 {
  const b = arcAt(i), yaw = yawAt(i), c = Math.cos(theta), s = Math.sin(theta);
  const Y = c*q.y-s*(q.z-D.d/2), Z = s*q.y+c*(q.z-D.d/2)+D.d/2;
  return p3(b.x+Math.cos(yaw)*q.x+Math.sin(yaw)*Z,Y,b.z-Math.sin(yaw)*q.x+Math.cos(yaw)*Z);
}
export const S16_GLSL = /* glsl */ `
const float D_W = 0.7, D_H = 2.1, D_D = 0.22;
vec3 arcAt(float i) { float a=mix(-0.62,0.62,i/18.0); return vec3(14.0*sin(a),0.0,-14.0+14.0*cos(a)); }
float yawAt(float i) { return mix(-0.62,0.62,i/18.0)+1.5707963267948966; }
vec3 dominoPoint(float i, vec3 q, float theta) {
  vec3 b=arcAt(i); float yaw=yawAt(i), c=cos(theta), s=sin(theta);
  float Y=c*q.y-s*(q.z-D_D/2.0), Z=s*q.y+c*(q.z-D_D/2.0)+D_D/2.0;
  return b+vec3(cos(yaw)*q.x+sin(yaw)*Z,Y,-sin(yaw)*q.x+cos(yaw)*Z);
}`;
export function faceCorners(i: number, t: number, T: GreenTimes, back = true): P3[] {
  const z = (back ? -1 : 1)*D.d/2;
  return [[-D.w/2,0],[D.w/2,0],[D.w/2,D.h],[-D.w/2,D.h]].map(([x,y])=>dominoPoint(i,p3(x!,y!,z),tiltAt(i,t,T)));
}
export function bounds(points: readonly { x: number; y: number }[]): Rect {
  const x=Math.min(...points.map(p=>p.x)), y=Math.min(...points.map(p=>p.y));
  return { x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y };
}
export function projectBounds(cam: Cam, points: P3[]): Rect {
  const rig=new Rig(); rig.set(cam); const ps=points.map(p=>rig.proj(p.x,p.y,p.z)).filter(p=>p!==null);
  return ps.length ? bounds(ps) : { x:0,y:0,w:0,h:0 };
}
function vector(a: P3,b: P3): THREE.Vector3 { return new THREE.Vector3(a.x-b.x,a.y-b.y,a.z-b.z); }
function value(v: THREE.Vector3): P3 { return p3(v.x,v.y,v.z); }
// Fit a real perspective camera to a planar face. Four numerical variables, four bbox constraints;
// no screen-space deformation of the domino is used for either handoff.
export function fitFaceCamera(points: P3[], rect: Rect, back = false): Cam {
  const center=new THREE.Vector3(); points.forEach(p=>center.add(new THREE.Vector3(p.x,p.y,p.z))); center.multiplyScalar(0.25);
  const U=vector(points[1]!,points[0]!).normalize(), V=vector(points[3]!,points[0]!).normalize();
  const N=new THREE.Vector3().crossVectors(U,V).normalize().multiplyScalar(back?-1:1);
  const make=(v:number[]):Cam=>{
    const dir=N.clone().multiplyScalar(Math.cos(v[3]!)).addScaledVector(V,Math.sin(v[3]!)).normalize();
    const up=new THREE.Vector3().crossVectors(dir,U).normalize();
    const eye=center.clone().addScaledVector(dir,v[0]!).addScaledVector(U,v[1]!).addScaledVector(up,v[2]!);
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize();
    const baseUp=new THREE.Vector3().crossVectors(dir,right).normalize();
    return {pos:value(eye),tgt:value(eye.clone().sub(dir)),roll:Math.atan2(U.dot(baseUp),U.dot(right)),fov:34};
  };
  const target=[rect.x+rect.w/2,rect.y+rect.h/2,rect.w,rect.h];
  let v=[540/Math.tan(17*Math.PI/180)*D.w/rect.w,0,0,back?0.8:0];
  const measure=(a:number[])=>{const b=projectBounds(make(a),points);return [b.x+b.w/2,b.y+b.h/2,b.w,b.h];};
  // Opening face is parallel: its physical aspect exactly matches the prescribed rectangle.
  if (!back) {
    const scale=rect.w/D.w; v[1]=-(target[0]!-960)/scale; v[2]=(target[1]!-540)/scale; return make(v);
  }
  for(let it=0;it<32;it++) {
    const m=measure(v), r=m.map((n,i)=>target[i]!-n); if(Math.max(...r.map(Math.abs))<1e-7)break;
    const A=r.map((n)=>[0,0,0,0,n]);
    for(let j=0;j<4;j++){const h=j===3?1e-5:1e-4,q=[...v];q[j]+=h;const b=measure(q);for(let i=0;i<4;i++)A[i]![j]=(b[i]!-m[i]!)/h;}
    for(let j=0;j<4;j++) {const pivot=A[j]![j]!; if(Math.abs(pivot)<1e-9)continue;for(let k=j;k<5;k++)A[j]![k]/=pivot;for(let i=0;i<4;i++)if(i!==j){const k=A[i]![j]!;for(let c=j;c<5;c++)A[i]![c]-=k*A[j]![c]!;}}
    const step=A.map(a=>a[4]!); let best=v,err=r.reduce((s,n)=>s+n*n,0);
    for(const alpha of [1,0.5,0.25,0.1,0.03]){const q=v.map((n,j)=>n+alpha*step[j]!);q[0]=Math.max(0.8,q[0]!);q[3]=clamp(q[3]!,0.02,1.4);const e=measure(q).reduce((s,n,i)=>s+(n-target[i]!)**2,0);if(e<err){best=q;err=e;}}
    if(best===v)break;v=best;
  }
  return make(v);
}
const cameras=new WeakMap<GreenTimes,{entry:Cam;exit:Cam}>();
function cutCameras(T:GreenTimes){let c=cameras.get(T);if(!c){c={entry:fitFaceCamera(faceCorners(0,T.start,T,false),HANDOFF.domino15),exit:fitFaceCamera(faceCorners(18,T.end-0.1,T),HANDOFF.domino16,true)};cameras.set(T,c);}return c;}
export function waveIndex(t:number,T:GreenTimes):number {
  let i=0;while(i<18 && t>=T.triggers[i+1]!)i++;
  return i<18 ? i+span(t,T.triggers[i]!,T.triggers[i+1]!) : 18;
}
export function cameraAt(t:number,T:GreenTimes):Cam {
  const cut=cutCameras(T);if(t<=T.start)return structuredClone(cut.entry);
  if(exitEnvelope(t,T.end).still)return structuredClone(cut.exit);
  const i=waveIndex(t,T),a=arcAt(Math.floor(i)),b=arcAt(Math.min(18,Math.floor(i)+1));
  const tgt=lerp3(a,b,Math.min(1,i%1+0.3));tgt.y=0.8;
  const following=orbitCam(tgt,0,0.18,9,46);
  if(t<T.start+0.1)return structuredClone(cut.entry);
  if(t<T.triggers[0]!)return mixCam(cut.entry,following,ease.inOutCubic(span(t,T.start+0.1,T.triggers[0]!)));
  const green=T.launches[0]!.start;
  if(t<green)return following;
  // Wide view contains the entire mathematical arc and the monument at z=-19.
  const k=ease.inQuad(span(t,green,T.nineteen.start));
  const wide=orbitCam(p3(lerp(-0.35,0.35,k),0.5,-1),0,lerp(0.18,0.5,k),11,48,-0.14*(1-k));
  if(t<T.nineteen.start)return wide;
  return mixCam(wide,cut.exit,ease.inOutCubic(span(t,T.nineteen.start,T.end-0.1)));
}
export function entryPrim(t:number,T:GreenTimes):Prim {return {kind:'rect',...projectBounds(cameraAt(t,T),faceCorners(0,t,T,false))};}
export function exitPrim(t:number,T:GreenTimes):Prim {return {kind:'rect',...projectBounds(cameraAt(t,T),faceCorners(18,t,T))};}
export function arcBounds(t:number,T:GreenTimes):Rect {
  const pts=[];for(let i=0;i<19;i++)for(const z of [-D.d/2,D.d/2])for(const x of [-D.w/2,D.w/2])for(const y of [0,D.h])pts.push(dominoPoint(i,p3(x,y,z),tiltAt(i,t,T)));
  return projectBounds(cameraAt(t,T),pts);
}
export function cursorWorldAt(t:number,T:GreenTimes):P3 {
  if(t<T.triggers[0]!){const a=arcAt(0),f=tangentAt(0);return p3(a.x-f.x*0.4,0.18,a.z-f.z*0.4);}
  const i=waveIndex(t,T),p=arcAt(Math.min(18,i+0.6));
  // Counts two and three have independent word-timed pusher strokes.
  for(const k of [1,2])if(t>=T.triggers[k]!-0.1 && t<=T.triggers[k]!){const a=arcAt(k),f=tangentAt(k),d=lerp(0.65,0.1,span(t,T.triggers[k]!-0.1,T.triggers[k]!));return p3(a.x-f.x*d,0.18,a.z-f.z*d);}
  return p3(p.x,0.18,p.z);
}
export function cursorAt(t:number,T:GreenTimes){const p=cursorWorldAt(t,T),r=new Rig();r.set(cameraAt(t,T));return r.proj(p.x,p.y,p.z);}
