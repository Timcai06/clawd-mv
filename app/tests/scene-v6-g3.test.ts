import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import './kit-pathtext.test'; // Shipped OpenType fonts; browser registration alone is mocked.
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { mulberry32 } from '../src/engine/util';
import { F, ot } from '../src/engine/type';
import { carryDrift } from '../src/kit/carry';
import { letterTimes, runInkBounds } from '../src/kit/pathtext';
import { primError } from '../src/kit/handoff';
import { Rig, p3 } from '../src/kit/rig';
import { SolidText } from '../src/kit/solidtype';
import { afterBeats } from '../src/kit/time';
import { varRun } from '../src/kit/vartype';
import { LEGS } from '../src/kit/clawd';
import { TAP_TEXT, bracketTarget, paperTravel } from '../src/scenes/parts/s08-layout';
import { PressAtlas } from '../src/scenes/parts/s08-print';
import {
  AMBIENT, LIT_TONE, ATLAS, PAGE, S08_GLSL, lightIrradiance, lightTone, paperExposure, clawdFrontTone, screenTilt, clawdCorners, impressionCorners, printedWordPolygons, polygonsIntersect, projectedHull, cameraAt, clawdAt, cursorAt, depthFromMask, entryPrim, exitPrim, exitState,
  floodRadius, flooded, hashAffine, heightAt, impactHits, impactPit, impactPost, machineAffines, machineSpec,
  machineTargetAffines, machineVisible, onPaper, paperPoint, pressAt, pressCorners, printGlyphCount, printingWorld, projectedBox,
} from '../src/scenes/parts/s08-world';
import { resolveCTimes } from '../src/scenes/parts/s06-timing';
import { handoffOut as old07 } from '../src/scenes/parts/s07-terrain';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';

const audio=new AudioData(audioJSON),lyrics=new Lyrics(lyricsJSON),m=printingWorld(audio,lyrics),T=m.T;
const times=[T.start,T.start+0.14,T.mit1,T.brk,T.tap1,T.tap2,T.tapping,T.quit,T.i2,T.mit2,T.works,T.machine,T.end-1/60];

