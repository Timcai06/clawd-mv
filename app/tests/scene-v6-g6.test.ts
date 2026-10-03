import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import { Rig, p3 } from '../src/kit/rig';
import { SolidText } from '../src/kit/solidtype';
import { carryLayout } from '../src/kit/carry';
import { layoutPath, letterTimes, drawPathText, runInkBounds } from '../src/kit/pathtext';
import { HANDOFF, primError, exitEnvelope } from '../src/kit/handoff';
import { resolveFTimes } from '../src/scenes/parts/s15-f-timing';
import { freeCarrySpec, freeCarryAffines, handoffOut, entryPrim as entry15 } from '../src/scenes/parts/s15-layout';
import { greenTimes, greenHit, GREEN_WIDTHS, greenState } from '../src/scenes/parts/s16-green-state';
import { D, RADIUS, ARC, MAX_TILT, S16_GLSL, arcAt, dominoPoint, tiltAt, hitAngle, hitDelay, cameraAt, cursorAt, arcBounds, entryPrim, exitPrim, projectBounds, faceCorners, groundLyrics, greenLetterPoints, freeBody, freeTiltAt, floorToneAt, groundShadowAt, lightTone, faceNormal, KEY_LIGHT, checkScaleAt, shakeAt } from '../src/scenes/parts/s16-world';
import { exitPrim as exit14 } from '../src/scenes/s14-shaft';
import { CUTS } from './handoff.test';
import { FakeCanvas, FakePath } from './kit-pathtext.test';
import { afterBeats } from '../src/kit/time';
import { varRun } from '../src/kit/vartype';
import { PRINT } from '../src/scenes/parts/s16-print';
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
  expect(spec).toMatchObject({text:'free',right:1000,y:810,size:90,color:'clay'});
  expect(freeCarryAffines(audio,v,T.start-1/60,F)).toEqual(aff);
  expect(freeCarryAffines(audio,v,T.start,F)).toEqual(aff);
  expect(spec.axes).toEqual(v.form(T.free,T.start).axes);
  const run=varRun('free',100,spec.axes),ink=runInkBounds(run);expect(spec.x+(ink.x1-ink.x0)*spec.size/run.capH).toBeCloseTo(1000,10);
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
test('GREEN satisfies revised projected constraints through every slam and acceleration frame',()=>{
  const rows=[];let bad=0,minArea=1,minTop=Infinity,minCap=Infinity,maxCap=0,minVisible=1;
  const times=[...Array.from({length:Math.ceil((T.nineteen.start-T.greens[0]!.start)*120)},(_,i)=>T.greens[0]!.start+i/120),...T.greens.slice(0,5).flatMap(w=>[w.start-.004,w.start-.001,w.start,w.start+.001,w.start+.12,w.end]),T.nineteen.start-1e-5].filter(t=>t<T.nineteen.start);
  for(const t of times){
    const cam=cameraAt(t,T),letters=greenLetterPoints(t,T),bs=letters.map(ps=>projectBounds(cam,ps));
    const upright=T.triggers.map((at,i)=>t<at?projectBounds(cam,faceCorners(i,t,T,false)).y:Infinity),top=Math.min(...upright);
    const box={top:Math.min(...bs.map(b=>b.y)),bottom:Math.max(...bs.map(b=>b.y+b.h)),minCap:Math.min(...bs.map(b=>b.h)),maxCap:Math.max(...bs.map(b=>b.h)),visible:Math.min(...bs.map(b=>(Math.min(1920,b.x+b.w)-Math.max(0,b.x))/b.w))};
    minTop=Math.min(minTop,box.top);minCap=Math.min(minCap,box.minCap);maxCap=Math.max(maxCap,box.maxCap);minVisible=Math.min(minVisible,box.visible);
    const arc=arcBounds(t,T),area=arc.w*arc.h/1920/1080;
    if(t>=T.launches[0]!.start)minArea=Math.min(minArea,area);
    if(box.top<40||box.bottom>=top||box.minCap<220||box.maxCap>380||box.visible<0.7){bad++;if(rows.length<12)rows.push({t,box,top,arc,area});}
  }
  console.log('G6 r2 GREEN diagnostics',JSON.stringify({bad,samples:times.length,minArea,minTop,minCap,maxCap,minVisible,rows}));expect(bad).toBe(0);
},20000);
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
test('free first reaches the first board left face at One, using its actual solid outline',()=>{
  const body=freeBody(freeCarrySpec(v,F),T);const yaw=-ARC+Math.PI/2,p=body.contact,a=arcAt(0);
  const local=p3(Math.cos(yaw)*(p.x-a.x)-Math.sin(yaw)*(p.z-a.z),p.y,Math.sin(yaw)*(p.x-a.x)+Math.cos(yaw)*(p.z-a.z));
  expect(local.x).toBeCloseTo(-D.w/2,10);expect(local.y).toBeGreaterThan(0);expect(local.y).toBeLessThan(D.h);expect(Math.abs(local.z)).toBeLessThanOrEqual(D.d/2+1e-10);
  const at=T.count[0]!.start;expect(freeTiltAt(at-0.24,T,body.angle)).toBe(0);expect(freeTiltAt(at,T,body.angle)).toBeCloseTo(body.angle,12);
  for(const t of [at-1/60,at-1/120]){const theta=freeTiltAt(t,T,body.angle);expect(Math.max(...body.points.map(p=>body.pivot.x+p.x*Math.cos(theta)+p.y*Math.sin(theta)))).toBeLessThan(-D.w/2);}
  console.log('G6 free contact',JSON.stringify({at,angle:body.angle,point:p,local}));body.solid.dispose();
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
    const points=[-1,1].map(k=>dominoPoint(i,p3(0,D.h/2+k*0.7/2,-D.d/2-0.003),tiltAt(i,t,T))).map(p=>rig.proj(p.x,p.y,p.z)!);
    const capPx=Math.hypot(points[1]!.x-points[0]!.x,points[1]!.y-points[0]!.y);
    expect(capPx).toBeGreaterThanOrEqual(50);expect(capPx).toBeLessThanOrEqual(110);measured.push({word:w.w,t,capPx});
  }console.log('G6 numeric projected caps',JSON.stringify(measured));
});

