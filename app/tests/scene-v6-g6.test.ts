import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import { Rig, p3 } from '../src/kit/rig';
import { SolidText } from '../src/kit/solidtype';
import { carryLayout } from '../src/kit/carry';
import { layoutPath, letterTimes } from '../src/kit/pathtext';
import { HANDOFF, primError, exitEnvelope } from '../src/kit/handoff';
import { resolveFTimes } from '../src/scenes/parts/s15-f-timing';
import { freeCarrySpec, freeCarryAffines, handoffOut, entryPrim as entry15 } from '../src/scenes/parts/s15-layout';
import { greenTimes, greenHit, GREEN_WIDTHS, greenState } from '../src/scenes/parts/s16-green-state';
import { D, RADIUS, ARC, MAX_TILT, S16_GLSL, arcAt, dominoPoint, tiltAt, hitAngle, hitDelay, cameraAt, cursorAt, arcBounds, entryPrim, exitPrim, projectBounds, faceCorners } from '../src/scenes/parts/s16-world';
import { exitPrim as exit14 } from '../src/scenes/s14-shaft';
import { CUTS } from './handoff.test';
import './kit-pathtext.test';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio=new AudioData(audioJSON),lyrics=new Lyrics(lyricsJSON),v=new Voice(lyrics,audio),T=greenTimes(audio,lyrics),F=resolveFTimes({audio,lyrics});
const closeRect=(a:any,b:any)=>{for(const k of ['x','y','w','h'])expect(Math.abs(a[k]-b[k])).toBeLessThanOrEqual(2);};

test('C14-C16 compare measured outgoing and incoming primitives, including quarter frames',()=>{
  expect(CUTS.map(c=>c.id)).toEqual(['C14','C15','C16']);
  expect(primError(exit14(F.s15[0]!-1/60),entry15(F.s15[0]!))).toEqual({px:0,size:0});
  closeRect(entryPrim(T.start,T),HANDOFF.domino15);closeRect(exitPrim(T.end-1/60,T),HANDOFF.domino16);
  const cutErrors=CUTS.map(c=>({id:c.id,...primError(c.exitPrim(c.cut-1/60),c.entryPrim(c.cut))}));
  console.log('G6 cut errors',JSON.stringify(cutErrors));
});
test('S15 piece reaches the exact upright rect and holds throughout exit stillness',()=>{
  const q=handoffOut(T.start-1/60,audio,F);closeRect(q,HANDOFF.domino15);expect(q.angle).toBe(0);
  expect(handoffOut(T.start-0.1,audio,F)).toEqual(handoffOut(T.start,audio,F));
});
test('free carry matches every affine field across the cut; only that word is carried',()=>{
  const spec=freeCarrySpec(v,F),aff=carryLayout(spec);
  expect(spec).toMatchObject({text:'free',x:1100,y:560,size:90,color:'clay'});
  expect(freeCarryAffines(audio,v,T.start-1/60,F)).toEqual(aff);
  expect(freeCarryAffines(audio,v,T.start,F)).toEqual(aff);
  expect(spec.axes).toEqual(v.form(T.free,T.start).axes);
});
test('the nineteen 0.7 x 2.1 x 0.22 boards lie on the specified circle',()=>{
  expect(D).toEqual({w:0.7,h:2.1,d:0.22});
  for(let i=0;i<19;i++){const p=arcAt(i);expect(Math.hypot(p.x,p.z+14)).toBeCloseTo(RADIUS,12);expect(p.y).toBe(0);if(i>0)expect(Math.hypot(p.x-arcAt(i-1).x,p.z-arcAt(i-1).z)).toBeGreaterThan(D.h*0.45);}
  expect(Math.atan2(arcAt(0).x,arcAt(0).z+14)).toBeCloseTo(-ARC,12);
  expect(Math.atan2(arcAt(18).x,arcAt(18).z+14)).toBeCloseTo(ARC,12);
});
// Translate the exported shader operations into scalar JavaScript, rather than a second copy
// of the geometry formula. GLSL vector addition and constructors are expanded mechanically.
const scalar=S16_GLSL
  .replace(/const float/g,'const').replace(/float (\w+)\(float i\)/g,'function $1(i)')
  .replace('vec3 arcAt(float i)','function arcAt(i)').replace('vec3 dominoPoint(float i, vec3 q, float theta)','function dominoPoint(i,q,theta)')
  .replace(/float /g,'let ').replace('vec3 b=arcAt(i)','let b=arcAt(i)')
  .replace('return b+vec3(','return add(b,vec3(').replace('Z);','Z));');
