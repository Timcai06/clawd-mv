// V6 G6: y-up mathematical world; GPU displacement and CPU queries share these constants.
import * as THREE from 'three';
import { clamp, ease, lerp, springStep } from '../../engine/util';
import { Rig, mixCam, orbitCam, p3, lerp3, type P3, type Cam } from '../../kit/rig';
import { HANDOFF, exitEnvelope, type Rect, type Prim } from '../../kit/handoff';
import { layoutPath, path3 } from '../../kit/pathtext';
import { SolidText } from '../../kit/solidtype';
import type { Voice } from '../../kit/lyric-moves';
import type { CarrySpec } from '../../kit/carry';
import { span } from '../../kit/time';
import type { GreenTimes } from './s16-green-state';

export const D = { w: 0.7, h: 2.1, d: 0.22 } as const;
export const RADIUS = 14, ARC = 0.62, MAX_TILT = Math.PI / 2 - 0.08;
export const FALL_SECONDS = 0.24;
/** Off-axis framing keeps the physical sightline aimed at the moving face centre. */
export interface GreenCamera extends Cam { shift?: { x:number; y:number } }
export class GreenRig extends Rig {
  override set(c:GreenCamera) {
    super.set(c);
    if(c.shift){
      this.cam.projectionMatrix.elements[8]!-=2*c.shift.x/1920;
      this.cam.projectionMatrix.elements[9]!+=2*c.shift.y/1080;
      this.cam.projectionMatrixInverse.copy(this.cam.projectionMatrix).invert();
      this.vp.multiplyMatrices(this.cam.projectionMatrix,this.cam.matrixWorldInverse);
    }
  }
}
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
  if(i===18)t=Math.min(t,T.end-0.1);
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
  const rig=new GreenRig(); rig.set(cam); const ps=points.map(p=>rig.proj(p.x,p.y,p.z)).filter(p=>p!==null);
  return ps.length ? bounds(ps) : { x:0,y:0,w:0,h:0 };
}
function vector(a: P3,b: P3): THREE.Vector3 { return new THREE.Vector3(a.x-b.x,a.y-b.y,a.z-b.z); }
function value(v: THREE.Vector3): P3 { return p3(v.x,v.y,v.z); }
// Fit a real perspective camera to a planar face. Four numerical variables, four bbox constraints;
// no screen-space deformation of the domino is used for either handoff.
export function fitFaceCamera(points: P3[], rect: Rect, back = false, readable = false): Cam {
  const center=new THREE.Vector3(); points.forEach(p=>center.add(new THREE.Vector3(p.x,p.y,p.z))); center.multiplyScalar(0.25);
  const X=vector(points[1]!,points[0]!).normalize(), Y=vector(points[3]!,points[0]!).normalize();
  const U=readable?Y:X,V=readable?X:Y;
  const N=new THREE.Vector3().crossVectors(X,Y).normalize().multiplyScalar(back?-1:1);
  const make=(v:number[]):Cam=>{
    const dir=N.clone().multiplyScalar(Math.cos(v[3]!)).addScaledVector(readable?U:V,Math.sin(v[3]!)).normalize();
    const up=new THREE.Vector3().crossVectors(dir,U).normalize();
    const eye=center.clone().addScaledVector(dir,v[0]!).addScaledVector(U.clone().addScaledVector(dir,-U.dot(dir)).normalize(),v[1]!).addScaledVector(up,v[2]!);
    const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize();
    const baseUp=new THREE.Vector3().crossVectors(dir,right).normalize();
    return {pos:value(eye),tgt:value(eye.clone().sub(dir)),roll:Math.atan2(U.dot(baseUp),U.dot(right))+(v[4]??0),fov:34};
  };
  const target=[rect.x+rect.w/2,rect.y+rect.h/2,rect.w,rect.h,...(readable?[0]:[])];
  let v=[540/Math.tan(17*Math.PI/180)*(readable?D.h:D.w)/rect.w,0,0,readable?-1.35:back?0.8:0,...(readable?[0]:[])];
  const measure=(a:number[])=>{const cam=make(a),b=projectBounds(cam,points);const result=[b.x+b.w/2,b.y+b.h/2,b.w,b.h];
    if(readable){const rig=new Rig();rig.set(cam);const at=(s:number)=>{const p=new THREE.Vector3(points[0]!.x,points[0]!.y,points[0]!.z).addScaledVector(X,D.w*.05).addScaledVector(Y,D.h*s);return rig.proj(p.x,p.y,p.z)!;};const l=at(.05),r=at(.95);result.push(l&&r?Math.atan2(r.y-l.y,r.x-l.x)*100:1e6);}return result;};
  // Opening face is parallel: its physical aspect exactly matches the prescribed rectangle.
  if (!back) {
    const scale=rect.w/D.w; v[1]=-(target[0]!-960)/scale; v[2]=(target[1]!-540)/scale; return make(v);
  }
  for(let it=0;it<80;it++) {
    const m=measure(v), r=m.map((n,i)=>target[i]!-n); if(Math.max(...r.map(Math.abs))<1e-7)break;
    const size=v.length,A=r.map((n)=>[...Array(size).fill(0),n]);
    for(let j=0;j<size;j++){const h=j===3?1e-5:1e-4,q=[...v];q[j]+=h;const b=measure(q);for(let i=0;i<size;i++)A[i]![j]=(b[i]!-m[i]!)/h;}
    for(let j=0;j<size;j++) {const pivot=A[j]![j]!; if(Math.abs(pivot)<1e-9)continue;for(let k=j;k<=size;k++)A[j]![k]/=pivot;for(let i=0;i<size;i++)if(i!==j){const k=A[i]![j]!;for(let c=j;c<=size;c++)A[i]![c]-=k*A[j]![c]!;}}
    const step=A.map(a=>a[size]!); let best=v,err=r.reduce((s,n)=>s+n*n,0);
    for(const alpha of [1,0.5,0.25,0.1,0.03]){const q=v.map((n,j)=>n+alpha*step[j]!);q[0]=Math.max(0.8,q[0]!);q[3]=clamp(q[3]!,readable?-1.56:0.02,1.56);const e=measure(q).reduce((s,n,i)=>s+(n-target[i]!)**2,0);if(e<err){best=q;err=e;}}
    if(best===v)break;v=best;
  }
  return make(v);
}
const cameras=new WeakMap<GreenTimes,{entry:Cam;exit:GreenCamera}>();
function cutCameras(T:GreenTimes){let c=cameras.get(T);if(!c){c={entry:fitFaceCamera(faceCorners(0,T.start,T,false),HANDOFF.domino15),exit:closingCamera(T.end-0.1,T)};cameras.set(T,c);}return c;}

