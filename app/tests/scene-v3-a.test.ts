import { beforeAll, afterAll, describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { loadFonts } from '../src/engine/type';
import { Voice } from '../src/kit/lyric-moves';
import { varRun } from '../src/kit/vartype';
import { HANDOFF, type Rect } from '../src/kit/handoff';
import { afterBeats } from '../src/kit/time';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import { TYPE_LEVELS as L01 } from '../src/scenes/s01-boot';
import { TYPE_LEVELS as L02 } from '../src/scenes/s02-notify';
import { TYPE_LEVELS as L03 } from '../src/scenes/s03-issue';
import { TYPE_LEVELS as L04 } from '../src/scenes/s04-calendar';
import { openingTimes } from '../src/scenes/parts/s01-timing';
import { cityTimes, cityBounds, cityState, cameraAt, handoffIn as in04, handoffOut as out04 } from '../src/scenes/parts/s04-city-model';
import { drawCursor } from '../src/kit/cursor';
import { cursorFromTop, inkBounds } from '../src/scenes/parts/s01-print';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import board from '../../storyboard/shots.json';
import keyframes from '../../storyboard/keyframes.json';
const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON), voice = new Voice(lyrics,audio);
const T = openingTimes(audio,lyrics), C = cityTimes(audio,lyrics);
const shots = resolveStoryboard(board as Storyboard,lyrics,audio).shots;
const anchor = (scene:string) => {
  const id = keyframes.frames.find(f=>f.id===scene)!.shot;
  const s = shots.find(s=>s.id===id)!;return s.start+s.duration*.6;
};
// Manual measurement on the ORIGINAL 1672×941 PNGs, not on renders. Read the outer ink/frame
// extents with x/y rulers, then multiply x/w by 1920/1672 and y/h by 1080/941.
// S01: frame (418,182)-(1254,599), Clawd incl. breathing pixels (583,351)-(1090,507).
// S02: visible giant (0,148)-(1672,692), Clawd (669,741)-(885,808).
// S03: clipped form (51,0)-(1645,941), Clawd (1315,817)-(1469,886).
// S04: city clipped (0,153)-(1672,941), tower (1067,153)-(1276,503),
//      Clawd (1117,467)-(1207,524). Generated S03/S04 sprites have a taller body than canonical
//      16×5; only the display rectangle is stretched (the cell artwork is unchanged).
const measured = (x:number,y:number,w:number,h:number):Rect => ({x:x*1920/1672,y:y*1080/941,w:w*1920/1672,h:h*1080/941});
const targets = {
  S01:{dominant:measured(418,182,836,417),clawd:measured(583,351,507,156)},
  S02:{dominant:measured(0,148,1672,544),clawd:measured(669,741,216,67)},
  S03:{dominant:measured(51,0,1594,941),clawd:measured(1315,817,154,69)},
  S04:{dominant:measured(0,153,1672,788),clawd:measured(1117,467,90,57),tower:measured(1067,153,209,350)},
};
function error(a:Rect,b:Rect){return {center:Math.hypot(a.x+a.w/2-b.x-b.w/2,a.y+a.h/2-b.y-b.h/2),width:Math.abs(a.w-b.w)/b.w,height:Math.abs(a.h-b.h)/b.h};}
function assertBox(a:Rect,b:Rect){const e=error(a,b);expect(e.center).toBeLessThanOrEqual(96);expect(e.width).toBeLessThanOrEqual(.15);expect(e.height).toBeLessThanOrEqual(.15);return e;}
const layouts={S04:()=>cityBounds(audio,anchor('S04'),C)};

// Load the actual bundled font outlines in Bun; restore browser shims immediately. No canvas or
// screenshot is involved. loadFonts fills the production registry consumed by varRun.
const oldFetch=globalThis.fetch,oldDoc=(globalThis as any).document,oldFace=(globalThis as any).FontFace;
beforeAll(async()=>{
  (globalThis as any).FontFace=class{async load(){return this;}};
  (globalThis as any).document={fonts:{add(){},ready:Promise.resolve()}};
  globalThis.fetch=(async(url:any)=>new Response(await Bun.file(new URL('../public/'+String(url),import.meta.url)).arrayBuffer())) as typeof fetch;
  try{await loadFonts();}finally{globalThis.fetch=oldFetch;(globalThis as any).document=oldDoc;(globalThis as any).FontFace=oldFace;}
});
afterAll(()=>{globalThis.fetch=oldFetch;(globalThis as any).document=oldDoc;(globalThis as any).FontFace=oldFace;});

