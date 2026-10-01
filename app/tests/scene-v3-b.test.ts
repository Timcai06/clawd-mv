import { describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import { HANDOFF, type Rect } from '../src/kit/handoff';
import { afterBeats } from '../src/kit/time';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import { TYPE_LEVELS as S05 } from '../src/scenes/s05-platform';
import { TYPE_LEVELS as S06 } from '../src/scenes/s06-todo';
import { TYPE_LEVELS as S07 } from '../src/scenes/s07-keyboard';
import { handoffIn as in05, handoffOut as out05, platformLayout, platformTimes } from '../src/scenes/parts/s05-platform-model';
import { handoffIn as in06, handoffOut as out06, resolveCTimes, todoLayout, checkHeadline } from '../src/scenes/parts/s06-timing';
import { handoffIn as in07, handoffOut as out07, keyboardLayout, cameraAt, atScreen, projectPoint, riderGeometry, WORD_KEYS, KEY_FIELD } from '../src/scenes/parts/s07-terrain';
import { clipBox } from '../src/scenes/parts/s05-print';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import board from '../../storyboard/shots.json';

const au=new AudioData(audioJSON),lyrics=new Lyrics(lyricsJSON),voice=new Voice(lyrics,au);
const P=platformTimes(au,lyrics),T=resolveCTimes(au,lyrics);
const shots=resolveStoryboard(board as Storyboard,lyrics,au).shots;
const sample=(id: string)=>{const s=shots.find(s=>s.id===id)!;return s.start+s.duration*0.6;};

// Measured ONLY from out/storyboard/v2/kf-S05/06/07.png (1672×941).
// Whole-pixel outer ink edges, scaled x by 1920/1672, y by 1080/941.
// S05: platform union [0,377..1672,941]; filename [0,720..1094,941];
//       sprite body/arms/legs [789,488..1043,581], excluding the tall cursor below it.
// S06: CHECK visible ink [0,0..1672,407]; ruled sheet [368,397..1672,941];
//       sprite [618,664..750,710], excluding the detached pen block/motion marks.
// S07: keys [0,58..1672,941]; title [872,0..1672,405];
//       active Enter [1130,596..1672,941]; sprite [351,81..494,165].
// These are image measurements independent of the production constants. Empty
// pixels inside a glyph/mesh/sprite are part of its axis-aligned enclosing box.
const measured=(x0: number,y0: number,x1: number,y1: number): Rect=>({x:x0*1920/1672,y:y0*1080/941,w:(x1-x0)*1920/1672,h:(y1-y0)*1080/941});
const errors=(actual: Rect,target: Rect)=>({
  center:Math.hypot(actual.x+actual.w/2-target.x-target.w/2,actual.y+actual.h/2-target.y-target.h/2),
  width:Math.abs(actual.w/target.w-1),height:Math.abs(actual.h/target.h-1),
});
function check(name: string,actual: Rect,target: Rect){
  const e=errors(actual,target);
  expect(e.center).toBeLessThanOrEqual(96);expect(e.width).toBeLessThanOrEqual(0.15);expect(e.height).toBeLessThanOrEqual(0.15);
  console.log(`${name}: center ${e.center.toFixed(2)} px, width ${(e.width*100).toFixed(2)}%, height ${(e.height*100).toFixed(2)}%`);
}

describe('V3 B / measured storyboard composition',()=>{
  test('S05 ledge union, cropped filename and canonical Clawd',()=>{
    const s=platformLayout(au,sample('S05-3'),P);
    check('S05 platforms',s.platformsBox,measured(0,377,1672,941));
    check('S05 month.ts',clipBox(s.title),measured(0,720,1094,941));
    check('S05 Clawd',s.clawdBox,measured(789,488,1043,581));
    expect(s.platformsBox.w*s.platformsBox.h/(1920*1080)).toBeGreaterThanOrEqual(0.3);
  });
  test('S06 CHECK, ruled sheet and canonical Clawd at the third check',()=>{
    const s=todoLayout(au,sample('S06-2'),T);
    check('S06 CHECK',clipBox(s.title),measured(0,0,1672,407));
    check('S06 sheet',s.sheet,measured(368,397,1672,941));
    // This sample is beyond the second snare hop's 0.6-beat window, before snare 3.
    check('S06 Clawd',{x:s.clawd.x,y:s.clawd.y,w:16*s.clawd.px,h:5*s.clawd.px},measured(618,664,750,710));
    expect(clipBox(s.title).w*clipBox(s.title).h/(1920*1080)).toBeGreaterThanOrEqual(0.3);
  });
  test('S07 actual projected key vertices and occupied sprite cells',()=>{
    const s=keyboardLayout(au,sample('S07-1'),T);
    check('S07 keys',s.field,measured(0,58,1672,941));
    check('S07 ENTER',s.title,measured(872,0,1672,405));
    check('S07 Enter cap',clipBox(s.enter),measured(1130,596,1672,941));
    check('S07 Clawd',s.rider,measured(351,81,494,165));
    expect(s.field.w*s.field.h/(1920*1080)).toBeGreaterThanOrEqual(0.3);
    expect(KEY_FIELD.length).toBe(8*KEY_FIELD.filter(k=>k.index<KEY_FIELD.length/8).length);
    const cam=cameraAt(au,sample('S07-1'),T);
    const screen=projectPoint(atScreen(486,145,cam,25),cam);
    expect(Math.hypot(screen.x-486,screen.y-145)).toBeLessThan(1e-8);
    expect(cam).toBeInstanceOf(THREE.PerspectiveCamera);
  });
  test('S07 rider follows a world-space wave crest and the dive leaves it behind',()=>{
    const anchor=sample('S07-1'),later=afterBeats(au,T.launch,1);
    const a=riderGeometry(au,anchor,T,cameraAt(au,anchor,T)),b=riderGeometry(au,later,T,cameraAt(au,later,T));
    expect(b.pos.x).toBe(a.pos.x);expect(b.pos.z).toBe(a.pos.z);expect(b.pos.y).not.toBe(a.pos.y);
    expect(b.pos.clone().sub(b.support).toArray()).toEqual(a.pos.clone().sub(a.support).toArray());
    const p=projectPoint(b.pos,cameraAt(au,later,T));
    expect(Math.hypot(p.x-486,p.y-145)).toBeGreaterThan(100);
  });
});

describe('V3 B / one-beat handoffs',()=>{
  test('S04 → S05 exact incoming sprite and no continued transition after one beat',()=>{
    expect(in05(P.start,au,P)).toEqual(HANDOFF.clawd04);
    const p=in05(afterBeats(au,P.start,1),au,P);
    expect(p.px).toBe(18.5);expect(p.y).toBe(566);
  });
  test('S05 → S06 clay underline endpoints on last rendered frame',()=>{
    const outgoing=out05(P.end-1/60,au,P),incoming=in06(T.todo,au,T);
    for(const k of ['x0','x1','y'] as const){expect(Math.abs(outgoing[k]-HANDOFF.strike05[k])).toBeLessThanOrEqual(2);expect(incoming[k]).toBe(HANDOFF.strike05[k]);}
    console.log('S05 strike last-frame error:',Math.max(...(['x0','x1','y'] as const).map(k=>Math.abs(outgoing[k]-HANDOFF.strike05[k]))).toFixed(4),'px');
    expect(out05(afterBeats(au,P.end,-1.1),au,P)).toEqual(out05(afterBeats(au,P.end,-1),au,P));
  });
  test('S06 → S07 exact pen / first lyric key, then centred legacy S08 cursor',()=>{
    const p=out06(T.keyboard-1/60,au,T);
    for(const k of ['x','y'] as const){expect(Math.abs(p[k]-HANDOFF.pen06[k])).toBeLessThanOrEqual(2);expect(in07(T.keyboard,au,T)[k]).toBe(HANDOFF.pen06[k]);}
    expect(out07(T.end,au,T)).toEqual({x:940.2,y:576,h:72});
    const end=out07(T.end-1/60,au,T);
    expect(Math.hypot(end.x-940.2,end.y-576)).toBeLessThanOrEqual(2);
    expect(WORD_KEYS.at(-1)!.enter).toBe(true);
    console.log('S06 pen last-frame error:',Math.hypot(p.x-HANDOFF.pen06.x,p.y-HANDOFF.pen06.y).toFixed(4),'px');
    console.log('S07 cursor last-frame error:',Math.hypot(end.x-940.2,end.y-576).toFixed(4),'px');
  });
});

describe('V3 B / lyric birth, hierarchy and deterministic seeking',()=>{
  test('every word intersecting this group is unborn before its aligned onset',()=>{
    const lines=lyrics.lines.filter(l=>l.end>=P.start&&l.start<T.end);
    for(const line of lines)for(const w of line.words)expect(voice.form(w,w.start-0.01).born).toBe(0);
    // Prefixes crossing S04/S05, S05/S06 and S06/S07 are already born on entry.
    for(const [at,prefix] of [[P.start,'So I crack'],[T.todo,'Read the'],[T.keyboard,'Claws on']] as const){
      const l=lyrics.lineAt(at)!;
      expect(l.words.filter(w=>voice.form(w,at).born>0).map(w=>w.w).join(' ')).toStartWith(prefix);
    }
  });
  test('three CHECK onsets control continuous weights without anticipating the first',()=>{
    expect(checkHeadline(T.checkWords[0]!-0.01,T).born).toBe(0);
    for(const [i,w] of [300,600,900].entries()){
      const word=T.plan.words.filter(w=>w.w.toLowerCase().startsWith('check'))[i]!;
      expect(checkHeadline(word.end,T).weight).toBe(w);
    }
  });
  test('three declared cap tiers',()=>{
    for(const l of [S05,S06,S07]){
      expect(l.lyric).toBeGreaterThanOrEqual(50);expect(l.lyric).toBeLessThanOrEqual(110);
      expect(l.label).toBeGreaterThanOrEqual(14);expect(l.label).toBeLessThanOrEqual(22);
      expect(l.giant).toBeGreaterThanOrEqual(200);expect(l.giant/l.lyric).toBeGreaterThanOrEqual(2.5);
      expect(l.lyric/l.label).toBeGreaterThanOrEqual(2.5);
    }
  });
  test('all pure layout / handoff functions survive repeated and out-of-order sampling',()=>{
    const functions=[(t:number)=>platformLayout(au,t,P),(t:number)=>todoLayout(au,t,T),(t:number)=>keyboardLayout(au,t,T),
      (t:number)=>in05(t,au,P),(t:number)=>out05(t,au,P),(t:number)=>in06(t,au,T),(t:number)=>out06(t,au,T),(t:number)=>in07(t,au,T),(t:number)=>out07(t,au,T)];
    for(const fn of functions){const t=sample('S07-1'),a=fn(t);expect(fn(t)).toEqual(a);fn(P.start);fn(T.end);fn(T.checkWords[1]!);expect(fn(t)).toEqual(a);}
    const other=new AudioData({...audioJSON,bpm:240});
    expect(keyboardLayout(other,sample('S07-1'),T)).toEqual(keyboardLayout(au,sample('S07-1'),T));
  });
});
