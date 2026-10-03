// Mathematical printing world. Canvas masks are data; CPU/GPU share page geometry,
// depression depth, impact envelopes and the hinge transform below.
import { AudioData, type AudioJSON } from '../../engine/audio';
import { Lyrics } from '../../engine/lyrics';
import { F, ot } from '../../engine/type';
import { ease, fbm2, frameIdx, lerp, noise1, springStep } from '../../engine/util';
import { CUT, exitEnvelope, type Prim } from '../../kit/handoff';
import { carryDrift, lerpAffines, type CarrySpec, type GlyphAffine } from '../../kit/carry';
import { Voice } from '../../kit/lyric-moves';
import { letterTimes, runInkBounds } from '../../kit/pathtext';
import { Rig, mixCam, orbitCam, p3, planeAffine, type Cam, type P3 } from '../../kit/rig';
import { afterBeats, span } from '../../kit/time';
import { varRun } from '../../kit/vartype';
import * as Clawd from '../../kit/clawd';
import { bracketTarget, commitScore, paperTravel, pressEvents, type CommitScore, type PressEvent } from './s08-layout';
import audioJSON from '../../../../data/audio.json';
import lyricsJSON from '../../../../data/lyrics.json';

export const PAGE = { w: 48, h: 27 } as const;
export const ATLAS = { w: 4096, h: 2304 } as const;
export const DEBOSS_DEPTH = 0.06;
export const LIGHT = [-0.8,0.27,0.55] as const;
export const AMBIENT = 0.1;
export const LIT_TONE = 0.88;
const lightLength = Math.hypot(...LIGHT);
export const KEY_INTENSITY = (LIT_TONE-AMBIENT)/(LIGHT[1]/lightLength);
export function lightIrradiance(normal: readonly number[], visibility = 1) {
  return AMBIENT+KEY_INTENSITY*Math.max(0,normal.reduce((sum,n,i) => sum+n*LIGHT[i]!,0)/lightLength)*visibility;
}
export function lightTone(normal: readonly number[], visibility = 1) {
  return Math.min(1,lightIrradiance(normal,visibility));
}
export function paperExposure(t: number, m: PrintWorld) {
  const tilt=screenTilt(t,m.T), n=[0,Math.cos(tilt),Math.sin(tilt)];
  return (LIT_TONE-AMBIENT)/(lightIrradiance(n)-AMBIENT);
}
export function clawdFrontTone() {
  const dif=LIGHT[2]/lightLength, ambient=(LIT_TONE-dif)/(1-dif);
  return { ambient,tone:ambient+(1-ambient)*dif };
}
export const SCREEN_TILT = 75*Math.PI/180; // 105 degrees to the keyboard's forward vector.
export const KEY_TOP = 0.445;
export interface PrintWorld { audio: AudioData; lyrics: Lyrics; voice: Voice; T: CommitScore; events: PressEvent[] }
export function printingWorld(audio: AudioData, lyrics: Lyrics): PrintWorld {
  const voice = new Voice(lyrics,audio), T = commitScore(audio,lyrics);
  const m={ audio, lyrics, voice, T, events:pressEvents(audio,lyrics,T,voice) };
  // C's lyric caps stay 80px even while the editorial camera pulls out. Slots
  // are reserved at the final axes and the largest physical cap, so no collision.
  for (const e of m.events.filter(e => e.kind === 'letter' || e.kind === 'tap' || e.kind === 'word')) {
    for (let i=0;i<24;i++) {
      const cap=projectedBox(pressCorners(e,e.tp,m,false),cameraAt(e.tp,m)).h,ratio=80/cap;
      e.capH*=ratio; e.width*=ratio; e.baselineX*=ratio; e.baselineZ*=ratio;
      if(Math.abs(ratio-1)<1e-8) break;
    }
  }
  return m;
}
let productionWorld: PrintWorld | undefined;
function defaultWorld(): PrintWorld { return productionWorld ??= printingWorld(new AudioData(audioJSON as unknown as AudioJSON),new Lyrics(lyricsJSON)); }
export function screenTilt(t: number, T: CommitScore) {
  return SCREEN_TILT*ease.inOutCubic(span(t,T.works,T.machine));
}
export function paperPoint(p: P3, travel: number, tilt: number): P3 {
  const z = p.z+travel-PAGE.h/2, cs = Math.cos(tilt), sn = Math.sin(tilt);
  return p3(p.x,p.y*cs-z*sn,PAGE.h/2+p.y*sn+z*cs);
}
export function onPaper(p: P3, t: number, m: PrintWorld): P3 {
  return paperPoint(p,paperTravel(m.audio,t,m.T),screenTilt(t,m.T));
}
export const S08_GLSL = /* glsl */ `
const float PAGE_W = 48.0, PAGE_H = 27.0, DEBOSS_DEPTH = 0.06;
float depthMap(float mask) { return DEBOSS_DEPTH*mask*(255.0/32.0); }
float impactPit(vec2 p, vec4 hit) {
  vec2 d = p-hit.xy;
  return hit.w < 0.0 ? hit.z : hit.z*exp(-dot(d,d)/max(0.01,hit.w*hit.w));
}
float heightAt(vec2 p, float mask, vec4 hits[8]) {
  float h=-depthMap(mask);
  for(int i=0;i<8;i++) h-=impactPit(p,hits[i]);
  return h;
}
vec3 paperPoint(vec3 p, float travel, float tilt) {
  float z = p.z+travel-PAGE_H/2.0, cs = cos(tilt), sn = sin(tilt);
  return vec3(p.x,p.y*cs-z*sn,PAGE_H/2.0+p.y*sn+z*cs);
}
`;
export function depthMap(mask: number) { return DEBOSS_DEPTH*mask*(255/32); }
export const depthFromMask=depthMap;
export function impactPit(p: readonly number[], hit: readonly number[]): number {
  return hit[3]! < 0 ? hit[2]! : hit[2]!*Math.exp(-((p[0]!-hit[0]!)**2+(p[1]!-hit[1]!)**2)/Math.max(0.01,hit[3]!**2));
}
export function impactHits(t: number, m: PrintWorld): number[][] {
  const hits = m.events.filter(e => t >= e.tp && t < e.tp+0.2).slice(-8).map(e => {
    const dt = t-e.tp;
    return [e.x,e.z,0.02*springStep(dt,12,0.45)*(1-span(dt,0.12,0.2)),Math.max(e.capH,e.width/2)];
  });
  const fit = m.T.bracketLine.words.at(-1)!.start;
  if (t >= fit && t < fit+0.2) hits.push([0,0,0.03*springStep(t-fit,12,0.45)*(1-span(t-fit,0.12,0.2)),-1]);
  return hits.slice(-8);
}
export function heightAt(p: readonly number[], mask: number, hits: readonly (readonly number[])[]): number {
  return -depthMap(mask)-hits.slice(0,8).reduce((sum,h) => sum+impactPit(p,h),0);
}
export function floodRadius(t: number, tp: number): number {
  const R = Math.hypot(PAGE.w/2,PAGE.h/2)/0.96;
  return R*ease.outExpo(span(t,tp,tp+0.3));
}
export function floodEdge(angle: number): number {
  // Fixed, four-octave angular FBM: no noise keyed to the rendered frame.
  return 1+0.04*fbm2(Math.cos(angle)*2,Math.sin(angle)*2,4,803);
}
export function flooded(x: number, z: number, t: number, tp: number): boolean {
  return t >= tp && Math.hypot(x,z) <= floodRadius(t,tp)*floodEdge(Math.atan2(z,x));
}

