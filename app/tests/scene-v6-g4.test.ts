import { expect, test } from 'bun:test';
import './kit-pathtext.test';
import { FakeCanvas, withCanvas } from './kit-pathtext.test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import { carryLayout } from '../src/kit/carry';
import { drawPathText, letterTimes, runInkBounds } from '../src/kit/pathtext';
import { Rig } from '../src/kit/rig';
import { afterBeats } from '../src/kit/time';
import { CUT, HANDOFF, primError } from '../src/kit/handoff';
import { resolveX9Times } from '../src/scenes/s09-z-shared';
import * as scope from '../src/scenes/parts/s09-scope';
import * as glass from '../src/scenes/parts/s10-glass';
import * as rain from '../src/scenes/parts/s11-layout';
import * as copy from '../src/scenes/parts/s12-world';
import { whyIncoming, clearLyrics, countLyrics } from '../src/scenes/parts/s12-layout';
import { xeroxSettings, copyWords } from '../src/scenes/parts/s12-copy';
import { handoffBoxes } from '../src/scenes/parts/s09-type';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
export const audio=new AudioData(audioJSON),lyrics=new Lyrics(lyricsJSON),voice=new Voice(lyrics,audio),T=resolveX9Times({audio,lyrics});
function born(lay:ReturnType<typeof scope.scopeLyrics>['layout']) {
  for(const g of lay.glyphs) {
    const own=lay.glyphs.filter(h=>h.word===g.word),i=own.indexOf(g);
    expect(g.t0).toBeGreaterThanOrEqual(letterTimes(g.word)[i]!.t0);expect(g.t0).toBeGreaterThanOrEqual(g.word.start);
  }
}
test('G4 every glyph obeys the aligned vocal start and letter times',()=>{
  born(scope.scopeLyrics(voice,T).layout);born(glass.stripLayout(voice,T));
  rain.rainLyrics(voice).forEach(r=>born(r.layout));born(rain.hangingLyrics(voice).layout);
  born(clearLyrics(voice).layout);born(countLyrics(voice).layout);
  for(let k=0;k<5;k++)for(const item of copyWords(voice,k))for(const letter of letterTimes(item.word))expect(letter.t0).toBeGreaterThanOrEqual(item.word.start);
});
test('S09 beam gate, repeated measured-beat sweeps, and 66px front glass cap',()=>withCanvas(()=>{
  const ly=scope.scopeLyrics(voice,T);for(const g of ly.layout.glyphs)if(g.word!==ly.pass)expect(g.t0).toBeGreaterThanOrEqual(scope.scanArrival(audio,T,g.s));
  expect(scope.scanHead(audio,T.waiting,T)).toBe(0);
  expect(scope.scanHead(audio,afterBeats(audio,T.waiting,0.5),T)).toBeCloseTo(960,8);
  const rig=new Rig();rig.set({pos:{x:0,y:0,z:17.662604},tgt:{x:0,y:0,z:0},roll:0,fov:34});
  const c=new FakeCanvas();drawPathText(c.ctx,rig,ly.path,ly.layout,100,{mode:'lie',normal:()=>({x:0,y:0,z:1}),base:'paper',on:'ink',pop:0,axes:g=>voice.form(g.word,g.word.end).axes});
  const cap=c.transforms[0]![3]!*runInkBounds((awaitFreeRun())).y0*-1;
  expect(cap).toBeGreaterThanOrEqual(60);expect(cap).toBeLessThanOrEqual(72);
}));
import { varRun } from '../src/kit/vartype';
function awaitFreeRun(){return varRun('H',100,voice.form(voice.line('So I run the tests, I’m waiting for a pass').words[0]!,100).axes);}
test('S09 machine is vertically absorbed into the baseline by its end + 120ms',()=>{
  const w=lyrics.lines.flatMap(l=>l.words).find(w=>w.start<T.terminal&&w.end>T.terminal)!;
  expect(scope.machineCarry(voice,w.end+0.12,T).alpha).toBe(0);
  const at=scope.machineCarry(voice,w.end,T);expect(at.aff).toHaveLength(w.w.length);
  const end=scope.machineCarry(voice,w.end+0.12,T);
  for(const g of end.aff){expect(g.d).toBe(0);expect(g.f).toBe(540);}
});
test('C9 passes exactly one word in one shared affine layout; obstruction dims then hides it',()=>{
  const spec=scope.passCarry(voice,T),incoming=glass.passIncoming(voice,T,T.wallStart);
  expect(incoming.spec).toEqual(spec);expect(incoming.aff).toEqual(carryLayout(spec).filter(g=>T.wallStart>=letterTimes(voice.line('So I run the tests, I’m waiting for a pass').words.at(-1)!)[g.i]!.t0));
  expect(glass.passIncoming(voice,T,T.wallStart+0.2).alpha).toBeCloseTo(0.35,9);
  const word=voice.line('So I run the tests, I’m waiting for a pass').words.at(-1)!;
  expect(glass.passIncoming(voice,T,word.end+0.12).alpha).toBe(0);
});
test('S10 strip cap projects to 60–90px and each glyph waits for its plate stamp',()=>{
  const lay=glass.stripLayout(voice,T);for(const g of lay.glyphs)expect(g.t0).toBeGreaterThanOrEqual(stampAt(audio,T,glass.stripPlate(g.s)));
  const cap=glass.stripCapPixels(audio,afterBeats(audio,T.wallStart,1),T);
  console.log('S10_STRIP_CAP',cap);expect(cap).toBeGreaterThanOrEqual(60);expect(cap).toBeLessThanOrEqual(90);
});
import { stampAt, shardTri, rot, plateToWorld, YAW } from '../src/scenes/parts/s10-world';
test('C10 all 152 actual projected shards move at 220px/beat at roll -0.2',()=>{
  const a=T.wallEnd-1/60,b=T.wallEnd,db=audio.beatAt(b)-audio.beatAt(a);
  let maxSpeed=0,maxAngle=0;
  for(let i=0;i<19;i++)for(let j=0;j<8;j++){
    const q=shardTri(i,j).c,A=glass.shardScreen(audio,T,i,j,a,q)!,B=glass.shardScreen(audio,T,i,j,b,q)!;
    const vx=(B.x-A.x)/db,vy=(B.y-A.y)/db,sp=Math.hypot(vx,vy);
    maxSpeed=Math.max(maxSpeed,Math.abs(sp-220));maxAngle=Math.max(maxAngle,Math.abs(Math.atan2(vx,vy)-HANDOFF.fall10.roll));
  }
  expect(maxSpeed).toBeLessThan(22);expect(maxAngle*180/Math.PI).toBeLessThan(10);
  console.log('C10_MAX_SPEED_ERROR',maxSpeed,'ANGLE_DEG',maxAngle*180/Math.PI);
});
test('glass glyph fragments preserve cut affines and keep the incoming velocity',()=>{
  const outgoing=glass.glassShards(voice,T,T.rainStart),incoming=rain.glassIncoming(voice,T,T.rainStart);
  expect(outgoing.length).toBeGreaterThan(0);console.log('GLASS_GLYPH_SHARD_SLICES',outgoing.length);
  expect(incoming.map(s=>s.aff)).toEqual(outgoing.map(s=>s.aff));
  const db=0.00001,next=rain.glassIncoming(voice,T,afterBeats(audio,T.rainStart,db));
  outgoing.forEach((s,i)=>{expect(Math.hypot(next[i]!.aff.e-s.aff.e,next[i]!.aff.f-s.aff.f)/db).toBeCloseTo(220,2);});
  expect(rain.glassIncoming(voice,T,afterBeats(audio,T.rainStart,0.5)).every(s=>!s.draw)).toBe(true);
});
test('S11 gravity lands at 0.45 measured beat; falling continues and sky rises',()=>{
  for(const row of rain.rainLyrics(voice))for(const g of row.layout.glyphs){
    const at=afterBeats(audio,g.t0,0.45),name=g.word.w.toLowerCase();
    const f=rain.fallLetter(audio,g,at);expect(f.land).toBeCloseTo(at,10);
    if(name==='sky'){expect(rain.fallLetter(audio,g,at+0.1).height).toBeGreaterThan(f.height);}
    else {expect(f.height).toBeCloseTo(0,9);if(name==='falling')expect(rain.fallLetter(audio,g,at+0.1).height).toBeLessThan(f.height);}
    if(name==='rain')expect(f.splash).toBe(true);
  }
});
test('C11 why outgoing and first incoming glyph affines are itemwise equal',()=>{
  const spec=rain.whyCarry(voice);expect(whyIncoming(voice,T,T.rerunStart).aff).toEqual(rain.whyFrame(voice,T.rerunStart));
});
test('S12 five copy events and generation parameters follow word starts exactly',()=>{
  expect(copy.copies(voice).map(w=>w.start)).toEqual(voice.line('Run it again, run it again, again').words.filter(w=>/^(run|again),?$/i.test(w.w)).map(w=>w.start));
  expect(copy.copies(voice)).toHaveLength(5);
  for(let k=0;k<5;k++)for(const item of copyWords(voice,k)){
    const n=k-item.j;expect(n).toBeGreaterThanOrEqual(0);
    const a=xeroxSettings(n),b=xeroxSettings(n+1);
    for(const key of ['density','blur','scale','rotation'] as const)expect(b[key]).toBeGreaterThan(a[key]);
  }
});
test('S12 numeric stand times, extra eleven time and exact two-frame fail flash',()=>{
  const at=copy.numberTimes(voice),words=voice.line('Clear the cache and count to ten').words;
  expect(at[9]).toBe(words[6]!.start);expect(at[10]).toBe(words[6]!.start+0.55*(words[6]!.end-words[6]!.start));
  for(let k=0;k<10;k++)expect(at[k]).toBeCloseTo(words[4]!.start+(words[6]!.start-words[4]!.start)*k/9,10);
  expect(copy.numberAt(voice,10,at[10]!+0.18).fail).toBe(true);
  expect(copy.numberAt(voice,10,at[10]!+0.18+2/60).fail).toBe(false);
});
test('C11 all nine projected EMPTY slots match boxes within 2px',()=>{
  const actual=copy.projectedSlots(voice,T.rerunStart,T),want=handoffBoxes(HANDOFF.boxes11);
  let max=0;actual.forEach((a,i)=>{const b=want[i]!;for(const k of ['x','y','w','h'] as const)max=Math.max(max,Math.abs(a[k]-b[k]));});
  console.log('C11_SLOT_MAX_PX',max);expect(max).toBeLessThanOrEqual(2);
});
test('C12 actual second stem projected edge equals DIAG13',()=>{
  const expected={kind:'line' as const,...CUT.diag13,w:2},actual=copy.exitPrim(voice,T.end-1/60,T),error=primError(actual,expected);
  console.log('C12_EDGE',actual,'ERROR',error);expect(error.px).toBeLessThanOrEqual(2);
});
test('S12 latest paper cap projection is 50–110px for every copy event',()=>{
  for(const word of copy.copies(voice)){
    const k=copy.copies(voice).indexOf(word),t=word.start+0.35,rig=new Rig();rig.set(copy.cameraAt(voice,t,T));
    const p=copy.sheetAt(voice,k,t),a=rig.proj(p.x,p.y,p.z)!,b=rig.proj(p.x,p.y,p.z-0.26)!;
    const cap=Math.hypot(a.x-b.x,a.y-b.y);console.log('S12_COPY_CAP',k,cap);
    expect(cap).toBeGreaterThanOrEqual(50);expect(cap).toBeLessThanOrEqual(110);
  }
});
test('G4 world, camera, cursor and lyric layouts are seek-order deterministic',()=>{
  const queries=[
    (t:number)=>scope.scopeCamera(audio,t,T),(t:number)=>scope.scopeLyrics(voice,T),(t:number)=>scope.cursorAt(audio,t,T),
    (t:number)=>glass.wallCamera(audio,t,T),(t:number)=>glass.stripLayout(voice,T),(t:number)=>glass.glassShards(voice,T,t),
    (t:number)=>rain.rainCamera(audio,t,T),(t:number)=>rain.rainLyrics(voice),(t:number)=>rain.cursorAt(voice,t,T),
    (t:number)=>copy.cameraAt(voice,t,T),(t:number)=>copy.sheetAt(voice,3,t),(t:number)=>copy.cursorAt(voice,t,T)];
  for(const query of queries){const a=query(62.5);query(T.end);query(T.terminal);expect(query(62.5)).toEqual(a);}
});
test('all outgoing cameras remain fixed in their final 100ms',()=>{
  for(const [end,query] of [[T.terminalEnd,(t:number)=>scope.scopeCamera(audio,t,T)],[T.wallEnd,(t:number)=>glass.wallCamera(audio,t,T)],
    [T.rainEnd,(t:number)=>rain.rainCamera(audio,t,T)],[T.end,(t:number)=>copy.cameraAt(voice,t,T)]] as const)
    expect(query(end-0.09)).toEqual(query(end-1/60));
});
test('CPU/GPU paper field independent GLSL-to-JS translation: 200 seeded points <1e-4',()=>{
  expect(copy.PAPER_GLSL).toContain('paperY');let max=0;
  // Translation of the exported GLSL loop, deliberately not a call to the CPU implementation.
  const glslJS=(x:number,z:number)=>{let sum=0,amp=0.005,f=2;for(let i=0;i<4;i++){sum+=amp*Math.sin(x*f+0.7*i)*Math.cos(z*f-0.4*i);amp*=0.5;f*=2;}return 0.025+sum;};
  for(let i=0;i<200;i++){const x=Math.sin(i*31)*8,z=Math.cos(i*17)*8;max=Math.max(max,Math.abs(copy.paperY(x,z)-glslJS(x,z)));}
  expect(max).toBeLessThan(1e-4);console.log('PAPER_CPU_GPU_MAX_ERROR',max);
});
import { ridgeY,ridgeConstants,RIDGE_GLSL } from '../src/scenes/parts/s09-world';
import { PLATE_GLSL } from '../src/scenes/parts/s10-world';
test('S09 retained ridge CPU/GPU formula: same seeded constants at 200 points',()=>{
 expect(RIDGE_GLSL).toContain('ridgeY');let max=0;
 for(let i=0;i<200;i++){
  const k=i%22,sx=960+960*Math.sin(i*3.4),c=ridgeConstants(k);
  const hill=1+1.9*Math.exp(-(((sx-1010)/430)**2))*Math.min(1,k/3),amp=c.variation*hill*Math.exp(-k*0.02);
  const x=(sx-134)/208+c.ph,local=x-Math.floor(x);
  const wave=-145*Math.exp(-(((local-0.83)/0.07)**2))+70*Math.exp(-(((local-0.4)/0.15)**2));
  const gpu=-0.35-wave*amp/100;max=Math.max(max,Math.abs(ridgeY(k,sx)-gpu));
 }
 console.log('RIDGE_CPU_GPU_MAX_ERROR',max);expect(max).toBeLessThan(1e-4);
});
test('S10 retained plate transform CPU/GPU formula: 200 points',()=>{
 expect(PLATE_GLSL).toContain('plateToWorld');let max=0;
 for(let n=0;n<200;n++){
  const i=n%19,p={x:Math.sin(n)*2,y:Math.cos(n)*6,z:Math.sin(n*3)*0.2},c=Math.cos(-0.15),s=Math.sin(-0.15),l=Math.hypot(1,1.2);
  const gpu={x:i*1.45/l+c*p.x+s*p.z,y:p.y,z:-i*1.45*1.2/l-s*p.x+c*p.z},cpu=plateToWorld(i,p);
  max=Math.max(max,Math.abs(gpu.x-cpu.x),Math.abs(gpu.y-cpu.y),Math.abs(gpu.z-cpu.z));
 }
 console.log('PLATE_CPU_GPU_MAX_ERROR',max);expect(max).toBeLessThan(1e-4);
});
test('S11 rainfall CPU/GPU formula: 200 point/time queries',()=>{
 expect(rain.RAIN_GLSL).toContain('fallHeight');const glyphs=rain.rainLyrics(voice).flatMap(r=>r.layout.glyphs);let max=0;
 for(let i=0;i<200;i++){
  const g=glyphs[i%glyphs.length]!,age=i/113,dt=afterBeats(audio,g.t0,0.45)-g.t0,name=g.word.w.toLowerCase();
  let gpu=9-9*age*age/(dt*dt);
  if(name==='sky')gpu=0.8*age;
  else if(age>=dt&&name!=='falling'){const u=age-dt,w=2*Math.PI*10;gpu=u>=0.1?0:0.1*Math.sin(Math.PI*u/0.1)*Math.exp(-0.5*w*u)*Math.cos(w*Math.sqrt(0.75)*u);}
  max=Math.max(max,Math.abs(gpu-rain.fallLetter(audio,g,g.t0+age).height));
 }
 console.log('RAIN_CPU_GPU_MAX_ERROR',max);expect(max).toBeLessThan(1e-4);
});
test('carried pass and why never reveal unborn letters after their cuts',()=>{
 for(const t of [T.wallStart,T.wallStart+0.05,T.wallStart+0.3]){
  const word=voice.line('So I run the tests, I’m waiting for a pass').words.at(-1)!,times=letterTimes(word);
  for(const g of glass.passIncoming(voice,T,t).aff)expect(t).toBeGreaterThanOrEqual(times[g.i]!.t0);
 }
 const word=voice.line('Undefined, undefined, and I don’t know why').words.at(-1)!,times=letterTimes(word);
 for(const t of [T.rerunStart,T.rerunStart+0.3,T.rerunStart+0.6])for(const g of whyIncoming(voice,T,t).aff)expect(t).toBeGreaterThanOrEqual(times[g.i]!.t0);
});

