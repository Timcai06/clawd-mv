// S08 V6: a deterministic, debossed letterpress; twelve editorial cameras share one world.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D, clearRT, makeRT } from '../engine/gl';
import { css, lin } from '../theme';
import { heatColor } from '../kit/lyric-moves';
import { VoxelClawd } from '../kit/clawd3d';
import { engraveMaterial, setEngrave } from '../kit/engrave-mat';
import { SolidText } from '../kit/solidtype';
import { drawCarry } from '../kit/carry';
import { drawPathText, layoutPath, path3, runInkBounds } from '../kit/pathtext';
import { Rig, p3 } from '../kit/rig';
import { afterBeats, span } from '../kit/time';
import { varRun } from '../kit/vartype';
import { F, font } from '../engine/type';
import { PressAtlas } from './parts/s08-print';
import {
  ATLAS, KEY_TOP, LIGHT, PAGE, S08_GLSL, cameraAt, clawdAt, cursorAt, exitState, hashAffine, impactHits, impactPost,
  machineAffines, machineSpec, machineVisible, onPaper, pressAt, printingWorld, screenTilt, type PrintWorld,
} from './parts/s08-world';
import { paperTravel, type PressEvent } from './parts/s08-layout';
export { cursorAt } from './parts/s08-world';
export const TYPE_LEVELS = { giant:550,lyric:80,label:18 };

function paperMaterial(atlas: PressAtlas, hits: THREE.IUniform<THREE.Vector4[]>) {
  const mat=engraveMaterial({ ink:lin('ink'),paper:lin('paper'),paperMap:true,angle:0.6,pitch:5,faceAngles:false });
  mat.map=atlas.printTexture;
  const baseCompile=mat.onBeforeCompile;
  mat.onBeforeCompile=(shader,renderer) => {
    baseCompile.call(mat,shader,renderer);
    Object.assign(shader.uniforms,{ deboss:{ value:atlas.depthTexture },hits });
    const head=`uniform sampler2D deboss; uniform vec4 hits[8];\n${S08_GLSL}
      float pageHeight(vec2 q) {
        vec2 p=(q-0.5)*vec2(PAGE_W,-PAGE_H);
        return heightAt(p,texture2D(deboss,q).r,hits);
      }`;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+head)
      .replace('#include <beginnormal_vertex>',`#include <beginnormal_vertex>
        vec2 du=vec2(1.0/${ATLAS.w}.0,0.0),dv=vec2(0.0,1.0/${ATLAS.h}.0);
        float hx=(pageHeight(uv+du)-pageHeight(uv-du))/(2.0*PAGE_W/${ATLAS.w}.0);
        float hy=(pageHeight(uv+dv)-pageHeight(uv-dv))/(2.0*PAGE_H/${ATLAS.h}.0);
        objectNormal=normalize(vec3(-hx,-hy,1.0));`)
      .replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.z+=pageHeight(uv);');
    // Local map-dependent line colour. The public material has one ink colour per material.
    shader.fragmentShader=shader.fragmentShader
      .replace('bool engraveLL =','bool clayArea = distance(engraveBase,vec3('+lin('clay').join(',')+')) < 0.025;\nbool engraveLL = clayArea ||')
      .replace('engraveI = engraveInk;','engraveI = clayArea ? engravePaper : engraveInk;');
  };
  mat.customProgramCacheKey=() => 's08-letterpress-paper-v6';
  return mat;
}

class PrintingPress {
  users=0;
  model: PrintWorld;
  atlas: PressAtlas;
  scene=new THREE.Scene();
  rig=new Rig();
  layer=new Layer2D();
  content=new Layer2D();
  rt=makeRT();
  sheet=new THREE.Group();
  paper: THREE.Mesh<THREE.PlaneGeometry,THREE.MeshLambertMaterial>;
  hits={ value:Array.from({ length:8 },() => new THREE.Vector4()) };
  clawd=new VoxelClawd();
  machineBody: SolidText;
  solids: { event:PressEvent; text:SolidText; mat:THREE.MeshLambertMaterial }[]=[];
  boxes: THREE.Mesh[]=[];
  screenFrame=new THREE.Group();
  materials: THREE.Material[]=[];
  key=new THREE.DirectionalLight(0xffffff,1.8);
  hashes: { layout:ReturnType<typeof layoutPath>; at:number }[]=[];
  tableWords: ReturnType<typeof layoutPath>;
  crt=new FSPass(`
    uniform sampler2D image; uniform float flatK,extension,gain;
    void main() {
      vec2 p=vUv-0.5;
      if(flatK <= 0.0001) {
        float line=1.0-smoothstep(0.5,1.5,abs(FRAG_PX.y-540.0));
        float width=mix(0.36,1.0,extension);
        line*=step(abs(p.x),width*0.5);
        fragColor=vec4(mix(C_INK,C_BONE*gain,line),1.0); return;
      }
      vec2 q=vec2(p.x,p.y/max(flatK,0.0001))+0.5;
      fragColor=vec4(0.0);
      if(q.y>=0.0 && q.y<=1.0) fragColor=texture(image,q);
    }`,{ image:{ value:this.rt.texture },flatK:{ value:1 },extension:{ value:0 },gain:{ value:1 } });