export function pressAt(e: PressEvent, t: number, m: PrintWorld) {
  const begin = e.tp-e.approach;
  const release = e.pair === 2 ? m.T.bracketLine.words.at(-1)!.start : e.tp;
  const holdEnd = release+0.1, lifeEnd=release+0.35;
  const works=/^works$/i.test(e.word.w) && e.kind === 'word';
  const dropStart=works ? e.tp-0.14 : begin;
  const height = t < e.tp ? 3*e.capH*(1-ease.inQuad(span(t,dropStart,e.tp)))
    : t <= holdEnd ? 0 : 3*e.capH*ease.outCubic(span(t,holdEnd,lifeEnd));
  const target = e.kind === 'bracket' ? bracketTarget(e,t,m.T) : { x:e.x,z:e.z };
  const arc = e.kind === 'bracket' && t < e.tp ? 18*(1-ease.outCubic(span(t,begin,e.tp))) : 0;
  return { x:target.x+(e.side ?? 1)*arc, y:height, z:target.z,
    visible: t >= begin && t <= lifeEnd,
    letters: e.times.map(at => t >= at), contact: t >= e.tp && t <= holdEnd };
}
export function printGlyphCount(e: PressEvent, t: number) {
  if (t < e.tp) return 0;
  return e.times.filter(at => t >= at).length;
}
/** Actual cap/ink rectangle in the world, including block depth and rotation. */
export function pressCorners(e: PressEvent, t: number, m: PrintWorld, volume = true): P3[] {
  const state = pressAt(e,t,m), cs = Math.cos(e.rot), sn = Math.sin(e.rot), pts: P3[] = [];
  for (const x of [-e.width/2,e.width/2]) for (const z of [-e.capH/2,e.capH/2])
    for (const y of volume ? [state.y,state.y+0.5*e.capH] : [0])
      pts.push(onPaper(p3(state.x+cs*x+sn*z,y,state.z-sn*x+cs*z),t,m));
  return pts;
}
export function projectedBox(points: P3[], cam: Cam) {
  const rig = new Rig(); rig.set(cam);
  const pts = points.map(p => rig.proj(p.x,p.y,p.z)).filter(p => p !== null);
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y };
}
/** Ink bounds use the same outline, baseline and immutable stamp transform as PRINT. */
export function impressionCorners(e: PressEvent, t: number, m: PrintWorld): P3[] {
  const run=varRun(e.text,100,e.axes), ink=runInkBounds(run), s=e.capH/run.capH;
  const cs=Math.cos(e.rot),sn=Math.sin(e.rot), pts:P3[]=[];
  for(const x of [ink.x0*s+e.baselineX,ink.x1*s+e.baselineX])
    for(const z of [ink.y0*s+e.baselineZ,ink.y1*s+e.baselineZ])
      pts.push(onPaper(p3(e.x+cs*x+sn*z,0,e.z-sn*x+cs*z),t,m));
  return pts;
}
export function printedWordPolygons(t: number, m: PrintWorld) {
  const flood=t >= m.T.mit2 ? m.T.mit2 : t >= m.T.mit1 ? m.T.mit1 : Infinity;
  const groups=new Map<PressEvent['word'],P3[]>();
  for(const e of m.events) {
    if(!printGlyphCount(e,t) || e.kind === 'bracket') continue;
    if(e.kind !== 'commit' && Number.isFinite(flood) && e.tp <= flood) continue;
    const points=groups.get(e.word) ?? []; points.push(...impressionCorners(e,t,m)); groups.set(e.word,points);
  }
  return [...groups].map(([word,points]) => ({ word,polygon:projectedHull(points,cameraAt(t,m)) }));
}
export function projectedHull(points: P3[], cam: Cam): [number,number][] {
  const rig=new Rig(); rig.set(cam);
  const pts=points.flatMap(p => { const q=rig.proj(p.x,p.y,p.z); return q ? [[q.x,q.y] as [number,number]] : []; })
    .sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const cross=(a:number[],b:number[],c:number[]) => (b[0]!-a[0]!)*(c[1]!-a[1]!)-(b[1]!-a[1]!)*(c[0]!-a[0]!);
  const half=(list:[number,number][]) => {
    const h:[number,number][]=[];
    for(const p of list) { while(h.length>1 && cross(h.at(-2)!,h.at(-1)!,p)<=0) h.pop(); h.push(p); }
    return h.slice(0,-1);
  };
  return pts.length < 3 ? pts : [...half(pts),...half([...pts].reverse())];
}
/** Separating axes on the projected ink polygons, not inflated screen AABBs. */
export function polygonsIntersect(a: readonly number[][], b: readonly number[][]) {
  if(a.length < 3 || b.length < 3) return false;
  for(const poly of [a,b]) for(let i=0;i<poly.length;i++) {
    const p=poly[i]!,q=poly[(i+1)%poly.length]!, nx=-(q[1]!-p[1]!),ny=q[0]!-p[0]!;
    const project=(r:readonly number[][]) => r.map(v => v[0]!*nx+v[1]!*ny);
    const aa=project(a),bb=project(b);
    if(Math.min(...aa)>=Math.max(...bb)-1e-6 || Math.min(...bb)>=Math.max(...aa)-1e-6) return false;
  }
  return true;
}
export function printedWordBoxes(t: number, m: PrintWorld) {
  return printedWordPolygons(t,m).map(({ word,polygon }) => {
    const xs=polygon.map(p => p[0]),ys=polygon.map(p => p[1]),x=Math.min(...xs),y=Math.min(...ys);
    return { word,box:{ x,y,w:Math.max(...xs)-x,h:Math.max(...ys)-y } };
  });
}
export function clawdCorners(t: number, m: PrintWorld, frontOnly = false) {
  const c=clawdAt(t,m),pts:P3[]=[];
  for(const cell of c.pose.cells) {
    if(frontOnly && cell.k === 'D') continue;
    const limb=cell.y === 4 || cell.x < 2 || cell.x > 13;
    const depth=(limb ? 2 : 4)*0.5;
    for(const dx of [-0.25,0.25]) for(const dy of [-0.25,0.25])
      for(const dz of frontOnly ? [depth/2] : [-depth/2,depth/2])
        pts.push(p3(c.point.x+(cell.x+c.pose.dx-7.5)*0.5+dx,
          c.point.y+(4.5-cell.y-c.pose.dy)*0.5+dy,c.point.z+dz));
  }
  return pts;
}

