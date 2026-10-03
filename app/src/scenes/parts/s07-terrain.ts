// Static keyboard layout plus a pure analytic height field. GPU deformation and
// CPU line placement use the same equation; seeking never integrates a simulation.
import { keyboardKeys } from '../../kit/keyboard';
import { KEYBOARD_ROWS } from '../../kit/content';
import * as THREE from 'three';
import type { AudioData } from '../../engine/audio';
import { ease, lerp, springStep } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { HANDOFF } from '../../kit/handoff';
import { keyboardState, type CTimes } from './s06-timing';
import { clipBox, unionBoxes } from './s05-print';
import * as Clawd from '../../kit/clawd';

export const TERRAIN_KEYS = keyboardKeys({}).map((k) => ({
  index: k.index, label: k.label, row: k.row,
  x: (k.x + k.width / 2) / 80 - 7.5,
  z: (k.y + k.height / 2) / 80 - 2.6875,
  width: k.width / 80, depth: k.height / 80,
  enter: k.label === 'Enter',
}));
export const ENTER = TERRAIN_KEYS.find((k) => k.enter)!;
export const KEY_COUNT = KEYBOARD_ROWS.reduce((sum, row) => sum + row.length, 0);

export function keyHeight(x: number, z: number, enter: boolean, beat: number, kick: number, landing: number) {
  if (enter) return 0.5 - landing * 0.22;
  return 0.48 + Math.sin(beat * Math.PI - x * 0.62 - z * 0.85) * 0.16
    + Math.sin(beat * Math.PI * 0.5 + x * 0.22) * 0.055
    + kick * 0.13 * Math.cos(x * 0.34 + z * 0.5);
}

/** Release the terrain continuously before the cursor hold; no hidden hard cut. */
export function terrainOpacity(dive: number) {
  const p = Math.max(0, Math.min(1, (dive - 0.72) / 0.26));
  return 1 - p * p * (3 - 2 * p);
}

// Repeat the real keyboard module into the distance. Only the nearest Enter is
// active; far caps are not additional UI buttons or annotation fields.
export const KEY_FIELD = Array.from({length:8},(_,module) => TERRAIN_KEYS.map(k => ({
  ...k,index:module*KEY_COUNT+k.index,z:k.z-module*5.8,enter:module===0&&k.enter,
}))).flat();
export const WORD_KEYS = [9,10,11,12,23,24,25,41,ENTER.index].map(i=>TERRAIN_KEYS[i]!);
export const RIDER_KEY = KEY_FIELD[4*KEY_COUNT+9]!;

function oldCameraAt(audio: AudioData,t: number,T: CTimes) {
  const s=keyboardState(audio,t,T),d=s.dive;
  // v4 motion: drops in from S06's pen dive (high, over-rolled) and lands with a spring; while the
  // keys are struck the lens dollies sideways (zero offset at the storyboard sample) and dips on
  // every typed word like a key under a claw; then the dive to Enter.
  const anchor=T.keyboard+(T.dive-T.keyboard)*0.6;
  const drop=1-ease.outBack(span(t,T.keyboard,afterBeats(audio,T.keyboard,1.1)),1.6);
  const dolly=(t-anchor)*0.22*(1-d);
  let dip=0;
  for(const w of T.claws.words) if(t>=w.start) dip+=0.09*Math.pow(0.5,(t-w.start)/0.07);
  dip*=1-d;
  const pos=new THREE.Vector3(lerp(3.66,ENTER.x,d)+dolly,lerp(3.87,1.14,d)+2.6*drop-dip,lerp(2.49,0.8,d)+1.2*drop);
  const target=new THREE.Vector3(lerp(4.89,ENTER.x,d)+dolly*0.6,lerp(0,0.5,d)-dip*0.5,lerp(-4.98,ENTER.z,d));
  const cam=new THREE.PerspectiveCamera(lerp(57.28,30,d)+6*drop,1920/1080,0.035,180);
  cam.position.copy(pos);cam.lookAt(target);cam.rotateZ(lerp(-Math.PI/12,0,d)-0.12*drop);
  cam.updateMatrixWorld();return cam;
}

