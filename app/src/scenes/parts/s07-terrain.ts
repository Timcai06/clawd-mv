// Static keyboard layout plus a pure analytic height field. GPU deformation and
// CPU line placement use the same equation; seeking never integrates a simulation.
import { keyboardKeys } from '../../kit/keyboard';
import { KEYBOARD_ROWS } from '../../kit/content';
import * as THREE from 'three';
import type { AudioData } from '../../engine/audio';
import { ease, lerp } from '../../engine/util';
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
export const WORD_KEYS = [9,10,11,12,23,24,25,26,ENTER.index].map(i=>TERRAIN_KEYS[i]!);
export const RIDER_KEY = KEY_FIELD[4*KEY_COUNT+9]!;

export function cameraAt(audio: AudioData,t: number,T: CTimes) {
  const s=keyboardState(audio,t,T),d=s.dive;
  // A low, rolled lens makes the near keys bleed and the eight modules converge.
  const pos=new THREE.Vector3(lerp(3.66,ENTER.x,d),lerp(3.87,1.14,d),lerp(2.49,0.8,d));
  const target=new THREE.Vector3(lerp(4.89,ENTER.x,d),lerp(0,0.5,d),lerp(-4.98,ENTER.z,d));
  const cam=new THREE.PerspectiveCamera(lerp(57.28,30,d),1920/1080,0.035,180);
  cam.position.copy(pos);cam.lookAt(target);cam.rotateZ(lerp(-Math.PI/12,0,d));
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

export function handoffIn(t: number,audio: AudioData,T: CTimes) {
  const k=ease.inOutCubic(span(t,T.keyboard,afterBeats(audio,T.keyboard,1)));
  const first=WORD_KEYS[0]!,beat=audio.beatAt(t);
  const p=projectPoint(new THREE.Vector3(first.x,keyHeight(first.x,first.z,false,beat,audio.hit('kick',t),0),first.z),cameraAt(audio,t,T));
  return {x:lerp(HANDOFF.pen06.x,p.x,k),y:lerp(HANDOFF.pen06.y,p.y,k)};
}

// S07→S08 has no new HANDOFF field: preserve the existing centred 39.6×72 cursor.
export function handoffOut(t: number,audio: AudioData,T: CTimes) {
  const k=ease.inOutCubic(span(t,afterBeats(audio,T.end,-1),T.end));
  const p=projectPoint(new THREE.Vector3(ENTER.x,0.515,ENTER.z),cameraAt(audio,t,T));
  return {x:lerp(p.x-19.8,940.2,k),y:lerp(p.y+36,576,k),h:72};
}

export function keyboardLayout(audio: AudioData,t: number,T: CTimes) {
  const camera=cameraAt(audio,t,T),s=keyboardState(audio,t,T);
  const support=riderGeometry(audio,t,T,camera).support;
  const field=KEY_FIELD.map(k=>clipBox(k.index===RIDER_KEY.index ? keyBox({...k,x:support.x,z:support.z},camera,audio.beatAt(t),audio.hit('kick',t),s.landing,support.y) : keyBox(k,camera,audio.beatAt(t),audio.hit('kick',t),s.landing))).filter(b=>b.w>0&&b.h>0);
  return {field:unionBoxes(field),enter:keyBox(ENTER,camera,audio.beatAt(t),audio.hit('kick',t),s.landing),
    title:clipBox({x:1000,y:-270,w:1180,h:titleSlice((1920-1000)/1180).bottom+270}),rider:riderBox(audio,t,T)};
}

export function titleSlice(u: number) {
  // A ruled perspective plane: far left short, right side enlarged beyond the frame.
  return { x:lerp(1000,2180,u),top:lerp(98,-270,u),bottom:lerp(310,480,u) };
}