function frameWidth(points: P3[], target: P3, yaw: number, pitch: number, fraction: number, maxHeight = Infinity): Cam {
  let lo = 0.5, hi = 250;
  for (let n = 0; n < 30; n++) {
    const d = (lo+hi)/2, cam=orbitCam(target,yaw,pitch,d),box = projectedBox(points,cam);
    if (box.w > 1920*fraction || box.h > maxHeight || !Number.isFinite(box.w)) lo=d; else hi=d;
  }
  return orbitCam(target,yaw,pitch,hi);
}
export function minimumViewDepth(points:P3[],cam:Cam) {
  const dx=cam.tgt.x-cam.pos.x,dy=cam.tgt.y-cam.pos.y,dz=cam.tgt.z-cam.pos.z,len=Math.hypot(dx,dy,dz);
  return Math.min(...points.map(p=>((p.x-cam.pos.x)*dx+(p.y-cam.pos.y)*dy+(p.z-cam.pos.z)*dz)/len));
}
const cameraMemo = new WeakMap<PrintWorld, Map<string,Cam>>();
function framedEvent(e: PressEvent, m: PrintWorld, width: number, pitch: number, yaw = 0) {
  let cache = cameraMemo.get(m); if (!cache) cameraMemo.set(m,cache=new Map());
  const key = `${e.id}:${width}:${pitch}:${yaw}`;
  let cam = cache.get(key);
  if (!cam) {
    const target = onPaper(p3(e.x,e.capH*0.25,e.z),e.tp,m);
    cam = frameWidth(pressCorners(e,e.tp,m),target,yaw,pitch,width,e.kind === 'giant' ? 1080*0.85/1.04 : Infinity); cache.set(key,cam);
  }
  return cam;
}

