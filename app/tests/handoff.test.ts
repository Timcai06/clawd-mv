import { expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { accelerando, exitEnvelope, primError, type Cut, type Prim } from '../src/kit/handoff';
import './kit-pathtext.test';

// Scene tasks register their exported pure primitives here; no scene is migrated by V6-K.
export type RegisteredCut = Cut & { cut: number; exitPrim: (t: number) => Prim; entryPrim: (t: number) => Prim };
import { Lyrics } from '../src/engine/lyrics';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import { exitPrim as exit14 } from '../src/scenes/s14-shaft';
import { entryPrim as entry15, exitPrim as exit15 } from '../src/scenes/parts/s15-layout';
import { resolveFTimes } from '../src/scenes/parts/s15-f-timing';
import { greenTimes } from '../src/scenes/parts/s16-green-state';
import { entryPrim as entry16, exitPrim as exit16 } from '../src/scenes/parts/s16-world';
import { resolveReleaseTimes } from '../src/scenes/parts/s17-release-state';
import { handoffIn as entry17 } from '../src/scenes/parts/s17-release-layout';
const song=new AudioData(audioJSON),words=new Lyrics(lyricsJSON),F=resolveFTimes({audio:song,lyrics:words}),G=greenTimes(song,words),R=resolveReleaseTimes(song,words);
export const CUTS: RegisteredCut[] = [
  {id:'C14',out:'S14',in:'S15',cut:F.s15[0]!,exitPrim:exit14,entryPrim:entry15},
  {id:'C15',out:'S15',in:'S16',cut:G.start,exitPrim:t=>exit15(t,song,F),entryPrim:t=>entry16(t,G)},
  {id:'C16',out:'S16',in:'S17',cut:G.end,exitPrim:t=>exit16(t,G),entryPrim:t=>({kind:'rect',...entry17(t,song,R)})},
];
test('registered cuts agree throughout the adjacent frame windows', () => {
  for (const cut of CUTS) for (let i = 0; i <= 4; i++) {
    const out = cut.exitPrim(cut.cut-(1-i/4)/60), incoming = cut.entryPrim(cut.cut+i/4/60), err = primError(out,incoming);
    expect(err.px,cut.id).toBeLessThanOrEqual(2); expect(err.size,cut.id).toBeLessThanOrEqual(0.02);
  }
});
test('point primitives compare centers and relative radii', () => {
  expect(primError({ kind: 'point',x: 0,y: 0,r: 10 },{ kind: 'point',x: 3,y: 4,r: 11 })).toEqual({ px: 5,size: 1/11 });
  expect(primError({ kind: 'point',x: 0,y: 0,r: 0 },{ kind: 'point',x: 0,y: 0,r: 0 })).toEqual({ px: 0,size: 0 });
  expect(() => primError({ kind: 'point',x: 0,y: 0,r: 1 },{ kind: 'rect',x: 0,y: 0,w: 1,h: 1 })).toThrow();
});
test('line primitive permits swapped endpoints and compares thickness', () => {
  const a = { kind: 'line' as const,x0: 1,y0: 2,x1: 8,y1: 9,w: 2 };
  expect(primError(a,{ ...a,x0: 8,y0: 9,x1: 1,y1: 2 })).toEqual({ px: 0,size: 0 });
  expect(primError(a,{ ...a,x0: 4,y0: 6,x1: 11,y1: 13,w: 4 })).toEqual({ px: 5,size: 0.5 });
});
test('rect primitive compares rolled corners and both dimensions', () => {
  const a = { kind: 'rect' as const,x: 10,y: 20,w: 30,h: 40,roll: 0.4 };
  expect(primError(a,{ ...a,x: 13,y: 24 })).toEqual({ px: 5,size: 0 });
  expect(primError(a,{ ...a,roll: a.roll+Math.PI }).px).toBeCloseTo(50,10);
  expect(primError(a,{ ...a,w: 60 }).size).toBe(0.5);
});
test('carry primitive compares all three font-metric affine points', () => {
  const spec = { text: 'machine',size: 100,axes: { wdth: 100,wght: 800 },x: 40,y: 500,color: 'paper' as const };
  const a = { kind: 'carry' as const,spec };
  expect(primError(a,a)).toEqual({ px: 0,size: 0 });
  expect(primError(a,{ kind: 'carry',spec: { ...spec,x: 43,y: 504 } })).toEqual({ px: 5,size: 0 });
  const big = primError(a,{ kind: 'carry',spec: { ...spec,size: 110 } }); expect(big.size).toBeCloseTo(1/11,10); expect(big.px).toBeGreaterThan(10);
  expect(primError(a,{ kind: 'carry',spec: { ...spec,text: 'other' } })).toEqual({ px: Infinity,size: Infinity });
});
test('exit stillness starts exactly at final 100 ms; gain ramps over 90 ms', () => {
  expect(exitEnvelope(8,10)).toEqual({ still: 0,gain: 1 }); expect(exitEnvelope(9.899,10).still).toBe(0); expect(exitEnvelope(9.9,10).still).toBe(1);
  expect(exitEnvelope(9.91,10).gain).toBe(1); expect(exitEnvelope(9.955,10,2.2).gain).toBeCloseTo(1.6,10);
  expect(exitEnvelope(10,10).gain).toBe(1.9); expect(exitEnvelope(11,10,2.2)).toEqual({ still: 1,gain: 2.2 });
});
const audio = new AudioData({ duration: 5,bpm: 120,fps: 100,beats: [0,0.5,1.1,1.5,2.2,2.7,3.1,3.6,4.2,4.7],downbeats: [0,2.2,4.2],sections: [],features: {},onsets: {} });
test('accelerando reads variable beat intervals and changes from eighths to sixteenths', () => {
  const times = accelerando(audio,0,1.1,2.2);
  expect(times).toEqual([0,0.25,0.5,0.8,1.1,1.2000000000000002,1.3,1.4,1.5,1.675,1.85,2.0250000000000004]);
  expect(new Set(times).size).toBe(times.length); expect(times.at(-1)!).toBeLessThan(2.2);
  expect(accelerando(audio,2,3,1)).toEqual([]); expect(accelerando(audio,0,10,1.1)).toEqual([0,0.25,0.5,0.8]);
  expect(accelerando(audio,0,-1,0.5)).toEqual([0,0.125,0.25,0.375]);
});

// G4 owns the C8 incoming / C12 outgoing sides. C12's canonical incoming contract is used until
// the independently owned S13 migration supplies its actual entryPrim; the unchanged v5 S13
// still opens from eleven12 (rect), and must not be misreported as runtime continuity.
import { audio as g4Audio,lyrics as g4Lyrics,voice as g4Voice,T as g4T } from './scene-v6-g4.test';
import * as g4Scope from '../src/scenes/parts/s09-scope';
import * as g4Glass from '../src/scenes/parts/s10-glass';
import * as g4Rain from '../src/scenes/parts/s11-layout';
import * as g4Copy from '../src/scenes/parts/s12-world';
import { CUT } from '../src/kit/handoff';
import { commitScore, handoffOut as hashOut } from '../src/scenes/parts/s08-layout';
import { afterBeats } from '../src/kit/time';
import { deepParticle } from '../src/scenes/parts/s11-deep';
import * as THREE from 'three';
const g4Commit=commitScore(g4Audio,g4Lyrics);
function shardVelocityPrim(t:number):Prim {
  const q={x:0,y:2,z:0},a=g4Glass.shardScreen(g4Audio,g4T,0,0,t,q)!,tb=afterBeats(g4Audio,t,0.00001);
  const b=g4Glass.shardScreen(g4Audio,g4T,0,0,tb,q)!;
  return {kind:'line',x0:0,y0:0,x1:(b.x-a.x)/0.00001,y1:(b.y-a.y)/0.00001,w:1};
}
function rainVelocityPrim(t:number):Prim {
  const view=g4Rain.rainView(t,g4Audio,g4T),cam=new THREE.PerspectiveCamera(52,1920/1080,0.1,200);
  cam.position.set(0,0,view.z);cam.up.set(Math.sin(view.roll),Math.cos(view.roll),0);cam.lookAt(0,0,-20);cam.updateMatrixWorld();
  const project=(d:number)=>{const p=deepParticle(37,d);return new THREE.Vector3(p.x,p.y,p.z).project(cam);};
  const a=project(0),b=project(220*0.00001);
  return {kind:'line',x0:0,y0:0,x1:(b.x-a.x)*960/0.00001,y1:-(b.y-a.y)*540/0.00001,w:1};
}
CUTS.push(
 {id:'C8-g4-entry',out:'S08',in:'S09',cut:g4T.terminal,exitPrim:t=>{const h=hashOut(t,g4Audio,g4Commit);return {kind:'line',x0:h.x0,y0:h.y,x1:h.x1,y1:h.y,w:2};},entryPrim:g4Scope.entryPrim},
 {id:'C9',out:'S09',in:'S10',cut:g4T.wallStart,exitPrim:g4Scope.exitPrim,entryPrim:g4Glass.entryPrim},
 {id:'C10-motion',out:'S10',in:'S11',cut:g4T.rainStart,exitPrim:shardVelocityPrim,entryPrim:rainVelocityPrim},
 {id:'C11',out:'S11',in:'S12',cut:g4T.rerunStart,exitPrim:g4Rain.exitPrim,entryPrim:t=>g4Copy.entryPrim(g4Voice,t,g4T)},
 {id:'C12-g4-exit-contract',out:'S12',in:'S13-contract',cut:g4T.end,exitPrim:t=>g4Copy.exitPrim(g4Voice,t,g4T),
   entryPrim:()=>({kind:'line',...CUT.diag13,w:2})},
);
test('G4 registers five owned cut contracts (C12 incoming implementation is external)',()=>{
 const own=CUTS.filter(c=>c.id.startsWith('C8')||c.id==='C9'||c.id.startsWith('C10')||c.id==='C11'||c.id.startsWith('C12'));
 expect(own.length).toBe(5);
 for(const cut of own){
  const errors=Array.from({length:5},(_,i)=>primError(cut.exitPrim(cut.cut-(1-i/4)/60),cut.entryPrim(cut.cut+i/4/60)));
  console.log('G4_CUT',cut.id,JSON.stringify({px:Math.max(...errors.map(e=>e.px)),size:Math.max(...errors.map(e=>e.size))}));
 }
});
