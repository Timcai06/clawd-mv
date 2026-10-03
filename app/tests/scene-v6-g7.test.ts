import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { chromium } from 'playwright-core';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import {F,ot} from '../src/engine/type';
import { Rig, p3 } from '../src/kit/rig';
import { afterBeats } from '../src/kit/time';
import { letterTimes, pathAt, writeHead } from '../src/kit/pathtext';
import { hash } from '../src/engine/util';
import { primError, HANDOFF } from '../src/kit/handoff';
import { CREDIT_LINES, AUTHOR } from '../src/kit/credits';
import { resolveReleaseTimes } from '../src/scenes/parts/s17-release-state';
import { lyricPaths, cursorAt } from '../src/scenes/s17-release';
import { buildSwarm, formation, devicesAt, cameraAt, freezeWindow, devicePoint, screenBounds, screenDevice, screenPoints, IMPACT_PX, PUNCH, configureFraming, deviceBounds, commentPose, commentBounds, paletteFlipped, S17_WORLD_GLSL, commitWidth, commentWidth, commentLine, diffHead, zipperShake, type Rasters } from '../src/scenes/parts/s17-swarm';
import { resolveOutroTimes, starState, outroCredits, SIGNATURE_LABEL, CODE_LINE } from '../src/scenes/parts/s18-score';
import { CITY, cityHeight, sunAngle, boxHit, S18_WORLD_GLSL, cursorScreenAt, cursorGainAt, loopTarget, entryPrim, starDirections, STAR_RADIUS, calendarAffine, calendarCam, cameraAt as camera18, clawdAt, lightAt, surfaceTone, S18_LIGHT_GLSL, signatureGlyphs, SIGNATURE, shadowAt } from '../src/scenes/parts/s18-world';
import { DATES, CELL } from '../src/scenes/parts/s04-city-model';
import a from '../../data/audio.json';
import l from '../../data/lyrics.json';
import './kit-pathtext.test';
const audio=new AudioData(a), lyrics=new Lyrics(l), voice=new Voice(lyrics,audio), R=resolveReleaseTimes(audio,lyrics), O=resolveOutroTimes(audio,lyrics);
// Real Canvas raster, real shipped fonts, and runtime errors. No screenshots or image inspection.
const port=5397, server=Bun.spawn(['bunx','vite','--port',String(port),'--strictPort'],{cwd:new URL('..',import.meta.url).pathname,stdout:'ignore',stderr:'ignore',env:{...process.env,CLAWD_NO_HMR:'1'}});
let facts: { rasters:Rasters; independent:number[]; errors:string[]; matrices:number[]; pixelsEqual:boolean; font:boolean; pixels:{starBright:number;cityMean:number;cityPixels:number;dawn147:number;dawn149:number;clay:number;cursorArea:number} };
try {
  for(let i=0;i<100;i++){try{if((await fetch(`http://localhost:${port}`)).ok)break;}catch{} await Bun.sleep(50);}
  const browser=await chromium.launch({channel:'chrome',args:['--use-angle=metal','--ignore-gpu-blocklist'],headless:true});
  try {
    const page=await browser.newPage(); const errors:string[]=[];
    page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error' && !m.text().includes('404'))errors.push(m.text());});
    await page.goto(`http://localhost:${port}/?export=1`); await page.waitForFunction(()=> (window as any).__clawd?.ready, null,{timeout:120000});
    facts=await page.evaluate(async({a,l})=>{
      const sw=await import('/src/scenes/parts/s17-swarm.ts'), vt=await import('/src/kit/vartype.ts'), ty=await import('/src/engine/type.ts');
      await ty.loadFonts(); const rasters=sw.makeRasters();
      const cv=document.createElement('canvas');cv.width=96;cv.height=20;const c=cv.getContext('2d',{willReadFrequently:true})!;
      const run=vt.varRun('COMMIT',100,{wdth:100,wght:900}),k=Math.min(94/run.width,18/run.capH);
      c.translate((96-run.width*k)/2,(20+run.capH*k)/2);c.scale(k,k);c.fillStyle='white';
      const path=new Path2D();for(const g of run.glyphs)vt.tracePath(path,g.o,g.x,0,run.size/1000);c.fill(path);
      const data=c.getImageData(0,0,96,20).data,independent=Array.from({length:1920},(_,i)=>i).filter(i=>data[i*4+3]!>127.5);
      const P=(window as any).__clawd, matrices:number[]=[];
      for(const t of [113.89,114,114.7,115.5,115.89,116.3,116.9,117.4,119.7,122,123.2,124.3,125,126.4,127.3,128.5,130.2,131.89,131.90,137.5,139,140.3,143,147,149.4,153.5,155,159,160.58])P.still(t);
      P.still(116.30);const first=await P.png();P.still(155);P.still(116.30);const pixelsEqual=first===await P.png();
      const mesh=new sw.SwarmMesh(); matrices.push(mesh.body.count,mesh.screens.count);mesh.dispose();
      const w18=await import('/src/scenes/parts/s18-world.ts'),score=await import('/src/scenes/parts/s18-score.ts'),
        au=await import('/src/engine/audio.ts'),ly=await import('/src/engine/lyrics.ts'),rigmod=await import('/src/kit/rig.ts');
      const audio=new au.AudioData(a),lyrics=new ly.Lyrics(l),T=score.resolveOutroTimes(audio,lyrics);
      const read=async(t:number)=>{
        P.still(t);const im=new Image();im.src='data:image/png;base64,'+await P.png();await im.decode();
        const cv=document.createElement('canvas');cv.width=1920;cv.height=1080;const c=cv.getContext('2d',{willReadFrequently:true})!;
        c.drawImage(im,0,0);return c.getImageData(0,0,1920,1080).data;
      };
      const lum=(p:Uint8ClampedArray,i:number)=>(0.2126*p[i]!+0.7152*p[i+1]!+0.0722*p[i+2]!)/255;
      const mean=(p:Uint8ClampedArray)=>{let sum=0;for(let i=0;i<p.length;i+=4)sum+=lum(p,i);return sum/(1920*1080);};
      const firstStars=await read(131.9);let starBright=0;for(let i=0;i<firstStars.length;i+=4)if(lum(firstStars,i)>0.8)starBright++;
      const city=await read(139),mask=document.createElement('canvas');mask.width=1920;mask.height=1080;const mc=mask.getContext('2d')!;
      const rig=new rigmod.Rig();rig.set(w18.cameraAt(audio,139,T));
      const cross=(o:any,a:any,b:any)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
      // Union of the actual projected building silhouettes defines the city ROI independently of pigment.
      for(const d of w18.CITY){
        const ps=[-1.36,1.36].flatMap(x=>[0,d.height].flatMap(y=>[-1.36,1.36].map(z=>rig.proj(d.x+x,y,d.z+z)))).filter(Boolean).sort((a:any,b:any)=>a.x-b.x||a.y-b.y);
        const lower:any[]=[],upper:any[]=[];
        for(const p of ps){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
        for(const p of [...ps].reverse()){while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
        const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];mc.beginPath();hull.forEach((p:any,i:number)=>i?mc.lineTo(p.x,p.y):mc.moveTo(p.x,p.y));mc.closePath();mc.fillStyle='white';mc.fill();
      }
      const roi=mc.getImageData(0,0,1920,1080).data;let citySum=0,cityPixels=0;
      for(let i=0;i<roi.length;i+=4)if(roi[i+3]!>127){citySum+=lum(city,i);cityPixels++;}
      const dawn147=mean(await read(147)),dawn149=mean(await read(149.4)),last=await read(160.5);let clay=0;
      for(let i=0;i<last.length;i+=4)if(Math.abs(last[i]!-215)<=5&&Math.abs(last[i+1]!-119)<=5&&Math.abs(last[i+2]!-87)<=5)clay++;
      const cursor=w18.loopTarget(),sampleIndex=(Math.floor(cursor.y+cursor.h/2)*1920+Math.floor(cursor.x+cursor.w/2))*4;
      const hist:Record<string,number>={};for(let i=0;i<city.length;i+=4)if(roi[i+3]!>127){const key=Array.from(city.slice(i,i+3)).join(",");hist[key]=(hist[key]??0)+1;}
      const cursorRGB=Array.from(last.slice(sampleIndex,sampleIndex+3)),cityColors=Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,8);
      const pixels={cursorRGB,cityColors,starBright,cityMean:citySum/cityPixels,cityPixels,dawn147,dawn149,clay,cursorArea:cursor.w*cursor.h};
      return {pixels,rasters,independent,errors:[...(P.errors??[])],matrices,pixelsEqual,font:document.fonts.check('600 100px "PingFang SC"')};
    }, {a,l}); facts.errors.push(...errors);
  } finally { await browser.close(); }
} finally {server.kill();}
const sw=buildSwarm(facts!.rasters);
configureFraming(sw,R);
await Bun.write(new URL('../../out/codex/v6-g7-browser-facts.json',import.meta.url),JSON.stringify({ pixels:facts!.pixels, rasters:facts!.rasters, errors:facts!.errors, matrices:facts!.matrices,pixelsEqual:facts!.pixelsEqual,font:facts!.font,lit:sw.rasters.COMMIT.mask.length,changed:sw.rasters.DIFF.changed?.length,onsets:O.ohs.length,loop:loopTarget() },null,2));
test('browser renders all G7 phases without scene or shader errors; seeks are pixel deterministic',()=>{expect(facts!.errors).toEqual([]);expect(facts!.pixelsEqual).toBe(true);expect(facts!.font).toBe(true);});
test('COMMIT actual Canvas coverage selects exactly every pixel above 0.5',()=>{expect(sw.rasters.COMMIT.mask).toEqual(facts!.independent);expect(formation(sw,'COMMIT').filter(d=>d.lit).map(d=>d.pixel).sort((a,b)=>a!-b!)).toEqual(facts!.independent);});
test('CHECK uses the actual shipped Plex check glyph because Archivo has no U+2713',()=>{
  expect(ot(F.archivo(100,900)).charToGlyphIndex('✓')).toBe(0);
  expect(ot(F.mono(600)).charToGlyphIndex('✓')).toBeGreaterThan(0);
  expect(sw.rasters.CHECK.mask.length).toBeGreaterThan(0);
  expect(sw.rasters.CHECK.width).toBe(40);expect(sw.rasters.CHECK.height).toBe(30);
});
test('all formations have 1400 devices and both renderer batches are instanced',()=>{for(const ds of Object.values(sw.formations))expect(ds).toHaveLength(1400);expect(facts!.matrices).toEqual([1400,1400]);});
test('MIT arrivals are exact and all screens ignite in two frames',()=>{
  const at=devicesAt(sw,audio,lyrics,R.hit,R),done=devicesAt(sw,audio,lyrics,R.hit+2/60,R),target=formation(sw,'COMMIT');
  target.forEach((d,i)=>{expect(Math.hypot(at[i]!.x-d.x,at[i]!.y-d.y,at[i]!.z-d.z)).toBeLessThan(0.01);if(d.lit){expect(at[i]!.lit).toBe(0);expect(done[i]!.lit).toBe(1);}});
});
test('one measured beat holds every camera and device matrix exactly still at five times',()=>{
  const f=freezeWindow(audio,R),t=f.start,cam=cameraAt(audio,lyrics,t,R),ds=devicesAt(sw,audio,lyrics,t,R);
  for(let i=0;i<5;i++){const q=t+(f.end-t)*i/4;expect(cameraAt(audio,lyrics,q,R)).toEqual(cam);expect(devicesAt(sw,audio,lyrics,q,R)).toEqual(ds);}
});
test('C16 is the projection of the actual device screen',()=>{expect(primError({kind:'rect',...screenBounds(screenDevice(),cameraAt(audio,lyrics,R.release[0]!.start,R))},{kind:'rect',...HANDOFF.domino16}).px).toBeLessThanOrEqual(2);});
test('settled formations project entirely within 60px, with the documented tall-check width exception',()=>{
  const checks:[string,number][]=[['COMMIT',R.hit+0.3],['DIFF',118.8],['CHECK',122.5],['TWO_ROWS',123.7],['ONE_ROW',125.2]];
  const metrics=checks.map(([name,t])=>{const box=deviceBounds(formation(sw,name as any),cameraAt(audio,lyrics,t,R));
    expect(box.x).toBeGreaterThanOrEqual(60-1e-5);expect(box.y).toBeGreaterThanOrEqual(60-1e-5);
    expect(box.x+box.w).toBeLessThanOrEqual(1860+1e-5);expect(box.y+box.h).toBeLessThanOrEqual(1020+1e-5);
    if(name!=='CHECK')expect(box.w).toBeGreaterThanOrEqual(1344);return {name,t,...box};});
  console.log('G7 projected formations '+JSON.stringify(metrics));
});
test('DIFF row gap is at least 1.2 times the projected letter height',()=>{
  const ds=formation(sw,'DIFF'),cam=cameraAt(audio,lyrics,118.8,R);
  const top=deviceBounds(ds.filter(d=>d.color==='fail'),cam),bottom=deviceBounds(ds.filter(d=>d.color==='pass'),cam);
  expect(bottom.y-top.y-top.h).toBeGreaterThanOrEqual(1.2*Math.max(top.h,bottom.h));
});
test('half-screen comment panel remains inside the frame and disjoint from the check for the full me hold',()=>{
  const me=lyrics.get('Then you wrote, “Looks good to me”').words[6]!;
  for(const t of [R.release[4]!.start,me.start,(me.start+me.end)/2,me.end-1e-6]) {
    const cam=cameraAt(audio,lyrics,t,R),tilt=-0.1*Math.min(1,Math.max(0,(t-me.start)/(me.end-me.start)));
    const box=commentBounds(cam,tilt),check=deviceBounds(formation(sw,'CHECK'),cam);
    expect(box.w).toBeCloseTo(960,3);expect(box.x).toBeGreaterThanOrEqual(60);expect(box.y).toBeGreaterThanOrEqual(60);
    expect(box.x+box.w).toBeLessThanOrEqual(1860+0.01);expect(box.y+box.h).toBeLessThanOrEqual(1020);
    if(t<R.release[5]!.start)expect(box.x).toBeGreaterThan(check.x+check.w);
  }
});
test('S17 exports the specified punch and swaps pigments for exactly four frames without post inversion',()=>{
  expect(PUNCH).toEqual({shakePx:24,flipFrames:4});
  for(let i=0;i<4;i++)expect(paletteFlipped(R.hit+(i+0.5)/60,R)).toBe(true);
  expect(paletteFlipped(R.hit-1e-8,R)).toBe(false);expect(paletteFlipped(R.hit+4/60,R)).toBe(false);
});
test('only equals-sign devices move during the 120ms diff fix',()=>{
  const A=devicesAt(sw,audio,lyrics,R.release[3]!.start-0.001,R),B=devicesAt(sw,audio,lyrics,R.release[3]!.start+0.12,R),changed=new Set(sw.rasters.DIFF.changed);
  expect(changed.size).toBeGreaterThan(0); A.forEach((d,i)=>{if(!changed.has(d.pixel!))expect(B[i]).toEqual(d);});
});
test('diff camera follows its actual world writing head before the it close-up',()=>{
  const paths=lyricPaths(voice,R),pull=lyrics.get('Pull request, and that is it');
  for(const t of [pull.words[0]!.start+0.1,pull.words[1]!.start+0.1,pull.words[2]!.start+0.1]) {
    const active=paths.find(p=>p.name===(t<pull.words[2]!.start?'branch':'main'))!,glyphs=active.layout.glyphs;
    const head=glyphs.filter(g=>t>=g.t0).at(-1)!;
    const p=pathAt(active.path,writeHead(glyphs,t)),q=diffHead(audio,lyrics,t);
    expect(Math.hypot(p.x-q.x,p.y-q.y,p.z-q.z)).toBeLessThan(1e-8);
    expect(diffHead(audio,lyrics,t)).toEqual(diffHead(audio,lyrics,t));
    expect(Math.abs(cameraAt(audio,lyrics,t,R).tgt.x-diffHead(audio,lyrics,t).x)).toBeLessThan(30);
    expect(head.word.start).toBeLessThanOrEqual(t);
  }
  const widths=[5,4,2,3],line=commentLine(widths,16);
  line.x.slice(1).forEach((x,i)=>expect(x-widths[i+1]!*line.scale/2).toBeGreaterThan(line.x[i]!+widths[i]!*line.scale/2));
});
test('each zipper landing kicks the already-merged row and the row settles afterwards',()=>{
  const t=R.zipStart+0.15,ds=devicesAt(sw,audio,lyrics,t,R);
  expect(zipperShake(t,R)).toBeCloseTo(0.05,9);expect(ds[sw.zipper[7]!]!.y).toBeCloseTo(0.05,9);
  expect(zipperShake(R.zipEnd+0.15,R)).toBe(0);
});
test('zipper reads all fifteen slots, including its dark spaces',()=>{
  const merged=lyrics.get('Merged to main, and now we’re free'),ds=devicesAt(sw,audio,lyrics,merged.words[2]!.end+0.16,R);
  expect(sw.zipper.map(i=>ds[i]!.char).join('')).toBe('Merged to main,');const xs=sw.zipper.map(i=>ds[i]!.x);expect(xs).toEqual([...xs].sort((a,b)=>a-b));expect(ds[sw.zipper[6]!]!.lit).toBe(0);
});
test('scatter is a seeded radius-thirty shell and every formation/flight is seek deterministic',()=>{
  formation(sw,'SCATTER').forEach(d=>expect(Math.hypot(d.x,d.y,d.z)).toBeCloseTo(30,8));
  for(const t of R.release.map(s=>s.start+0.1)){const ds=devicesAt(sw,audio,lyrics,t,R),cam=cameraAt(audio,lyrics,t,R);devicesAt(sw,audio,lyrics,R.hit,R);expect(devicesAt(sw,audio,lyrics,t,R)).toEqual(ds);expect(cameraAt(audio,lyrics,t,R)).toEqual(cam);}
});
test('all words and world-path first letters respect aligned vocal start; path layout is deterministic',()=>{
  const paths=lyricPaths(voice,R);expect(lyricPaths(voice,R)).toEqual(paths);
  for(const line of lyrics.lines.filter(l=>l.start>=R.release[0]!.start&&l.start<O.start))for(const w of line.words)expect(letterTimes(w)[0]!.t0).toBeGreaterThanOrEqual(w.start);
  for(const p of paths)for(const g of p.layout.glyphs)expect(g.t0).toBeGreaterThanOrEqual(g.word.start);
  const t=R.release[2]!.start+0.3;expect(cursorAt(t,audio,lyrics,R)).toEqual(cursorAt(t,audio,lyrics,R));
});
test('device CPU and exported GLSL translation agree for two hundred seeded points',()=>{
  expect(S17_WORLD_GLSL).toContain('c*q.x+s*q.z');
  for(let i=0;i<200;i++){const p=p3(hash(i,1)*4-2,hash(i,2)*4-2,hash(i,3)*4-2),center=p3(hash(i,4),hash(i,5),hash(i,6)),size=p3(hash(i,7),hash(i,8),hash(i,9)),yaw=hash(i,10),a=devicePoint(p,center,size,yaw);
    const q=[p.x*size.x,p.y*size.y,p.z*size.z],c=Math.cos(yaw),s=Math.sin(yaw),b=p3(center.x+c*q[0]!+s*q[2]!,center.y+q[1]!,center.z-s*q[0]!+c*q[2]!);expect(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)).toBeLessThan(1e-4);}
});
test('C17 actual star rays reproduce every lit front-wall screen center',()=>{
  const incoming=entryPrim(O.start);expect(incoming.kind).toBe('points');if(incoming.kind==='points')expect(primError(incoming,{kind:'points',pts:screenPoints()}).px).toBeLessThanOrEqual(2);
  expect(screenPoints()).toHaveLength(54);starDirections().forEach(d=>expect(Math.hypot(d.x,d.y,d.z)*STAR_RADIUS).toBeCloseTo(200));
});
test('oh onsets light one star each, capped at eighty, never guessed beats or chorus carry',()=>{
  expect(O.ohs).toHaveLength(Math.min(80,audio.events('vocal',O.start,O.end).length));expect(O.carried).toEqual([]);
  for(const [i,w] of O.ohs.entries()){expect(starState(audio,voice,w.start-0.0001,O)[54+i]!.alpha).toBe(0);if(w.start<afterBeats(audio,O.end,-2))expect(starState(audio,voice,w.start,O)[54+i]!.alpha).toBe(1);}
});
test('calendar buildings are precisely S04 days 1-31 and sink to zero after four beats',()=>{
  expect(CITY).toEqual(DATES.slice(0,31));expect(CITY.some(d=>d.day===32)).toBe(false);
  for(const d of CITY){expect(cityHeight(d,audio,O.start,O)).toBe(d.height);expect(cityHeight(d,audio,afterBeats(audio,O.shots[6]!.start,4),O)).toBe(0);}
});
test('the printed seven-by-five calendar has the same projected cell pitch as the actual S04 city',()=>{
  const rig=new Rig();rig.set(calendarCam());const aff=calendarAffine(rig)!;
  const o=rig.proj(-3.5*CELL,0.06,-4.5*CELL)!,x=rig.proj(-2.5*CELL,0.06,-4.5*CELL)!,z=rig.proj(-3.5*CELL,0.06,-3.5*CELL)!;
  expect(Math.hypot(aff.a*1920/7-(x.x-o.x),aff.b*1920/7-(x.y-o.y))).toBeLessThan(0.01);
  expect(Math.hypot(aff.c*1080/5-(z.x-o.x),aff.d*1080/5-(z.y-o.y))).toBeLessThan(0.01);
});
test('sun elevation endpoints are -4 and 14 degrees, and Clawd reaches roof31 before Bye',()=>{
  expect(sunAngle(O.dawn,O)).toBe(-4);expect(sunAngle(O.shots[5]!.start,O)).toBe(14);
  const c=clawdAt(audio,O.shots[3]!.start,O).at,d=CITY[30]!;expect(c.x).toBe(d.x);expect(c.y).toBe(d.height);expect(c.z).toBe(d.z);
});
test('AABB CPU/GLSL twin rays agree for two hundred random points',()=>{
  expect(S18_WORLD_GLSL).toContain('abs(rd[i])<1e-10');
  for(let i=0;i<200;i++){const p=p3(hash(i,41)*20-10,hash(i,42)*10,hash(i,43)*20-10),rd=p3(i%5===0?0:hash(i,44)*2-1,i%7===0?0:hash(i,45)*2-1,i%11===0?0:hash(i,46)*2-1),b={x:2,z:-3,half:1.36,height:3};
    const P=[p.x,p.y,p.z],D=[rd.x,rd.y,rd.z],lo=[b.x-b.half,0,b.z-b.half],hi=[b.x+b.half,b.height,b.z+b.half];
    let near=-1e30,far=1e30,miss=Math.hypot(...D)<1e-10;
    for(let j=0;j<3;j++)if(Math.abs(D[j]!)<1e-10){if(P[j]!<lo[j]!||P[j]!>hi[j]!)miss=true;}
    else {const a=(lo[j]!-P[j]!)/D[j]!,c=(hi[j]!-P[j]!)/D[j]!;near=Math.max(near,Math.min(a,c));far=Math.min(far,Math.max(a,c));}
    expect(Math.abs(boxHit(p,rd,b)-(!miss && far>Math.max(near,0)?near:-1))).toBeLessThan(1e-4);}
});
test('credit contents remain byte-identical to kit, including the author and Chinese line',()=>{
  expect(outroCredits(audio,O.end,O).lines.map(x=>x.text)).toEqual([...CREDIT_LINES]);expect(AUTHOR).toEqual({latin:'TIM',cjk:'蔡任天'});expect(SIGNATURE_LABEL).toBe('A FILM BY  ·  作品');expect(CODE_LINE).toBe('每一帧都由代码画出');
});
test('C18 last-frame cursor matches the prescribed S01 P0 fallback and all city cameras are deterministic',()=>{
  expect(primError({kind:'rect',...cursorScreenAt(audio,O.end-1/60,O)},{kind:'rect',...loopTarget()}).px).toBeLessThanOrEqual(2);
  for(const t of O.shots.map(s=>s.start+0.2))expect(camera18(audio,t,O)).toEqual(camera18(audio,t,O));
});
test('outgoing cameras hold for the final 100ms; loop cursor continues from signature and gains heat',()=>{
  for(let i=0;i<5;i++){
    const offset=0.1-i*0.02;
    expect(cameraAt(audio,lyrics,O.start-offset,R)).toEqual(cameraAt(audio,lyrics,O.start-0.1,R));
    expect(camera18(audio,O.end-offset,O)).toEqual(camera18(audio,O.end-0.1,O));
    expect(cursorScreenAt(audio,O.end-offset,O)).toEqual(loopTarget());
  }
  const at=afterBeats(audio,O.end,-2),a=cursorScreenAt(audio,at-1e-6,O),b=cursorScreenAt(audio,at,O);
  expect(primError({kind:'rect',...a},{kind:'rect',...b}).px).toBeLessThan(0.01);
  expect(cursorGainAt(O.end-0.1,O)).toBe(1);expect(cursorGainAt(O.end,O)).toBe(1.9);
});