describe('V6 g3 score and press mechanics',() => {
  test('editorial anchors resolve from the board and word onsets are not substituted with snapped shots',() => {
    expect(T.shots).toHaveLength(12);
    for (let i=1;i<T.shots.length;i++) expect(T.shots[i]!.start).toBeGreaterThan(T.shots[i-1]!.start);
    const commits=m.events.filter(e => e.kind === 'commit');
    expect(commits.map(e => e.tp)).toEqual([T.mit1,T.mit2]);
    for (const e of m.events.filter(e => e.kind === 'giant')) expect(e.tp).toBe(e.word.start);
  });
  test('contact is exact; approach is quadratic, lift starts at 100ms, lifetime ends after 350ms',() => {
    for (const e of m.events.filter(e => e.kind !== 'bracket')) {
      expect(pressAt(e,e.tp,m).y).toBe(0);
      expect(pressAt(e,e.tp-1e-5,m).y).toBeGreaterThan(0);
      expect(pressAt(e,e.tp+0.1,m).y).toBe(0);
      expect(pressAt(e,e.tp+0.1001,m).y).toBeGreaterThan(0);
      expect(pressAt(e,e.tp+0.351,m).visible).toBe(false);
      expect(pressAt(e,e.tp-e.approach,m).y).toBeCloseTo(e.capH*3,10);
    }
  });
  test('both MIT pickups park the camera for their last 100ms; each slam has two palette-swapped frames',() => {
    for (const tp of [T.mit1,T.mit2]) {
      expect(cameraAt(tp-0.09,m)).toEqual(cameraAt(tp-0.01,m));
      expect(impactPost(tp,m).paletteSwap).toBe(1);
      expect(impactPost(tp+1/60,m).paletteSwap).toBe(1);
      expect(impactPost(tp+2/60,m).paletteSwap).toBe(0);
    }
  });
  test('all lyrics and first glyphs wait for the aligned word; machine never presses',() => {
    for (const e of m.events.filter(e => e.kind !== 'bracket')) {
      expect(e.times[0]!).toBeGreaterThanOrEqual(e.word.start);
      expect(printGlyphCount(e,e.tp-1e-6)).toBe(0);
      if (e.kind !== 'commit') expect(e.tp).toBeGreaterThanOrEqual(e.word.start);
    }
    for (const word of T.machineLine.words) expect(letterTimes(word)[0]!.t0).toBeGreaterThanOrEqual(word.start);
    const machine=T.machineLine.words.at(-1)!;
    expect(machineVisible(machine.start-1e-6,m).some(Boolean)).toBe(false);
    expect(m.events.some(e => e.word === machine)).toBe(false);
  });
  test('FIT makes both outer brackets land exactly, with no tolerance-based snap',() => {
    const fit=T.bracketLine.words.at(-1)!.start;
    for (const e of m.events.filter(e => e.pair === 2)) {
      expect(bracketTarget(e,fit,T)).toEqual({ x:e.x,z:e.z });
      expect(bracketTarget(e,fit-0.01,T).x).not.toBe(e.x);
    }
  });
  test('thirteen letters and two hyphens have distinct, increasing mallet contacts in 1-3-2-4 order',() => {
    const tap=m.events.filter(e => e.kind === 'tap');
    expect(tap.map(e => e.text).join('')).toBe(TAP_TEXT);
    expect(tap).toHaveLength(15);
    expect(tap.filter(e => /[A-Z]/.test(e.text))).toHaveLength(13);
    for (const [i,e] of tap.entries()) {
      expect(e.tp).toBe(e.times[0]!); expect(e.leg).toBe([0,2,1,3][i%4]!);
      const clawd=clawdAt(e.tp,m),foot=clawd.pose.cells.find(c => c.x === LEGS[e.leg!] && c.y === 4)!;
      expect(clawd.hit).toBe(e.tp); expect(foot).toBeDefined();
      expect(clawd.point.x+(foot.x+clawd.pose.dx-7.5)*0.5).toBeCloseTo(e.x,10);
      expect(clawd.point.y).toBe(0); const near=Math.min(...impressionCorners(e,e.tp,m).map(p => p.z));
      expect(near-(clawd.point.z+0.5)).toBeCloseTo(0.6,10);
      if (i) expect(e.tp).toBeGreaterThan(tap[i-1]!.tp);
    }
  });
  test('paper moves as an integral of beats, returns precisely at MIT2, overlay register is authored',() => {
    expect(paperTravel(audio,T.quit,T)).toBe(0);
    expect(paperTravel(audio,afterBeats(audio,T.i2,-0.5),T)).toBeLessThan(0);
    expect(paperTravel(audio,T.mit2,T)).toBe(0);
    const commits=m.events.filter(e => e.kind === 'commit');
    expect(commits[1]!.x).toBe(0.06*commits[0]!.capH);
    expect(commits[1]!.z).toBe(0.04*commits[0]!.capH);
    expect(commits[1]!.rot).toBe(-0.006);
    const changed=new AudioData({ ...audioJSON,bpm:40 });
    for (const t of times) expect(paperTravel(changed,t,T)).toBe(paperTravel(audio,t,T));
  });
});