import { affineBounds } from '../src/scenes/parts/s09-type';
import { SolidText } from '../src/kit/solidtype';
import * as THREE from 'three';
function disjoint(a:{x:number;y:number;w:number;h:number},b:{x:number;y:number;w:number;h:number}) {
  return a.x+a.w<=b.x || b.x+b.w<=a.x || a.y+a.h<=b.y || b.y+b.h<=a.y;
}
// An ink rectangle is projected as a quadrilateral. Its screen AABB may overlap
// a neighbouring tilted quadrilateral without the projected ink rectangles intersecting.
function inkQuad(ch:string,axes:{wdth:number;wght:number},m:readonly number[]) {
  const b=runInkBounds(varRun(ch,100,axes));
  return [[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]].map(([x,y])=>[m[0]!*x!+m[2]!*y!+m[4]!,m[1]!*x!+m[3]!*y!+m[5]!] as [number,number]);
}
function quadDisjoint(a:[number,number][],b:[number,number][]) {
  return [a,b].some(q=>q.some((p,i)=>{
    const r=q[(i+1)%q.length]!,nx=p[1]-r[1],ny=r[0]-p[0];
    const A=a.map(p=>p[0]*nx+p[1]*ny),B=b.map(p=>p[0]*nx+p[1]*ny);
    return Math.max(...A)<=Math.min(...B)+1e-8 || Math.max(...B)<=Math.min(...A)+1e-8;
  }));
}
test('R2 S09 all projected ink rectangles are disjoint at 48.45 and 48.68',()=>withCanvas(()=>{
  for(const t of [48.45,48.68]) {
    const ly=scope.scopeLyrics(voice,T),rig=new Rig();rig.set(scope.scopeCamera(audio,t,T));
    const boxes=ly.layout.glyphs.filter(g=>g.word!==ly.pass && t>=g.t0).map(g=>{
      const c=new FakeCanvas();drawPathText(c.ctx,rig,ly.path,{...ly.layout,glyphs:[g]},t,
        {mode:'lie',normal:()=>({x:0,y:0,z:1}),base:'paper',on:'ink',pop:0,axes:g=>voice.form(g.word,t).axes});
      return {name:g.ch,quad:inkQuad(g.ch,voice.form(g.word,t).axes,c.transforms[0]!)};
    });
    const spec=scope.passCarry(voice,T),glyphs=scope.passFrame(voice,T,t),born=ly.layout.glyphs.filter(g=>g.word===ly.pass);
    for(const g of glyphs)if(t>=born[g.i]!.t0)boxes.push({name:'pass:'+g.ch,quad:inkQuad(g.ch,spec.axes,[g.a,g.b,g.c,g.d,g.e,g.f])});
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      if(!quadDisjoint(boxes[i]!.quad,boxes[j]!.quad))console.log('OVERLAP',t,boxes[i],boxes[j]);
      expect(quadDisjoint(boxes[i]!.quad,boxes[j]!.quad)).toBe(true);
    }
    const aabbs=boxes.map(b=>{const x=Math.min(...b.quad.map(p=>p[0])),y=Math.min(...b.quad.map(p=>p[1]));return {name:b.name,x,y,w:Math.max(...b.quad.map(p=>p[0]))-x,h:Math.max(...b.quad.map(p=>p[1]))-y};});
    let overlaps=0,passOverlaps=0;for(let i=0;i<aabbs.length;i++)for(let j=i+1;j<aabbs.length;j++)if(!disjoint(aabbs[i]!,aabbs[j]!)){overlaps++;if(aabbs[i]!.name.startsWith('pass:')!==aabbs[j]!.name.startsWith('pass:'))passOverlaps++;}
    console.log('R2_S09_BOX_METHOD',JSON.stringify({t,projected_quad_intersections:0,axis_aligned_envelope_intersections:overlaps,pass_vs_other_aabb_intersections:passOverlaps}));
    expect(Math.max(...glyphs.map(g=>{const b=affineBounds(spec.text,spec.axes,[g]);return b.x+b.w;}))).toBeLessThanOrEqual(1824.00001);
  }
}));
test('R2 S12 clear words move offscreen before count; foreground lyric and solids do not overlap',()=>withCanvas(()=>{
  const count=voice.line('Clear the cache and count to ten').words[4]!.start,rig=new Rig();rig.set(copy.cameraAt(voice,count-1e-6,T));
  const clear=clearLyrics(voice,count-1e-6);
  const box=drawPathText(new FakeCanvas().ctx,rig,clear.path,clear.layout,count-1e-6,{mode:'lie',normal:()=>({x:0,y:1,z:0}),base:'paper',on:'ink',pop:0,axes:g=>voice.form(g.word,count).axes}).bbox;
  expect(!box || box.x>=1920 || box.x+box.w<=0 || box.y>=1080 || box.y+box.h<=0).toBe(true);
  for(const t of [65.50,66.10,66.70,67.00]) {
    rig.set(copy.cameraAt(voice,t,T));const ly=countLyrics(voice);
    const b=drawPathText(new FakeCanvas().ctx,rig,ly.path,ly.layout,t,{mode:'stand',base:'paper',on:'ink',pop:0,minPx:50,maxPx:110,axes:g=>voice.form(g.word,t).axes}).bbox;
    for(let k=0;k<11;k++){
      const state=copy.numberAt(voice,k,t);if(!state.visible)continue;
      const text=new SolidText(String(k+1),{capH:state.capH,axes:state.axes,depth:0.2,bevel:k===10?0:0.015,material:new THREE.MeshBasicMaterial()});
      text.group.position.set(state.x,state.y,state.z);text.group.rotation.x=state.rx;
      const p=text.letters.flatMap((_,i)=>text.letterCorners(i)).map(p=>rig.proj(p.x,p.y,p.z)).filter(p=>p!==null);
      if(b && p.length){const x=Math.min(...p.map(p=>p.x)),y=Math.min(...p.map(p=>p.y)),n={x,y,w:Math.max(...p.map(p=>p.x))-x,h:Math.max(...p.map(p=>p.y))-y};
        if(!disjoint(b,n))console.log('S12_OVERLAP',t,b,n);expect(disjoint(b,n)).toBe(true);}
      text.dispose();
    }
  }
}));
test('R2 finite line light CPU/GLSL parity at 200 points',()=>{
  expect(copy.LINE_GLSL).toContain('copierLine');let max=0;
  const a={x:-1.7,y:0.08,z:0.2},b={x:1.7,y:0.08,z:0.2},n={x:0,y:1,z:0};
  for(let i=0;i<200;i++){
    const p={x:Math.sin(i*3.1)*5,y:0,z:Math.cos(i*1.7)*3};
    const u=Math.max(0,Math.min(1,((p.x-a.x)*(b.x-a.x))/((b.x-a.x)**2)));
    const d=Math.hypot(a.x+u*(b.x-a.x)-p.x,0.08,0.2-p.z);
    const js=2.2*Math.max(0,0.08/d)/(1+(d/0.6)**2);
    max=Math.max(max,Math.abs(copy.lineIlluminance(p,n,a,b)-js));
  }
  expect(max).toBeLessThan(1e-4);console.log('R2_LINE_CPU_GPU_MAX',max);
});
test('R2 S12 exposure: five lit samples on desk/paper and five geometric key shadows',()=>{
  const rows=[];
  for(const t of [60.30,60.70,62.50])for(const surface of ['table','paper'] as const) {
    const active=copy.scanAt(voice,t).k,k=Math.max(0,active-1),pose=copy.sheetAt(voice,k,t);
    const rotation=new THREE.Matrix4().makeRotationY(pose.ry),normals:THREE.Vector3[]=[];
    const points=Array.from({length:5},(_,i)=>{
      const x=-0.8+0.4*i,z=0.6,h=1e-4;
      if(surface==='table'){normals.push(new THREE.Vector3(0,1,0));return {x:active*copy.PITCH+x,y:0,z};}
      const dx=(copy.paperY(x+h,z)-copy.paperY(x-h,z))/(2*h),dz=(copy.paperY(x,z+h)-copy.paperY(x,z-h))/(2*h);
      normals.push(new THREE.Vector3(-dx,1,-dz).normalize().transformDirection(rotation));
      const p=new THREE.Vector3(x,copy.paperY(x,z),z).applyMatrix4(rotation).add(new THREE.Vector3(pose.x,pose.y,pose.z));return {x:p.x,y:p.y,z:p.z};
    });
    const tones=points.map((p,i)=>copy.lightTone(voice,t,p,normals[i]!));
    for(const x of tones){expect(x).toBeGreaterThanOrEqual(0.80);expect(x).toBeLessThanOrEqual(0.92);}rows.push({t,surface,points,tones});
  }
  // A standing solid numeral supplies real occluders, not an arbitrary shadow coefficient.
  const t=65.50,pose=copy.numberAt(voice,0,t),text=new SolidText('1',{capH:pose.capH,axes:pose.axes,depth:0.2,bevel:0.015,material:new THREE.MeshBasicMaterial()});
  text.group.position.set(pose.x,pose.y,pose.z);text.group.rotation.x=pose.rx;text.group.updateMatrixWorld(true);
  const mesh=text.letters[0]!.mesh,attr=mesh.geometry.getAttribute('position'),d=new THREE.Vector3(copy.KEY_DIR.x,copy.KEY_DIR.y,copy.KEY_DIR.z),shadows=[];
  for(let i=0;i<attr.count-2 && shadows.length<5;i+=3){
    const p=new THREE.Vector3();for(let j=0;j<3;j++)p.add(new THREE.Vector3().fromBufferAttribute(attr,i+j).applyMatrix4(mesh.matrixWorld));p.divideScalar(3);
    if(p.y<0.5)continue;const ground=p.clone().addScaledVector(d,-p.y/d.y);ground.y=0.00001;
    if(new THREE.Raycaster(ground,d).intersectObject(text.group,true).length===0)continue;
    const point={x:ground.x,y:0,z:ground.z},tone=copy.lightTone(voice,t,point,{x:0,y:1,z:0},0);
    expect(tone).toBeGreaterThanOrEqual(0.15);expect(tone).toBeLessThanOrEqual(0.30);shadows.push({point,tone});
  }
  expect(shadows).toHaveLength(5);text.dispose();console.log('R2_EXPOSURE',JSON.stringify({lit:rows,shadows}));
});