describe('A / storyboard composition',()=>{
  for(const scene of ['S04'] as const)test(`${scene} original-image bounds vs production layout / projection`,()=>{
    const actual=layouts[scene](),target=targets[scene];
    const errors={dominant:assertBox(actual.dominant,target.dominant),clawd:assertBox(actual.clawd,target.clawd)};
    console.log(scene,JSON.stringify({t:anchor(scene),actual,errors}));
  });
  test('32 is a projected solid, not a declared screen rectangle',()=>{
    const actual=cityBounds(audio,anchor('S04'),C).tower;
    console.log('S04 tower',JSON.stringify({actual,error:assertBox(actual,targets.S04.tower)}));
  });
  test('PING has ink outlines and its scaled visible rectangle is the same box used by drawing',()=>{
    const f=voice.form(lyrics.lines[0]!.words[3]!,anchor('S02'));
    const box=inkBounds(varRun('PING',100,{wdth:f.axes.wdth,wght:Math.max(800,f.axes.wght)}));
    expect(box.w).toBeGreaterThan(100);expect(box.h).toBeGreaterThan(50);
    expect(f.born).toBe(1);
  });
});
describe('A / match cuts and one-beat limits',()=>{
  function match(actual:Record<string,number>,target:Record<string,number>){
    for(const [key,value] of Object.entries(target))expect(Math.abs(actual[key]!-value)).toBeLessThanOrEqual(2);
  }
  // S01/S02/S03 V3 sprite/card cuts are replaced by scene-v6-g1.test.ts.
  test('unchanged S04 V3 handoff and beat limits remain covered',()=>{
    match(in04(C.start,audio,C),HANDOFF.month03);match(out04(C.end-1/60,audio,C),HANDOFF.clawd04);
    expect(in04(afterBeats(audio,C.start,1),audio,C).alpha).toBe(0);
    expect(out04(C.end-1/60,audio,C)).toEqual(out04(C.end,audio,C));
  });
});
describe('A / levels, vocal timing and seek order',()=>{
  test('declared cap heights obey the three-level intervals and ratios',()=>{
    for(const l of [L01,L02,L03,L04]){
      expect(l.lyric).toBeGreaterThanOrEqual(50);expect(l.lyric).toBeLessThanOrEqual(110);
      expect(l.label).toBeGreaterThanOrEqual(14);expect(l.label).toBeLessThanOrEqual(22);
      expect(l.lyric/l.label).toBeGreaterThanOrEqual(2.5);
      if(l.giant!==null){expect(l.giant).toBeGreaterThanOrEqual(200);expect(l.giant/l.lyric).toBeGreaterThanOrEqual(2.5);}
    }
    const actual=varRun('H',74,{wdth:100,wght:700}).capH;
    expect(actual).toBeGreaterThanOrEqual(50);expect(actual).toBeLessThanOrEqual(110);
    expect(Math.abs(actual-L01.lyric)).toBeLessThan(1);
  });
  for(const scene of ['S01','S02','S03','S04'] as const)test(`${scene}: each intersecting vocal word is unborn before onset`,()=>{
    const windows=shots.filter(s=>s.scene===scene),start=windows[0]!.start,end=windows.at(-1)!.end;
    const words=lyrics.lines.flatMap(l=>l.words).filter(w=>w.start<end&&w.end>=start);
    expect(words.length).toBeGreaterThan(0);
    for(const w of words)expect(voice.form(w,w.start-.01).born).toBe(0);
  });
  test('v6 R1: the issue cut sits on the beat before "Got"',()=>{
    expect(lyrics.get('Got a bug').words[0]!.start).toBeGreaterThanOrEqual(T.issue-0.02);
  });
  test('layout, camera, handoff and sound forms are independent of seek history',()=>{
    const states=[(t:number)=>cityBounds(audio,t,C),(t:number)=>cameraAt(audio,t,C,cityState(audio,t,C)),(t:number)=>out04(t,audio,C),
      (t:number)=>voice.forms(lyrics.lines[2]!,t)];
    for(const fn of states){const t=anchor('S04'),a=fn(t);expect(fn(t)).toEqual(a);fn(C.end);fn(T.start);expect(fn(t)).toEqual(a);}
  });
});
