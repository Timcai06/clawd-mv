// S05 — front-elevation code ledges, three blueprint strata and a cropped filename.
// Lyrics are the walkable source platform. No predicted (unborn) words are painted.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { css, lin } from '../theme';
import { postFor } from '../kit/ground';
import { Voice, drawSet, setLine } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import { HANDOFF } from '../kit/handoff';
import { afterBeats, span } from '../kit/time';
import { ease, lerp } from '../engine/util';
import { drawCursor } from '../kit/cursor';
import * as Clawd from '../kit/clawd';
import { handoffOut, platformLayout, platformTimes, type PlatformTimes } from './parts/s05-platform-model';
import { hatchBlock, printRun } from './parts/s05-print';

export const TYPE_LEVELS = { giant: 320, lyric: 56, label: 18 }; // cap heights; source labels are 18px Mono
const PRINT = /* glsl */ `
uniform vec3 ink, paper;
uniform float pan;
void main() {
  vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  float dots = step(0.91, hash12(floor((p + vec2(pan, 0.0)) / 12.0)))
    * (1.0 - smoothstep(0.8, 1.5, length(mod(p,12.0)-6.0)));
  float fibre = hash12(floor(p * vec2(1.0, 0.22)));
  fragColor = vec4(mix(ink, paper, dots * 0.12 + fibre * 0.016), 1.0);
}`;

class PlatformWorld {
  users = 0;
  text = new Layer2D();
  bg = new FSPass(PRINT, { ink: { value: new THREE.Vector3(...lin('ink')) }, paper: { value: new THREE.Vector3(...lin('paper')) }, pan: { value: 0 } });
  times: PlatformTimes;
  voice: Voice;
  constructor(ctx: SceneCtx) { this.times = platformTimes(ctx.audio, ctx.lyrics); this.voice = new Voice(ctx.lyrics, ctx.audio); }
  dispose() { this.text.texture.dispose(); this.bg.mat.dispose(); }
}
let world: PlatformWorld | undefined;

export default class S05Platform extends Scene {
  private w!: PlatformWorld;
  override init() { this.w = world ??= new PlatformWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }

