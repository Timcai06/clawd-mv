import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { css, POSTER_POST } from '../theme';
import { drawPathText, layoutPath, pathAt, samplePath, writeHead, type Path3, type PathLayout } from '../kit/pathtext';
import { Rig, orbitCam } from '../kit/rig';
import { Voice } from '../kit/lyric-moves';
import { cursorSpark, SparkLines } from '../kit/spark';

export default class GalleryPathtext extends Scene {
  private layer!: Layer2D;
  private sparks!: SparkLines;
  private voice!: Voice;
  private rig = new Rig();
  private ridge!: Path3;
  private spiral!: Path3;
  private lay!: PathLayout;
  override init() {
    this.layer = new Layer2D(); this.sparks = new SparkLines(); this.voice = new Voice(this.ctx.lyrics,this.ctx.audio);
    const words = this.ctx.lyrics.get('There’s a thirty-second day in October').words;
    this.lay = layoutPath(words,{ capH: 0.38, axes: { wdth: 100,wght: 800 }, space: 0.32 });
    const L = this.lay.s1*1.1;
    this.ridge = samplePath(u => ({ x: (u-0.5)*L, y: 2.5+0.35*Math.sin(u*Math.PI*4), z: -0.8*Math.sin(u*Math.PI*2) }),256);
    this.spiral = samplePath(u => {
      const r = 0.6+u*2.8, a = -Math.PI/2+u*Math.PI*3;
      return { x: r*Math.cos(a), y: -2.8, z: r*Math.sin(a) };
    },512);
  }
  private time(t: number) { return 10+((t-10)%4+4)%4; }
  private camera(t: number, rig: Rig) { rig.set(orbitCam({ x: 0,y: 0,z: 0 },0.02+(t-10)*0.015,0.48,17-(t-10)*0.18,36)); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = this.time(f.t), c = this.layer.ctx; this.layer.clear(css('ink')); this.camera(t,this.rig);
    const drawPath = (p: Path3) => {
      c.strokeStyle = css('paper',0.2); c.lineWidth = 1; c.beginPath(); let first = true;
      for (const v of p.pts) { const q = this.rig.proj(v.x,v.y,v.z); if (!q) { first = true; continue; } if (first) c.moveTo(q.x,q.y); else c.lineTo(q.x,q.y); first = false; }
      c.stroke();
    };
    drawPath(this.ridge); drawPath(this.spiral);
    const common = { base: 'paper' as const,on: 'ink' as const,axes: (g: Parameters<typeof drawPathText>[3]['glyphs'][number], t: number) => this.voice.form(g.word,t).axes };
    drawPathText(c,this.rig,this.ridge,this.lay,t,{ ...common, mode: 'stand' });
    drawPathText(c,this.rig,this.spiral,this.lay,t,{ ...common, mode: 'lie',normal: () => ({ x: 0,y: 1,z: 0 }) });
    this.sparks.begin(c,undefined,'ink');
    const birthRig = new Rig();
    cursorSpark(c,undefined,this.sparks,t,tb => {
      this.camera(tb,birthRig); const p = pathAt(this.ridge,writeHead(this.lay.glyphs,tb,this.lay.s0)), q = birthRig.proj(p.x,p.y,p.z);
      return q ? { x: q.x,y: q.y,h: 22,on: 1 } : null;
    },{ on: 'ink',from: 10,to: 14,seed: 61 });
    this.ctx.comp.draw(this.ctx.renderer,this.layer.upload(),out,{ mode: 'replace' }); this.sparks.finish(this.ctx,out);
    return { ...POSTER_POST,hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); this.sparks.dispose(); }
}
