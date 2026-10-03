// V6 PING: immutable layout, absolute poses, two real shadow-casting lights.
import { clamp, ease, lerp, pulse, springStep } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { Rig, orbitCam, p3, type Cam } from '../../kit/rig';
import { exitEnvelope, type Prim } from '../../kit/handoff';
import { carryDrift, carryLayout, lerpAffines, type CarrySpec, type GlyphAffine } from '../../kit/carry';
import { letterTimes } from '../../kit/pathtext';
import { audio, lyrics, T, voice } from './s01-timing';
import { continuedLayout, line01Layout, line01Affines, line01Next } from './s01-world';
import { iStemRect, pingLayout, SPLIT_X } from './s02-layout';
export { iStemRect } from './s02-layout';
export const DEPTH=6.25*0.12,BEVEL=DEPTH*0.1,FRONT=DEPTH+2*BEVEL;
export const pingWord=lyrics.lines[0]!.words[3]!;
export const pingTimes=letterTimes({...pingWord,w:'PING'});
export function landingAt(i:number){return pingTimes[i]!.t0;}
export function letterPose(i:number,t:number){
  const at=landingAt(i),age=t-at,exitStart=afterBeats(audio,T.issue,-1),order=[2,3,1,0][i]!;
  const tipStart=afterBeats(audio,exitStart,order/16),tipEnd=afterBeats(audio,tipStart,0.35);
  const tilt=Math.PI/2*ease.inCubic(span(t,tipStart,tipEnd));
  const fall=span(t,tipEnd,T.issue-1/60),dy=-38*fall*fall;
  // V6's landing-time/no-projection acceptance implies an invisible approach.
  // The 90 ms near-camera trajectory is computed before onset; no glyph is
  // visible or casts a shadow until its letter time. P is already at rest at C1.
  const z=age<0?2.4*6.25*(1-ease.outExpo(span(t,at-0.09,at))):0;
  return {at,visible:age>=0&&fall<1,z,dy,rotX:tilt,scaleZ:age<0?1:1-0.06*(1-springStep(age,18,0.5)),
    castShadow:age>=0&&fall<1,emissive:i===1&&t<tipStart};
}
export const S02_GLSL=/* glsl */`
float posterRipple(vec2 p,vec2 center,float age){
  if(age<0.0||age>0.25)return 1.0;
  float front=age*2400.0;float ring=exp(-pow((length(p-center)-front)/75.0,2.0));
  return 1.0+0.5*ring*sin(3.14159265359*age/0.25);
}`;
export function posterRipple(p:{x:number;y:number},center:{x:number;y:number},age:number){
  if(age<0||age>0.25)return 1;
  return 1+0.5*Math.exp(-(((Math.hypot(p.x-center.x,p.y-center.y)-age*2400)/75)**2))*Math.sin(Math.PI*age/0.25);
}
export function cameraAt(t:number):Cam {
  t=Math.min(t,T.issue-0.1);let surge=0;
  for(const i of [0,2,3])if(t>=landingAt(i))surge+=0.015*Math.exp(-(t-landingAt(i))/0.08);
  // First-frame C1 is exact, then the three decaying impulses act along +z.
  if(t<=T.ping+1/60)surge=0;
  const focal=540/Math.tan(34*Math.PI/360);
  return orbitCam(p3(0,0,FRONT),0,0,focal/100/(1+surge),34);
}
export function lightIntensity(t:number){
  let k=1+3*(1-ease.outCubic(span(t,T.ping+1/60,afterBeats(audio,T.ping,0.3))));
  for(const i of [0,2,3])k+=2.5*pulse(t,landingAt(i),0.12);return k;
}
export function entryPrim(_t:number):Prim {return {kind:'rect',...iStemRect()};}
export function exitPrim(_t:number):Prim {return {kind:'line',x0:SPLIT_X,y0:0,x1:SPLIT_X,y1:1080,w:1};}
export function cursorAt(t:number){
  const stem=iStemRect(),pose=letterPose(1,t),k=ease.outCubic(span(t,T.ping+1/60,afterBeats(audio,T.ping,0.3)));
  const fall=span(t,afterBeats(audio,T.issue,-1),T.issue-1/60);
  return {x:lerp(stem.x+stem.w/2,SPLIT_X,k),y:lerp(stem.y+stem.h/2,0,k),
    h:lerp(stem.h,12,k),iVisible:pose.visible&&k<1,gain:exitEnvelope(t,T.issue).gain,exit:fall};
}
export function line01Incoming(){return line01Affines();}
export function continuationGlyphs(){return continuedLayout().glyphs.slice(line01Layout().glyphs.length);}
export function continuationAffines(t:number):GlyphAffine[] {return continuationGlyphs().map((_,i)=>line01Next(i,t));}
export function screenSpec(t=lyrics.lines[0]!.words[6]!.end):CarrySpec {
  const glyphs=continuationGlyphs(),i=glyphs.findIndex(g=>g.word.index===6),first=line01Next(i);
  return {text:'screen',size:50.8,axes:voice.form(lyrics.lines[0]!.words[6]!,t).axes,x:first.e,y:first.f,color:'paper'};
}
// carry.ts supplies a horizontal uniform layout only. Transport its per-letter
// drift through each actual perspective affine instead of flattening the word.
export function screenAffines(t:number):GlyphAffine[] {
  const time=Math.min(t,T.issue-1/60),spec=screenSpec(),raw=carryLayout(spec),drift=carryDrift(spec,time,0.3),glyphs=continuationGlyphs();
  const start=glyphs.findIndex(g=>g.word.index===6);
  const transported=raw.map((g,i)=>{
    const a=line01Next(start+i),d=drift[i]!,sx=g.a,sy=g.d;
    const A=a.a/sx,B=a.b/sx,C=a.c/sy,D=a.d/sy,E=a.e-A*g.e-C*g.f,F=a.f-B*g.e-D*g.f;
    return {ch:g.ch,i,a:A*d.a+C*d.b,b:B*d.a+D*d.b,c:A*d.c+C*d.d,d:B*d.c+D*d.d,e:A*d.e+C*d.f+E,f:B*d.e+D*d.f+F};
  });
  const source=raw.map((g,i)=>({...line01Next(start+i),ch:g.ch,i}));
  return lerpAffines(source,transported,ease.inOutCubic(span(t,afterBeats(audio,T.issue,-0.5),T.issue-1/60)));
}
export function rippleCenters(){return pingLayout().letters.map(b=>({x:b.x+b.w/2,y:b.y+b.h/2}));}
export function gain(t:number){return exitEnvelope(t,T.issue).gain;}
export function projectionRig(t:number){const rig=new Rig();rig.set(cameraAt(t));return rig;}