export const END_ROLL=Math.atan((HANDOFF.domino16.w/HANDOFF.domino16.h*D.h-D.w)/(D.h-HANDOFF.domino16.w/HANDOFF.domino16.h*D.w));
export function faceCenter(i:number,t:number,T:GreenTimes):P3 {
  return dominoPoint(i,p3(0,D.h/2,-D.d/2),tiltAt(i,t,T));
}
/** The label's baseline spans 90% of the narrow face; its basis is fixed to the print. */
export function nineteenFrame(){
  const c=Math.cos(END_ROLL),s=Math.sin(END_ROLL);
  return {origin:p3(0,D.h/2,-D.d/2-.003),u:p3(-c,s,0),v:p3(s,c,0),width:D.w*.9};
}
export function closingCamera(t:number,T:GreenTimes):GreenCamera {
  t=Math.min(t,T.end-0.1);
  const k=ease.inOutCubic(span(t,T.nineteen.start,T.end-0.1)),target=faceCenter(18,t,T);
  const theta=tiltAt(18,t,T),pitch=Math.max(1.2,theta),f=tangentAt(18);
  const dir=new THREE.Vector3(-f.x*Math.cos(pitch),Math.sin(pitch),-f.z*Math.cos(pitch));
  const X=vector(dominoPoint(18,p3(-1,0,0),theta),dominoPoint(18,p3(0,0,0),theta)).normalize();
  const right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),dir).normalize();
  const up=new THREE.Vector3().crossVectors(dir,right).normalize();
  const fov=34,finalDistance=540/Math.tan(fov*Math.PI/360)*(D.h*Math.cos(END_ROLL)+D.w*Math.sin(END_ROLL))/HANDOFF.domino16.h;
  const distance=lerp(24,finalDistance,k),pos=new THREE.Vector3(target.x,target.y,target.z).addScaledVector(dir,distance);
  return {pos:value(pos),tgt:target,fov,roll:Math.atan2(X.dot(up),X.dot(right))+END_ROLL,
    shift:{x:k*(HANDOFF.domino16.x+HANDOFF.domino16.w/2-960),y:k*(HANDOFF.domino16.y+HANDOFF.domino16.h/2-540)}};
}