export function cameraAt(t: number, m: PrintWorld): Cam {
  const { T,events,audio } = m;
  if (t >= T.end-0.1) t=T.end-0.1;
  const second = t >= T.i2, hook = second ? T.second : T.first;
  const commit = events.find(e => e.kind === 'commit' && e.word.line === hook.i)!;
  const hit = second ? T.mit2 : T.mit1;
  if (t < T.first.words.at(-1)!.start || (t >= T.i2 && t < T.second.words.at(-1)!.start)) {
    const word = [...hook.words.slice(0,4)].reverse().find(w => t >= w.start) ?? hook.words[0]!;
    const e = events.find(e => e.kind === 'giant' && e.word === word)!;
    const cam = framedEvent(e,m,0.8,1.15), held = Math.max(0,t-word.start);
    const push = 1/(1+0.035*held);
    const state=pressAt(e,t,m),center=onPaper(p3(state.x,state.y+e.capH*.25,state.z),t,m);
    const live = { ...cam,tgt:center,
      pos:p3(center.x+(cam.pos.x-cam.tgt.x)*push,center.y+(cam.pos.y-cam.tgt.y)*push,center.z+(cam.pos.z-cam.tgt.z)*push) };
    if (!second && t < T.start+0.15) {
      // Start within the upper clay face of I, whose lower face is the printing face.
      const surface = onPaper(p3(e.x,e.capH*0.5,e.z),e.tp,m);
      return mixCam(orbitCam(surface,0,1.55,0.3),live,ease.outExpo(span(t,T.start+1/60,T.start+0.15)));
    }
    const points=pressCorners(e,t,m),box=projectedBox(points,live);
    const visible=(second?events.filter(event=>pressAt(event,t,m).visible):[e]).flatMap(event=>pressCorners(event,t,m));
    const maxHeight=1080*(second?.70:.85)-16;
    if(state.visible && (second?(minimumViewDepth(visible,live)<.55 || box.h>maxHeight || box.x<24 || box.x+box.w>1896 || box.y<24 || box.y+box.h>1056):box.h>1080*.85)) {
      // Keep the complete extrusion and approaching neighbours in front of the
      // near plane; a projection helper must never silently drop rear vertices.
      const dx=live.pos.x-live.tgt.x,dy=live.pos.y-live.tgt.y,dz=live.pos.z-live.tgt.z;
      const distance=Math.hypot(dx,dy,dz),pitch=Math.asin(dy/distance),yaw=Math.atan2(dx,dz);
      const framed=frameWidth(points,live.tgt,yaw,pitch,.8,second?maxHeight:1080*.85),depth=minimumViewDepth(visible,framed);
      if(depth<.55){const extra=.55-depth;framed.pos=p3(framed.pos.x+dx/distance*extra,framed.pos.y+dy/distance*extra,framed.pos.z+dz/distance*extra);}
      return framed;
    }
    return live;
  }
  if (t < (second ? T.works : T.brk)) {
    const base = framedEvent(commit,m,0.92,1.3);
    if (t < hit) {
      const begin = commit.word.start, end=hit-0.1;
      const near = { ...base,pos:p3(base.pos.x*0.88,base.pos.y*0.88,base.pos.z*0.88) };
      return mixCam(near,base,ease.outCubic(span(t,begin,end)));
    }
    const yaw = 0.12*span(t,hit,second ? T.works : T.brk);
    return orbitCam(base.tgt,yaw,1.3,Math.hypot(base.pos.x-base.tgt.x,base.pos.y-base.tgt.y,base.pos.z-base.tgt.z));
  }
  if (t < Math.min(T.tap1,T.tapLine.words[0]!.start)) {
    const brackets = events.filter(e => e.kind === 'bracket');
    const fit = T.bracketLine.words.at(-1)!.start;
    const points = [...pressCorners(events.find(e => e.kind === 'commit')!,fit,m,false),
      ...brackets.flatMap(e => pressCorners(e,fit,m,false))];
    const base = frameWidth(points,p3(0,0,1),0,1.45,0.88);
    const previous = framedEvent(events.find(e => e.kind === 'commit')!,m,0.92,1.3);
    return mixCam(previous,base,ease.outExpo(span(t,T.brk,afterBeats(audio,T.brk,0.5))));
  }
  if (t < T.i2) {
    const at = clawdAt(t,m).point, tapWord = T.tapLine.words[0]!;
    if (t < T.tap2) return orbitCam(p3(at.x,1,at.z),0,0.25,10);
    if (t < T.tapping) return orbitCam(p3(at.x,1,at.z),1.2,0.45,14);
    return orbitCam(p3(0,0,paperTravel(audio,t,T)+8),0,Math.PI/2,40+4*span(t,tapWord.end,T.i2));
  }
  const begin = framedEvent(events.filter(e => e.kind === 'commit')[1]!,m,0.92,1.3);
  const laptop = orbitCam(p3(0,7,22),-0.2,0.55,105,38);
  if (t < T.machine) return mixCam(begin,laptop,ease.inOutCubic(span(t,T.works,T.machine)));
  const center = paperPoint(p3(0,0,0),0,SCREEN_TILT);
  return mixCam(laptop,orbitCam(center,0,0.3,42,38),ease.inCubic(span(t,T.machine,T.end-0.1)));
}

