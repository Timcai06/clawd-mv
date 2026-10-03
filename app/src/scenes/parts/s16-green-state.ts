// Word clocks and scene-local state; all geometry is queried from s16-world.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Word } from '../../engine/lyrics';
import { lerp } from '../../engine/util';
import type { Rect } from '../../kit/handoff';
import type { Voice } from '../../kit/lyric-moves';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import { afterBeats } from '../../kit/time';
import board from '../../../../storyboard/shots.json';
import { hitDelay, tiltAt, faceCorners, projectBounds, cameraAt, arcBounds, cursorAt } from './s16-world';
export { bounds } from './s16-world';
export const GREEN_WIDTHS = [62,87.5,112.5,75,125,100] as const;
export interface GreenTimes {
  start:number;end:number;cuts:number[];triggers:number[];greens:Word[];launches:Word[];
  nineteen:Word;count:Word[];free:Word;incomingEnd:number;outgoingStart:number;outgoingEnd:number;
}
export function greenTimes(audio:AudioData,lyrics:Lyrics):GreenTimes {
  const shots=resolveStoryboard(board as Storyboard,lyrics,audio).shots.filter(s=>s.scene==='S16');
  const count=lyrics.get('One goes green, and two, and three').words;
  const launches=lyrics.get('Green and green and green and green').words.filter(w=>/^green\W*$/i.test(w.w));
  const final=lyrics.get('Nineteen green!').words;
  const triggers=[count[0]!.start,count[4]!.start,count[6]!.start];
  launches.forEach((w,g)=>{const n=g===3?3:4;for(let j=0;j<n;j++){const i=triggers.length;triggers.push(j===0?w.start:triggers[i-1]!+hitDelay(i-1));}});
  triggers.push(final[0]!.start);
  const start=shots[0]!.start,end=shots.at(-1)!.end;
  return {start,end,cuts:shots.map(s=>s.start),triggers,launches,greens:[count[2]!,...launches,final[1]!],nineteen:final[0]!,count,
    free:lyrics.get('Snip the extra line and set October free').words.at(-1)!,incomingEnd:afterBeats(audio,start,1),outgoingStart:afterBeats(audio,end,-1),outgoingEnd:end-1/60};
}
export function greenHit(t:number,T:GreenTimes){const i=T.greens.findLastIndex(w=>t>=w.start);return i<0?null:{i,word:T.greens[i]!,wdth:GREEN_WIDTHS[i]!,drop:1.5*(1-Math.min(1,Math.max(0,(t-T.greens[i]!.start)/0.12))**2)};}
export function handoffIn(t:number,_audio:AudioData,T:GreenTimes){return projectBounds(cameraAt(t,T),faceCorners(0,t,T,false));}
export function handoffOut(t:number,_audio:AudioData,T:GreenTimes){return projectBounds(cameraAt(t,T),faceCorners(18,t,T));}
export function greenState(_audio:AudioData,_lyrics:Lyrics,_voice:Voice,t:number,T:GreenTimes){
  const cam=cameraAt(t,T),cards=T.triggers.map((at,i)=>({i,passed:t>=at,fall:tiltAt(i,t,T),face:projectBounds(cam,faceCorners(i,t,T,i!==0||t>=at))}));
  return {cards,passed:cards.filter(c=>c.passed).length,plaqueBounds:arcBounds(t,T),cursor:cursorAt(t,T),hit:greenHit(t,T)};
}

// S17 imports this rectangle helper; retain its exact pre-V6 behaviour.
export function mixRect(a:Rect,b:Rect,p:number):Rect{return {x:lerp(a.x,b.x,p),y:lerp(a.y,b.y,p),w:lerp(a.w,b.w,p),h:lerp(a.h,b.h,p)};}
export function greenArcCards(_audio:AudioData,t:number,T:GreenTimes){
  const cam=cameraAt(t,T);return T.triggers.map((at,i)=>({i,passed:t>=at,fall:tiltAt(i,t,T),face:projectBounds(cam,faceCorners(i,t,T,i!==0||t>=at))}));
}
