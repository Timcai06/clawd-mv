// Projected upright test plates + engraved angular fragments. Projection is closed-form,
// not a simulation; the same vertices drive Canvas drawing and the composition tests.
import { hash, lerp } from '../../engine/util';
import type { AudioData } from '../../engine/audio';
import type { X9Times } from '../s09-z-shared';
import { HANDOFF } from '../../kit/handoff';
import { exitBeat, enterBeat, union, spriteBox } from './s09-type';
import * as Clawd from '../../kit/clawd';
export type Point = [number, number];
export const GLASS = { rows: 19, pieces: 8, width: 170, height: 620 };
export function glassTriangles(row: number) {
  const w = GLASS.width, h = GLASS.height;
  const center: Point = [w * (0.32 + hash(row, 11) * 0.36), h * (0.25 + hash(row, 12) * 0.5)];
  const ring: Point[] = [[0, 0], [w * 0.4, 0], [w, 0], [w, h * 0.55],
    [w, h], [w * 0.6, h], [0, h], [0, h * 0.45]];
  return ring.map((p, i) => [center, p, ring[(i + 1) % ring.length]!] as const);
}
/** A row of equal-world-height plates, progressively foreshortened toward the right vanishing point. */
export function plateAt(row: number) {
  const depth = 1 + row * 0.18;
  const x = 76 + 1714 * (row * 0.06 / (1 + row * 0.06)) / (1.08 / 2.08);
  const y = 258 + 610 * (1 - 1 / depth), w = 170 / depth, bottom = 880 + 10 / depth;
  const quad: Point[] = [[x, y], [x + w, y + 64 / depth], [x + w, bottom], [x, bottom + 8 / depth]];
  return { row, x, y, w, h: bottom - y, depth, quad };
}
export function glassShardState(row: number, piece: number, fracture: number) {
  const id = row * 8 + piece, p = plateAt(row);
  const release = Math.max(0, (fracture - row * 0.008) / (1 - row * 0.008));
  return { x: (hash(id, 5) - 0.5) * 220 * release / Math.sqrt(p.depth),
    y: (-120 + hash(id, 6) * 390) * release / Math.sqrt(p.depth),
    z: (hash(id, 7) - 0.5) * release * 80,
    rz: (hash(id, 8) - 0.5) * release * 1.8, release, alpha: 1 };
}
export function glassState(audio: AudioData, t: number, T: X9Times) {
  // A plate's broken lower face stays scattered throughout the shattering shot.
  const fracture = Math.min(1, Math.max(0, (audio.beatAt(t) - audio.beatAt(T.shatter)) / 2.5));
  const plates = Array.from({ length: 19 }, (_, row) => plateAt(row));
  const pose = Clawd.pose('A8', { beat: audio.beatAt(t), beat0: audio.beatAt(T.nineteen), p: fracture });
  return { plates, fracture, dominant: union(plates.flatMap(p => [...p.quad, [p.quad[0]![0] - 9 / p.depth, p.quad[0]![1] + 4] as Point, [p.quad[3]![0] - 9 / p.depth, p.quad[3]![1] + 4] as Point])),
    clawd: { x: 600, y: 914, px: 15, pose }, clawdBox: spriteBox(600, 914, 15, pose) };
}
export function handoffIn(t: number, audio: AudioData, T: X9Times) {
  const p = enterBeat(audio, t, T.wallStart);
  return { x: lerp(HANDOFF.nineteen09.x, 80, p), baseline: lerp(HANDOFF.nineteen09.baseline, 204, p), capH: 140 };
}
export function handoffOut(t: number, audio: AudioData, T: X9Times) {
  const p = exitBeat(audio, t, T.wallEnd);
  return { roll: lerp(0.12, HANDOFF.fall10.roll, p), pxPerBeat: lerp(160, HANDOFF.fall10.pxPerBeat, p) };
}
export function fallTravel(t: number, audio: AudioData, T: X9Times) {
  const b = Math.max(0, audio.beatAt(t) - audio.beatAt(T.wallEnd) + 1);
  // Integral of the cubic velocity ramp: derivative reaches exactly 220px/beat at the cut.
  const u = Math.min(1, b / 0.9);
  const integral = u <= 0.5 ? u ** 4 : u + (1 - u) ** 4 - 0.5;
  return 160 * b + 60 * 0.9 * integral + 60 * Math.max(0, b - 0.9);
}

