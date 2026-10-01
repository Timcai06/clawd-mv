import { describe, expect, test } from 'bun:test';
import type { LineBatch } from '../src/engine/lines';
import { cursorSpark, cursorSpeed, heatTrail, sparkFade, sparkParticles, trailColor } from '../src/kit/spark';
import { lin } from '../src/theme';
import { trailHead } from '../src/kit/cursor';

function record(draw: (lb: LineBatch) => void) {
  const lines: unknown[][] = [];
  draw({ seg2: (...args: unknown[]) => lines.push(structuredClone(args)) } as unknown as LineBatch);
  return lines;
}
const at = (t: number) => ({ x: t * 400, y: 30, h: 24 });
const canvas = () => ({ globalAlpha: 1, save(){}, restore(){}, translate(){}, scale(){}, fillRect(){} }) as unknown as CanvasRenderingContext2D;
const particles = (t: number) => record(lb => sparkParticles(lb,t,at,{ rate: tb => 40 + 80 * (0.5+0.5*Math.sin(tb)), rateMax:120, seed:7 }));

describe('fixed birth identities and direct age ballistics', () => {
  test('same t returns exactly the same segments', () => { expect(particles(5).length).toBeGreaterThan(0); expect(particles(5)).toEqual(particles(5)); });
  test('reverse seeks do not change particles', () => { const a=particles(5),b=particles(3); expect(particles(3)).toEqual(b); expect(particles(5)).toEqual(a); });
  test('variable rates are evaluated on the fixed birth clock', () => {
    const births:number[]=[];
    record(lb=>sparkParticles(lb,3.027,at,{rate:tb=>{births.push(tb);return 40;},rateMax:100}));
    expect(births.length).toBeGreaterThan(0);
    for(const tb of births) { expect(Math.abs(tb*100-Math.round(tb*100))).toBeLessThan(1e-9); expect(tb).toBeLessThanOrEqual(3.027); }
  });
  test('variable rate without a maximum is rejected', () => { expect(()=>record(lb=>sparkParticles(lb,3,at,{rate:()=>10}))).toThrow('rateMax'); });
  test('zero rate emits nothing',()=>{expect(record(lb=>sparkParticles(lb,5,at,{rate:0}))).toEqual([]);});
  test('null path emits nothing',()=>{expect(record(lb=>sparkParticles(lb,5,()=>null))).toEqual([]);});
  test('stationary cursor emits no sparks',()=>{
    const fixed=()=>({x:10,y:20,h:24}); expect(cursorSpeed(5,fixed)).toBe(0);
    expect(record(lb=>cursorSpark(canvas(),undefined,lb,5,fixed,{on:'ink'}))).toEqual([]);
  });
  test('moving cursor emits and leaves source records unchanged',()=>{
    const shared={x:1,y:2,h:24,on:0}; record(lb=>cursorSpark(canvas(),undefined,lb,5,()=>shared,{on:'ink'})); expect(shared.on).toBe(0);
    expect(record(lb=>cursorSpark(canvas(),undefined,lb,5,at,{on:'ink'})).length).toBeGreaterThan(0);
  });
  test('PAPER particles print clay; CLAY particles print paper',()=>{
    for(const [on,key] of [['paper','clay'],['clay','paper']] as const) {
      const lines=record(lb=>sparkParticles(lb,3.1,at,{on,rate:90}));expect(lines.length).toBeGreaterThan(0);
      for(const line of lines) expect(line[5]).toEqual(lin(key));
    }
  });
  test('PAPER birth rate is half the INK rate on the same maximum clock',()=>{
    const ink=record(lb=>cursorSpark(canvas(),undefined,lb,5,at,{on:'ink',seed:5}));
    const paper=record(lb=>cursorSpark(canvas(),undefined,lb,5,at,{on:'paper',seed:5}));
    expect(paper.length).toBeGreaterThan(0);expect(paper.length).toBeLessThan(ink.length);
    for(const line of paper) expect(ink.some(x=>JSON.stringify(x.slice(0,5))===JSON.stringify(line.slice(0,5)))).toBe(true);
  });
  test('last handoff frame has zero spark alpha',()=>{
    expect(sparkFade(10-1/60,10)).toBe(0);
    expect(record(lb=>cursorSpark(canvas(),undefined,lb,10-1/60,at,{on:'ink',end:10}))).toEqual([]);
  });
});
describe('time-stamped thermal trails',()=>{
  test('age zero is hot and age beyond cool is exactly clay',()=>{expect(trailColor(0)).toEqual(lin('hot'));expect(trailColor(0.4)).toEqual(lin('clay'));expect(trailColor(2)).toEqual(lin('clay'));});
  test('actual endpoint segment is hot; old segments are clay',()=>{
    const hot=record(lb=>heatTrail(lb,0.1,at,{from:0}));expect(hot.at(-1)![5]).toEqual(lin('hot'));
    const cold=record(lb=>heatTrail(lb,2,at,{from:0,to:0.1}));for(const line of cold) expect(line[5]).toEqual(lin('clay'));
  });
  test('same t and reverse order preserve trail segments',()=>{
    const trail=(t:number)=>record(lb=>heatTrail(lb,t,at,{from:2}));const a=trail(5),b=trail(3);expect(trail(3)).toEqual(b);expect(trail(5)).toEqual(a);
  });
  test('null gaps never receive a connecting segment',()=>{
    const lines=record(lb=>heatTrail(lb,0.1,t=>t>0.04&&t<0.07?null:{x:t,y:0},{from:0}));
    expect(lines.some(x=>(x[0] as number)<0.04&&(x[2] as number)>0.07)).toBe(false);
  });
  test('explicit corner birth times are inserted exactly',()=>{
    const knot=0.051234;const lines=record(lb=>heatTrail(lb,0.1,t=>({x:Math.min(t,knot),y:Math.max(0,t-knot)}),{from:0,knots:[knot]}));
    expect(lines.some(x=>x[2]===knot&&x[3]===0)).toBe(true);
  });
  test('drawing-free trail head preserves the legacy arc length',()=>{
    expect(trailHead([[0,0],[3,0],[3,4]],3/7)).toEqual({x:3,y:0});expect(trailHead([[0,0],[3,0],[3,4]],1)).toEqual({x:3,y:4});
  });
});

// The emitter samples moving card geometry at birth, rather than at the render time.
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import { greenTimes, greenState, greenArcCards } from '../src/scenes/parts/s16-green-state';
import audioData from '../../data/audio.json';
import lyricData from '../../data/lyrics.json';
test('birth-time domino faces equal the unchanged production geometry in either seek order',()=>{
  const audio=new AudioData(audioData),lyrics=new Lyrics(lyricData),voice=new Voice(lyrics,audio),T=greenTimes(audio,lyrics);
  for(const t of [110,108,112,T.start,T.end-1/60]) {
    const a=greenArcCards(audio,t,T),b=greenState(audio,lyrics,voice,t,T).cards;
    expect(a.map(c=>[c.front,c.side,c.face,c.fall])).toEqual(b.map(c=>[c.front,c.side,c.face,c.fall]));
    greenArcCards(audio,T.end,T);greenArcCards(audio,T.start,T);expect(greenArcCards(audio,t,T)).toEqual(a);
  }
});