if(process.env.G4_PIXEL_STATS==='1')test('R2 rendered PNG contrast, no off-bar white pixels and clay exit satisfy thresholds',async()=>{
  const stats=await Bun.file(new URL('../../out/v6-g4/pixel-statistics.json',import.meta.url)).json();
  for(const row of stats.s10){expect(row.inside_pixels).toBeGreaterThan(0);expect(row.ring_pixels).toBeGreaterThan(0);expect(row.difference).toBeGreaterThanOrEqual(0.45);}
  for(const row of stats.s12)expect(row.bright_outside_bar_plus_4px).toBe(0);
  expect(stats.c12.sample_pixels).toBeGreaterThan(0);expect(stats.c12.ratio).toBeGreaterThanOrEqual(0.95);expect(stats.pass).toBe(true);
});

test('R2 S12 foreground lyrics retain the common 50–110px projected capital height',()=>withCanvas(()=>{
  for(const t of [65.50,66.10,66.70,67.00]){
    const rig=new Rig();rig.set(copy.cameraAt(voice,t,T));const ly=countLyrics(voice),c=new FakeCanvas();
    drawPathText(c.ctx,rig,ly.path,ly.layout,t,{mode:'stand',base:'paper',on:'ink',pop:0,minPx:50,maxPx:110,axes:g=>voice.form(g.word,t).axes});
    const glyphs=ly.layout.glyphs.filter(g=>t>=g.t0);
    c.transforms.forEach((m,i)=>{const axes=voice.form(glyphs[i]!.word,t).axes,cap=varRun('H',100,axes).capH,height=Math.hypot(m[2]!,m[3]!)*cap;
      expect(height).toBeGreaterThanOrEqual(50-0.1);expect(height).toBeLessThanOrEqual(110+0.1);});
  }
}));
