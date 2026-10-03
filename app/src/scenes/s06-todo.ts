import { SparkLines, cursorSpark, heatTrail, sparkFade } from '../kit/spark';
import { drawNote } from '../kit/note';
import { PrintOverlay } from '../kit/print-overlay';
// S06 — the cropped CHECK headline and a front-elevation pen-plotter sheet.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { css, lin } from '../theme';
import { drawCursor, drawTrail, trailHead } from '../kit/cursor';
import { postFor } from '../kit/ground';
import { afterBeats, span } from '../kit/time';
import { ease, lerp } from '../engine/util';
import { heatColor, Voice, drawSet, setLine } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { checkHeadline, resolveCTimes, todoLayout, type CTimes } from './parts/s06-timing';
import { printRun } from './parts/s05-print';

export const TYPE_LEVELS = { giant: 526, lyric: 56, label: 18 }; // cap px; mono machine item can use the lyric tier
const PAPER = /* glsl */ `
uniform vec3 paper,ink;
void main() {
  vec2 p=FRAG_PX;
  float fibre=hash12(floor(p*vec2(0.7,0.15)));
  float grain=hash12(floor(p));
  fragColor=vec4(mix(paper,ink,fibre*0.009+grain*0.009),1.0);
}`;
class TodoWorld {
  print = new PrintOverlay();
  sparks = new SparkLines();
  users=0;
  layer=new Layer2D();
  bg=new FSPass(PAPER,{paper:{value:new THREE.Vector3(...lin('paper'))},ink:{value:new THREE.Vector3(...lin('ink'))}});
  times: CTimes;
  voice: Voice;
  constructor(ctx: SceneCtx) { this.times=resolveCTimes(ctx.audio,ctx.lyrics); this.voice=new Voice(ctx.lyrics,ctx.audio); }
  dispose() { this.sparks.dispose(); this.print.dispose(); this.bg.mat.dispose(); this.layer.texture.dispose(); }
}
let world: TodoWorld | undefined;
export default class S06Todo extends Scene {
  private w!: TodoWorld;
  override init() { this.w=world??=new TodoWorld(this.ctx); this.w.users++; }
  override dispose() { if(--this.w.users===0) {this.w.dispose();world=undefined;} }
  override render(f: Frame,out: THREE.WebGLRenderTarget) {
    const {w}=this,T=w.times,au=this.ctx.audio,c=w.layer.ctx,s=todoLayout(au,f.t,T);
    w.layer.clear();
    // v4 motion: the sheet is filmed, not pinned. A slow push on the pen; a punch toward each box on
    // its check (the third, stressed one hardest); the last beat dives into the pen tip, which S07
    // receives as its first lit key.
    const punch=T.checks.reduce((a,at,i)=>a+(f.t>=at?[0.05,0.07,0.13][i]!*Math.pow(0.5,(f.t-at)/0.1):0),0);
    const tilt=T.checks.reduce((a,at,i)=>a+(f.t>=at?[0.012,-0.014,0.02][i]!*Math.pow(0.5,(f.t-at)/0.14):0),0);
    const drift=ease.inOutQuad(span(f.t,T.todo,T.keyboard));
    const dive=ease.inCubic(span(f.t,afterBeats(au,T.keyboard,-1),T.keyboard));
    const entry=1-ease.outCubic(span(f.t,T.todo,afterBeats(au,T.todo,1.2)));
    const zoom=1+0.14*drift+punch+0.25*entry+1.6*dive;
    const fx=s.pen.x, fy=s.pen.y;
    c.save();
    c.translate(lerp(fx,960,0.2*drift+0.8*dive),lerp(fy,540,0.2*drift+0.8*dive)-30*entry);
    c.rotate(tilt-0.015*entry); c.scale(zoom,zoom); c.translate(-fx,-fy);
    w.sparks.begin(c, undefined, 'paper');
    let writing = false;
    const head=checkHeadline(f.t,T),checks=T.plan.words.filter(x=>x.w.toLowerCase().startsWith('check'));
    if(head.born>0) {
      const active=checks.filter(x=>x.start<=f.t).at(-1)!;
      const form=w.voice.form(active,f.t);
      c.fillStyle=heatColor('ink', 'paper', form.age); c.globalAlpha=form.born;
      const run=varRun('CHECK',730,{...form.axes,wght:head.weight});
      printRun(c,run,s.title);
      // Keep the storyboard's ink headline: the stressed third check passes a
      // clay ink roller through its lower edge instead of recolouring the poster.
      if(form.stress) {
        c.save();c.beginPath();c.rect(0,425,1920,39*form.sung);c.clip();
        c.fillStyle=heatColor('clay', 'paper', form.age);printRun(c,run,s.title);c.restore();
      }
      c.globalAlpha=1;
    }
    c.strokeStyle=css('ink',0.6); c.lineWidth=1.4;
    c.beginPath();c.moveTo(424,460);c.lineTo(424,1080);
    for(const y of [612,750]) {c.moveTo(424,y);c.lineTo(1920,y);}c.stroke();
    for(let i=0;i<3;i++) {
      const row=s.rows[i]!,b=row.box;
      const forms=w.voice.forms(T.plan,f.t).slice(i===0?0:3,i===0?3:6);
      if(i===2 || forms.some(x=>x.born>0)) {
        c.strokeStyle=css('ink',0.6);c.lineWidth=i===2?4:2;
        c.strokeRect(b.x,b.y,b.w,b.h);
      }
      if(i<2) drawSet(c,setLine(forms,row.size,{space:0.4}),row.x,row.y,{on:'paper'});
      else { // This is a machine task, never a sung/predicted word.
        c.fillStyle=css('ink',0.6);c.font=font(F.mono(500),row.size);c.fillText('Fix October',row.x,row.y);
      }
      // Plotter strokes remain single strokes. Vocal check onsets start the pen;
      // the measured snares supply the hop accents, without revealing a future lyric.
      const at=checks[i]!.start,progress=span(f.t,at,afterBeats(au,at,i===2?1:0.4));
      const pts: [number,number][]=[[b.x+b.w*0.18,b.y+b.h*0.48],[b.x+b.w*0.41,b.y+b.h*0.7],[b.x+b.w*1.02,b.y+3]];
      const finish = afterBeats(au, at, i===2?1:0.4);
      const path = (tb: number) => trailHead(pts, span(tb, at, finish));
      const lengths = [Math.hypot(pts[1]![0]-pts[0]![0],pts[1]![1]-pts[0]![1]), Math.hypot(pts[2]![0]-pts[1]![0],pts[2]![1]-pts[1]![1])];
      heatTrail(w.sparks, f.t, path, { from: at, to: finish, width: i===2?21:11,
        knots: [at + (finish-at)*lengths[0]!/(lengths[0]!+lengths[1]!)], cold: sparkFade(f.t, T.keyboard)===0 });
      if (f.t >= at && f.t < finish) {
        writing = true;
        cursorSpark(c, undefined, w.sparks, f.t, tb => ({ ...path(tb), h: 27 }),
          { on: 'paper', from: at, to: finish, end: T.keyboard, seed: 60+i });
      }
      if(i<2) {
        const strike=i===0?s.strike:{x0:588,x1:1250,y:681};
        const p=span(f.t,T.checks[i]!,afterBeats(au,T.checks[i]!,0.7));
        // Incoming clay highlight line is received before the first local check.
        const visible=i===0?Math.max(1-span(f.t,T.todo,afterBeats(au,T.todo,1)),p):p;
        drawTrail(c,[[strike.x0,strike.y],[strike.x1,strike.y]],visible,{width:2,color:i===0?'clay':'ink',alpha:i===0?1:0.6});
      }
    }
    { const b=s.rows[2]!.box; drawNote(c,{ax:b.x+b.w*0.5,ay:b.y+b.h,x:b.x+b.w+24,y:b.y+b.h+46,text:'est. 1 line',t0:afterBeats(au,T.checks[2]!,0.5),on:'paper'},f.t); }
    // Pixel sprite at the third check's tip; the hop is a rigid translation only.
    const at=T.checks.filter(x=>x<=f.t).at(-1)??T.todo;
    const phase=span(f.t,at,afterBeats(au,at,0.6));
    const hop=-10*Math.sin(phase*Math.PI);
    const pose=Clawd.pose('A5',{beat:f.beat,beat0:au.beatAt(at),p:0,travel:0});
    Clawd.draw(c,s.clawd.x,s.clawd.y+hop,pose,{px:s.clawd.px});
    if (!writing) drawCursor(c,{x:s.pen.x,y:s.pen.y,h:27,on:1});
    // The next line begins in this scene: carry its sung prefix on the lower margin.
    if(f.t>=T.claws.start) {
      const set=setLine(w.voice.forms(T.claws,f.t),78,{space:0.22});
      c.save();c.translate(98,1060);c.scale(Math.min(1,1700/set.width),1);
      drawSet(c,set,0,0,{on:'paper'});c.restore();
    }
    c.restore();
    w.bg.render(this.ctx.renderer,out);
    this.ctx.comp.draw(this.ctx.renderer,w.layer.upload(),out);
    w.print.render(this.ctx.renderer, out);
    return {...postFor('paper'),hud:0,frame:0,bloom:0,grain:0.019};
  }
}