const translated=new Function('vec3','add','sin','cos','mix',scalar+';return {arcAt,dominoPoint};')(
  (x:number,y:number,z:number)=>({x,y,z}),(a:any,b:any)=>p3(a.x+b.x,a.y+b.y,a.z+b.z),Math.sin,Math.cos,(a:number,b:number,k:number)=>a+(b-a)*k);
test('CPU and the exported GLSL translation agree at 200 seeded points under arbitrary tilts',()=>{
  let seed=62026,max=0;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;};
  for(let j=0;j<200;j++){const i=Math.floor(rand()*19),q=p3((rand()-0.5)*D.w,rand()*D.h,(rand()-0.5)*D.d),theta=rand()*MAX_TILT;
    const a=dominoPoint(i,q,theta),b=translated.dominoPoint(i,q,theta);max=Math.max(max,Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z));}
  expect(max).toBeLessThan(1e-4);console.log('G6 CPU/GLSL max error',max);
});
test('tau is strictly increasing, exact at One/two/three/Nineteen and six greens use exact widths',()=>{
  expect(T.triggers).toHaveLength(19);expect(T.triggers.slice(0,3)).toEqual([T.count[0]!.start,T.count[4]!.start,T.count[6]!.start]);
  expect(T.triggers[18]).toBe(T.nineteen.start);for(let i=1;i<19;i++)expect(T.triggers[i]!).toBeGreaterThan(T.triggers[i-1]!);
  expect(T.greens).toHaveLength(6);expect(GREEN_WIDTHS).toEqual([62,87.5,112.5,75,125,100]);
  T.greens.forEach((word,i)=>{expect(greenHit(word.start,T)).toMatchObject({i,wdth:GREEN_WIDTHS[i]});});
});
test('each physical cascade starts on the exact first top-to-neighbour plane contact',()=>{
  const exceptions=[];for(let i=0;i<18;i++){
    const theta=hitAngle(i),p=dominoPoint(i,p3(0,D.h,D.d/2),theta),next=arcAt(i+1);
    const a=-ARC+(i+1)/18*2*ARC,n=p3(Math.cos(a),0,-Math.sin(a));
    expect((next.x-p.x)*n.x+(next.z-p.z)*n.z).toBeCloseTo(D.d/2,10);
    const collision=T.triggers[i]!+hitDelay(i),early=collision-T.triggers[i+1]!;
    if([6,10,14].includes(i)){expect(early).toBeGreaterThan(0);exceptions.push({from:i+1,to:i+2,earlyMs:early*1000});}
    else expect(T.triggers[i+1]!+1e-10).toBeGreaterThanOrEqual(collision);
  }
  console.log('G6 fixed lyric launch exceptions',JSON.stringify(exceptions));
});
test('fall uses inQuad 0.24 s, final board 0.6 s, with a bounded analytic rebound',()=>{
  for(let i=0;i<19;i++){const d=i===18?0.6:0.24;expect(tiltAt(i,T.triggers[i]!,T)).toBe(0);
    expect(tiltAt(i,T.triggers[i]!+d/2,T)).toBeCloseTo(MAX_TILT/4,9);
    expect(tiltAt(i,T.triggers[i]!+d,T)).toBeCloseTo(MAX_TILT,9);
    for(let dt=d;dt<d+1;dt+=0.01)expect(Math.abs(tiltAt(i,T.triggers[i]!+dt,T)-MAX_TILT)).toBeLessThan(0.013);}
});
test('acceleration shot contains the full projected arc, whose bbox occupies at least 30 percent',()=>{
  const metrics=[];for(const t of [110.843,110.9,111.3,111.75,112.2,112.539]){const b=arcBounds(t,T),area=b.w*b.h/(1920*1080);expect(area).toBeGreaterThanOrEqual(0.3);
    expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(1920);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.h).toBeLessThanOrEqual(1080);metrics.push({t,bbox:b,area});}
  console.log('G6 arc projected bboxes',JSON.stringify(metrics));
});
test('GREEN uses cached matching solids, with both sides outside the frame before the face close-up',()=>{
  const mat=new THREE.MeshBasicMaterial(),metrics=[];T.greens.forEach((word,i)=>{
    const a=new SolidText('GREEN',{capH:3.2,depth:0.6,axes:{wdth:GREEN_WIDTHS[i]!,wght:900},material:mat});
    const b=new SolidText('GREEN',{capH:3.2,depth:0.6,axes:{wdth:GREEN_WIDTHS[i]!,wght:900},material:mat});
    expect(a.letters[0]!.mesh.geometry).toBe(b.letters[0]!.mesh.geometry);
    a.group.scale.x=6;a.group.position.set(-a.width*3,0,-19);const box=projectBounds(cameraAt(word.start+0.13,T),a.letters.flatMap((_,j)=>a.letterCorners(j)));
    if(i<5){expect(box.x).toBeLessThanOrEqual(0);expect(box.x+box.w).toBeGreaterThanOrEqual(1920);}metrics.push({wdth:GREEN_WIDTHS[i],bbox:box});a.dispose();b.dispose();
  });mat.dispose();console.log('G6 GREEN projected bboxes',JSON.stringify(metrics));
});
test('every glyph time belongs to its word, and ground words reserve their completed voice axes',()=>{
  for(const w of [T.free,...T.count,...lyrics.get('Green and green and green and green').words,...lyrics.get('Nineteen green!').words])expect(letterTimes(w)[0]!.t0).toBeGreaterThanOrEqual(w.start);
  const words=T.count.filter((_,i)=>[1,2,3,5].includes(i));const a=layoutPath(words,{capH:0.7,axes:w=>v.form(w,w.end).axes,upper:true});
  expect(a).toEqual(layoutPath(words,{capH:0.7,axes:w=>v.form(w,w.end).axes,upper:true}));for(const g of a.glyphs)expect(g.t0).toBeGreaterThanOrEqual(g.word.start);
});
test('world, camera, cursor and lyric geometry are deterministic under reverse seeks and BPM changes',()=>{
  const other=new AudioData({...audioJSON,bpm:40});expect(greenTimes(other,lyrics).triggers).toEqual(T.triggers);
  for(const t of [T.start,107.13,108.85,109.75,110.9,111.75,112.6,T.end-1/60]){
    const a={world:faceCorners(18,t,T),cam:cameraAt(t,T),cursor:cursorAt(t,T),state:greenState(audio,lyrics,v,t,T)};
    cameraAt(T.end,T);cameraAt(T.start,T);greenState(audio,lyrics,v,T.end,T);
    expect({world:faceCorners(18,t,T),cam:cameraAt(t,T),cursor:cursorAt(t,T),state:greenState(audio,lyrics,v,t,T)}).toEqual(a);
  }
});
test('outgoing camera and screen-space carrier stop in the final 100ms',()=>{
  const cam=cameraAt(T.end-0.1,T);for(const t of [T.end-0.08,T.end-1/60,T.end]){expect(cameraAt(t,T)).toEqual(cam);expect(exitEnvelope(t,T.end).still).toBe(1);}
});
test('known free collision clock contradiction remains explicit rather than retiming the lyrics',()=>{
  const begin=T.free.end-0.1;expect(T.triggers[0]).toBe(T.free.end);expect(begin+0.24-T.triggers[0]!).toBeCloseTo(0.14,10);
  console.log('G6 free: full 90 degree fall occurs 140 ms after One; carry x=1100 is right of first board x=1010');
});