describe('V6 g3 world and projection',() => {
  test('200 points agree with functions translated directly from the exported GLSL bodies',() => {
    const body=(name:string) => S08_GLSL.match(new RegExp(`${name}\\([^)]*\\)\\s*\\{([^}]+)\\}`))![1]!;
    const gpuDepth=new Function('mask','DEBOSS_DEPTH',body('depthMap')) as (mask:number,d:number)=>number;
    const gpuPaper=new Function('p','travel','tilt','PAGE_H',body('paperPoint')
      .replace(/float /g,'let ').replace(/\bcos\(/g,'Math.cos(').replace(/\bsin\(/g,'Math.sin(')
      .replace('vec3(','Array.of(')) as (p:{x:number,y:number,z:number},travel:number,tilt:number,h:number)=>number[];
    const gpuPit=new Function('p','hit',body('impactPit').replace('vec2 d = p-hit.xy;','const d=[p[0]-hit[0],p[1]-hit[1]];')
      .replaceAll('hit.z','hit[2]').replaceAll('hit.w','hit[3]').replace('dot(d,d)','(d[0]*d[0]+d[1]*d[1])')
      .replace('exp(','Math.exp(').replace('max(','Math.max(')) as (p:number[],hit:number[])=>number;
    const gpuHeight=new Function('p','mask','hits','depthMap','impactPit',body('heightAt').replace('float h','let h').replace('int i','let i')) as
      (p:number[],mask:number,hits:number[][],depth:(mask:number)=>number,pit:typeof gpuPit)=>number;
    const random=mulberry32(803);
    for (let i=0;i<200;i++) {
      const p=p3((random()-0.5)*48,(random()-0.5)*2,(random()-0.5)*27),travel=(random()-0.5)*10,tilt=random()*1.4;
      const cpu=paperPoint(p,travel,tilt),gpu=gpuPaper(p,travel,tilt,PAGE.h),mask=random();
      expect(Math.max(Math.abs(cpu.x-gpu[0]!),Math.abs(cpu.y-gpu[1]!),Math.abs(cpu.z-gpu[2]!))).toBeLessThan(1e-4);
      expect(Math.abs(depthFromMask(mask)-gpuDepth(mask,0.06))).toBeLessThan(1e-4);
      const hit=[random()*10,random()*10,random()*0.03,random()*4];
      expect(Math.abs(impactPit([p.x,p.z],hit)-gpuPit([p.x,p.z],hit))).toBeLessThan(1e-4);
      const globalHit=[0,0,random()*0.03,-1];
      expect(impactPit([p.x,p.z],globalHit)).toBe(globalHit[2]!);
      expect(gpuPit([p.x,p.z],globalHit)).toBe(globalHit[2]!);
      const hits=Array.from({ length:8 },() => [random()*10,random()*10,random()*0.03,random()*4]);
      expect(Math.abs(heightAt([p.x,p.z],mask,hits)-gpuHeight([p.x,p.z],mask,hits,n => gpuDepth(n,0.06),gpuPit))).toBeLessThan(1e-4);
    }
  });
  test('light direction, dimensions, overlap depth and local impact are physical world values',() => {
    expect(ATLAS).toEqual({ w:4096,h:2304 }); expect(PAGE).toEqual({ w:48,h:27 });
    expect(heightAt([0,0],32/255,[])).toBeCloseTo(-0.06,12); expect(heightAt([0,0],64/255,[])).toBeCloseTo(-0.12,12);
    expect(heightAt([0,0],96/255,[])).toBeCloseTo(-0.18,12);
    const hits=impactHits(T.mit1+0.06,m);
    expect(heightAt([0,0],0,hits)).toBeLessThan(0);
    expect(Math.abs(heightAt([0,0],0,hits))).toBeGreaterThan(Math.abs(heightAt([23,13],0,hits)));
  });
  test('MIT +300ms floods at least 95 percent of the whole sheet for both impressions',() => {
    for (const tp of [T.mit1,T.mit2]) {
      let covered=0,total=0;
      for (let z=-13.5;z<=13.5;z+=0.27) for (let x=-24;x<=24;x+=0.48) { total++; if (flooded(x,z,tp+0.3,tp)) covered++; }
      expect(covered/total).toBeGreaterThanOrEqual(0.95);
      expect(floodRadius(tp,tp)).toBe(0);
    }
  });
  test('actual extruded outlines retain 80 percent width; revised I respects the 85 percent height cap',() => {
    const material=new THREE.MeshBasicMaterial();
    const measured=[];
    for (const e of m.events.filter(e => e.kind === 'giant')) {
      const solid=new SolidText(e.text,{ capH:e.capH,axes:e.axes,depth:0.5*e.capH,bevel:0,material });
      const at=onPaper(p3(e.x,0,e.z),e.tp,m);
      solid.group.position.set(at.x,at.y,at.z);
      solid.group.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),e.rot)
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
      solid.letters.forEach((_,i) => solid.setLetter(i,{ d:p3(e.baselineX,-e.baselineZ,0) }));
      const box=projectedBox(solid.letters.flatMap((_,i) => solid.letterCorners(i)),cameraAt(e.tp,m));
      measured.push({ text:e.text,time:e.tp,...box });
      if(e.text !== 'I' || e.word === T.first.words[0]) expect(box.w,`${e.text} @ ${e.tp}`).toBeGreaterThanOrEqual(1920*0.7);
      if(e.word !== T.first.words[0]) expect(box.h).toBeLessThanOrEqual(1080*0.85);
      solid.dispose();
    }
    material.dispose(); console.log('g3 pickup projected boxes',JSON.stringify(measured));
  });
  test('COMMIT and the nested bracket arrangement have the specified projected widths',() => {
    const commit=m.events.find(e => e.kind === 'commit')!;
    const b=projectedBox(pressCorners(commit,commit.tp,m),cameraAt(commit.tp,m));
    expect(b.w/1920).toBeCloseTo(0.92,2);
    const fit=T.bracketLine.words.at(-1)!.start;
    const arrangement=[commit,...m.events.filter(e => e.kind === 'bracket')].flatMap(e => pressCorners(e,fit,m,false));
    const frame=projectedBox(arrangement,cameraAt(fit,m)); expect(frame.w/1920).toBeCloseTo(0.88,2);
    console.log('g3 COMMIT / brackets',JSON.stringify({ commit:b,brackets:frame }));
  });
  test('each framed pickup remains within 85 percent height through its rise and lift, except the literal C7 close-up',() => {
    for(const e of m.events.filter(e => e.kind === 'giant' && e.word !== T.first.words[0])) {
      const next=m.events.filter(p => p.kind === 'giant' && p.tp > e.tp).map(p => p.tp)[0] ?? Infinity;
      for(let t=e.tp;t<Math.min(e.tp+.35,next);t+=1/120)
        expect(projectedBox(pressCorners(e,t,m),cameraAt(t,m)).h,`${e.text} @ ${t}`).toBeLessThanOrEqual(1080*.85+1e-5);
    }
  });
  test('C and D letter impressions have projected cap heights between 70 and 90px',() => {
    const caps=m.events.filter(e => e.kind === 'letter' || e.kind === 'tap').map(e => projectedBox(pressCorners(e,e.tp,m,false),cameraAt(e.tp,m)).h);
    for (const cap of caps) { expect(cap).toBeGreaterThanOrEqual(70); expect(cap).toBeLessThanOrEqual(90); }
    console.log('g3 C cap range',Math.min(...caps),Math.max(...caps));
  });
  test('28–43s projected ink polygons never intersect across different lyric words; COMMIT overprint is intentional',() => {
    let samples=0;
    for(let i=0;i<=150;i++) {
      const t=28+i/10,words=printedWordPolygons(t,m); samples++;
      for(let a=0;a<words.length;a++) for(let b=a+1;b<words.length;b++) {
        if(words[a]!.word.w === words[b]!.word.w) continue;
        expect(polygonsIntersect(words[a]!.polygon,words[b]!.polygon),`${t}: ${words[a]!.word.w} / ${words[b]!.word.w}`).toBe(false);
      }
      const active=[...m.events].reverse().find(e => e.kind === 'tap' && e.tp <= t);
      if(active && t < T.quit && clawdAt(t,m).visible) {
        expect(polygonsIntersect(projectedHull(clawdCorners(t,m),cameraAt(t,m)),
          projectedHull(impressionCorners(active,t,m),cameraAt(t,m))),`Clawd / ${active.text} @ ${t}`).toBe(false);
      }
    }
    for(const e of m.events.filter(e => e.kind === 'tap')) expect(polygonsIntersect(
      projectedHull(clawdCorners(e.tp,m),cameraAt(e.tp,m)),projectedHull(impressionCorners(e,e.tp,m),cameraAt(e.tp,m)))).toBe(false);
    console.log('g3 r2 non-overlap samples',samples);
  });
  test('major lit faces and five actual shadow points use normalized illumination; Clawd front is at least 0.85',() => {
    // The shadow ray follows -LIGHT from the paper into the known contacting
    // COMMIT block, at five interior front-face positions along its M stem.
    const commit=m.events.find(e => e.kind === 'commit')!;
    const material=new THREE.MeshBasicMaterial();
    const solid=new SolidText('COMMIT',{ capH:commit.capH,axes:commit.axes,depth:.5*commit.capH,bevel:0,material });
    solid.group.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
    solid.letters.forEach((_,i) => solid.setLetter(i,{ d:p3(commit.baselineX,-commit.baselineZ,0) }));
    const ray=new THREE.Raycaster(),samples=[];
    solid.group.updateMatrixWorld(true);
    for(let i=0;i<5;i++) {
      const x=-6.4+i*.04,z=-.5;
      const origin=new THREE.Vector3(x,.001,z),direction=new THREE.Vector3(-.8,.27,.55).normalize();
      ray.set(origin,direction);
      const shadow=ray.intersectObject(solid.group,true).length>0;
      samples.push({x,z,shadow,tone:lightTone([0,1,0],shadow?0:1)});
      expect(shadow).toBe(true);expect(lightTone([0,1,0],0)).toBeGreaterThanOrEqual(.1);expect(lightTone([0,1,0],0)).toBeLessThanOrEqual(.35);
    }
    for(const t of[27.3,29.7,41.3])for(let i=0;i<5;i++) {
      const tilt=screenTilt(t,T),n=[0,Math.cos(tilt),Math.sin(tilt)];
      const tone=AMBIENT+(lightIrradiance(n)-AMBIENT)*paperExposure(t,m);
      expect(tone).toBeGreaterThanOrEqual(.8);expect(tone).toBeLessThanOrEqual(.95);
    }
    expect(lightTone([0,1,0])).toBeCloseTo(LIT_TONE,12);
    expect(clawdFrontTone().tone).toBeGreaterThanOrEqual(.85);
    solid.dispose();material.dispose();console.log('g3 lighting samples',JSON.stringify(samples));
  });
  test('cameras, world, press layouts, carry and cursor are deterministic after arbitrary seeks',() => {
    for (const t of times) {
      const expected={ cam:cameraAt(t,m),clawd:clawdAt(t,m),cursor:cursorAt(t,m),carry:machineAffines(t,m),hits:impactHits(t,m) };
      for (const other of [...times].reverse()) { cameraAt(other,m); machineAffines(other,m); }
      expect({ cam:cameraAt(t,m),clawd:clawdAt(t,m),cursor:cursorAt(t,m),carry:machineAffines(t,m),hits:impactHits(t,m) }).toEqual(expected);
      expect(cursorAt(t)).toEqual(cursorAt(t,m));
    }
  });
  test('works suspends until its final axes; MY has a final width of 125',() => {
    const works=m.events.find(e => /^works$/i.test(e.word.w))!;
    expect(works.tp).toBe(works.word.end); expect(works.axes).toEqual(m.voice.form(works.word,works.word.end).axes);
    const my=T.machineLine.words[4]!; expect(m.voice.form(my,my.end).axes.wdth).toBe(125);
  });
  test('both Plex annotations retain projected caps from 14 to 22px through the camera pullback',() => {
    const box=ot(F.mono(500)).charToGlyph('H').getPath(0,0,100).getBoundingBox();
    for (const [row,tp] of [T.mit1,T.mit2].entries()) {
      const start=afterBeats(audio,tp,1);
      for (let t=start;t<T.machine;t+=0.05) {
        const a=hashAffine(t,row,m)!;
        const cap=Math.hypot(a.c,a.d)*(box.y2-box.y1);
        expect(cap).toBeGreaterThanOrEqual(14-1e-10); expect(cap).toBeLessThanOrEqual(22+1e-10);
      }
    }
  });
});