export function projectPoint(p: THREE.Vector3,camera: THREE.PerspectiveCamera) {
  const q=p.clone().project(camera);return {x:(q.x+1)*960,y:(1-q.y)*540};
}

export function keyBox(k: typeof KEY_FIELD[number],camera: THREE.PerspectiveCamera,beat: number,kick: number,landing: number,top?: number) {
  const y=top ?? keyHeight(k.x,k.z,k.enter,beat,kick,landing);
  const points=[-1,1].flatMap(x=>[-1,1].flatMap(z=>[y,y-0.42].map(h=>projectPoint(new THREE.Vector3(k.x+x*k.width/2,h,k.z+z*k.depth/2),camera))));
  const x=Math.min(...points.map(p=>p.x)),yy=Math.min(...points.map(p=>p.y));
  return {x,y:yy,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-yy};
}

/** Screen centre of the riding sprite; actual GL billboard uses the same inverse ray. */
export function riderAt(audio: AudioData,t: number,T: CTimes) {
  const anchor=T.keyboard+(T.dive-T.keyboard)*0.6;
  const drift=(audio.beatAt(t)-audio.beatAt(anchor))*9;
  return {x:486+drift,y:145,px:11.5,roll:Math.PI/12};
}

export function riderBox(audio: AudioData,t: number,T: CTimes) {
  const camera=cameraAt(audio,t,T),s=riderAt(audio,t,T),g=riderGeometry(audio,t,T,camera);
  const rotation=camera.quaternion.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-s.roll));
  const cells=Clawd.pose('A5',{beat:audio.beatAt(t),beat0:audio.beatAt(T.land),p:0,travel:0}).cells;
  const points=cells.flatMap(c=>[0,1].flatMap(x=>[0,1].map(y=>projectPoint(new THREE.Vector3((c.x+x-8)*s.px*g.units,(2.5-c.y-y)*s.px*g.units,0).applyQuaternion(rotation).add(g.pos),camera))));
  const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
  return {x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y};
}

export function riderGeometry(audio: AudioData,t: number,T: CTimes,camera: THREE.PerspectiveCamera) {
  // Solve the crest once from the storyboard sample, then ride its analytic wave
  // in world space. The dive now leaves this key behind rather than dragging the
  // sprite along as a HUD element. No evaluation order or previous frame involved.
  const anchor=T.keyboard+(T.dive-T.keyboard)*0.6,reference=cameraAt(audio,anchor,T);
  const s=riderAt(audio,anchor,T),pos=atScreen(s.x,s.y,reference,25);
  const viewDepth=-pos.clone().applyMatrix4(reference.matrixWorldInverse).z;
  const units=2*viewDepth*Math.tan(reference.fov*Math.PI/360)/1080;
  const base=keyHeight(pos.x,pos.z,false,audio.beatAt(anchor),audio.hit('kick',anchor),0);
  const wave=keyHeight(pos.x,pos.z,false,audio.beatAt(t),audio.hit('kick',t),0);
  pos.y+=wave-base;
  const up=new THREE.Vector3(0,1,0).applyQuaternion(reference.quaternion);
  const support=pos.clone().addScaledVector(up,-2.5*s.px*units);
  return {pos,units,support};
}

/** Inverse camera ray, used to anchor a screen-registered plate in the 3D world. */
export function atScreen(x: number,y: number,camera: THREE.PerspectiveCamera,depth: number) {
  const p=new THREE.Vector3(x/960-1,1-y/540,0.5).unproject(camera);
  return camera.position.clone().add(p.sub(camera.position).normalize().multiplyScalar(depth));
}

