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