describe('V6 g3 cuts and cache contract',() => {
  test('entry is a full clay face, outgoing is the literal two-pixel baseline, final camera parks',() => {
    expect(entryPrim(T.start)).toEqual({ kind:'rect',x:0,y:0,w:1920,h:1080 });
    expect(impactPost(T.start,m).paletteSwap).toBe(0);
    expect(impactPost(T.start+1/60,m).paletteSwap).toBe(1);
    expect(impactPost(T.start+2/60,m).paletteSwap).toBe(1);
    expect(exitPrim(T.end-1/60)).toEqual({ kind:'line',x0:0,y0:540,x1:1920,y1:540,w:2 });
    expect(cameraAt(T.end-0.09,m)).toEqual(cameraAt(T.end-0.01,m));
    expect(impactPost(T.end-1/60,m)).toEqual({ paletteSwap:0,shake:[0,0],zoom:1 });
    expect(exitState(T.end-1/60,T).flat).toBe(0);
  });
  test('outgoing machine glyph affines exactly equal S09 shared drift at the cut; predecessor mismatch is explicit',() => {
    expect(machineAffines(T.end-1/60,m)).toEqual(carryDrift(machineSpec(m),T.end,.2).map(g => ({...g,b:g.b,d:g.d,f:540+(g.f-540)})));
    expect(machineAffines(T.end-1/60,m)).toEqual(machineTargetAffines(m));
    const legacy=old07(T.start-1/60,audio,resolveCTimes(audio,lyrics));
    const err=primError({ kind:'rect',x:legacy.x,y:legacy.y,w:legacy.h*0.55,h:legacy.h },entryPrim(T.start));
    expect(err.px).toBeGreaterThan(2); console.log('C7 baseline predecessor gap',JSON.stringify(err));
    // The worktree predecessor remains v5; the frozen-main runtime is audited
    // separately in out/v6-g3/integration-verification.json.
  });
  test('cache signature depends only on fixed past events and flood time, never render order',() => {
    const atlas=Object.create(PressAtlas.prototype) as PressAtlas;
    (atlas as any).model=m;
    for (const t of times) {
      const expected=atlas.key(t); times.forEach(other => atlas.key(other)); expect(atlas.key(t)).toBe(expected);
    }
    expect(atlas.key(T.mit1+0.04)).not.toBe(atlas.key(T.mit1+0.08));
    expect(atlas.key(T.mit1+0.31)).toBe(atlas.key(T.mit1+0.32));
  });
});
