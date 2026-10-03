// V6 lyrics query the copier / scraper / solid-number world.
import { Voice } from '../../kit/lyric-moves';
import { layoutPath, path3 } from '../../kit/pathtext';
import { p3, Rig, planeAffine } from '../../kit/rig';
import { afterBeats, span } from '../../kit/time';
import { ease, clamp, lerp } from '../../engine/util';
import { carryLayout, lerpAffines, type GlyphAffine } from '../../kit/carry';
import { whyCarry, whyFrame } from './s11-layout';
import { cameraAt, copies, SHEET, scraperX } from './s12-world';
import { varRun } from '../../kit/vartype';
import type { X9Times } from '../s09-z-shared';
export { copies as COPIES, numberTimes, entryPrim, exitPrim, cameraAt, cursorAt } from './s12-world';
export function clearLyrics(v:Voice) {
  const words=v.line('Clear the cache and count to ten').words.slice(0,3);
  const path=path3([p3(-4,0.028,1),p3(24,0.028,1)]);
  const a=words[0]!.start,b=words[2]!.end;
  const notBefore=(s:number)=>{
    const u=clamp((s-4+5+3)/29);
    return lerp(a,b,u<0.5?Math.sqrt(u/2):1-Math.sqrt((1-u)/2));
  };
  return {path,layout:layoutPath(words,{capH:0.5,axes:w=>v.form(w,w.end).axes,notBefore})};
}
export function countLyrics(v:Voice) {
  const words=v.line('Clear the cache and count to ten').words.slice(3,6);
  return {path:path3([p3(-6,0,0),p3(18,0,0)]),layout:layoutPath(words,{capH:0.66,axes:w=>v.form(w,w.end).axes})};
}
export function whyIncoming(v:Voice,T:X9Times,t:number) {
  const spec=whyCarry(v),base=carryLayout(spec),a=whyFrame(v,t),at=copies(v)[0]!.start,rig=new Rig();rig.set(cameraAt(v,t,T));
  const run=varRun(spec.text,100,spec.axes),scale=0.26/run.capH;
  const aff=planeAffine(rig,p3(-SHEET.w/2+32/512*SHEET.w,0.032,SHEET.h/2-80/512*SHEET.w),p3(1,0,0),p3(0,0,1),scale);
  const b:GlyphAffine[]=a.map((g)=>({...g,...(aff??g),e:(aff?.e??g.e)+(aff?.a??g.a)*run.glyphs[g.i]!.x,
    f:(aff?.f??g.f)+(aff?.b??g.b)*run.glyphs[g.i]!.x}));
  return {spec,aff:lerpAffines(a,b,ease.inOutQuad(span(t,at,at+0.25))),draw:t<at+0.25};
}