test('merge row spans eighty percent and every screen cap height is at least fifty pixels; unused hardware is below frame',()=>{
  for(const t of [123.7,124.3,125,125.8]) {
    const ds=devicesAt(sw,audio,lyrics,t,R),cam=cameraAt(audio,lyrics,t,R),rig=new Rig();rig.set(cam);
    const box=deviceBounds(sw.zipper.map(i=>ds[i]!),cam);expect(box.w).toBeGreaterThanOrEqual(1536);
    for(const i of sw.zipper) if(ds[i]!.char!==' '){const d=ds[i]!,bottom=rig.proj(d.x,d.y-d.h*0.36,d.z+d.d*0.51)!,top=rig.proj(d.x,d.y+d.h*0.36,d.z+d.d*0.51)!;expect(bottom.y-top.y).toBeGreaterThanOrEqual(50);}
    const used=new Set(sw.zipper);for(const [i,d] of ds.entries())if(!used.has(i))expect(rig.proj(d.x,d.y+d.h/2,d.z+d.d/2)!.y).toBeGreaterThan(1080);
  }
});
test('night and noon exposure sample real roofs, facades and analytic cast shadows',()=>{
  const night=139,day=149.4;
  const roofs=CITY.slice(-5).map(d=>p3(d.x,d.height+0.025,d.z));
  const walls=CITY.slice(-5).map(d=>p3(d.x,d.height/2,d.z+1.37));
  const lit=roofs.map(p=>surfaceTone(p,p3(0,1,0),audio,day,O));
  const moon=roofs.map(p=>surfaceTone(p,p3(0,1,0),audio,night,O));
  const facades=walls.map(p=>surfaceTone(p,p3(0,0,1),audio,night,O));
  const shadows=CITY.slice(0,5).map(d=>p3(d.x,0.025,d.z+1.6)).map(p=>surfaceTone(p,p3(0,1,0),audio,day,O));
  moon.forEach(t=>{expect(t).toBeGreaterThanOrEqual(0.3);expect(t).toBeLessThanOrEqual(0.45);});
  facades.forEach(t=>{expect(t).toBeGreaterThanOrEqual(0.1);expect(t).toBeLessThanOrEqual(0.25);});
  lit.forEach(t=>{expect(t).toBeGreaterThanOrEqual(0.85);expect(t).toBeLessThanOrEqual(0.92);});
  shadows.forEach(t=>{expect(t).toBeGreaterThanOrEqual(0.15);expect(t).toBeLessThanOrEqual(0.3);});
  const L=lightAt(day,O);expect(L.sunK).toBeCloseTo(0.9/Math.max(0.15,L.sun.y),10);expect(lightAt(O.dawn,O).sunK).toBe(0);
  console.log('G7 tones '+JSON.stringify({moon,facades,lit,shadows}));expect(S18_LIGHT_GLSL).toContain('0.03+0.15*g7Daylight');
});
test('calendar covers eighty-five percent of the frame and the printed signature spans fifty-five percent',()=>{
  const rig=new Rig();rig.set(calendarCam());const aff=calendarAffine(rig)!;
  const points=[0,1920].flatMap(x=>[0,1080].map(y=>({x:aff.a*x+aff.c*y+aff.e,y:aff.b*x+aff.d*y+aff.f})));
  const width=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)),height=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
  const clipped=(Math.min(1920,Math.max(...points.map(p=>p.x)))-Math.max(0,Math.min(...points.map(p=>p.x))))*(Math.min(1080,Math.max(...points.map(p=>p.y)))-Math.max(0,Math.min(...points.map(p=>p.y))));
  expect(clipped/(1920*1080)).toBeGreaterThanOrEqual(0.85);
  const glyphs=signatureGlyphs(audio,157,O);expect((glyphs.right-SIGNATURE.x)*aff.a).toBeGreaterThanOrEqual(1056);
  glyphs.glyphs.forEach((g,i)=>{expect(g.at).toBe(afterBeats(audio,O.flatAt,i*0.5));expect(signatureGlyphs(audio,g.at,O).glyphs[i]!.drop).toBe(0.3);expect(signatureGlyphs(audio,g.at+0.12,O).glyphs[i]!.drop).toBe(0);});
  console.log('G7 calendar '+JSON.stringify({width,height,coverage:clipped/(1920*1080),signatureWidth:(glyphs.right-SIGNATURE.x)*aff.a}));
});

