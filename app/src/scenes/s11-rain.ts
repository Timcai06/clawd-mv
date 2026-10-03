// S11: engraved/toner storm in depth; the complete reference headline shares its placement
// with the second, missing-glyph slam. The missing boxes settle only during the final beat.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { css, lin } from '../theme';
import { Ground, GlowLayer, postFor } from '../kit/ground';
import { glowDraw, heatColor, Voice, drawWithMissing } from '../kit/lyric-moves';
import { fillRun } from '../kit/vartype';
import * as Clawd from '../kit/clawd';
import { beatHit, resolveX9Times, type X9Times } from './s09-z-shared';
import { DeepStorm, deepParticle, DEEP } from './parts/s11-deep';
import { headlineState, rainView, handoffOut, ROLL } from './parts/s11-layout';
import { toner, handoffBoxes } from './parts/s09-type';
import { Rig, p3 } from '../kit/rig';
import { drawPathText, pathAt } from '../kit/pathtext';
import { carryLayout, drawCarry } from '../kit/carry';
import { rainCamera, rainLyrics, fallLetter, hangingLyrics, hangingRig, whyCarry, whyFrame, glassIncoming, cursorAt } from './parts/s11-layout';
export { cursorAt } from './parts/s11-layout';
import { hash } from '../engine/util';
import { LineBatch } from '../engine/lines';
import { exitEnvelope } from '../kit/handoff';
// Archivo levels are cap heights; Plex label=18 is its CSS font size.
export const TYPE_LEVELS = { giant: 296.352, lyric: 65.856, label: 18 };
class World {
  rainLines=new LineBatch(256,{screen2D:true,blend:'normal'});
  glow = new GlowLayer();
  ground = new Ground(); storm: DeepStorm; camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 200);
  layer = new Layer2D(); times: X9Times; voice: Voice; users = 0;
  constructor(ctx: SceneCtx) {
    this.storm = new DeepStorm(ctx.renderer); this.times = resolveX9Times(ctx); this.voice = new Voice(ctx.lyrics, ctx.audio);
  }
  dispose() { this.rainLines.geo.dispose();this.rainLines.mat.dispose();this.glow.dispose(); this.storm.dispose(); this.ground.pass.mat.dispose(); this.layer.texture.dispose(); }
}
let world: World | undefined;
export default class S11Rain extends Scene {
  private w!: World;
  override init() { this.w = world ??= new World(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world = undefined; } }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.times, t = f.t, v = w.voice, au = this.ctx.audio;
    const view = rainView(Math.min(t,T.rainEnd-0.1), au, T), s = headlineState(v, t, T);
    const hit = Math.max(...T.impacts.map(at => beatHit(au, t, at, 0.12)));
    w.ground.render(this.ctx.renderer, out, { kind: 'ink', t, grid: 0, haze: 0.1,
      streaks: 0.3, streakAngle: view.roll, travel: view.b * 0.2 });
    // Integral of the entrance velocity: exactly 220 screen px/beat at the cut.
    const b = view.b, d = 220 * b + 20 * (b <= 1 ? b ** 2 / 2 : b - 0.5);
    w.storm.update(d, 0, 1, hit * 0.3);
    const order=Array.from({length:DEEP.count},(_,i)=>i).sort((a,b)=>hash(a,1)-hash(b,1)),zero=new THREE.Matrix4().makeScale(0,0,0);
    order.forEach((id,slot)=>{if(deepParticle(id,0).bar)w.storm.mesh.setMatrixAt(slot,zero);});w.storm.mesh.instanceMatrix.needsUpdate=true;
    w.camera.position.set(0, 0, view.z); w.camera.up.set(Math.sin(ROLL), Math.cos(ROLL), 0);
    w.camera.lookAt(0, 0, -20); w.camera.updateMatrixWorld();
    const r = this.ctx.renderer; r.setRenderTarget(out); r.render(w.storm.scene, w.camera);
    const stormMat = w.storm.mesh.material as THREE.ShaderMaterial;
    stormMat.uniforms.glowOnly!.value = 1;
    w.glow.renderScene(r, w.storm.scene, w.camera);
    stormMat.uniforms.glowOnly!.value = 0;
    w.layer.clear(); w.glow.clear();w.rainLines.clear(); const c = w.layer.ctx;
    const rig=new Rig();rig.set(rainCamera(au,t,T));
    c.save();
    if(s.first.born>0){c.beginPath();c.rect(0,0,1920,1080);c.rect(s.dominant.x,s.dominant.y,s.dominant.w,s.dominant.h);c.clip('evenodd');}
    for(const row of rainLyrics(v)) {
      drawPathText(c,rig,row.path,row.layout,t,{mode:'stand',up:p3(Math.sin(ROLL),Math.cos(ROLL),0),
        base:'paper',on:'ink',pop:0,minPx:0,maxPx:1000,axes:(g,at)=>v.form(g.word,at).axes,
        offset:(g,at)=>{const fall=fallLetter(au,g,at);return fall.draw?{d:{...fall.d,y:fall.d.y-32*s.out},alpha:fall.alpha}:null;}});
      for(const g of row.layout.glyphs) {
        const fall=fallLetter(au,g,t);if(!fall.splash)continue;
        const p=pathAt(row.path,g.s),age=t-fall.land;
        for(let j=0;j<6;j++){
          const spread=(hash(g.i,j,11)-0.5)*age*5,len=0.3+0.5*hash(g.i,j,12);
          const a=rig.proj(p.x+spread,p.y-age*8,p.z),b=rig.proj(p.x+spread,p.y-age*8-len,p.z);
          if(!a||!b)continue;w.rainLines.seg2(a.x,a.y,b.x,b.y,1,lin('paper'),1-age/0.25);
        }
      }
    }
    c.restore();
    const incoming=glassIncoming(v,T,t),glass=v.line('Nineteen red, and they’re shattering like glass').words.at(-1)!;
    const glassSpec={text:glass.w,size:66,axes:v.form(glass,glass.end).axes,x:0,y:0,color:'paper' as const};
    for(const shard of incoming)if(shard.draw) {
      if(shard.triangle.length>=3){c.fillStyle=css('paper',0.25);c.beginPath();shard.triangle.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill();}
      if(t>=shard.t0 && shard.triangle.length>=3){c.save();c.beginPath();shard.triangle.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.clip();drawCarry(c,glassSpec,[shard.aff]);c.restore();}
    }
    if (s.first.born > 0) {
      c.save(); c.translate(s.x, s.y); c.rotate(s.roll); c.scale(s.sx, s.sy);
      c.globalAlpha = s.first.born * (1 - s.out);
      c.fillStyle = heatColor(s.first.stress ? 'clay' : 'paper', 'ink', s.first.age); fillRun(c, s.run);
      if (s.first.stress) glowDraw(c, w.glow.ctx, g => { g.fillStyle = c.fillStyle; fillRun(g, s.run); });
      if (s.second.born > 0) {
        c.globalAlpha = s.second.born * (1 - s.out);
        drawWithMissing(c, s.run, 0, 0, i => s.second.sung * 10 - i - 0.6, heatColor(s.second.stress ? 'clay' : 'paper', 'ink', s.second.age));
        if (s.second.stress) glowDraw(c, w.glow.ctx, g => drawWithMissing(g, s.run, 0, 0, i => s.second.sung * 10 - i - 0.6, heatColor('clay','ink',s.second.age)));
      }
      c.restore();
      toner(c, s.dominant, 31, 2600);
    }
    if (s.out > 0) {
      // Exactly nine equally spaced .notdef boxes; S12 expands these into its copy row.
      const h = handoffOut(t, au, T);
      c.save(); c.globalAlpha = s.out; c.strokeStyle = css('paper'); c.lineWidth = 4;
      for (const b of handoffBoxes(h)) c.strokeRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4);
      c.restore();
    }
    const hang=hangingLyrics(v),hr=hangingRig(),why=v.line('Undefined, undefined, and I don’t know why').words.at(-1)!;
    for(const g of hang.layout.glyphs) {
      if(t<g.t0 || g.word===why)continue;
      const transform=c.setTransform.bind(c),grow=Math.min(1,(t-g.t0)/0.12);
      c.setTransform=((a:number,b:number,cc:number,d:number,e:number,f:number)=>transform(a,b,cc*grow,d*grow,e,f-66*(1-grow))) as typeof c.setTransform;
      try {drawPathText(c,hr,hang.path,{...hang.layout,glyphs:[g]},t,{mode:'stand',base:'paper',on:'ink',pop:0,axes:(g,at)=>v.form(g.word,at).axes});}
      finally {c.setTransform=transform;}
    }
    const spec=whyCarry(v);drawCarry(c,spec,whyFrame(v,t));
    const head=cursorAt(v,t,T);if(head){c.strokeStyle=css('clay');c.lineWidth=3;c.beginPath();const length=1.5*head.s;c.moveTo(head.x-Math.sin(ROLL)*length/2,head.y-Math.cos(ROLL)*length/2);c.lineTo(head.x+Math.sin(ROLL)*length/2,head.y+Math.cos(ROLL)*length/2);c.stroke();}
    const crab = s.clawd; Clawd.draw(c, crab.x, crab.y, crab.pose, { px: crab.px });
    glowDraw(c, w.glow.ctx, g => Clawd.draw(g, crab.x, crab.y, { ...crab.pose, cells: crab.pose.cells.filter(cell => cell.k === 'O') }, { px: crab.px, alpha: 0.25 }));
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    w.rainLines.render(r,out);w.glow.composite(this.ctx, out, 1.6);
    return { ...postFor('ink'), hud: 0, ca: 0.6,exposure:exitEnvelope(t,T.rainEnd).gain };
  }
}
