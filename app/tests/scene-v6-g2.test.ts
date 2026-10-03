import {describe,expect,test} from 'bun:test';
import './kit-pathtext.test';
import {loadStrokeFonts,writtenLength} from '../src/engine/stroke';
import {AudioData} from '../src/engine/audio';import {Lyrics} from '../src/engine/lyrics';
import {afterBeats} from '../src/kit/time';import {letterTimes,pathAt,tangentAt,drawPathText} from '../src/kit/pathtext';
import {FakeCanvas,withCanvas} from './kit-pathtext.test';
import {Voice} from '../src/kit/lyric-moves';import {varRun} from '../src/kit/vartype';
import {primError,CUT,HANDOFF} from '../src/kit/handoff';
import {mulberry32} from '../src/engine/util';
import {MONTH_SOURCE} from '../src/kit/content';
import {projectedBounds} from '../src/scenes/parts/s05-print';
import * as S4 from '../src/scenes/parts/s04-city-model';
import * as S5 from '../src/scenes/parts/s05-world';
import * as S6 from '../src/scenes/parts/s06-world';
import * as S7 from '../src/scenes/parts/s07-terrain';
import {platformTimes} from '../src/scenes/parts/s05-platform-model';import {resolveCTimes} from '../src/scenes/parts/s06-timing';
import aj from '../../data/audio.json';import lj from '../../data/lyrics.json';
// A minimal SVG DOM adapter loads the production stroke-font outlines in Bun.
const decode=(s:string)=>s.replace(/&#x([0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(+v)).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const attrs=(tag:string)=>{const a=new Map<string,string>();for(const m of tag.matchAll(/([\w-]+)="([^"]*)"/g))a.set(m[1]!,decode(m[2]!));return {getAttribute:(k:string)=>a.get(k)??null};};
const saved={fetch:globalThis.fetch,DOMParser:globalThis.DOMParser};
try{globalThis.DOMParser=class{parseFromString(s:string){return {querySelector:(name:string)=>attrs(s.match(new RegExp('<'+name+'\\b[^>]*>'))![0]),querySelectorAll:()=>Array.from(s.matchAll(/<glyph\b[^>]*>/g),m=>attrs(m[0]))};}} as any;
  globalThis.fetch=(async(url:string)=>new Response(await Bun.file(new URL('../public/'+url,import.meta.url)).arrayBuffer())) as any;await loadStrokeFonts();
}finally{Object.assign(globalThis,saved);}
const a=new AudioData(aj),l=new Lyrics(lj),C=S4.cityTimes(a,l),P=platformTimes(a,l),T=resolveCTimes(a,l),v=new Voice(l,a);
const error=(A:any,B:any)=>{const e=primError(A,B);expect(e.px).toBeLessThanOrEqual(2);expect(e.size).toBeLessThanOrEqual(.02);return e;};
const area=(b:{w:number;h:number})=>b.w*b.h/(1920*1080);

describe('V6 G2 / worlds, projected geometry and seek determinism',()=>{
  test('S04 first frame is a flat world and the actual month projects onto GRID04',()=>{
    error(S4.entryPrim(C.start,a,C),{kind:'rect',...CUT.grid04});for(let i=0;i<32;i++)expect(S4.blockHeight(i,C.start,a,C)).toBe(0);
    expect(S4.cityState(a,afterBeats(a,C.start,2),C).extrude).toBe(1);
  });
  test('200 GLSL-translated calendar centers equal CPU dates',()=>{
    const expr=S4.CITY_GLSL.match(/return vec3\((.*)\);}/)![1]!.replace(/mod\(/g,'mod(').replace(/floor\(/g,'Math.floor(');
    const f=new Function('day','mod','const slot=4+day-1;return ['+expr+'];'),rng=mulberry32(404);
    for(let i=0;i<200;i++){const day=1+Math.floor(rng()*32),d=S4.dateBlock(day),g=f(day,(x:number,n:number)=>x%n);expect(Math.max(Math.abs(g[0]-d.x),Math.abs(g[1]),Math.abs(g[2]-d.z))).toBeLessThan(1e-4);}
  });
  test('200 GLSL-translated ledges/drawers/stone origins equal CPU geometry',()=>{
    const vec=(name:string,args:string)=>new Function(...args.split(','),'return ['+S5.WORLD_GLSL.match(new RegExp(name+'\\([^)]*\\) \\{ return vec3\\((.*?)\\);'))![1]+'];');
    const lo=vec('ledgeLo','i,indent'),hi=vec('ledgeHi','i,indent,len'),drawer=vec('drawerLo','k,outAmount'),stone=vec('stoneOrigin','j'),rng=mulberry32(505);
    for(let n=0;n<200;n++){const i=18+Math.floor(rng()*27),text=MONTH_SOURCE[i]!,indent=text.length-text.trimStart().length,b=S5.ledgeBox(i),L=lo(i,indent),H=hi(i,indent,text.trimStart().length);expect([b.lo.x,b.lo.y,b.lo.z]).toEqual(L);expect([b.hi.x,b.hi.y,b.hi.z]).toEqual(H);const k=n%3,t=P.start+rng()*(P.end-P.start),D=S5.drawerBox(k,t,a,P),G=drawer(k,S5.drawerOut(k,t,a,P));expect([D.lo.x,D.lo.y,D.lo.z]).toEqual(G);const j=n%5,S=S5.wordStone(j,l,a);expect([S.lo.x,S.lo.y,S.lo.z]).toEqual(stone(j));}
  });
  test('200 GLSL-translated row and keyboard samples agree within 1e-4',()=>{
    const row=new Function('k','return ['+S6.WORLD_GLSL.match(/rowStart.*?vec3\((.*?)\)/)![1]+'];');
    const source=S7.HEIGHT_GLSL.replace(/^float keyHeight\([^)]*\)/,'').replace(/sin\(/g,'Math.sin(').replace(/cos\(/g,'Math.cos('),height=new Function('x','z','enter','beat','kick','landing',source),rng=mulberry32(707);
    for(let n=0;n<200;n++){const k=n%3;expect(Object.values(S6.rowLine(k)[0])).toEqual(row(k));const x=rng()*15-7.5,z=rng()*10-5,beat=rng()*40,kick=rng(),land=rng(),e=n%4===0;expect(Math.abs(S7.keyHeight(x,z,e,beat,kick,land)-height(x,z,e,beat,kick,land))).toBeLessThan(1e-4);}
  });
  test('world functions, cameras and lyric layout are invariant to seek order',()=>{
    const functions=[(t:number)=>S4.cityState(a,t,C),(t:number)=>S4.cameraAt(a,t,C),(t:number)=>S4.cityLyrics(l,a,C),(t:number)=>S5.cameraAt(t,a,l),(t:number)=>S5.clawdAt(t,a,l),(t:number)=>S5.leadLayout(l,a),(t:number)=>S6.penAt(t,a,T),(t:number)=>S6.cameraAt(t,a,T),(t:number)=>S6.checkLight(t,T),(t:number)=>S7.cameraAt(a,t,T).matrixWorld.toArray(),(t:number)=>S7.keyTop(S7.ENTER,t,a,T)];
    for(const fn of functions){const t=(P.scroll+P.end)/2,result=fn(t);fn(C.start);fn(T.end);fn(T.checks[1]!);expect(fn(t)).toEqual(result);expect(fn(t)).toEqual(result);}
  });
});

describe('V6 G2 / vocal timing and world-attached text',()=>{
  test('R2 letters are born exactly where the cursor passes at letterTimes, including the hyphen',()=>{
    const lay=S4.cityLyrics(l,a,C),inverse=S4.inverseTravel(a,C);for(const set of [...lay.leadWords,lay.count,...lay.dayWords,...S5.leadLayouts(l,a)])for(const g of set.glyphs)expect(g.t0).toBeGreaterThanOrEqual(g.word.start);
    const times=letterTimes({...l.get('thirty-second day').words[2]!,w:'THIRTY-SECOND'});
    expect(lay.count.capH).toBe(1.6);expect(lay.count.glyphs).toHaveLength(13);
    lay.count.glyphs.forEach((g,i)=>{expect(g.t0).toBe(times[i]!.t0);expect(Math.abs(g.t0-inverse(g.s))).toBeLessThan(1/60);
      const P=S4.letterBirthPoint(i,a,l,C),Q=S4.cursorAt(g.t0,a,C);expect(Math.hypot(P.x-Q.x,P.y-Q.y)).toBeLessThan(1e-6);
      const run=varRun(g.ch,100,v.form(g.word,g.word.end).axes);expect(g.w).toBeCloseTo(run.glyphs[0]!.adv*1.6/run.capH,8);
      if(i)expect(g.s).toBeGreaterThanOrEqual(lay.count.glyphs[i-1]!.s);});
    for(const w of S5.stoneWords(l)){expect(S5.stoneLetters(w,w.start-1e-6).every(s=>!s.visible)).toBe(true);letterTimes(w).forEach((g,i)=>expect(S5.stoneLetters(w,g.t0-1e-6)[i]!.visible).toBe(false));}
    for(const e of S7.keyEvents(T)){expect(e.at).toBeGreaterThanOrEqual(e.word.start);expect(S7.keyPress(e.at-1e-6,e.at)).toBe(0);expect(S7.keyPress(e.at+.03,e.at)).toBeLessThan(0);}
  });
  test('crack has six deterministic segments of total length 2.6 and drawers pull on the specified beats',()=>{
    const points=S5.crackPath();expect(points).toHaveLength(7);expect(points).toEqual(S5.crackPath());let length=0;for(let i=1;i<points.length;i++)length+=Math.hypot(points[i]!.x-points[i-1]!.x,points[i]!.y-points[i-1]!.y);expect(length).toBeCloseTo(2.6,10);
    const at=l.get('crack my claws').words[2]!.start;expect(S5.crackProgress(at-1e-6,l)).toBe(0);expect(S5.crackProgress(at+.24,l)).toBe(1);
    for(let k=0;k<3;k++){const at=P.drawers[k]!;expect(S5.drawerOut(k,at-1e-6,a,P)).toBe(0);expect(S5.drawerOut(k,afterBeats(a,at,.7),a,P)).toBe(1.2);}
  });
  test('Clawd lands on each word before the following onset',()=>{
    const words=S5.stoneWords(l);for(let j=0;j<words.length;j++){const at=S5.landingAt(j,a,l),b=S5.wordStone(j,l,a),p=S5.clawdAt(at,a,l);expect(at).toBeLessThan(words[j+1]?.start??P.end);expect(Math.abs(p.y-b.hi.y-S5.stoneSink(j,at,a,l))).toBeLessThan(1e-5);expect(p.x).toBeCloseTo((b.lo.x+b.hi.x)/2,6);}
  });
  test('drawer landing compresses Clawd by 15 percent, then releases before the sung stones',()=>{
    const at=afterBeats(a,afterBeats(a,P.drawers[0],.7),.45),b=S5.drawerBox(1,at,a,P),p=S5.clawdAt(at,a,l);
    expect(p.y).toBeCloseTo(b.hi.y,6);expect(S5.clawdSquish(at-1e-6,a,l)).toBe(0);
    expect(S5.clawdSquish(at,a,l)).toBeCloseTo(.15,10);expect(S5.clawdSquish(at+.14,a,l)).toBeLessThan(.03);
  });
  test('plotter writes real readable font outlines with the same pen head and no early strokes',()=>{
    for(const writing of S6.writings(T))for(const [i,[t0,t1]] of writing.times.entries()){
      const [lo]=writing.st.charRange[i]!;expect(writtenLength(writing.st,writing.times,t0-1e-6)).toBeLessThanOrEqual(lo+1e-6);
      if(t1<=t0)continue;const t=(t0+t1)/2,active=S6.writingAt(t,T);if(!active)continue;const p=S6.penAt(t,a,T);expect(Math.hypot(p.x-active.point.x,p.z-active.point.z)).toBeLessThanOrEqual(.01);
    }
  });
  test('measured check hits stay before the next cut and the light lowers from 62 to 11 degrees',()=>{
    expect(T.checks).toHaveLength(3);T.checks.forEach(t=>expect(t).toBeLessThan(T.keyboard));expect(T.checks[2]).toBe(T.checkWords[2]);
    expect(S6.checkLight(T.checks[0]!-1e-6,T).elevation).toBe(62);expect(S6.checkLight(T.checks[2]!+.18,T).elevation).toBe(11);
  });
  test('LOOKING presses seven consecutive keys from left to right at letterTimes',()=>{expect(S7.LOOKING_KEYS).toHaveLength(7);const events=S7.keyEvents(T).filter(e=>e.word.w==='looking'),times=letterTimes(T.claws.words[7]!);events.forEach((e,i)=>{expect(e.at).toBe(times[i]!.t0);if(i)expect(e.key.x).toBeGreaterThan(events[i-1]!.key.x);expect(e.key.row).toBe(events[0]!.key.row);});});
  test('carry table assigns no cross-cut carry words to C3-C7; sub-frame back tail remains on Enter',()=>{
    for(const [end,line] of [[C.end,'thirty-second day'],[P.end,'crack my claws'],[T.keyboard,'Read the code'],[T.end,'Claws on the keys']] as const)expect(l.get(line).words.at(-1)!.end-end).toBeLessThan(1/60);
  });
});

describe('V6 G2 / projected composition and handoffs',()=>{
  test('R2 C4 is 9 px at the continuous cut and 14 px at 5/3 measured beats',()=>{error(S4.exitPrim(C.end,a,C),S5.entryPrim(P.start,a,l));const b=S5.entryPrim(afterBeats(a,P.start,5/3),a,l);expect(b.kind).toBe('rect');if(b.kind==='rect')expect(b.w/16).toBeCloseTo(14,1);
    const start=afterBeats(a,C.end,-1),mid=(start+C.end)/2;expect(S4.clawdRect(a,mid,C).w/16).toBeCloseTo(6+3*.25,8);
    const inMid=(P.start+afterBeats(a,P.start,5/3))/2,B=S5.entryPrim(inMid,a,l);if(B.kind==='rect')expect(B.w/16).toBeCloseTo(9+5*.75,8);
  });
  test('C5 and C6 use actual projected line endpoints and pen/key centers',()=>{error(S5.exitPrim(P.end-1/60,a,l),S6.entryPrim(T.todo,a,T));error(S6.exitPrim(T.keyboard-1/60,a,T),S7.entryPrim(T.keyboard,a,T));});
  test('C7 Enter top covers all four viewport corners and its own four corners are outside',()=>{expect(S7.enterCovers(T.end-1/60,a,T)).toBe(true);const ps=S7.enterCorners(T.end-1/60,a,T);for(const p of ps)expect(p.x<0||p.x>1920||p.y<0||p.y>1080).toBe(true);error(S7.exitPrim(T.end-1/60,a,T),{kind:'rect',x:0,y:0,w:1920,h:1080});});
  test('source stone steps and CHECK cover at least 30 percent of the projected frame',()=>{const stones=S5.stoneBounds(P.scroll+.6*(P.end-P.scroll),a,l),check=S6.checkBounds(T.checkWords[1]!+.03,a,T);expect(area(stones)).toBeGreaterThanOrEqual(.3);expect(area(check)).toBeGreaterThanOrEqual(.3);console.log('G2 projected areas',JSON.stringify({stones:area(stones),check:area(check)}));});
  test('keyboard terrain occupies at least 30 percent before the Enter dive',()=>{expect(area(S7.keyboardLayout(a,T.keyboard+.6*(T.dive-T.keyboard),T).field)).toBeGreaterThanOrEqual(.3);});
  test('OCTOBER world monument exceeds 45 percent frame width at rise plus half a beat',()=>{
    const t=afterBeats(a,C.rise,.5),cam=S4.cameraAt(a,t,C),ox=-20,oz=-8*S4.CELL,angle=Math.atan2(cam.pos.x-ox,cam.pos.z-oz),word=l.get('thirty-second day').words[5]!,run=varRun('OCTOBER',100,{wdth:87.5,wght:900}),width=run.width*6.5/run.capH*v.form(word,t).axes.wdth/87.5;
    const pts=[0,width].flatMap(x=>[0,6.5].map(y=>({x:ox+Math.cos(angle)*x,y,z:oz-Math.sin(angle)*x}))),b=projectedBounds(S4.cityRig(a,t,C),pts);expect(b.w).toBeGreaterThanOrEqual(1920*.45);
    console.log('G2 OCTOBER projected width',b.w);
  });
  test('R2 C4 adjacent-frame pixel-size rates and center directions meet the revised motion limits',()=>{
    const h=1e-4,velocity=(fn:(t:number)=>any,t:number)=>{const A=fn(t-h),B=fn(t+h);return {x:(B.x+B.w/2-A.x-A.w/2)/(2*h),y:(B.y+B.h/2-A.y-A.h/2)/(2*h),px:(B.w-A.w)/(32*h)};};
    const out=velocity(t=>S4.clawdRect(a,t,C),C.end-1/60),incoming=velocity(t=>S5.entryPrim(t,a,l),P.start+1/60),ratio=incoming.px/out.px;
    const angle=Math.acos((out.x*incoming.x+out.y*incoming.y)/Math.hypot(out.x,out.y)/Math.hypot(incoming.x,incoming.y))*180/Math.PI;
    expect(ratio).toBeGreaterThanOrEqual(.85);expect(ratio).toBeLessThanOrEqual(1.15);expect(angle).toBeLessThanOrEqual(15);
    expect(S4.exitVelocity(C.end-.05,a,C).w).toBeGreaterThan(0);console.log('G2 C4 motion',JSON.stringify({ratio,angle,out,incoming,rawFrameError:primError(S4.exitPrim(C.end-1/60,a,C),S5.entryPrim(P.start,a,l))}));
  });
  test('R2 two src lyric rows fit their real drawer, remain attached, and are separated by 0.5',()=>{
    const layouts=S5.leadLayouts(l,a);expect(layouts).toHaveLength(2);expect(layouts.map(s=>s.glyphs.filter(g=>g.i===0).map(g=>g.word.w))).toHaveLength(2);
    for(const [row,lay] of layouts.entries()){expect(lay.capH).toBe(.3);expect(lay.s1-lay.s0).toBeLessThanOrEqual(4.4);
      for(const t of [14.9,15.3,15.8]){const path=S5.leadPath(t,a,P,row),b=S5.drawerBox(0,t,a,P);expect(path.pts[0]!.x).toBe(b.lo.x);expect(path.pts[0]!.y).toBe(b.hi.y);expect(path.pts[0]!.z).toBeCloseTo(b.hi.z-row*.5,10);}}
  });
  test('R2 C composition reserves the complete unclipped five-stone hull with 48 px inset',()=>{
    for(const t of [P.scroll,16.8,17.0,17.23]){const b=S5.stoneBounds(t,a,l),hero=S5.entryPrim(t,a,l);expect(b.x).toBeGreaterThanOrEqual(48-1e-5);expect(b.y).toBeGreaterThanOrEqual(48-1e-5);expect(b.x+b.w).toBeLessThanOrEqual(1872+1e-5);expect(b.y+b.h).toBeLessThanOrEqual(1032+1e-5);expect(area(b)).toBeGreaterThanOrEqual(.3);if(hero.kind==='rect')expect(hero.w).toBeGreaterThanOrEqual(50);}
  });
  test('R2 full C-section inset also holds at the required C5 landing frame',()=>{
    const b=S5.stoneBounds(P.end-1/60,a,l);expect(b.x).toBeGreaterThanOrEqual(48);expect(b.y).toBeGreaterThanOrEqual(48);
    expect(b.x+b.w).toBeLessThanOrEqual(1872);expect(b.y+b.h).toBeLessThanOrEqual(1032);
  });
  test('R2 C6 roll is -0.26 at both endpoints and the last 0.1 s is still',()=>{
    const end=S6.cameraAt(T.keyboard-1/60,a,T);expect(end.roll).toBeCloseTo(-.26,10);expect(S6.cameraAt(T.keyboard-.09,a,T)).toEqual(end);
    // Measure the camera roll against a lookAt camera at the same pose.
    const rotation=S7.entryRoll(a,T);expect(rotation).toBeCloseTo(-.26,10);
  });
  test('R2 every module reaches its analytic wave height within one measured beat',()=>{
    const deadline=afterBeats(a,T.keyboard,1);for(const k of S7.KEY_FIELD){expect(S7.keyRise(k,deadline,a,T)).toBe(1);expect(S7.keyRise(k,deadline+1/60,a,T)).toBe(1);}
    const first=S7.WORD_KEYS[0]!,far=S7.KEY_FIELD.find(k=>Math.hypot(k.x-first.x,k.z-first.z)===S7.MAX_KEY_DISTANCE)!;expect(S7.keyRise(far,deadline-1e-6,a,T)).toBe(0);
  });
  test('R2 paper stays exposed as CHECK shadows grow; CPU triangle polygons exclude the solid footprint',()=>{
    const A=S6.checkShadowArea(19.4,T),B=S6.checkShadowArea(20.7,T);expect(B/A).toBeGreaterThanOrEqual(2.5);
    for(const t of [19.4,20.7]){const L=S6.checkLight(t,T);expect(L.intensity*L.dir.y).toBeCloseTo(.9,10);const points=S6.paperSamples(t,T);expect(points.lit).toHaveLength(5);expect(points.shadow).toHaveLength(5);
      for(const p of points.lit){expect(S6.paperToneAt(p,t,T)).toBeGreaterThanOrEqual(.85);expect(S6.paperToneAt(p,t,T)).toBeLessThanOrEqual(.92);}
      for(const p of points.shadow){expect(S6.paperToneAt(p,t,T)).toBeGreaterThanOrEqual(.1);expect(S6.paperToneAt(p,t,T)).toBeLessThanOrEqual(.3);}}
    console.log('G2 CHECK CPU shadow area',JSON.stringify({before:A,after:B,ratio:B/A}));
  });
  test('R2 the five lit src fronts and five actual wall-shadow points meet exposure limits',()=>{
    const {lit,shadow}=S5.cliffSamples(15.3,a,l),normal={x:0,y:0,z:1};expect(lit).toHaveLength(5);expect(shadow).toHaveLength(5);
    for(const p of lit){const tone=S5.surfaceTone(normal,S5.wallShadowAt({...p,z:p.z+.01},15.3,a,l));expect(tone).toBeGreaterThanOrEqual(.8);expect(tone).toBeLessThanOrEqual(.92);}
    for(const p of shadow){expect(S5.wallShadowAt(p,15.3,a,l)).toBe(0);const tone=S5.surfaceTone(normal,0);expect(tone).toBeGreaterThanOrEqual(.1);expect(tone).toBeLessThanOrEqual(.3);}
    expect(.65+.35*S5.LIGHT[2]!).toBeGreaterThanOrEqual(.8); // VoxelClawd's front-face equation.
  });
});

import * as THREE from 'three';
import {WordPlane} from '../src/kit/wordplane';
test('G2 projected lyric cap heights and real WordPlane karaoke are measured',()=>{
  const city=S4.cityLyrics(l,a,C),cityCaps=[...city.leadWords.map(lay=>({lay,path:city.first,mode:'lie'})),...city.dayWords.map(lay=>({lay,path:city.foot,mode:'stand'}))].map(({lay,path,mode})=>{
    const word=lay.glyphs[0]!.word,t=(word.start+word.end)/2,rig=S4.cityRig(a,t,C),P=pathAt(path,lay.s0),u=tangentAt(path,lay.s0),A=rig.proj(P.x,P.y,P.z)!,B=rig.proj(P.x+u.z*lay.capH,P.y,P.z-u.x*lay.capH)!;
    const px=mode==='stand'?lay.capH*A.s:Math.hypot(A.x-B.x,A.y-B.y);expect(px).toBeGreaterThanOrEqual(60);expect(px).toBeLessThanOrEqual(90);return {word:word.w,px};
  });
  const lead=S5.leadPath(14.90,a,P).pts[0]!,capLead=.3*S5.rigAt(14.9,a,l).proj(lead.x,lead.y,lead.z)!.s;
  const r6=S6.rigAt(18.1,a,T),P6=r6.proj(-3.55,.009,-1.28)!,Q6=r6.proj(-3.55,.009,-1.90)!;
  const kt=T.keyboard+.6*(T.dive-T.keyboard),cam=S7.cameraAt(a,kt,T),caps=S7.WORD_KEYS.slice(0,4).map(k=>{const h=S7.keyTop(k,kt,a,T),A=S7.projectPoint(new THREE.Vector3(k.x,h,k.z+.28),cam),B=S7.projectPoint(new THREE.Vector3(k.x,h,k.z+.28-.55),cam);return Math.hypot(A.x-B.x,A.y-B.y);});
  const metrics={city:cityCaps,cliffLead:capLead,plotter:Math.hypot(P6.x-Q6.x,P6.y-Q6.y),keyboard:caps};console.log('G2 projected cap heights',JSON.stringify(metrics));
  expect(capLead).toBeGreaterThanOrEqual(50);expect(capLead).toBeLessThanOrEqual(110);
  expect(metrics.plotter).toBeGreaterThanOrEqual(50);expect(metrics.plotter).toBeLessThanOrEqual(110);
  withCanvas(()=>{const plane=new WordPlane('OCTOBER',{capH:6.5,axes:{wdth:87.5,wght:900},engrave:true}),word=city.october;expect(plane.karaoke({...word,w:'OCTOBER'},word.end)).toBe(1);expect(plane.karaoke({...word,w:'OCTOBER'},word.start-1e-6)).toBe(0);plane.dispose();});
});