import { Rig, p3, type P3 } from '../../kit/rig';
import { layoutPath, path3, pathAt, runInkBounds, letterTimes } from '../../kit/pathtext';
import { varRun } from '../../kit/vartype';
import { Voice, heatColor } from '../../kit/lyric-moves';
import { carryLayout, type GlyphAffine } from '../../kit/carry';
import { passCarry } from './s09-scope';
import { exitPrim as nineteenPrim } from './s09-scope';
import { clamp, ease } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { plateOrigin, plateToWorld, shardMotion, shardTri, rot, stampAt, cameraAt, PW, PH, ROW_DIR, ROW_STEP, YAW } from './s10-world';
export const entryPrim = nineteenPrim;
export const STRIP_LEN = ROW_STEP*18+PW*1.4;
export const STRIP_CAP = 0.62, STRIP_BASE = PH*0.32;
export function stripLayout(v: Voice,T: X9Times) {
  const words=v.line('Nineteen red, and they’re shattering like glass').words;
  return layoutPath(words,{capH:STRIP_CAP,space:0.24,axes:w=>v.form(w,w.end).axes,
    notBefore:s=>stampAt(v.audio,T,stripPlate(s))});
}
export const STRIP_OFFSET=PW*0.7*ROW_DIR.x;
export const STRIP_X=ROW_DIR.x*Math.cos(YAW)-ROW_DIR.z*Math.sin(YAW);
export function stripPlate(s: number) {return Math.round(clamp((s-STRIP_OFFSET)/ROW_STEP,0,18));}
export function wallCamera(audio:AudioData,t:number,T:X9Times) {return cameraAt(audio,Math.min(t,T.wallEnd-0.1),T);}
export function passIncoming(v:Voice,T:X9Times,t:number) {
  const spec=passCarry(v,T),pass=v.line('So I run the tests, I’m waiting for a pass').words.at(-1)!;
  const blocked=clamp((t-T.wallStart)/0.2);
  return {spec,aff:carryLayout(spec).filter(g=>t>=letterTimes(pass)[g.i]!.t0),alpha:t>=pass.end+0.12?0:(1-0.65*blocked)*(1-clamp((t-pass.end)/0.12))};
}
export function shardPoint(T:X9Times,i:number,j:number,t:number,q:P3) {
  const cw=plateToWorld(i,shardTri(i,j).c),w=plateToWorld(i,q),m=shardMotion(T,i,j,t);
  const r=rot(p3(w.x-cw.x,w.y-cw.y,w.z-cw.z),m.axis,m.angle);
  return p3(cw.x+r.x+m.d.x,Math.max(-40,cw.y+r.y+m.d.y),cw.z+r.z+m.d.z);
}
/** Freeze shard orientation in the final beat; screen translation then has the rain's exact velocity.
 * No change to the retained v5 ballistic world function. */
