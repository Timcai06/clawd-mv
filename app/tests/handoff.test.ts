import { expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { accelerando, exitEnvelope, primError, type Cut, type Prim } from '../src/kit/handoff';
import './kit-pathtext.test';

// Scene tasks register their exported pure primitives here; no scene is migrated by V6-K.
export type RegisteredCut = Cut & { cut: number; exitPrim: (t: number) => Prim; entryPrim: (t: number) => Prim };
export const CUTS: RegisteredCut[] = [];
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

// G2 owns C3 entry, both C4/C5/C6 sides, and C7 exit. Neighbor groups
// have not migrated on this worktree's main snapshot: C3/C7 compare our
// actual projected geometry to their specified contracts, not their old scenes.
import { Lyrics as G2Lyrics } from '../src/engine/lyrics';
import g2AudioJSON from '../../data/audio.json';import g2LyricsJSON from '../../data/lyrics.json';
import * as g2s04 from '../src/scenes/parts/s04-city-model';
import * as g2s05 from '../src/scenes/parts/s05-world';
import * as g2s06 from '../src/scenes/parts/s06-world';
import * as g2s07 from '../src/scenes/parts/s07-terrain';
import {resolveCTimes as g2Times} from '../src/scenes/parts/s06-timing';
import {platformTimes as g2PlatformTimes} from '../src/scenes/parts/s05-platform-model';
import {CUT as G2CUT} from '../src/kit/handoff';
const g2a=new AudioData(g2AudioJSON),g2l=new G2Lyrics(g2LyricsJSON),g2C=g2s04.cityTimes(g2a,g2l),g2P=g2PlatformTimes(g2a,g2l),g2T=g2Times(g2a,g2l);
CUTS.push(
  {id:'C3',out:'S03-contract',in:'S04',cut:g2C.start,exitPrim:()=>({kind:'rect',...G2CUT.grid04}),entryPrim:t=>g2s04.entryPrim(t,g2a,g2C)},
  {id:'C4',out:'S04',in:'S05',cut:g2P.start,exitPrim:t=>g2s04.exitPrim(t,g2a,g2C),entryPrim:t=>g2s05.entryPrim(t,g2a,g2l)},
  {id:'C5',out:'S05',in:'S06',cut:g2T.todo,exitPrim:t=>g2s05.exitPrim(t,g2a,g2l),entryPrim:t=>g2s06.entryPrim(t,g2a,g2T)},
  {id:'C6',out:'S06',in:'S07',cut:g2T.keyboard,exitPrim:t=>g2s06.exitPrim(t,g2a,g2T),entryPrim:t=>g2s07.entryPrim(t,g2a,g2T)},
  {id:'C7',out:'S07',in:'S08-contract',cut:g2T.end,exitPrim:t=>g2s07.exitPrim(t,g2a,g2T),entryPrim:()=>({kind:'rect',x:0,y:0,w:1920,h:1080})},
);