  constructor(ctx: SceneCtx) {
    this.model=printingWorld(ctx.audio,ctx.lyrics); const m=this.model;
    this.crt.mat.transparent=true; this.crt.mat.blending=THREE.NormalBlending;
    this.atlas=new PressAtlas(m);
    const mat=paperMaterial(this.atlas,this.hits); this.materials.push(mat);
    this.paper=new THREE.Mesh(new THREE.PlaneGeometry(PAGE.w,PAGE.h,768,432),mat);
    this.paper.rotation.x=-Math.PI/2; this.paper.receiveShadow=true;
    this.sheet.add(this.paper); this.scene.add(this.sheet);
    this.scene.add(new THREE.AmbientLight(0xffffff,0.1));
    this.key.position.set(LIGHT[0]*80,LIGHT[1]*80,LIGHT[2]*80);
    this.key.castShadow=true; this.key.shadow.mapSize.set(2048,2048);
    Object.assign(this.key.shadow.camera,{ left:-70,right:70,top:70,bottom:-70,near:0.1,far:200 });
    this.key.shadow.bias=-0.00015; this.key.shadow.normalBias=0.015;
    this.key.shadow.camera.updateProjectionMatrix(); this.scene.add(this.key,this.key.target);
    for (const event of m.events) if (event.kind !== 'tap') {
      const mat=engraveMaterial({ ink:lin('paper'),paper:lin(event.kind === 'commit' ? 'clay' : event.ink),lightLines:true,angle:0.6,pitch:5,faceAngles:false });
      const text=new SolidText(event.text,{ capH:event.capH,axes:event.axes,depth:0.5*event.capH,bevel:0,material:mat,curveSegments:4 });
      text.group.rotation.set(-Math.PI/2,0,0);
      this.scene.add(text.group); this.solids.push({ event,text,mat }); this.materials.push(mat);
    }
    const box=(w:number,h:number,d:number,x:number,y:number,z:number,color:'paper'|'ink',parent=this.scene as THREE.Object3D) => {
      const mat=engraveMaterial({ ink:lin(color === 'ink' ? 'paper' : 'ink'),paper:lin(color),lightLines:color === 'ink',pitch:5,angle:0.6 });
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
      mesh.position.set(x,y,z); mesh.castShadow=mesh.receiveShadow=true; parent.add(mesh); this.boxes.push(mesh); this.materials.push(mat); return mesh;
    };
    this.scene.add(this.screenFrame);
    // Screen opening: all four bezel strips are in the same hinged sheet coordinates.
    box(50,1.1,0.6,0,0,-13.9,'ink',this.screenFrame);
    box(50,1.1,0.6,0,0,13.9,'ink',this.screenFrame);
    box(1.0,1.1,27,-24.5,0,0,'ink',this.screenFrame);
    box(1.0,1.1,27,24.5,0,0,'ink',this.screenFrame);
    box(50,1.6,30,0,-0.8,28.5,'paper');
    // Keycaps are geometric, including shadows; no text labels add a fourth size tier.
    for (let row=0;row<4;row++) for (let col=0;col<13;col++) box(2.5,0.45,2.1,-18+col*3,KEY_TOP-0.225,18+row*3,'ink');
    box(12,0.2,6,0,0.08,37,'ink'); box(220,1,180,0,-2.1,15,'ink');
    this.clawd.mesh.scale.setScalar(0.5); this.clawd.light([...LIGHT],0.1,0);
    this.clawd.mesh.castShadow=true; this.scene.add(this.clawd.mesh);
    const machineMaterial=engraveMaterial({ ink:lin('ink'),paper:lin('paper'),pitch:5,angle:0.6 });
    this.materials.push(machineMaterial);
    this.machineBody=new SolidText('machine',{ capH:2.8,axes:machineSpec(m).axes,depth:1.4,bevel:0,material:machineMaterial });
    this.scene.add(this.machineBody.group);
    const hashWord=m.T.first.words.at(-1)!;
    for (const [i,text] of ['a1f3c9e','5d2b70f'].entries()) {
      const at=afterBeats(m.audio,i ? m.T.mit2 : m.T.mit1,1);
      const word={ ...hashWord,w:text,start:at,end:afterBeats(m.audio,at,0.5) };
      this.hashes.push({ layout:layoutPath([word],{ capH:0.4,axes:{ wdth:100,wght:500 } }),at });
    }
    this.tableWords=layoutPath(m.T.machineLine.words.slice(3,5),{ capH:5,axes:w => m.voice.form(w,w.end).axes });
  }
  update(t: number) {
    const m=this.model, tilt=screenTilt(t,m.T), travel=paperTravel(m.audio,t,m.T);
    this.atlas.update(t); this.rig.set(cameraAt(t,m));
    this.sheet.rotation.x=tilt;
    // Around hinge z=13.5: translation and rotation are CPU paperPoint's exact transform.
    this.sheet.position.set(0,Math.sin(tilt)*(13.5-travel),13.5+Math.cos(tilt)*(travel-13.5));
    this.screenFrame.rotation.x=tilt;
    this.screenFrame.position.set(0,Math.sin(tilt)*13.5,13.5-Math.cos(tilt)*13.5);
    const hits=impactHits(t,m);
    this.hits.value.forEach((h,i) => hits[i] ? h.set(...hits[i]! as [number,number,number,number]) : h.set(0,0,0,1));
    for (const s of this.solids) {
      const e=s.event,p=pressAt(e,t,m),group=s.text.group;
      const pos=onPaper(p3(p.x,p.y,p.z),t,m);
      group.position.set(pos.x,pos.y,pos.z);
      const qSheet=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),tilt);
      const qRot=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),e.rot);
      const qFace=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
      group.quaternion.copy(qSheet).multiply(qRot).multiply(qFace);
      const heldWorks=/^works$/i.test(e.word.w) && e.kind === 'word';
      const axes=m.voice.form(e.word,t).axes, ratio=heldWorks ? axes.wdth/e.axes.wdth : 1;
      group.scale.set(ratio,1,1);
      group.visible=p.visible;
      // Metal approaches ahead of the contact; only the printed impression waits
      // for the event's vocal time. WORKS reveals its held letters while suspended.
      s.text.letters.forEach((g,i) => s.text.setLetter(i,{ d:p3(e.baselineX,e.baselineZ*-1,0),
        visible:heldWorks ? t >= e.times[i]! : p.visible }));
      // Heat is on the physical metal face; no bloom or extra light changes the paper tone.
      s.mat.color.setRGB(1,1,1);
      const heat=new THREE.Color(heatColor(e.kind === 'commit' ? 'clay' : e.ink,'ink',t-e.tp));
      // Per-material palette uniforms are updated without rebuilding shader programs.
      const cold=lin(e.kind === 'commit' ? 'clay' : e.ink);
      const entryFace=e.word === m.T.first.words[0] && t < m.T.start+1/60;
      setFaceColor(s.mat,t >= e.tp && !entryFace ? [heat.r,heat.g,heat.b] : cold);
    }
    const clawd=clawdAt(t,m); this.clawd.update(clawd.pose);
    this.clawd.mesh.visible=clawd.visible;
    this.clawd.mesh.position.set(clawd.point.x,clawd.point.y,clawd.point.z);
    for (const mesh of this.boxes) mesh.visible=t >= m.T.works;
    const overlay=this.content.ctx; this.content.clear(); this.layer.clear();
    const machineOnset=m.T.machineLine.words.at(-1)!.start;
    const carryStart=afterBeats(m.audio,m.T.end,-0.5);
    const machineGroup=this.machineBody.group, machinePosition=onPaper(p3(-8,3,7),t,m);
    const machineRun=varRun('machine',100,machineSpec(m).axes),machineRatio=m.voice.form(m.T.machineLine.words.at(-1)!,t).axes.wdth/machineSpec(m).axes.wdth;
    machineGroup.position.set(machinePosition.x-runInkBounds(machineRun).x0*2.8/machineRun.capH*machineRatio,machinePosition.y,machinePosition.z);
    machineGroup.rotation.set(tilt-Math.PI/2,0,0);
    machineGroup.scale.set(machineRatio,1,1);
    machineGroup.visible=t >= machineOnset && t < carryStart;
    const machineGlyphs=machineVisible(t,m);
    this.machineBody.letters.forEach((_,i) => this.machineBody.setLetter(i,{ visible:machineGlyphs[i] }));
    for (const [i,h] of this.hashes.entries()) {
      if (t < h.at) continue;
      // pathtext currently has no Mono-font parameter. Keep the same paper path,
      // but place Plex outlines with the shared planeAffine and explicit glyph times.
      const aff=hashAffine(t,i,m);
      if (aff) {
        overlay.save(); overlay.setTransform(aff.a,aff.b,aff.c,aff.d,aff.e,aff.f);
        overlay.font=font(F.mono(500),100); overlay.fillStyle=css('ink');
        const text=i ? '5d2b70f' : 'a1f3c9e', end=afterBeats(m.audio,h.at,0.5);
        const count=Math.min(text.length,1+Math.floor(span(t,h.at,end)*text.length));
        overlay.fillText(text.slice(0,count),0,0); overlay.restore();
      }
    }
    if (t >= m.T.machineLine.words[3]!.start && t < m.T.machine) {
      drawPathText(overlay,this.rig,path3([p3(-19,-1.5,47),p3(22,-1.5,47)]),this.tableWords,t,
        { mode:'stand',base:'paper',on:'ink',axes:(g,time) => m.voice.form(g.word,time).axes,pop:0,minPx:70,maxPx:90 });
    }
    if (t >= carryStart) {
      const aff=machineAffines(t,m),visible=machineVisible(t,m);
      drawCarry(this.layer.ctx,machineSpec(m),aff.filter(g => visible[g.i]));
    }
    if (t >= machineOnset && t < machineOnset+2/60) {
      const q=onPaper(p3(23.4,0.03,12.9),t,m),p=this.rig.proj(q.x,q.y,q.z);
      if (p) { overlay.fillStyle=css('fail'); overlay.fillRect(p.x,p.y,Math.max(2,p.s*0.5),Math.max(2,p.s*0.5)); }
    }
    if (t < m.T.machine) {
      const p=cursorAt(t,m); overlay.fillStyle=css('clay'); overlay.fillRect(p.x-3,p.y-3,6,6);
    }
  }
  dispose() {
    this.atlas.dispose(); this.paper.geometry.dispose(); this.solids.forEach(s => s.text.dispose()); this.machineBody.dispose();
    this.boxes.forEach(s => s.geometry.dispose()); this.materials.forEach(m => m.dispose());
    this.clawd.dispose(); this.layer.texture.dispose(); this.content.texture.dispose(); this.rt.dispose(); this.crt.mat.dispose();
    this.key.shadow.map?.dispose();
  }
}
function setFaceColor(mat:THREE.MeshLambertMaterial,paper:readonly [number,number,number]) { setEngrave(mat,{ paper }); }
let world: PrintingPress | undefined;
export default class S08Commit extends Scene {
  private w!: PrintingPress;
  override init() { this.w=world ??= new PrintingPress(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); world=undefined; } }
  override render(f:Frame,out:THREE.WebGLRenderTarget) {
    const w=this.w,t=f.t,r=this.ctx.renderer,m=w.model;
    w.update(t);
    const oldShadow=r.shadowMap.enabled,oldType=r.shadowMap.type;
    r.shadowMap.enabled=true; r.shadowMap.type=THREE.PCFShadowMap;
    try {
      if (t >= m.T.machine) {
        // Only the display content collapses. The bezel, keyboard and floating
        // machine type stay in the physical world until the opaque final line.
        clearRT(r,out,lin('ink')); w.sheet.visible=false;
        r.setRenderTarget(out); r.render(w.scene,w.rig.cam); w.sheet.visible=true;
        const visible=w.scene.children.map(child => child.visible);
        try {
          w.scene.children.forEach(child => { child.visible=child === w.sheet || child instanceof THREE.Light || child === w.key.target; });
          clearRT(r,w.rt,lin('ink'),0); r.setRenderTarget(w.rt); r.render(w.scene,w.rig.cam);
          this.ctx.comp.draw(r,w.content.upload(),w.rt);
        } finally { w.scene.children.forEach((child,i) => { child.visible=visible[i]!; }); }
        const s=exitState(t,m.T); w.crt.u.flatK!.value=s.flat;
        w.crt.u.extension!.value=s.width; w.crt.u.gain!.value=s.gain;
        w.crt.render(r,out);
      } else {
        clearRT(r,out,lin('ink')); r.setRenderTarget(out); r.render(w.scene,w.rig.cam);
        this.ctx.comp.draw(r,w.content.upload(),out);
      }
      this.ctx.comp.draw(r,w.layer.upload(),out);
    } finally { r.shadowMap.enabled=oldShadow; r.shadowMap.type=oldType; }
    return { bloom:0,halation:0,ca:0,grain:0,vignette:0,hud:0,frame:0,exposure:1,...impactPost(t,m) };
  }
}