  private tree(c: CanvasRenderingContext2D, x: number, y: number, scale: number, alpha: number) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    c.strokeStyle = css('paper', alpha); c.lineWidth = 2; c.fillStyle = css('paper', alpha);
    c.beginPath(); c.moveTo(-55, -80); c.lineTo(-55, 290);
    c.moveTo(-55, 22); c.lineTo(0, 22); c.moveTo(36, 52); c.lineTo(36, 124); c.lineTo(86,124);
    c.moveTo(122,155); c.lineTo(122,232); c.lineTo(168,232); c.stroke();
    for (let i = 0; i < 3; i++) {
      const xx = i * 86, yy = i * 108;
      c.beginPath(); c.moveTo(xx,yy+48); c.lineTo(xx,yy); c.lineTo(xx+23,yy); c.lineTo(xx+33,yy+11);
      c.lineTo(xx+66,yy+11); c.lineTo(xx+66,yy+48); c.closePath(); c.stroke();
      // File-tree names are intrinsic machine lettering (the storyboard exception).
      c.font = font(F.mono(i === 2 ? 700 : 400), i === 2 ? 70 : 54);
      c.fillText(['src','calendar','month.ts'][i]!,xx+100,yy+48);
    }
    c.restore();
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, au = this.ctx.audio;
    const s = platformLayout(au, f.t, T), c = w.text.ctx;
    w.text.clear();
    // v4 motion: arrive pushed in on Clawd (continuing S04's push), pull out over the first beat;
    // a punch on "claws"; the last beat pushes in on the read line (the strike S06 picks up).
    const claws = this.ctx.lyrics.get('crack my claws').words.find((x) => /claws/i.test(x.w))!;
    const tIn = ease.outCubic(span(f.t, T.start, afterBeats(au, T.start, 1.5)));
    const punch = f.t >= claws.start ? Math.pow(0.5, (f.t - claws.start) / 0.09) : 0;
    const exitK = ease.inCubic(span(f.t, afterBeats(au, T.end, -1), T.end));
    const zoom = lerp(1.45, 1, tIn) + 0.05 * punch + 0.35 * exitK;
    const fx = lerp(s.clawd.x + 8 * s.clawd.px, 960, tIn), fy = lerp(s.clawd.y, 540, tIn) + 170 * exitK;
    c.save(); c.translate(fx, fy); c.scale(zoom, zoom); c.rotate(-0.012 * punch); c.translate(-fx, -fy);
    this.tree(c, 1130 - s.offset * 0.18, 55, 1, 0.6);
    this.tree(c, 180 - s.offset * 0.22, 75, 0.43, 0.2);
    this.tree(c, 660 - s.offset * 0.55, 288, 0.43, 0.25);
    hatchBlock(c,{x:0,y:208,w:120,h:174},0.28);
    hatchBlock(c,{x:938-s.offset*0.22,y:361,w:202,h:107},0.24);
    hatchBlock(c,{x:1760,y:0,w:160,h:210},0.45);
    for (const b of s.ledges) {
      c.strokeStyle = css('paper', b.depth === 1 ? 0.6 : 0.4); c.lineWidth = b.depth === 1 ? 2 : 1;
      c.beginPath(); c.moveTo(b.x,b.y); c.lineTo(b.x+b.w,b.y); c.lineTo(b.x+b.w,b.y+b.h);
      c.lineTo(b.x,b.y+b.h); c.stroke();
      hatchBlock(c, {x:b.x,y:b.y+5,w:b.depth===1?240:b.w,h:b.h-8},b.depth*0.45, b.depth===1?16:7);
    }
    c.font=font(F.mono(400),18); c.fillStyle=css('paper',0.55);
    c.fillText("import { calendar } from './calendar';",5-s.offset*0.22,457);
    c.fillText('export function month(date: Date) {',170-s.offset*0.55,548);
    let rider={...s.clawd};
    // Choose the currently sung line across the cut. Already sung words retain their forms.
    const line=this.ctx.lyrics.lineAt(f.t) ?? this.ctx.lyrics.lastLine(f.t);
    if(line) {
      const forms=w.voice.forms(line,f.t), set=setLine(forms,78,{space:0.22});
      const fit=Math.min(1,1550/set.width);
      const lx = 270 - s.offset;
      c.save(); c.translate(lx,738); c.scale(fit,1);
      drawSet(c,set,0,0,{on:'ink'}); c.restore();
      // Each born word owns a segment of the same physical platform.
      c.strokeStyle=css('paper',0.6); c.lineWidth=1.5;
      for(const word of set.words) if(word.form.born>0) {
        c.beginPath(); c.moveTo(lx+word.x*fit,664); c.lineTo(lx+(word.x+word.w)*fit,664); c.stroke();
      }
      // On the source-reading phrase, its aligned "read" is the ledge Clawd
      // crosses. The later "Read the code" prefix stays in the cut's fixed layout.
      // Clawd walks the line: after the hand-off beat he rides the word being sung (the pdoom
      // spark-on-the-curve method), hopping onto each new word.
      if(line.text.startsWith('So I crack') && f.t > afterBeats(au, T.start, 1)) {
        const born=set.words.filter(w=>w.form.born>0);
        const cur=born.at(-1);
        if(cur) {
          const k=ease.inOutCubic(span(f.t, cur.form.t0, cur.form.t0+0.12));
          const prev=born.at(-2) ?? cur;
          const xa=lx+(prev.x+prev.w*0.5)*fit, xb=lx+(cur.x+cur.w*Math.min(1,cur.form.sung))*fit;
          const k1=ease.inOutCubic(span(f.t, afterBeats(au, T.start, 1), afterBeats(au, T.start, 1.6)));
          rider.x=lerp(rider.x, lerp(xa,xb,k)-8*rider.px, k1);
          rider.y=lerp(rider.y, 664-5*rider.px-26*Math.sin(Math.PI*k), k1);
        }
      }
    }
    // The canonical sprite is kept flat, including at the S04 match cut.
    const armsUp=f.t>=claws.start && f.t<claws.start+0.32;
    const pose=Clawd.pose(armsUp?'A7':'A5',{beat:f.beat,beat0:au.beatAt(T.start),p:0,travel:0});
    Clawd.draw(c,rider.x,rider.y,pose,{px:rider.px});
    const strike=handoffOut(f.t,au,T);
    c.strokeStyle=css('clay'); c.lineWidth=2;
    c.beginPath(); c.moveTo(strike.x0,strike.y); c.lineTo(strike.x1,strike.y); c.stroke();
    // Filename is machine text, a documented giant-type exception, not a sung word.
    c.fillStyle=css('paper',0.6);
    printRun(c,varRun('month.ts',430,{wdth:100,wght:900}),s.title);
    const exit=span(f.t,afterBeats(au,T.end,-1),T.end);
    drawCursor(c,{x:1045,y:724,h:50*(1-exit),on:1});
    // The incoming platform starts directly below the shared Clawd rectangle.
    const entry=1-span(f.t,T.start,afterBeats(au,T.start,1));
    if(entry>0) { c.fillStyle=css('paper',0.5*entry); c.fillRect(HANDOFF.clawd04.x-30,HANDOFF.clawd04.y+30,180,1); }
    c.restore();
    w.bg.u.pan!.value=s.offset; w.bg.render(this.ctx.renderer,out);
    this.ctx.comp.draw(this.ctx.renderer,w.text.upload(),out);
    return {...postFor('ink'),hud:0,frame:0,bloom:0,grain:0.022,vignette:0};
  }
}