export function clawdAt(t: number, m: PrintWorld) {
  const { T,audio,events } = m, tap = events.filter(e => e.kind === 'tap');
  const active = tap.find(e => Math.abs(t-e.tp)<1e-9)
    ?? tap.find(e => t < e.tp && t >= e.tp-0.13)
    ?? [...tap].reverse().find(e => t >= e.tp) ?? tap[0]!;
  const pose = Clawd.pose(null,{ beat:audio.beatAt(t),beat0:audio.beatAt(T.tap1),p:0 });
  const leg = active.leg ?? 0, legX = Clawd.LEGS[leg]!, dt=t-active.tp;
  const lift = dt < -0.05 ? ease.outCubic(span(dt,-0.13,-0.05)) : 1-ease.inQuad(span(dt,-0.05,0));
  pose.cells = pose.cells.map(c => c.y === 4 && c.x === legX ? { ...c,y:c.y-lift } : c);
  const jumpStart = afterBeats(audio,T.tapLine.words[0]!.start,-0.5), jumpEnd=T.tapLine.words[0]!.start;
  const jump = span(t,jumpStart,jumpEnd), y = t < jumpEnd ? 5*4*jump*(1-jump) : 0;
  // The near ink edge is 0.6 in front of the front edge of the feet (limb depth=1).
  const near=(e:PressEvent) => {
    const run=varRun(e.text,100,e.axes),ink=runInkBounds(run);
    return e.z+ink.y0*e.capH/run.capH+e.baselineZ;
  };
  const lastPrinted=[...tap].reverse().find(e => e.tp <= t);
  const nearEdge=Math.min(near(active),lastPrinted ? near(lastPrinted) : Infinity);
  let point = p3(active.x-(legX-7.5)*0.5,y,nearEdge-1.1);
  if (t < jumpEnd) point.x += 26*(1-jump);
  if (t >= T.quit) {
    const k=span(t,T.quit,T.i2), bounce=4*k*(1-k)*3;
    point=p3(lerp(point.x,0,k),bounce,lerp(point.z,8-paperTravel(audio,t,T),ease.outExpo(k)));
  }
  if (t >= T.works) {
    point=p3(0,KEY_TOP,27);
    // One whole arm voxel rises one grid row, as specified for the thumbs-up.
    pose.cells=pose.cells.map(c => c.y === 2 && Clawd.RIGHT_ARM.includes(c.x) ? { ...c,y:1 } : c);
    return { point,pose,visible:true,leg,hit:active.tp };
  }
  return { point:onPaper(point,t,m),pose,visible:t >= jumpStart && t < T.i2,leg,hit:active.tp };
}