test('five visible lit floor, cast-shadow and lit top-face samples meet the revised exposure bands',()=>{
  const rows=[];for(const t of [T.start,afterBeats(audio,T.start,0.5)]){
    const rig=new Rig();rig.set(cameraAt(t,T));
    const floorPoints=[200,400,600,800,1000,1200,1400,1600,1800].flatMap(x=>[900,950,1000].map(y=>{const p=new THREE.Vector3(x/960-1,1-y/540,.5).unproject(rig.cam),dir=p.sub(rig.cam.position);return p3(rig.cam.position.x-dir.x*rig.cam.position.y/dir.y,0,rig.cam.position.z-dir.z*rig.cam.position.y/dir.y);})).filter(p=>!groundShadowAt(p,t,T)).filter((_,i)=>i%3===0).slice(0,5);expect(floorPoints).toHaveLength(5);
    const floor=floorPoints.map(p=>floorToneAt(p,t,T));
    const shadowPoints=Array.from({length:5},(_,i)=>{const p=dominoPoint(i,p3(0,D.h*.45,0),tiltAt(i,t,T));return p3(p.x-KEY_LIGHT.x*p.y/KEY_LIGHT.y,0,p.z-KEY_LIGHT.z*p.y/KEY_LIGHT.y);});
    const shadow=shadowPoints.map(p=>floorToneAt(p,t,T));
    const lit=Array.from({length:5},(_,i)=>{const a=dominoPoint(i,p3(0,0,0),0),b=dominoPoint(i,p3(0,1,0),0);return lightTone(p3(b.x-a.x,b.y-a.y,b.z-a.z));});
    for(const p of [...floorPoints,...shadowPoints]){const q=rig.proj(p.x,p.y,p.z)!;expect(q.x).toBeGreaterThanOrEqual(0);expect(q.x).toBeLessThanOrEqual(1920);expect(q.y).toBeGreaterThanOrEqual(0);expect(q.y).toBeLessThanOrEqual(1080);}
    for(const q of floor){expect(q).toBeGreaterThanOrEqual(.85);expect(q).toBeLessThanOrEqual(.92);}for(const q of shadow){expect(q).toBeGreaterThanOrEqual(.15);expect(q).toBeLessThanOrEqual(.30);}for(const q of lit){expect(q).toBeGreaterThanOrEqual(.80);expect(q).toBeLessThanOrEqual(.90);}rows.push({t,floor,shadow,lit,floorPoints,shadowPoints});
  }console.log('G6 exposure samples',JSON.stringify(rows));
});

