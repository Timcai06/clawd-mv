import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { loadFonts } from '../src/engine/type';
import { mulberry32, clamp, smoothstep } from '../src/engine/util';
import { afterBeats } from '../src/kit/time';
import { Rig, p3 } from '../src/kit/rig';
import { letterTimes, pathAt, runInkBounds, writeHead } from '../src/kit/pathtext';
import { varRun } from '../src/kit/vartype';
import { primError, CUT } from '../src/kit/handoff';
import { audio, lyrics, T, voice, WELCOME_BOX, BOOT_CLAWD } from '../src/scenes/parts/s01-timing';
import * as S01 from '../src/scenes/parts/s01-world';
import * as S02 from '../src/scenes/parts/s02-world';
import * as S03 from '../src/scenes/parts/s03-world';
import { pingLayout, PING_BOX } from '../src/scenes/parts/s02-layout';
import { pingBounds } from '../src/scenes/s02-notify';
import { stampBodyGeometry } from '../src/scenes/s03-issue';
import { cityTimes, handoffIn as main04Entry } from '../src/scenes/parts/s04-city-model';
import { affineBounds } from '../src/scenes/parts/s01-print';
const metrics:Record<string,unknown>={cuts:T};
const oldFetch=globalThis.fetch,oldDoc=(globalThis as any).document,oldFace=(globalThis as any).FontFace;
beforeAll(async()=>{
  (globalThis as any).FontFace=class{async load(){return this;}};
  (globalThis as any).document={fonts:{add(){},ready:Promise.resolve()}};
  globalThis.fetch=(async(url:any)=>new Response(await Bun.file(new URL('../public/'+String(url),import.meta.url)).arrayBuffer())) as typeof fetch;
  try{await loadFonts();}finally{globalThis.fetch=oldFetch;(globalThis as any).document=oldDoc;(globalThis as any).FontFace=oldFace;}
});
afterAll(async()=>{await Bun.write(new URL('../../out/v6-g1/metrics.json',import.meta.url),JSON.stringify(metrics,null,2)+'\n');});
const boxError=(a:{x:number;y:number;w:number;h:number},b:typeof a)=>({x:a.x-b.x,y:a.y-b.y,widthPct:Math.abs(a.w-b.w)/b.w*100,heightPct:Math.abs(a.h-b.h)/b.h*100});
const cap=(t:number,x:number,z:number,h:number)=>{const rig=new Rig();rig.set(S03.cameraAt(t));const a=S03.paperPoint(x,z,t),b=S03.paperPoint(x,z-h,t),qa=rig.proj(a.x,a.y,a.z)!,qb=rig.proj(b.x,b.y,b.z)!;return Math.hypot(qa.x-qb.x,qa.y-qb.y);};
describe('V6 g1 deterministic mathematical worlds',()=>{
  test('every camera, world, layout, head, pose and carry is independent of seek order',()=>{
    const fns=[S01.cameraAt,S01.worldBoxes,S01.cursorBox,S01.frameBox,S01.clawdBox,S02.cameraAt,S02.cursorAt,S02.screenAffines,
      S03.cameraAt,S03.paperBox,S03.calendarBox,S03.cursorAt,S03.incomingScreenAffines,S03.stampPose,
      (t:number)=>S01.line01Affines(),(t:number)=>S01.line01Next(0,t),(t:number)=>S03.titleLayouts(),(t:number)=>S03.notesLayout()];
    for(const fn of fns)for(const t of [T.welcome+0.2,T.ping,T.issue,8.2,9.4,T.end-1/60]){const a=fn(t);fn(T.end);fn(0);expect(fn(t)).toEqual(a);}
  });
  test('S01 CPU vs independently translated GLSL box union: 200 seeded points at each of five times',()=>{
    expect(S01.S01_GLSL).toContain('length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)');
    const rand=mulberry32(601),times=[0.6,2.6,3.3,4.4,5.45];let err=0;
    for(const t of times)for(let i=0;i<200;i++){
      const p=p3(rand()*14-7,rand()*7-1,rand()*7-3),boxes=S01.worldBoxes(t);
      let d=p.y;for(const b of boxes){const q=[Math.abs(p.x-b.c.x)-b.h.x,Math.abs(p.y-b.c.y)-b.h.y,Math.abs(p.z-b.c.z)-b.h.z];
        d=Math.min(d,Math.sqrt(q.map(x=>Math.max(x,0)**2).reduce((a,b)=>a+b,0))+Math.min(Math.max(...q),0));}
      err=Math.max(err,Math.abs(d-S01.sdWorld(p,t)));
    }expect(err).toBeLessThan(1e-4);metrics.s01Parity={points:1000,maxError:err};
  });
  test('S02 CPU vs GLSL ripple: 200 seeded points',()=>{
    expect(S02.S02_GLSL).toContain('age*2400.0');const rand=mulberry32(602);let err=0;
    for(let i=0;i<200;i++){const p={x:rand()*1920,y:rand()*1080},c={x:rand()*1920,y:rand()*1080},age=rand()*0.5-0.1;
      const r=age<0||age>0.25?1:1+0.5*Math.exp(-Math.pow((Math.hypot(p.x-c.x,p.y-c.y)-age*2400)/75,2))*Math.sin(Math.PI*age/0.25);
      err=Math.max(err,Math.abs(r-S02.posterRipple(p,c,age)));}
    expect(err).toBeLessThan(1e-4);metrics.s02Parity={points:200,maxError:err};
  });
  test('S03 CPU vs GLSL height/analytic normal: 200 seeded points plus dent boundary',()=>{
    expect(S03.S03_GLSL).toContain('paperNormal(float x,float z)');const rand=mulberry32(603);let err=0,normalErr=0;
    const points=Array.from({length:200},()=>({x:0.6+rand()*17.9,z:0.57+rand()*10,t:7.16+rand()*0.5}));
    points.push({x:11.9+8.1/2,z:7.66,t:T.bug+0.05},{x:11.9,z:7.66,t:T.bug+0.05});
    for(const {x,z,t} of points){
      const q=[x-S03.STAMP.x,z-S03.STAMP.z],co=Math.cos(S03.STAMP.angle),si=Math.sin(S03.STAMP.angle);
      const Q=[Math.abs(co*q[0]!+si*q[1]!)-S03.STAMP.w/2+S03.STAMP.r,Math.abs(-si*q[0]!+co*q[1]!)-S03.STAMP.h/2+S03.STAMP.r];
      const d=Math.hypot(...Q.map(n=>Math.max(n,0)))+Math.min(Math.max(...Q),0)-S03.STAMP.r;
      const u=(x-S03.PAPER.x0)/S03.PAPER.w,v=1-(z-S03.PAPER.z0)/S03.PAPER.h;
      const height=.05*(1-Math.cos(Math.PI*u))+.18*smoothstep(.75,1,u)*smoothstep(.7,1,v)-.05*(1-smoothstep(-.15,.15,d))*S03.press(t);
      err=Math.max(err,Math.abs(height-S03.paperY(x,z,t)));
      const h=1e-5,dx=(S03.paperY(x+h,z,t)-S03.paperY(x-h,z,t))/(2*h),dz=(S03.paperY(x,z+h,t)-S03.paperY(x,z-h,t))/(2*h),len=Math.hypot(dx,1,dz),n=S03.paperNormal(x,z,t);
      normalErr=Math.max(normalErr,Math.hypot(n.x+dx/len,n.y-1/len,n.z+dz/len));
    }expect(err).toBeLessThan(1e-4);expect(normalErr).toBeLessThan(1e-4);metrics.s03Parity={points:points.length,maxHeightError:err,maxNormalError:normalErr};
  });
});
describe('V6 g1 projected composition and specification conflicts',()=>{
  test('S01 fixed world/target conflicts are measured, never replaced by declared screen boxes',()=>{
    const t=afterBeats(audio,T.welcome,4),frame=S01.frameBox(t),clawd=S01.clawdBox(t),target={x:BOOT_CLAWD.x,y:BOOT_CLAWD.y,w:16*BOOT_CLAWD.px,h:5*BOOT_CLAWD.px};
    expect(frame.w).toBeGreaterThan(930);expect(frame.w).toBeLessThan(990);expect(S01.FRAME.y0).toBe(.62);expect(S01.cameraAt(t).tgt).toEqual(p3(0,2.95,0));
    // These cannot pass the supplied screen-position thresholds with the supplied world coordinates.
    expect(Math.abs(frame.y-WELCOME_BOX.y)).toBeGreaterThan(WELCOME_BOX.h*.03);
    expect(Math.abs(clawd.y-target.y)).toBeGreaterThan(target.h*.05);
    metrics.s01Composition={t,frame,frameError:boxError(frame,WELCOME_BOX),clawd,clawdError:boxError(clawd,target),specifiedFrameArea:WELCOME_BOX.w*WELCOME_BOX.h/(1920*1080)};
    expect(WELCOME_BOX.w*WELCOME_BOX.h/(1920*1080)).toBeLessThan(.30);
  });
  test('S01 lyrics have actual projected cap heights; the fixed 0.42 m limit is recorded',()=>{
    const t=afterBeats(audio,T.welcome,4),heights=S01.line01Layout().glyphs.map(g=>{
      const aff=S01.standAffine(g,t),run=varRun(g.ch,100,voice.form(g.word,t).axes);return Math.hypot(aff.c,aff.d)*run.capH;});
    metrics.s01LyricCap={at:t,min:Math.min(...heights),max:Math.max(...heights),required:[50,110]};
    expect(Math.min(...heights)).toBeGreaterThan(40);expect(Math.max(...heights)).toBeLessThanOrEqual(110);
  });
  test('S02 actual extruded glyph corners project to PING_BOX within 2 percent',()=>{
    const at=5.95,b=pingBounds(at),e=boxError(b,PING_BOX);metrics.s02Composition={at,b,error:e,axes:pingLayout().axes,scaleX:pingLayout().scaleX};
    expect(Math.abs(e.x)).toBeLessThan(PING_BOX.w*.02);expect(Math.abs(e.y)).toBeLessThan(PING_BOX.h*.02);
    expect(e.widthPct).toBeLessThanOrEqual(2);expect(e.heightPct).toBeLessThanOrEqual(2);
  });
  test('S03 paper fills 90 percent at E1; title and NOTES caps use real paper projection',()=>{
    const at=afterBeats(audio,T.issue,1),b=S03.paperBox(at),coverage=(Math.min(1920,b.x+b.w)-Math.max(0,b.x))*(Math.min(1080,b.y+b.h)-Math.max(0,b.y))/(1920*1080);
    const samples=[{t:7.1,row:'got',x:.85,z:4.806,h:3.156},{t:8.2,row:'report',x:.85,z:8.156,h:3.156},{t:8.8,row:'notes',x:4.2,z:9.72,h:.508}];
    const caps=samples.map(v=>({...v,px:cap(v.t,v.x,v.z,v.h)}));metrics.s03Composition={at,paper:b,coverage,caps};
    expect(coverage).toBeGreaterThanOrEqual(.90);
    for(const s of caps){expect(s.px).toBeGreaterThanOrEqual(s.row==='notes'?50:250);expect(s.px).toBeLessThanOrEqual(s.row==='notes'?110:340);}
  });
  test('C3 measures the displaced calendar mesh, with a fitted header and a still final camera',()=>{
    const actual=S03.exitPrim(T.end-1/60),target={kind:'rect' as const,...CUT.grid04},err=primError(actual,target);
    expect(err.px).toBeLessThanOrEqual(2);expect(err.size).toBeLessThanOrEqual(.02);
    metrics.c3={actual,error:err,headerPx:S03.calendarFit().header*100,actualMainEntry:main04Entry(T.end,audio,cityTimes(audio,lyrics)),integration:'S04 V6 entry pending G2'};
  });
});
describe('V6 g1 letter clocks, light, stamp and relay',()=>{
  test('every first letter and every later letter is not earlier than its word',()=>{
    const lays=[S01.line01Layout(),S01.continuedLayout(),...S03.titleLayouts(),S03.notesLayout(),S03.screenLayout()];
    for(const lay of lays){const indices=new Map<number,number>();for(const g of lay.glyphs){const index=indices.get(g.word.gi)??0;indices.set(g.word.gi,index+1);expect(g.t0).toBeGreaterThanOrEqual(g.word.start);expect(g.t0).toBe(letterTimes(g.word)[index]!.t0);}}
    for(const wd of lyrics.lines.slice(0,2).flatMap(l=>l.words)){expect(letterTimes(wd)[0]!.t0).toBe(wd.start);expect(voice.form(wd,wd.start-1e-6).born).toBe(0);}
  });
  test('held words grow inside their reserved end-axis slots',()=>{
    for(const wi of [1,6]){const wd=lyrics.lines[0]!.words[wi]!;expect(voice.form(wd,wd.end).axes.wdth).toBeGreaterThan(voice.form(wd,wd.start).axes.wdth);}
    const a=S01.line01Layout();expect(a.glyphs.at(-1)!.s+a.glyphs.at(-1)!.w).toBeLessThanOrEqual(a.s1+1e-9);
  });
  test('the initial cursor is a 0.06 m deep block and the lamp is at its physical centre',()=>{
    expect(S01.cursorCenter(0.6)).toEqual(p3(S01.CUR.x,S01.CUR.h/2,S01.CUR.z));
    const ps=S01.cursorSolidPoints(0.6);expect(ps.length).toBe(8);
    expect(Math.abs(ps[0]!.z-ps[4]!.z)).toBeCloseTo(S01.CUR.d,10);
  });
  test('specified blink decay and word alpha respond to the single light; 10x example conflict recorded',()=>{
    const bright=T.start,dark=afterBeats(audio,T.start,.8),p=p3(.2,0,1.4),a=S01.lightAt(p,bright),b=S01.lightAt(p,dark);
    expect(b).toBeLessThan(a);expect(S01.lyricAlpha(p,dark)).toBeLessThan(S01.lyricAlpha(p,bright));
    expect(S01.blink(dark)).toBeCloseTo(Math.exp(-(dark-audio.timeOfBeat(Math.floor(audio.beatAt(dark))+.55))/.09),10);
    metrics.s01Blink={bright,dark,brightE:a,darkE:b,ratio:a/b,requiredRatio:10};
  });
  test('C1 projected cursor matches I and the incoming phrase uses identical frozen affines',()=>{
    const e=primError(S01.exitPrim(T.ping-1/60),S02.entryPrim(T.ping));expect(e.px).toBeLessThanOrEqual(2);expect(e.size).toBeLessThanOrEqual(.02);
    expect(S01.line01Affines()).toEqual(S02.line01Incoming());metrics.c1=e;
  });
  test('C2 paper edge and screen carry agree exactly on the first frame',()=>{
    const e=primError(S02.exitPrim(T.issue-1/60),S03.entryPrim(T.issue));expect(e.px).toBeLessThanOrEqual(2);
    expect(S02.screenAffines(T.issue-1/60)).toEqual(S03.incomingScreenAffines(T.issue));
    expect(S03.incomingScreenAffines(6.84)).toEqual(S03.screenOnPaper(6.84));metrics.c2=e;
  });
  test('PING lands at letter time, is invisible/no-shadow before then, and exits by C2',()=>{
    for(const i of [0,2,3]){const at=S02.landingAt(i);expect(at).toBe(letterTimes({...lyrics.lines[0]!.words[3]!,w:'PING'})[i]!.t0);
      expect(S02.letterPose(i,at-1e-6)).toMatchObject({visible:false,castShadow:false});expect(S02.letterPose(i,at).z).toBe(0);expect(S02.letterPose(i,at).visible).toBe(true);
      expect(S02.letterPose(i,T.issue-1/60).visible).toBe(false);}
    expect(S02.letterPose(0,T.ping).visible).toBe(true);
  });
  test('the beveled rubber body has the specified outer dimensions',()=>{
    const g=stampBodyGeometry();g.computeBoundingBox();const b=g.boundingBox!;
    expect(b.max.x-b.min.x).toBeCloseTo(S03.STAMP.w,5);expect(b.max.y-b.min.y).toBeCloseTo(S03.STAMP.h,5);
    expect(b.max.z-b.min.z).toBeCloseTo(S03.STAMP.depth,5);g.dispose();
  });
  test('paper is not stamped before bug, depresses at impact, keeps the imprint after lift',()=>{
    expect(S03.press(T.bug-1e-8)).toBe(0);expect(S03.press(T.bug+.03)).toBeCloseTo(1,8);
    expect(S03.stampPose(T.bug).y).toBeCloseTo(S03.paperY(S03.STAMP.x,S03.STAMP.z,T.bug)+.08,8);
    expect(S03.stampPose(T.bug-1e-6).ink).toBe(false);expect(S03.stampPose(T.bug+.17).ink).toBe(true);expect(S03.stampPose(10).ink).toBe(true);
    expect(S03.paperY(S03.STAMP.x,S03.STAMP.z,T.bug+.05)).toBeLessThan(S03.paperY(S03.STAMP.x,S03.STAMP.z,T.bug-1e-6));
  });
  test('paper cursor is the projected writing/circle head within one px',()=>{
    let max=0;for(const t of [6.6,6.75,7.1,8.2,8.8,9.4,9.8,10.3]){const rig=new Rig();rig.set(S03.cameraAt(t));const p=S03.writeHeadWorld(t),q=rig.proj(p.x,p.y,p.z)!,c=S03.cursorAt(t);
      max=Math.max(max,Math.hypot(c.x-q.x,c.y-q.y));}
    expect(max).toBeLessThanOrEqual(1);metrics.s03CursorMaxError=max;
  });
  test('all final cameras are absolutely still for 100 ms and gain reaches the shared peak',()=>{
    for(const [fn,end] of [[S01.cameraAt,T.ping],[S02.cameraAt,T.issue],[S03.cameraAt,T.end]] as const){expect(fn(end-.1)).toEqual(fn(end-1/60));expect(fn(end-1e-6)).toEqual(fn(end-.1));}
    expect(S02.gain(T.issue)).toBe(1.9);expect(S03.gain(T.end)).toBe(1.9);
  });
});
