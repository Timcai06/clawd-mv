// V6 — a lit source cliff, pulled drawers and letter-timed solid stepping stones.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { F, font } from '../engine/type';
import { css, lin, POSTER_POST } from '../theme';
import { Voice } from '../kit/lyric-moves';
import { runInkBounds, letterTimes, drawPathText } from '../kit/pathtext';
import { planeAffine, Rig } from '../kit/rig';
import { engraveMaterial, setEngrave } from '../kit/engrave-mat';
import { varRun } from '../kit/vartype';
import { SolidText } from '../kit/solidtype';
import { VoxelClawd } from '../kit/clawd3d';
import * as Clawd from '../kit/clawd';
import { MONTH_SOURCE } from '../kit/content';
import { exitEnvelope } from '../kit/handoff';
import { platformTimes } from './parts/s05-platform-model';
import { setCamera, solidInkContext, type Box3 } from './parts/s05-print';
import * as W from './parts/s05-world';
export const TYPE_LEVELS={giant:320,lyric:64,label:18};
export function drawLeadText(c:CanvasRenderingContext2D,rig:Rig,t:number,a:SceneCtx['audio'],l:SceneCtx['lyrics'],T=platformTimes(a,l),mask=false) {
  const voice=new Voice(l,a);
  return W.leadLayouts(l,a).flatMap((layout,row)=>['ink','clay'].map(pigment=>drawPathText(solidInkContext(c,mask?'white':css(pigment as 'ink'|'clay')),rig,W.leadPath(t,a,T,row),layout,t,
    {mode:'stand',base:'ink',on:'ink',minPx:0,maxPx:90,axes:(g,t)=>voice.form(g.word,t).axes,
      offset:(g,t)=>(g.word.w.toLowerCase()==='claws')!==(pigment==='clay')?null:
        {d:{x:0,y:g.word.w.toLowerCase()==='crack'?.03*Math.sin(g.i*7+t*80)*Math.exp(-Math.max(0,t-g.t0)/.12):0,z:0}}})));
}
class Cliff {
  users=0; scene=new THREE.Scene();rig=new Rig();layer=new Layer2D();
  T;voice;clawd=new VoxelClawd();light=new THREE.DirectionalLight(0xffffff,1);
  wallMat=engraveMaterial({ink:lin('paper'),paper:lin('ink'),lightLines:true,maxCov:.3,pitch:12});
  mat=engraveMaterial({ink:lin('ink'),paper:lin('paper')});
  solidMats:THREE.MeshLambertMaterial[]=[];letterMats:THREE.MeshLambertMaterial[][]=[];
  crackU={progress:{value:0},front:{value:1.2},points:{value:W.crackPath().map(p=>new THREE.Vector3(p.x,p.y,p.z))}};
  crackMat=engraveMaterial({ink:lin('ink'),paper:lin('paper')});stones:SolidText[];
  drawers:THREE.Mesh[]=[];ledges:THREE.Mesh[]=[];
  constructor(ctx:SceneCtx) {
    this.T=platformTimes(ctx.audio,ctx.lyrics);this.voice=new Voice(ctx.lyrics,ctx.audio);
    this.scene.add(new THREE.AmbientLight(0xffffff,W.AMBIENT));this.light.intensity=Math.PI*W.LIGHT_INTENSITY;this.light.position.set(...W.LIGHT as unknown as [number,number,number]).multiplyScalar(25);
    // Lambert's direct BRDF carries 1/pi. Normalize before engraving, and
    // keep the lit top and front within the specified paper-tone ceiling.
    for(const mat of [this.mat,this.crackMat]){const compile=mat.onBeforeCompile;mat.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.fragmentShader=shader.fragmentShader
      .replace('float engraveT = engraveSat(engraveL);','float engraveT = clamp(engraveL,0.0,0.92);')
      .replace('return 1.0-smoothstep(hw-aa,hw+aa,x);','return min(engraveBox(x,hw,aa*0.5)+engraveBox(1.0-x,hw,aa*0.5),1.0);');};mat.customProgramCacheKey=()=> 'g2-paper-normalized';}
    const wallCompile=this.wallMat.onBeforeCompile;this.wallMat.onBeforeCompile=(shader,renderer)=>{wallCompile(shader,renderer);
      // A subpixel burin mark uses box-filtered coverage. The shared maxCov
      // clamps the sampled line amplitude; here it instead bounds its width.
      shader.fragmentShader=shader.fragmentShader.replace('float engraveCov = min(engraveMaxCov, engraveTone(engraveU,engraveLL ? 1.0-engraveT : engraveT));',
        'float engraveCov = engraveBox(0.5-abs(fract(engraveU)-0.5),0.5*engraveMaxCov*0.06*pow(engraveT,1.25),max(0.5*fwidth(engraveU),1e-4));');
    };this.wallMat.customProgramCacheKey=()=> 'g2-ink-wall-thin-burin';
    this.light.castShadow=true;this.light.shadow.mapSize.set(1024,1024);
    Object.assign(this.light.shadow.camera,{left:-22,right:22,top:12,bottom:-20,near:.1,far:80});
    this.light.shadow.bias=-.0003;this.scene.add(this.light,this.light.target);
    const wall=new THREE.Mesh(new THREE.PlaneGeometry(200,200),this.wallMat);wall.receiveShadow=true;this.scene.add(wall);
    for(const i of W.SOURCE_ROWS){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),this.mat);m.castShadow=m.receiveShadow=true;this.ledges.push(m);this.scene.add(m);this.box(m,W.ledgeBox(i));}
    const compile=this.crackMat.onBeforeCompile;
    this.crackMat.onBeforeCompile=(shader,renderer)=>{
      compile(shader,renderer);Object.assign(shader.uniforms,{crackProgress:this.crackU.progress,crackFront:this.crackU.front,crackPoints:this.crackU.points});
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCrackWorld;').replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nvCrackWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vCrackWorld;uniform float crackProgress,crackFront;uniform vec3 crackPoints[7];`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',`
      if(abs(vCrackWorld.z-crackFront)<0.008){for(int i=0;i<6;i++){
        float p=clamp(crackProgress*6.0-float(i),0.0,1.0);if(p<=0.0)continue;
        vec2 A=crackPoints[i].xy,B=mix(A,crackPoints[i+1].xy,p),V=B-A,Q=vCrackWorld.xy-A;
        float u=clamp(dot(Q,V)/max(dot(V,V),1e-8),0.0,1.0),dist=length(Q-V*u);
        float flank=sign(V.x*Q.y-V.y*Q.x),groove=1.0-smoothstep(0.008,0.025,dist);
        outgoingLight=mix(outgoingLight,mix(engravePaper,engraveInk,step(0.0,flank)),groove*.9);
      }}
      #include <opaque_fragment>`);
    };this.crackMat.customProgramCacheKey=()=> 'g2-crack-groove';
    for(let k=0;k<3;k++){const m=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),k===0?this.crackMat:this.mat);m.castShadow=m.receiveShadow=true;this.drawers.push(m);this.scene.add(m);}
    this.stones=W.stoneWords(ctx.lyrics).map((word,j)=>{
      const m=engraveMaterial({ink:lin('ink'),paper:lin('paper')});
      if(j===1)setEngrave(m,{ink:lin('clay'),paper:lin('clay')});this.solidMats.push(m);
      const solid=new SolidText(word.w.toUpperCase(),{axes:this.voice.form(word,word.end).axes,capH:.55,depth:.4,bevel:0,material:m});
      const mats=solid.letters.map(g=>{const material=engraveMaterial({ink:lin('ink'),paper:lin('paper')});
        const compile=material.onBeforeCompile;material.onBeforeCompile=(shader,renderer)=>{compile(shader,renderer);shader.fragmentShader=shader.fragmentShader
          .replace('float engraveT = engraveSat(engraveL);','float engraveT = clamp(engraveL,0.0,0.92);')
          .replace('return 1.0-smoothstep(hw-aa,hw+aa,x);','return min(engraveBox(x,hw,aa*0.5)+engraveBox(1.0-x,hw,aa*0.5),1.0);');};material.customProgramCacheKey=()=> 'g2-stone-normalized';
        g.mesh.material=j===1?new THREE.MeshBasicMaterial({color:new THREE.Color(...lin('clay')),toneMapped:false}):material;return material;});this.letterMats.push(mats);
      this.scene.add(solid.group);return solid;
    });
    this.clawd.mesh.scale.setScalar(W.VOXEL);this.scene.add(this.clawd.mesh);this.clawd.light(Array.from(W.LIGHT) as [number,number,number],.65);
    this.clawd.mesh.castShadow=true; // kit's custom voxel shader has no Lambert shadow receiver.
  }
  box(m:THREE.Mesh,b:Box3){m.position.set((b.lo.x+b.hi.x)/2,(b.lo.y+b.hi.y)/2,(b.lo.z+b.hi.z)/2);m.scale.set(b.hi.x-b.lo.x,b.hi.y-b.lo.y,b.hi.z-b.lo.z);}
  dispose(){this.layer.texture.dispose();this.clawd.dispose();this.wallMat.dispose();this.mat.dispose();this.crackMat.dispose();this.stones[1]!.letters.forEach(g=>(g.mesh.material as THREE.Material).dispose());this.letterMats.flat().forEach(m=>m.dispose());this.solidMats.forEach(m=>m.dispose());this.stones.forEach(s=>s.dispose());this.scene.traverse(o=>{if(o instanceof THREE.Mesh&&o!==this.clawd.mesh&&!this.stones.some(s=>s.letters.some(g=>g.mesh===o)))o.geometry.dispose();});this.light.dispose();}
}
let world:Cliff|undefined;
export default class S05Platform extends Scene {
  w!:Cliff;override init(){this.w=world??=new Cliff(this.ctx);this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();world=undefined;}}
  override render(f:Frame,out:THREE.WebGLRenderTarget){
    const w=this.w,a=this.ctx.audio,l=this.ctx.lyrics,t=f.t;
    setCamera(w.rig,W.cameraAt(t,a,l,w.T));
    w.drawers.forEach((m,k)=>w.box(m,W.drawerBox(k,t,a,w.T)));w.crackU.progress.value=W.crackProgress(t,l);w.crackU.front.value=W.drawerBox(0,t,a,w.T).hi.z;
    w.stones.forEach((s,j)=>{const b=W.wordStone(j,l,a),states=W.stoneLetters(W.stoneWords(l)[j]!,t);
      const run=varRun(W.stoneWords(l)[j]!.w.toUpperCase(),100,w.voice.form(W.stoneWords(l)[j]!,W.stoneWords(l)[j]!.end).axes),ink=runInkBounds(run);
      s.group.position.set(b.lo.x-ink.x0*.55/run.capH,b.lo.y+W.stoneSink(j,t,a,l),0);
      for(const g of s.letters){const state=states[g.i]!,z=g.mesh.geometry.boundingBox!.getCenter(new THREE.Vector3()).z;s.setLetter(g.i,{visible:state.visible,scale:{x:1,y:1,z:state.z},d:{x:0,y:0,z:-z*(1-state.z)}});const age=t-letterTimes(W.stoneWords(l)[j]!)[g.i]!.t0;setEngrave(w.letterMats[j]![g.i]!,{emissive:lin('hot'),emissiveK:age<0?0:Math.exp(-age/.28)});}
      const age=t-W.stoneWords(l)[j]!.start;setEngrave(w.solidMats[j]!,{emissive:lin('hot'),emissiveK:age<0?0:Math.exp(-age/.28)});
    });
    const p=W.clawdAt(t,a,l,w.T),crack=l.get('crack my claws').words[2]!,pose=Clawd.pose('A5',{beat:f.beat,beat0:a.beatAt(w.T.start),p:0,travel:0});
    if(t>=crack.start&&t<crack.start+.24){const phase=Math.sin((t-crack.start)/.24*Math.PI*2);pose.cells=pose.cells.map(cell=>cell.k==='O'&&(cell.x<2||cell.x>13)?{...cell,y:cell.y+(cell.x<2?-1:1)*Math.round(phase)}:cell);}
    w.clawd.update(pose);w.clawd.mesh.position.set(p.x,p.y,p.z);
    const squish=W.clawdSquish(t,a,l,w.T);w.clawd.mesh.scale.set(W.VOXEL,W.VOXEL*(1-squish),W.VOXEL);
    clearRT(this.ctx.renderer,out,lin('ink'));const r=this.ctx.renderer,shadow=r.shadowMap.enabled;r.shadowMap.enabled=true;r.setRenderTarget(out);r.clearDepth();r.render(w.scene,w.rig.cam);r.shadowMap.enabled=shadow;
    w.layer.clear();const c=w.layer.ctx;
    const machine=(text:string,P:{x:number;y:number;z:number},cap:number,alpha:number)=>{const aff=planeAffine(w.rig,P,{x:1,y:0,z:0},{x:0,y:-1,z:0},cap/.7/100);if(!aff)return;c.save();c.setTransform(aff.a,aff.b,aff.c,aff.d,aff.e,aff.f);c.font=font(F.mono(),100);c.fillStyle=css('paper',alpha);c.fillText(text,0,0);c.restore();};
    const reading=W.reading(t,a,l,w.T);
    W.SOURCE_ROWS.forEach(i=>{const b=W.ledgeBox(i);machine(MONTH_SOURCE[i]!.trimStart(),{x:b.lo.x,y:b.lo.y+.03,z:.357},.16,reading.rows.includes(i)&&i<=reading.row?.6:.45);});
    w.drawers.forEach((_,k)=>{const b=W.drawerBox(k,t,a,w.T);machine(['src','calendar','month.ts'][k]!,{x:b.lo.x+.12,y:b.lo.y+.28,z:b.hi.z+.005},.28,.6);});
    drawLeadText(c,w.rig,t,a,l,w.T);
    if(t>=reading.start){const [A]=W.underline(reading.row),B=W.cursorAt(t,a,l,w.T),pa=w.rig.proj(A.x,A.y,A.z)!,pb=w.rig.proj(B.x,B.y,B.z)!;c.strokeStyle=new THREE.Color(...lin('clay')).multiplyScalar(exitEnvelope(t,w.T.end).gain).getStyle();c.lineWidth=3;c.beginPath();c.moveTo(pa.x,pa.y);c.lineTo(pb.x,pb.y);c.stroke();}
    if(t>=w.T.read&&t<w.T.scroll){const p=w.rig.proj(-5.8,3.8,1)!;c.fillStyle=css('paper',.6);c.font=font(F.mono(),18);c.fillText('month.ts · 48 lines',p.x,p.y);}
    this.ctx.comp.draw(r,w.layer.upload(),out);
    const gain=exitEnvelope(t,w.T.end).gain;
    return {...POSTER_POST,hud:0,frame:0,grain:.02,exposure:1};
  }
}