test('rendered sRGB pixels meet all five R2 thresholds, using a geometry-defined city ROI',()=>{
  const p=facts!.pixels;
  expect(p.starBright).toBeGreaterThanOrEqual(54*30);
  expect(p.cityMean).toBeGreaterThanOrEqual(0.15);expect(p.cityMean).toBeLessThanOrEqual(0.35);
  expect(p.dawn147).toBeGreaterThanOrEqual(0.4);expect(p.dawn149).toBeGreaterThanOrEqual(0.6);
  expect(p.clay).toBeGreaterThanOrEqual(p.cursorArea*0.8);
  console.log('G7 pixels '+JSON.stringify(p));
});

test('CPU and exported GLSL light arithmetic agree at two hundred deterministic world samples',()=>{
  expect(S18_LIGHT_GLSL).toContain('min(g7MaxTone,max(0.10,0.03+0.15*g7Daylight+moon+sun))');
  for(let i=0;i<200;i++){
    const t=i%2?139:149.4,p=p3(hash(i,81)*25-12.5,hash(i,82)*4,hash(i,83)*18-16),n=p3(hash(i,84)*2-1,hash(i,85),hash(i,86)*2-1),len=Math.hypot(n.x,n.y,n.z);n.x/=len;n.y/=len;n.z/=len;
    const l=lightAt(t,O),dot=(d:typeof n)=>Math.max(0,n.x*d.x+n.y*d.y+n.z*d.z);
    const translated=Math.min(l.toneCeiling,Math.max(0.1,0.03+0.15*l.daylight+l.moonK*dot(l.moon)*shadowAt(p,l.moon,audio,t,O)+l.sunK*dot(l.sun)*shadowAt(p,l.sun,audio,t,O)));
    expect(Math.abs(surfaceTone(p,n,audio,t,O)-translated)).toBeLessThan(1e-4);
  }
  expect(lightAt(O.flatAt,O).sun.y).toBe(1);expect(surfaceTone(p3(0,0.1,-7.2),p3(0,1,0),audio,O.flatAt,O)).toBe(0.9);
});
test('C17 star arms are ten pixels and newly born stars use eighteen pixels for exactly 0.4 seconds',()=>{
  expect(starState(audio,voice,O.start,O).slice(0,54).every(s=>s.r===10)).toBe(true);
  const at=O.ohs[0]!.start;expect(starState(audio,voice,at,O)[54]!.r).toBe(18);expect(starState(audio,voice,at+0.399,O)[54]!.r).toBe(18);expect(starState(audio,voice,at+0.401,O)[54]!.r).toBe(10);
});