const screenRig=new Rig(),anchorRig=new Rig();let rigTime=NaN,anchorTime=NaN,rigAudio:AudioData|undefined;
export function shardScreen(audio:AudioData,T:X9Times,i:number,j:number,t:number,q:P3) {
  const at=afterBeats(audio,T.wallEnd,-1);
  if(t!==rigTime || audio!==rigAudio){screenRig.set(wallCamera(audio,t,T));rigTime=t;rigAudio=audio;}
  const rig=screenRig;
  if(t<at){const w=shardPoint(T,i,j,t,q);return rig.proj(w.x,w.y,w.z);}
  if(at!==anchorTime){anchorRig.set(wallCamera(audio,at,T));anchorTime=at;}const anchor=anchorRig;
  const p=shardPoint(T,i,j,at,q),a=anchor.proj(p.x,p.y,p.z);if(!a)return null;
  const b=audio.beatAt(t)-audio.beatAt(at),roll=HANDOFF.fall10.roll;
  return {...a,x:a.x+Math.sin(roll)*220*b,y:a.y+Math.cos(roll)*220*b};
}
/** Clip a polygon against a rectangle, so every exported glyph is exactly its shard's slice. */
function clipRect(poly:P3[],x0:number,x1:number,y0:number,y1:number) {
  for(const [axis,value,sign] of [['x',x0,1],['x',x1,-1],['y',y0,1],['y',y1,-1]] as const) {
    const next:P3[]=[];
    for(let i=0;i<poly.length;i++){
      const a=poly[i]!,b=poly[(i+1)%poly.length]!,A=(a[axis]-value)*sign>=0,B=(b[axis]-value)*sign>=0;
      if(A)next.push(a);
      if(A!==B){const k=(value-a[axis])/(b[axis]-a[axis]);next.push(p3(a.x+(b.x-a.x)*k,a.y+(b.y-a.y)*k,0));}
    }
    poly=next;
  }
  return poly;
}
export function glassShards(v:Voice,T:X9Times,t:number) {
  const lay=stripLayout(v,T),glass=v.line('Nineteen red, and they’re shattering like glass').words.at(-1)!;
  const axes=v.form(glass,glass.end).axes,run=varRun(glass.w,100,axes),m=STRIP_CAP/run.capH;
  const out:{plate:number;piece:number;aff:GlyphAffine;triangle:NonNullable<ReturnType<typeof shardScreen>>[];t0:number;ch:string;axes:typeof axes}[]=[];
  lay.glyphs.filter(g=>g.word===glass).forEach((g,index)=>{
    const glyph=run.glyphs[index]!,ink=runInkBounds({...run,glyphs:[{...glyph,x:0}]});
    for(let i=0;i<19;i++){
      const x=(g.s-STRIP_OFFSET-ROW_STEP*i)/STRIP_X;
      const x0=x+ink.x0*m/STRIP_X,x1=x+ink.x1*m/STRIP_X;
      if(x1<-PW/2||x0>PW/2)continue;
      for(let j=0;j<8;j++){
        const clipped=clipRect(shardTri(i,j).pts,Math.max(-PW/2,x0),Math.min(PW/2,x1),
          Math.max(PH*0.30,STRIP_BASE-ink.y1*m),Math.min(PH*0.42,STRIP_BASE-ink.y0*m));
        if(clipped.length<3)continue;
        const a=shardScreen(v.audio,T,i,j,t,p3(x,STRIP_BASE,0.071)),
          u=shardScreen(v.audio,T,i,j,t,p3(x+10*m/STRIP_X,STRIP_BASE,0.071)),
          d=shardScreen(v.audio,T,i,j,t,p3(x,STRIP_BASE-10*m,0.071));
        if(!a||!u||!d)continue;
        const aff:GlyphAffine={ch:g.ch,i:index,a:(u.x-a.x)/10,b:(u.y-a.y)/10,c:(d.x-a.x)/10,d:(d.y-a.y)/10,e:a.x,f:a.y};
        const triangle=clipped.map(p=>shardScreen(v.audio,T,i,j,t,{...p,z:0.071})).filter(p=>p!==null);
        out.push({plate:i,piece:j,aff,triangle,t0:g.t0,ch:g.ch,axes});
      }
    }
  });
  return out;
}
export function cursorAt(audio:AudioData,t:number,T:X9Times) {
  const i=Array.from({length:19},(_,i)=>i).reduce((a,i)=>t>=stampAt(audio,T,i)?i:a,0);
  const rig=new Rig();rig.set(wallCamera(audio,t,T));const p=plateToWorld(i,p3(PW*0.05,PH*0.86,0.18));
  return rig.proj(p.x,p.y,p.z)!;
}
export function stripCapPixels(audio:AudioData,t:number,T:X9Times) {
  const rig=new Rig();rig.set(wallCamera(audio,t,T));const p=plateToWorld(0,p3(0,STRIP_BASE,THICK));
  const a=rig.proj(p.x,p.y,p.z)!,b=rig.proj(p.x,p.y+STRIP_CAP,p.z)!;
  return Math.hypot(a.x-b.x,a.y-b.y);
}
const THICK=0.071;
