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
import { heatColor, Voice } from '../kit/lyric-moves';
import { drawPlot, plotRest, plotRows, plotWriting, type PlotRow } from './parts/s06-plot';
import { varRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { cam06, checkFinish, checkHeadline, resolveCTimes, todoLayout, type CTimes } from './parts/s06-timing';
import { applyCam2, HANDOFF } from '../kit/handoff';
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
  private plotted?: PlotRow[];
  constructor(ctx: SceneCtx) { this.times=resolveCTimes(ctx.audio,ctx.lyrics); this.voice=new Voice(ctx.lyrics,ctx.audio); }
  plot() { return this.plotted ??= plotRows(this.voice, this.times.plan); }
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
    c.save(); applyCam2(c,cam06(au,f.t,T));
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
    // Stage 9 ②: the sung rows are plotted by the pen that ticks the boxes; the pen head is the cursor.
    const plot=w.plot(), penHead=drawPlot(c,w.voice,T.plan,plot,f.t);
    const penWriting=plotWriting(plot,f.t);
    const rest=penHead??plotRest();
    for(let i=0;i<3;i++) {
      const row=s.rows[i]!,b=row.box;
      const forms=w.voice.forms(T.plan,f.t).slice(i===0?0:3,i===0?3:6);
      if(i===2 || forms.some(x=>x.born>0)) {
        c.strokeStyle=css('ink',0.6);c.lineWidth=i===2?4:2;
        c.strokeRect(b.x,b.y,b.w,b.h);
      }
      if(i===2) { // This is a machine task, never a sung/predicted word.
        c.fillStyle=css('ink',0.6);c.font=font(F.mono(500),row.size);c.fillText('Fix October',row.x,row.y);
      }
      // Plotter strokes remain single strokes. Vocal check onsets start the pen;
      // the measured snares supply the hop accents, without revealing a future lyric.
      const at=checks[i]!.start;
      // C6: the third (stressed) check's flick ends at the pen hand-off point, where S07's first key lights.
      const pts: [number,number][]=[[b.x+b.w*0.18,b.y+b.h*0.48],[b.x+b.w*0.41,b.y+b.h*0.7],
        i===2?[HANDOFF.pen06.x,HANDOFF.pen06.y]:[b.x+b.w*1.02,b.y+3]];
      const finish = checkFinish(au, T, i, at);
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
    // Before the first check the cursor is the plotter pen: on the stroke being written, then resting
    // where the text ends; from the first check on it is the check pen (resting at the third box).
    if (f.t < T.checks[0]!) drawCursor(c,{x:rest.x+4,y:rest.y,h:27,on:penWriting?1:undefined});
    else if (!writing) drawCursor(c,{x:s.pen.x,y:s.pen.y,h:27,on:1});
    // "Claws on the keys" belongs to S07 since the cut moved to the line break (R1).
    c.restore();
    w.bg.render(this.ctx.renderer,out);
    this.ctx.comp.draw(this.ctx.renderer,w.layer.upload(),out);
    w.print.render(this.ctx.renderer, out);
    return {...postFor('paper'),hud:0,frame:0,bloom:0,grain:0.019};
  }
}