test('the fallen green back faces upward and the close-up camera stays above the ground',()=>{
  const ps=faceCorners(18,T.end-1/60,T),a=new THREE.Vector3(ps[1]!.x-ps[0]!.x,ps[1]!.y-ps[0]!.y,ps[1]!.z-ps[0]!.z),b=new THREE.Vector3(ps[3]!.x-ps[0]!.x,ps[3]!.y-ps[0]!.y,ps[3]!.z-ps[0]!.z);
  // faceCorners order is the front winding: the back's outward normal is its negative.
  expect(a.cross(b).normalize().y).toBeLessThan(-0.99);
  for(const t of [T.start,107.13,110.843,112.54,113.5,T.end])expect(cameraAt(t,T).pos.y).toBeGreaterThan(0);
});

test('the three numeric lyrics have measured projected capital heights of 50-110px on their boards',()=>{
  const measured=[];for(const [i,w] of [[0,T.count[0]!],[1,T.count[4]!],[2,T.count[6]!]] as const){
    const t=(w.start+w.end)/2,rig=new Rig();rig.set(cameraAt(t,T));
    const points=[-1,1].map(k=>dominoPoint(i,p3(0,D.h/2+k*0.55/2,-D.d/2-0.003),tiltAt(i,t,T))).map(p=>rig.proj(p.x,p.y,p.z)!);
    const capPx=Math.hypot(points[1]!.x-points[0]!.x,points[1]!.y-points[0]!.y);
    expect(capPx).toBeGreaterThanOrEqual(50);expect(capPx).toBeLessThanOrEqual(110);measured.push({word:w.w,t,capPx});
  }console.log('G6 numeric projected caps',JSON.stringify(measured));
});
