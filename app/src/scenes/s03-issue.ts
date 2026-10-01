// S03: tilted full-page form, distressed clay rubber stamp and mini-calendar attachment.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { Ground, postFor } from '../kit/ground';
import { Voice } from '../kit/lyric-moves';
import { afterBeats, span } from '../kit/time';
import { lerp } from '../engine/util';
import { Lens } from '../kit/lens';
import * as Clawd from '../kit/clawd';
import { openingTimes } from './parts/s01-timing';
import { mono } from './parts/s01-drafting';
import { drawForm, drawCalendar, drawReportLyrics, handoffIn, handoffOut, FORM_ROLL, REPORT_CLAWD } from './parts/s03-form';
export const TYPE_LEVELS = { giant: 315.6, lyric: 50.8, label: 20 };
class IssueWorld {
  users=0; ground=new Ground(); layer=new Layer2D(); lens=new Lens(); T; voice;
  constructor(ctx:SceneCtx){this.T=openingTimes(ctx.audio,ctx.lyrics);this.voice=new Voice(ctx.lyrics,ctx.audio);}
  dispose(){this.lens.dispose();this.ground.pass.mat.dispose();this.ground.pass.mesh.geometry.dispose();this.layer.texture.dispose();}
}
let shared:IssueWorld|undefined;
export default class S03Issue extends Scene {
  private w!:IssueWorld;
  override init(){this.w=shared??=new IssueWorld(this.ctx);this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();shared=undefined;}}
  /** v4 motion: the form is read up close (a breathing push that returns to identity for the S04 hand-off), with a punch on "weirdest". */
  private view(t:number){
    const T=this.w.T;
    const p=span(t,T.issue,T.end);
    const weird=this.w.voice.line(1).words.find(x=>/weirdest/i.test(x.w))!;
    const punch=t>=weird.start?Math.pow(0.5,(t-weird.start)/0.1):0;
    const zoom=1+0.07*Math.sin(Math.PI*p)+0.05*punch;
    return {zoom,fx:lerp(820,960,p),fy:lerp(480,540,p),rot:-0.012*punch*(1-p)};
  }

  override render(f:Frame,finalOut:THREE.WebGLRenderTarget){
    const out=this.w.lens.rt;
    const w=this.w,au=this.ctx.audio,t=f.t,c=w.layer.ctx,b=handoffIn(t,au,w.T),k=span(t,w.T.issue,afterBeats(au,w.T.issue,1));
    w.ground.render(this.ctx.renderer,out,{kind:'paper',t,grid:0,halftone:.22,pitch:7}); w.layer.clear();
    c.save();c.translate(960,540);c.rotate(FORM_ROLL*k);c.translate(-960,-540);drawForm(c,b);c.restore();
    if(k>0){
      c.save();c.globalAlpha=k;drawCalendar(c,handoffOut(t));drawReportLyrics(c,w.voice,t);
      c.save();c.translate(REPORT_CLAWD.x,REPORT_CLAWD.y);c.scale(1,REPORT_CLAWD.stretchY);
      Clawd.draw(c,0,0,Clawd.pose(null,{beat:f.beat,beat0:au.beatAt(w.T.issue),p:k}),{px:REPORT_CLAWD.px});c.restore();c.restore();
    } else {
      mono(c,'Issue #1031 · calendar',b.x+24,b.y+b.h*.65,20,'ink',.6);drawReportLyrics(c,w.voice,t);
    }
    this.ctx.comp.draw(this.ctx.renderer,w.layer.upload(),out);
    w.lens.film(this.ctx.renderer,finalOut,this.view(t));
    return {...postFor('paper'),hud:0,bloom:0,grain:.035,vignette:0};
  }
}