test('printed fail crosses measure at least 40 px on visible fronts half a beat after entry',()=>{
  const t=afterBeats(audio,T.start,.5),cam=cameraAt(t,T),rig=new Rig();rig.set(cam);const widths=[];
  for(let i=0;i<19;i++){const a=arcAt(i),n=faceNormal(i,t,T,false),dot=n.x*(cam.pos.x-a.x)+n.y*cam.pos.y+n.z*(cam.pos.z-a.z);const face=projectBounds(cam,faceCorners(i,t,T,false));
    if(dot<=0||face.x+face.w<0||face.x>1920)continue;
    const cross=projectBounds(cam,[-1,1].flatMap(x=>[-1,1].map(y=>dominoPoint(i,p3(x*PRINT.markWidth/2,D.h/2+y*PRINT.markWidth/2,D.d/2),tiltAt(i,t,T)))));
    expect(cross.w).toBeGreaterThanOrEqual(40);widths.push({i:i+1,width:cross.w});
  }expect(widths.length).toBeGreaterThan(0);console.log('G6 printed fail widths',JSON.stringify({t,widths}));
});
test('ground words stand on separate arc paths, within the lyric capital-height tier',()=>{
  const paths=groundLyrics(T,v);expect(paths.map(q=>q.center)).toEqual([.5,1,2]);expect(paths.every(q=>q.offset===.6)).toBe(true);
  const saved=globalThis.Path2D;globalThis.Path2D=FakePath as any;try{for(const q of paths){const word=q.layout.glyphs.at(-1)!.word,t=word.end,rig=new Rig();rig.set(cameraAt(t,T));const c=new FakeCanvas();drawPathText(c as any,rig,q.path,q.layout,t,{mode:'stand',base:'ink',on:'paper',axes:(g,t)=>v.form(g.word,t).axes,minPx:50,maxPx:110});expect(c.draws.length).toBeGreaterThan(0);
    for(const d of c.draws){const cap=varRun('H',100,v.form(q.layout.glyphs[0]!.word,t).axes).capH;const h=Math.hypot(d.m[2]!,d.m[3]!)*cap;expect(h).toBeGreaterThanOrEqual(50-1e-8);expect(h).toBeLessThanOrEqual(110+1e-8);}}
  }finally{globalThis.Path2D=saved;}
});
test('sixth green slams the nineteenth printed check with outBack in 0.12 s and shakes 6px',()=>{
  const at=T.greens[5]!.start;expect(greenHit(at,T)?.target).toBe('check');expect(T.greens.slice(0,5).every(w=>greenHit(w.start,T)?.target==='monument')).toBe(true);expect(tiltAt(18,at,T)).toBeCloseTo(MAX_TILT,2);expect(checkScaleAt(at-1/60,T)).toBe(1);expect(checkScaleAt(at,T)).toBe(1.3);expect(checkScaleAt(at+.12,T)).toBe(1);expect(checkScaleAt(at+.08,T)).toBeLessThan(1);expect(shakeAt(at,T)).toBe(6);expect(shakeAt(T.end-1/60,T)).toBe(0);
});
test('Nineteen baseline points project rightward within ten degrees and its top points upward',()=>{
  const t=T.end-1/60,theta=tiltAt(18,t,T),rig=new Rig();rig.set(cameraAt(t,T));
  const ps=[p3(-.315,D.h/2-.945,-D.d/2-.003),p3(-.315,D.h/2+.945,-D.d/2-.003),p3(.315,D.h/2-.945,-D.d/2-.003)].map(q=>dominoPoint(18,q,theta)).map(p=>rig.proj(p.x,p.y,p.z)!);
  const [a,b,c]=ps;const angle=Math.atan2(b!.y-a!.y,b!.x-a!.x)*180/Math.PI;expect(Math.abs(angle)).toBeLessThanOrEqual(10);expect(b!.x).toBeGreaterThan(a!.x);expect(c!.y).toBeLessThan(a!.y);console.log('G6 Nineteen orientation',JSON.stringify({angle,points:ps}));
});

