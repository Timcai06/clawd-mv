import { PrintOverlay } from '../kit/print-overlay';
// S03: tilted full-page form, distressed clay rubber stamp and mini-calendar attachment.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { Ground, postFor } from '../kit/ground';
import { Voice } from '../kit/lyric-moves';
import { afterBeats, span } from '../kit/time';
import { ease } from '../engine/util';
import { inscribe } from '../kit/inscribe';
import { impact } from '../kit/impact';
import { Lens } from '../kit/lens';
import * as Clawd from '../kit/clawd';
import { openingTimes } from './parts/s01-timing';
import { drawScreenGrid } from './parts/s02-layout';
import { mono } from './parts/s01-drafting';
import { drawForm, drawCalendar, drawReportLyrics, handoffIn, handoffOut, view03, FORM_ROLL, REPORT_CLAWD } from './parts/s03-form';
export const TYPE_LEVELS = { giant: 315.6, lyric: 50.8, label: 20 };
class IssueWorld {
  print = new PrintOverlay();
  users=0; ground=new Ground(); layer=new Layer2D(); lens=new Lens(); T; voice;
  constructor(ctx:SceneCtx){this.T=openingTimes(ctx.audio,ctx.lyrics);this.voice=new Voice(ctx.lyrics,ctx.audio);}
  dispose(){ this.print.dispose();this.lens.dispose();this.ground.pass.mat.dispose();this.ground.pass.mesh.geometry.dispose();this.layer.texture.dispose();}
}
let shared:IssueWorld|undefined;
export default class S03Issue extends Scene {
  private w!:IssueWorld;
  override init(){this.w=shared??=new IssueWorld(this.ctx);this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();shared=undefined;}}

  override render(f:Frame,finalOut:THREE.WebGLRenderTarget){
    const out=this.w.lens.rt;
    const w=this.w,au=this.ctx.audio,t=f.t,c=w.layer.ctx,b=handoffIn(t,au,w.T),k=span(t,w.T.issue,afterBeats(au,w.T.issue,1));
    w.ground.render(this.ctx.renderer,out,{kind:'paper',t,grid:0,halftone:.22,pitch:7}); w.layer.clear();
    // C3 (docs/CUTS.md): over the last beat the form, its words and the stamp fall out of frame
    // (inCubic, done 0.1 s before the cut); only the attached month stays, which S04 opens on.
    const fall=1150*ease.inCubic(span(t,afterBeats(au,w.T.end,-1),w.T.end-0.1));
    c.save();c.translate(0,fall);
    c.save();c.translate(960,540);c.rotate(FORM_ROLL*k);c.translate(-960,-540);drawForm(c,b);c.restore();
    if(k>0){
      c.save();c.globalAlpha=k;c.save();c.translate(0,-fall);drawCalendar(c,handoffOut(t));c.restore();drawReportLyrics(c,w.voice,t);
      c.save();c.translate(REPORT_CLAWD.x,REPORT_CLAWD.y);c.scale(1,REPORT_CLAWD.stretchY);
      Clawd.draw(c,0,0,Clawd.pose(null,{beat:f.beat,beat0:au.beatAt(w.T.issue),p:k}),{px:REPORT_CLAWD.px});c.restore();c.restore();
    } else {
      mono(c,'Issue #1031 · calendar',b.x+24,b.y+b.h*.65,20,'ink',.6);drawReportLyrics(c,w.voice,t);
    }
    c.restore();
    // C2 (R2): "screen" is still sung for 0.21 s after the cut; finish it in S02's grid, under the form.
    const screen=w.voice.line(0).words.at(-1)!;
    if(t<screen.end+0.12){c.save();c.globalCompositeOperation='destination-over';drawScreenGrid(c,w.voice,t,true);c.restore();}
    this.ctx.comp.draw(this.ctx.renderer,w.layer.upload(),out);
    w.print.render(this.ctx.renderer, out);
    w.lens.film(this.ctx.renderer,finalOut,view03(t,w.T,w.voice.line(1).words.find(x=>/weirdest/i.test(x.w))!.start));
    // Impacts (G3): every typed title letter knocks the frame a little; the BUG stamp hits hard.
    const line=w.voice.line(1),title=inscribe(w.voice.forms(line,t).slice(0,4),100);
    const hits=[...title.glyphs.map(g=>({t:g.t,shake:2.5,half:0.03})),{t:line.words[2]!.start,shake:22,half:0.07}];
    return {...postFor('paper'),hud:0,bloom:0,grain:.035,vignette:0,shake:impact(t,hits,w.T.end).shake};
  }
}