import { letterTimes } from '../../kit/pathtext';
import { type Prim } from '../../kit/handoff';
export const LOOKING_KEYS=TERRAIN_KEYS.filter(k=>k.row===WORD_KEYS[7]!.row&&k.x>=WORD_KEYS[7]!.x).sort((a,b)=>a.x-b.x).slice(0,7);
export function keyEvents(T:CTimes){
  return T.claws.words.flatMap((word,i)=>i===7?letterTimes(word).map((g,j)=>({key:LOOKING_KEYS[j]!,word,letter:j,at:g.t0})): [{key:WORD_KEYS[i]!,word,letter:0,at:letterTimes(word)[0]!.t0}]);
}
export function keyPress(t:number,at:number){if(t<at)return 0;if(t<at+.06)return -.12*ease.outQuad(span(t,at,at+.06));return -.12*(1-springStep((t-at-.06)/.18));}
export const MAX_KEY_DISTANCE=Math.max(...KEY_FIELD.map(k=>Math.hypot(k.x-WORD_KEYS[0]!.x,k.z-WORD_KEYS[0]!.z)));
export function keyRise(k:typeof KEY_FIELD[number],t:number,a:AudioData,T:CTimes){
  const first=WORD_KEYS[0]!,distance=Math.hypot(k.x-first.x,k.z-first.z),delay=distance/MAX_KEY_DISTANCE,begin=afterBeats(a,T.keyboard,delay);
  // The distance/one-beat front reaches the farthest cap at the deadline;
  // shorter caps retain the 0.35-beat spring, clipped to that same deadline.
  const end=Math.min(afterBeats(a,begin,.35),afterBeats(a,T.keyboard,1));
  return k.index===first.index||t>=end?1:t<=begin?0:ease.outBack(span(t,begin,end),1.3);
}
export function keyTop(k:typeof KEY_FIELD[number],t:number,a:AudioData,T:CTimes){
  const s=keyboardState(a,t,T),base=keyHeight(k.x,k.z,k.enter,a.beatAt(t),a.hit('kick',t),s.landing),rise=keyRise(k,t,a,T);
  const event=keyEvents(T).filter(e=>e.key.index===k.index&&e.at<=t).at(-1);
  return lerp(-.6,base,rise)+(event?keyPress(t,event.at):0);
}
export const HEIGHT_GLSL=`float keyHeight(float x,float z,bool enter,float beat,float kick,float landing){if(enter)return 0.5-landing*0.22;return 0.48+sin(beat*3.14159265359-x*0.62-z*0.85)*0.16+sin(beat*3.14159265359*0.5+x*0.22)*0.055+kick*0.13*cos(x*0.34+z*0.5);}`;
export function cameraAt(a:AudioData,t:number,T:CTimes){
  const back=T.claws.words.at(-1)!,first=WORD_KEYS[0]!,cam=oldCameraAt(a,Math.min(t,back.start),T);
  const k=span(t,T.keyboard,afterBeats(a,T.keyboard,1));
  cam.quaternion.copy(oldCameraAt(a,Math.min(t,back.start),T).quaternion);
  cam.rotateZ(.12+Math.PI/12-.26-(.12+Math.PI/12-.26)*ease.inOutCubic(k));
  cam.updateMatrixWorld();
  const reference=oldCameraAt(a,T.keyboard,T);reference.rotateZ(.12+Math.PI/12-.26);reference.updateMatrixWorld();
  const P=projectPoint(new THREE.Vector3(first.x,keyTop(first,t,a,T),first.z),cam),fade=1-ease.inOutCubic(k);
  cam.setViewOffset(1920,1080,(P.x-671)*fade,(P.y-809)*fade,1920,1080);cam.updateProjectionMatrix();
  if(t>=back.start){
    const u=ease.inCubic(span(t,back.start,T.end-1/60)),top=keyTop(ENTER,t,a,T),target=new THREE.Vector3(ENTER.x,top,ENTER.z),end=new THREE.Vector3(ENTER.x,top+.06,ENTER.z+.000001);
    cam.position.lerp(end,u);const oldTarget=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion).add(cam.position);
    cam.up.set(0,1-u,-u);cam.lookAt(oldTarget.lerp(target,u));cam.clearViewOffset();cam.fov=lerp(cam.fov,30,u);cam.updateProjectionMatrix();cam.updateMatrixWorld();
  }
  return cam;
}
export function cameraRoll(cam:THREE.PerspectiveCamera){
  const forward=new THREE.Vector3(0,0,-1).applyQuaternion(cam.quaternion),reference=cam.clone();reference.up.set(0,1,0);reference.lookAt(cam.position.clone().add(forward));
  const delta=reference.quaternion.invert().multiply(cam.quaternion);return 2*Math.atan2(delta.z,delta.w);
}
export function entryRoll(a:AudioData,T:CTimes){return cameraRoll(cameraAt(a,T.keyboard,T));}
export function cursorAt(t:number,a:AudioData,T:CTimes){const event=keyEvents(T).filter(e=>e.at<=t).at(-1),k=event?.key??WORD_KEYS[0]!;return projectPoint(new THREE.Vector3(k.x,keyTop(k,t,a,T),k.z),cameraAt(a,t,T));}
export function entryPrim(t:number,a:AudioData,T:CTimes):Prim{const k=WORD_KEYS[0]!,p=projectPoint(new THREE.Vector3(k.x,keyTop(k,t,a,T),k.z),cameraAt(a,t,T));return {kind:'point',...p,r:6};}
export function enterCorners(t:number,a:AudioData,T:CTimes){const y=keyTop(ENTER,t,a,T),cam=cameraAt(a,t,T);return [-1,1].flatMap(x=>[-1,1].map(z=>projectPoint(new THREE.Vector3(ENTER.x+x*ENTER.width*.45,y,ENTER.z+z*ENTER.depth*.45),cam)));}
export function enterCovers(t:number,a:AudioData,T:CTimes){
  const ps=enterCorners(t,a,T),poly=[ps[0]!,ps[2]!,ps[3]!,ps[1]!];
  const inside=(P:{x:number;y:number})=>{const signs=poly.map((A,i)=>{const B=poly[(i+1)%4]!;return (B.x-A.x)*(P.y-A.y)-(B.y-A.y)*(P.x-A.x);});return signs.every(v=>v>=-1e-6)||signs.every(v=>v<=1e-6);};
  return [{x:0,y:0},{x:1920,y:0},{x:1920,y:1080},{x:0,y:1080}].every(inside)&&ps.every(p=>p.x<0||p.x>1920||p.y<0||p.y>1080);
}
export function exitPrim(t:number,a:AudioData,T:CTimes):Prim{if(enterCovers(t,a,T))return {kind:'rect',x:0,y:0,w:1920,h:1080};const ps=enterCorners(t,a,T),x=Math.min(...ps.map(p=>p.x)),y=Math.min(...ps.map(p=>p.y));return {kind:'rect',x,y,w:Math.max(...ps.map(p=>p.x))-x,h:Math.max(...ps.map(p=>p.y))-y};}
export function handoffIn(t:number,a:AudioData,T:CTimes){const p=entryPrim(t,a,T);return p.kind==='point'?{x:p.x,y:p.y}:{x:0,y:0};}
export function handoffOut(t:number,a:AudioData,T:CTimes){return exitPrim(t,a,T);}
export function keyboardLayout(a:AudioData,t:number,T:CTimes){const camera=cameraAt(a,t,T);const field=KEY_FIELD.map(k=>clipBox(keyBox(k,camera,a.beatAt(t),a.hit('kick',t),0,keyTop(k,t,a,T)))).filter(b=>b.w>0&&b.h>0);return {field:unionBoxes(field),enter:keyBox(ENTER,camera,a.beatAt(t),a.hit('kick',t),0,keyTop(ENTER,t,a,T)),title:{x:0,y:0,w:0,h:0},rider:riderBox(a,t,T)};}
export function titleSlice(u:number){return {x:lerp(1000,2180,u),top:lerp(98,-270,u),bottom:lerp(310,480,u)};}