/** Finite CPU ray / oriented box slab intersection, using the same pose as GPU vertices. */
export function dominoRayHit(i:number,origin:P3,direction:P3,t:number,T:GreenTimes,maxDistance=Infinity):number|null {
  const theta=tiltAt(i,t,T),pivot=dominoPoint(i,p3(),theta),delta=vector(origin,pivot),ray=new THREE.Vector3(direction.x,direction.y,direction.z).normalize();
  const axes=[p3(1,0,0),p3(0,1,0),p3(0,0,1)].map(q=>vector(dominoPoint(i,q,theta),pivot));
  let near=0,far=maxDistance;
  for(let j=0;j<3;j++){
    const o=delta.dot(axes[j]!),d=ray.dot(axes[j]!),lo=[-D.w/2,0,-D.d/2][j]!,hi=[D.w/2,D.h,D.d/2][j]!;
    if(Math.abs(d)<1e-10){if(o<lo||o>hi)return null;continue;}
    const a=(lo-o)/d,b=(hi-o)/d;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));
    if(far<near)return null;
  }
  return near;
}
export function waveIndex(t:number,T:GreenTimes):number {
  let i=0;while(i<18 && t>=T.triggers[i+1]!)i++;
  return i<18 ? i+span(t,T.triggers[i]!,T.triggers[i+1]!) : 18;
}
export function cameraAt(t:number,T:GreenTimes):GreenCamera {
  const cut=cutCameras(T);if(t<=T.start)return structuredClone(cut.entry);
  if(exitEnvelope(t,T.end).still)return structuredClone(cut.exit);
  const i=waveIndex(t,T),a=arcAt(Math.floor(i)),b=arcAt(Math.min(18,Math.floor(i)+1));
  const tgt=lerp3(a,b,Math.min(1,i%1+0.3));tgt.y=0.8;
  const following=orbitCam(tgt,0,0.18,9,46);
  if(t<T.triggers[0]!)return structuredClone(cut.entry);
  if(t<T.triggers[0]!+0.12)return mixCam(cut.entry,following,ease.inOutCubic(span(t,T.triggers[0]!,T.triggers[0]!+0.12)));
  const monumentStart=T.greens[0]!.start;
  if(t<monumentStart)return following;
  const wide=monumentCamera(t,T);
  if(t<T.nineteen.start)return wide;
  return closingCamera(t,T);
}
const monumentCameras=new WeakMap<GreenTimes,{t:number;cam:Cam}[]>();
const CAMERA_STEP=1/120;
function solveMonumentCamera(t:number,T:GreenTimes):Cam {
  const k=ease.inQuad(span(t,T.launches[0]!.start,T.nineteen.start));
  const a=[0.14844887,42.40493573,14.01384572,-0.12123699,2.42605736,-5.783558,0.08];
  const b=[-0.30873119,47.98271512,22.24598352,5.26514752,-3.45091503,-15.97421,-0.06592746];
  const base=a.map((n,i)=>lerp(n,b[i]!,k)),pitch=lerp(.18,.5,k);
  const letters=greenLetterPoints(t,T),arc: P3[]=[];const standing:P3[][]=[];
  for(let i=0;i<19;i++){for(const z of [-D.d/2,D.d/2])for(const x of [-D.w/2,D.w/2])for(const y of [0,D.h])arc.push(dominoPoint(i,p3(x,y,z),tiltAt(i,t,T)));if(t<T.triggers[i]!)standing.push(faceCorners(i,t,T,false));}
  const make=(q:number[])=>orbitCam(p3(q[3],q[4],q[5]),q[0]!,pitch,q[1]!,q[2]!,q[6]!);
  const score=(q:number[])=>{
    const cam=make(q),rig=new Rig();rig.set(cam);let cost=0;const penalty=(n:number,weight=1)=>cost+=weight*Math.max(0,n)**2;
    const top=Math.min(...standing.map(ps=>projectBounds(cam,ps).y));
    for(const ps of letters){const b=projectBounds(cam,ps);
      const x=(Math.min(...ps.map(p=>p.x))+Math.max(...ps.map(p=>p.x)))/2,z=(Math.min(...ps.map(p=>p.z))+Math.max(...ps.map(p=>p.z)))/2;
      const i=T.greens.findLastIndex(w=>t>=w.start),drop=1.5*(1-ease.inQuad(clamp((t-T.greens[i]!.start)/.12)));
      const base=rig.proj(x,drop,z),head=rig.proj(x,drop+3.2,z);const cap=base&&head?Math.hypot(head.x-base.x,head.y-base.y):0;penalty(226-cap,200);penalty(cap-374,200);penalty(46-b.y,200);penalty(b.y+b.h+6-top,200);penalty(226-b.h,200);penalty(b.h-374,200);penalty((Math.max(0,-b.x)+Math.max(0,b.x+b.w-1920))/Math.max(1,b.w)*100-28,200);}
    const box=projectBounds(cam,arc);penalty(6-box.x);penalty(box.x+box.w-1914);penalty(6-box.y);penalty(box.y+box.h-1074);
    if(t>=T.launches[0]!.start)penalty((.305-box.w*box.h/1920/1080)*1000);
    penalty(.1-cam.pos.y);return cost;
  };
  let best=base,bestCost=Infinity;
  for(const seed of [base,[...base.slice(0,6),-.1],b,a]){
    let q=[...seed],cost=score(q),steps=[.08,6,2,1,1,2,.04];
    for(let it=0;it<60;it++){
      let improved=false;for(let j=0;j<7;j++)for(const sign of [-1,1]){const next=[...q];next[j]+=sign*steps[j]!;next[1]=Math.max(6,next[1]!);next[2]=clamp(next[2]!,2,60);const c=score(next);if(c<cost){q=next;cost=c;improved=true;}}
      if(cost<1e-8)break;if(!improved)steps=steps.map(n=>n*.7);
    }
    if(cost<bestCost){best=q;bestCost=cost;}if(bestCost<1e-8)break;
  }return make(best);
}
/** Build a seek-independent camera table from world/word clocks, then interpolate at sub-frame times. */
export function monumentCamera(t:number,T:GreenTimes):Cam {
  let table=monumentCameras.get(T);const start=T.greens[0]!.start;
  if(!table){const times=[...Array.from({length:Math.ceil((T.nineteen.start-start)/CAMERA_STEP)+1},(_,i)=>Math.min(T.nineteen.start,start+i*CAMERA_STEP)),...T.greens.slice(0,5).flatMap(w=>[w.start,w.start+.12])];
    table=[...new Set(times)].sort((a,b)=>a-b).map(t=>({t,cam:solveMonumentCamera(t,T)}));monumentCameras.set(T,table);}
  const at=clamp(t,start,T.nineteen.start);let lo=0,hi=table.length-1;while(hi-lo>1){const m=(lo+hi)>>1;if(table[m]!.t<=at)lo=m;else hi=m;}
  const a=table[lo]!,b=table[hi]!;
  // A slam changes the solid width and its drop at the exact word clock. Do not anticipate
  // the new camera with the preceding, already-grounded inscription.
  const stage=(time:number)=>T.greens.findLastIndex(w=>time>=w.start);
  if(at<b.t&&stage(a.t)!==stage(b.t))return structuredClone(a.cam);
  return mixCam(a.cam,b.cam,span(at,a.t,b.t));
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
export function cursorAt(t:number,T:GreenTimes){const p=cursorWorldAt(t,T),r=new GreenRig();r.set(cameraAt(t,T));return r.proj(p.x,p.y,p.z);}

export const AMBIENT_TONE=0.20, FLOOR_TONE=0.88;
export const LIGHT_INTENSITY=Math.PI*(FLOOR_TONE-AMBIENT_TONE)/Math.max(0.15,KEY_LIGHT.y);
/** Lambert irradiance / pi, followed by the same upper exposure bound used in the shader. */
export function lightTone(normal:P3,visibility=1):number {
  return Math.min(0.90,AMBIENT_TONE+LIGHT_INTENSITY/Math.PI*Math.max(0,normal.x*KEY_LIGHT.x+normal.y*KEY_LIGHT.y+normal.z*KEY_LIGHT.z)*visibility);
}
export function faceNormal(i:number,t:number,T:GreenTimes,back=true):P3 {
  const p=dominoPoint(i,p3(0,0,0),tiltAt(i,t,T)),q=dominoPoint(i,p3(0,0,back?-1:1),tiltAt(i,t,T));return p3(q.x-p.x,q.y-p.y,q.z-p.z);
}
export function groundShadowAt(p:P3,t:number,T:GreenTimes):boolean {
  const ray=new THREE.Vector3(KEY_LIGHT.x,KEY_LIGHT.y,KEY_LIGHT.z);
  for(let i=0;i<19;i++){
    const theta=tiltAt(i,t,T),pivot=dominoPoint(i,p3(0,0,0),theta);
    const x=vector(dominoPoint(i,p3(1,0,0),theta),pivot),y=vector(dominoPoint(i,p3(0,1,0),theta),pivot),z=vector(dominoPoint(i,p3(0,0,1),theta),pivot);
    const origin=vector(p,pivot),o=[origin.dot(x),origin.dot(y),origin.dot(z)],d=[ray.dot(x),ray.dot(y),ray.dot(z)];
    let near=1e-5,far=Infinity;for(let j=0;j<3;j++){const lo=[-D.w/2,0,-D.d/2][j]!,hi=[D.w/2,D.h,D.d/2][j]!;
      if(Math.abs(d[j]!)<1e-9){if(o[j]!<lo||o[j]!>hi){far=-1;break;}}else{const a=(lo-o[j]!)/d[j]!,b=(hi-o[j]!)/d[j]!;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));}}
    if(far>=near)return true;
  }return false;
}
export function floorToneAt(p:P3,t:number,T:GreenTimes):number{return lightTone(p3(0,1,0),groundShadowAt(p,t,T)?0:1);}
export function checkScaleAt(t:number,T:GreenTimes):number {if(t<T.greens[5]!.start)return 1;return 1.3-0.3*ease.outBack(clamp((t-T.greens[5]!.start)/0.12));}
export function shakeAt(t:number,T:GreenTimes):number {
  if(exitEnvelope(t,T.end).still)return 0;
  const i=T.greens.findLastIndex(w=>t>=w.start);if(i<0)return 0;
  const age=t-T.greens[i]!.start-(i===5?0:0.12);
  return age<0?0:6*Math.exp(-age/0.06)*Math.cos(age*100);
}
const greenGeometry=new Map<number,SolidText>();
export function greenSolid(wdth:number):SolidText {
  let text=greenGeometry.get(wdth);if(!text){text=new SolidText('GREEN',{capH:3.2,depth:0.6,axes:{wdth,wght:900},material:new THREE.MeshBasicMaterial()});text.group.position.set(-text.width/2,0,-19);greenGeometry.set(wdth,text);}return text;
}
export function greenLetterPoints(t:number,T:GreenTimes):P3[][] {
  const i=Math.min(4,T.greens.findLastIndex(w=>t>=w.start));if(i<0)return [];
  const text=greenSolid([62,87.5,112.5,75,125][i]!);const drop=1.5*(1-ease.inQuad(clamp((t-T.greens[i]!.start)/0.12)));
  return text.letters.map((_,j)=>text.letterCorners(j).map(p=>p3(p.x,p.y+drop,p.z)));
}
export function groundLyrics(T:GreenTimes,voice:Voice){
  // Independent baseline paths prevent the two conjunctions sharing one consecutive run.
  return [[T.count[1]!,T.count[2]!],[T.count[3]!],[T.count[5]!]].map((words,j)=>{
    const layout=layoutPath(words,{capH:0.7,axes:w=>voice.form(w,w.end).axes,upper:true});
    const center=j===0?0.5:j===1?1:2,points=[];
    for(let i=0;i<=64;i++){const at=arcAt(center+(i/64-0.5)*layout.s1/(RADIUS*2*ARC/18));const a=-ARC+(center+(i/64-0.5)*layout.s1/(RADIUS*2*ARC/18))/18*2*ARC;
      points.push(p3(at.x+Math.sin(a)*0.6,0,at.z+Math.cos(a)*0.6));}
    return {layout,path:path3(points),center,offset:0.6};
  });
}
export interface FreeBody {solid:SolidText;right:number;points:P3[];angle:number;contact:P3;pivot:P3;}
export function freeBody(spec:CarrySpec,T:GreenTimes):FreeBody {
  const material=new THREE.MeshBasicMaterial(),solid=new SolidText('free',{capH:0.9,depth:0.05,bevel:0,axes:spec.axes,material});material.dispose();
  const pts: P3[]=[];for(const g of solid.letters){const pos=g.mesh.geometry.attributes.position!;for(let k=0;k<pos.count;k++)pts.push(p3(pos.getX(k)+g.x,pos.getY(k),pos.getZ(k)));}
  const right=Math.max(...pts.map(p=>p.x));const points=pts.map(p=>p3(p.x-right,p.y,p.z));
  // Actual outline vertices, not the advance box, determine first side contact.
  let lo=0,hi=Math.PI/2;for(let j=0;j<50;j++){const m=(lo+hi)/2;if(Math.max(...points.map(p=>p.x*Math.cos(m)+p.y*Math.sin(m)))<0.1)lo=m;else hi=m;}
  const angle=(lo+hi)/2,top=points.reduce((a,b)=>a.x*Math.cos(angle)+a.y*Math.sin(angle)>b.x*Math.cos(angle)+b.y*Math.sin(angle)?a:b);
  const pivot=p3(-D.w/2-0.1,0,D.d/2-solid.letters[0]!.mesh.geometry.boundingBox!.max.z);
  const contact=dominoPoint(0,p3(pivot.x+top.x*Math.cos(angle)+top.y*Math.sin(angle),-top.x*Math.sin(angle)+top.y*Math.cos(angle),pivot.z+top.z),0);
  return {solid,right,points,angle,contact,pivot};
}
export function freeTiltAt(t:number,T:GreenTimes,angle:number):number {
  if(t<=T.triggers[0]!)return angle*ease.inQuad(clamp((t-(T.triggers[0]!-0.24))/0.24));
  return lerp(angle,Math.PI/2,ease.inQuad(clamp((t-T.triggers[0]!)/0.24)));
}