test('the upright free solid and carried ink boxes agree within 0.25px at C15',()=>{
  const spec=freeCarrySpec(v,F),body=freeBody(spec,T),rig=new Rig();rig.set(cameraAt(T.start,T));
  const front=body.points.filter(p=>p.z>=.05-1e-7).map(p=>dominoPoint(0,p3(body.pivot.x+p.x,p.y,body.pivot.z+p.z),0));
  const b=projectBounds(cameraAt(T.start,T),front),run=varRun('free',100,spec.axes),ink=runInkBounds(run),s=spec.size/run.capH;
  for(const [actual,expected] of [[b.x,spec.x],[b.x+b.w,1000],[b.y,spec.y+ink.y0*s],[b.y+b.h,spec.y+ink.y1*s]])expect(Math.abs(actual!-expected!)).toBeLessThanOrEqual(.25);
  console.log('G6 physical free entry bbox',JSON.stringify(b));body.solid.dispose();
});

test('GREEN capital-height vectors project inside the giant tier independently of letter bbox width',()=>{
  let min=Infinity,max=0;for(let t=T.greens[0]!.start;t<T.nineteen.start;t+=1/120){const rig=new Rig();rig.set(cameraAt(t,T));const ps=greenLetterPoints(t,T);
    for(const points of ps){const x=(Math.min(...points.map(p=>p.x))+Math.max(...points.map(p=>p.x)))/2,z=(Math.min(...points.map(p=>p.z))+Math.max(...points.map(p=>p.z)))/2;
      const i=T.greens.findLastIndex(w=>t>=w.start),age=Math.max(0,Math.min(1,(t-T.greens[i]!.start)/.12)),y=1.5*(1-age*age);
      const a=rig.proj(x,y,z)!,b=rig.proj(x,y+3.2,z)!,cap=Math.hypot(b.x-a.x,b.y-a.y);min=Math.min(min,cap);max=Math.max(max,cap);expect(cap).toBeGreaterThanOrEqual(220);expect(cap).toBeLessThanOrEqual(380);}}
  console.log('G6 true GREEN caps',JSON.stringify({min,max}));
});

test('the inherited full-arc frame and thirty-percent constraints still apply after the camera re-solve',()=>{
  let minArea=1,maxOverflow=0;const rows=[];
  for(let t=T.launches[0]!.start;t<T.nineteen.start;t+=1/120){const b=arcBounds(t,T),area=b.w*b.h/1920/1080,overflow=Math.max(0,-b.x,-b.y,b.x+b.w-1920,b.y+b.h-1080);minArea=Math.min(minArea,area);maxOverflow=Math.max(maxOverflow,overflow);if((area<.3||overflow>0)&&rows.length<5)rows.push({t,area,overflow,bbox:b});}
  console.log('G6 inherited arc constraints',JSON.stringify({minArea,maxOverflow,rows}));expect(minArea).toBeGreaterThanOrEqual(.3);expect(maxOverflow).toBe(0);
});