export function machineSpec(m = defaultWorld()): CarrySpec {
  const word=m.T.machineLine.words.at(-1)!;
  return { ...CUT.machine08, axes:m.voice.form(word,word.end).axes };
}
/** S09's first frame uses the shared 0.2 drift. Freeze that exact cut-time pose
 * at the outgoing end, including its affine arithmetic, instead of restarting it. */
export function machineTargetAffines(m = defaultWorld()): GlyphAffine[] {
  return carryDrift(machineSpec(m),m.T.end,0.2).map(g => ({ ...g,b:g.b,d:g.d,f:540+(g.f-540) }));
}
export function machineAffines(t: number, m = defaultWorld()): GlyphAffine[] {
  const spec=machineSpec(m), word=m.T.machineLine.words.at(-1)!, run=varRun(spec.text,100,spec.axes);
  const ink=runInkBounds(run), scale=2.8/run.capH, rig=new Rig(); rig.set(cameraAt(t,m));
  const origin=onPaper(p3(-8,4.4,7),t,m);
  const ux=p3(1,0,0), uy=p3(0,-Math.sin(screenTilt(t,m.T)),Math.cos(screenTilt(t,m.T)));
  const aff=planeAffine(rig,origin,ux,uy,scale) ?? { a:1,b:0,c:0,d:1,e:960,f:540 };
  const ratio=m.voice.form(word,t).axes.wdth/spec.axes.wdth; aff.a*=ratio; aff.b*=ratio;
  const world=run.glyphs.map(g => ({ ...aff,e:aff.e+aff.a*(g.x-ink.x0),f:aff.f+aff.b*(g.x-ink.x0),ch:g.ch,i:g.i }));
  const start=afterBeats(m.audio,m.T.end,-0.5), finish=m.T.end-1/60;
  return lerpAffines(world,machineTargetAffines(m),ease.inOutCubic(span(t,start,finish)));
}
export function machineVisible(t: number, m: PrintWorld) {
  return letterTimes(m.T.machineLine.words.at(-1)!).map(g => t >= g.t0);
}
export function hashAffine(t: number, row: number, m: PrintWorld) {
  const rig=new Rig(); rig.set(cameraAt(t,m));
  const tilt=screenTilt(t,m.T),origin=onPaper(p3(8,0.015,3.4+row*0.7),t,m);
  const aff=planeAffine(rig,origin,p3(1,0,0),p3(0,-Math.sin(tilt),Math.cos(tilt)),0.0058);
  if (!aff) return null;
  const bounds=ot(F.mono(500)).charToGlyph('H').getPath(0,0,100).getBoundingBox();
  const cap=Math.hypot(aff.c,aff.d)*(bounds.y2-bounds.y1);
  // Match pathtext's projected-size clamp while retaining the paper-plane axes.
  const ratio=Math.max(14,Math.min(22,cap))/Math.max(1e-6,cap);
  return { ...aff,a:aff.a*ratio,b:aff.b*ratio,c:aff.c*ratio,d:aff.d*ratio };
}
export function cursorAt(t: number, m = defaultWorld()) {
  if (t >= m.T.machine) return { x:lerp(960,1920,ease.outExpo(span(t,m.T.machine,m.T.end-0.1))),y:540,h:2 };
  const event=[...m.events].reverse().find(e => t >= e.tp) ?? m.events[0]!;
  const rig=new Rig(); rig.set(cameraAt(t,m));
  const p=onPaper(p3(event.x,0.025,event.z),t,m), q=rig.proj(p.x,p.y,p.z);
  return { x:q?.x ?? 960,y:q?.y ?? 540,h:12 };
}
export function entryPrim(_t: number): Prim { return { kind:'rect',x:0,y:0,w:1920,h:1080 }; }
export function exitPrim(_t: number): Prim { return { kind:'line',x0:0,y0:540,x1:1920,y1:540,w:2 }; }
export function exitState(t: number, T: CommitScore) {
  return { ...exitEnvelope(t,T.end),flat:1-ease.inCubic(span(t,T.machine,T.machine+0.25)),
    width:ease.outExpo(span(t,T.machine+0.25,T.end-0.1)) };
}
export function impactPost(t: number, m: PrintWorld) {
  const hits=m.events.filter(e => e.kind === 'giant' || e.kind === 'commit').map(e => ({ t:e.tp,px:e.kind === 'commit' ? 10 : 7 }));
  hits.push({ t:m.T.bracketLine.words.at(-1)!.start,px:6 });
  hits.sort((a,b) => a.t-b.t);
  const hit=[...hits].reverse().find(h => t >= h.t);
  const age=hit ? t-hit.t : Infinity;
  const mag=hit ? hit.px*Math.exp(-age/0.09) : 0;
  // Preserve the literal C7 clay face for one frame before swapping its palette.
  const fi=frameIdx(t),pulseFrame=hit ? frameIdx(hit.t)+(hit.t === m.T.start ? 1 : 0) : Infinity;
  const paletteSwap=hit && fi>=pulseFrame && fi<pulseFrame+2 ? 1 : 0;
  const still=exitEnvelope(t,m.T.end).still;
  return { paletteSwap:still ? 0 : paletteSwap,shake:[still ? 0 : noise1(fi*17.13,803)*mag,still ? 0 : noise1(fi*29.37,804)*mag] as [number,number],
    zoom:still ? 1 : 1+(hit?.px === 10 ? 0.04*Math.exp(-age/0.09) : 0) };
}
