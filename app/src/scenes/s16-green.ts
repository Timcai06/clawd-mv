// V6 S16: engraved, lit solids. No state is integrated between rendered frames.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { clamp, ease } from '../engine/util';
import { css, lin } from '../theme';
import { engraveMaterial, setEngrave } from '../kit/engrave-mat';
import { SolidText } from '../kit/solidtype';
import { WordPlane } from '../kit/wordplane';
import { Rig, p3 } from '../kit/rig';
import { Voice } from '../kit/lyric-moves';
import { drawCarry, carryLayout } from '../kit/carry';
import { exitEnvelope } from '../kit/handoff';
import { layoutPath, path3, drawPathText, letterTimes } from '../kit/pathtext';
import { postFor } from '../kit/ground';
import { greenTimes, greenHit, GREEN_WIDTHS, type GreenTimes } from './parts/s16-green-state';
import { D, KEY_LIGHT, S16_GLSL, yawAt, arcAt, tiltAt, cameraAt, cursorWorldAt } from './parts/s16-world';
import { resolveFTimes } from './parts/s15-f-timing';
import { freeCarrySpec } from './parts/s15-layout';
import { dominoAtlas, dominoGeometry } from './parts/s16-print';
export { cursorAt, cameraAt } from './parts/s16-world';
export const TYPE_LEVELS = { giant: 320, lyric: 70, label:20 };

function deform(m:THREE.Material,i:number,theta:{value:number}) {
  const prior=m.onBeforeCompile.bind(m);
  m.onBeforeCompile=(s,r)=>{
    prior(s,r);s.uniforms.dominoI={value:i};s.uniforms.dominoTheta=theta;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\n'+S16_GLSL+'\nuniform float dominoI, dominoTheta;');
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','vec3 transformed=dominoPoint(dominoI,position,dominoTheta);');
    // Normals undergo the same rigid transform, excluding the pivot's translation.
    s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>',`vec3 objectNormal=dominoPoint(dominoI,normal,dominoTheta)-dominoPoint(dominoI,vec3(0.0),dominoTheta);`);
  };
  const key=m.customProgramCacheKey.bind(m);m.customProgramCacheKey=()=>key()+'-s16-pose-v1';
}
class World {
  users=0;T:GreenTimes;voice:Voice;scene=new THREE.Scene();rig=new Rig();layer=new Layer2D();
  atlas=dominoAtlas();materials:THREE.MeshLambertMaterial[]=[];geo:THREE.BufferGeometry[]=[];
  theta=Array.from({length:19},()=>({value:0}));dominoes:THREE.Mesh[]=[];poses:THREE.Group[]=[];
  words:{word:GreenTimes['nineteen'];plane:WordPlane;board:number;cap:number;width:number}[]=[];
  green:SolidText[]=[];greenLetters=Array.from({length:5},()=>engraveMaterial({ink:lin('ink'),paper:lin('ink'),pitch:5,emissive:lin('hot'),emissiveK:0}));greenMat=engraveMaterial({ink:lin('ink'),paper:lin('ink'),pitch:5,minCov:0.02});
  floorMat=engraveMaterial({ink:lin('ink'),paper:lin('paper'),pitch:5});
  cursorMat=engraveMaterial({ink:lin('ink'),paper:lin('clay'),pitch:5});cursor:THREE.Mesh;
  free:SolidText;freeAnchor=new THREE.Group();freePivot=new THREE.Group();freeBearing=0;carry:ReturnType<typeof freeCarrySpec>;
  groundWords:ReturnType<typeof layoutPath>;groundPath:ReturnType<typeof path3>;
  depth:THREE.MeshDepthMaterial[]=[];
  constructor(ctx:SceneCtx){
    this.T=greenTimes(ctx.audio,ctx.lyrics);this.voice=new Voice(ctx.lyrics,ctx.audio);
    this.carry=freeCarrySpec(this.voice,resolveFTimes(ctx));
    const floorGeo=new THREE.PlaneGeometry(400,400);floorGeo.rotateX(-Math.PI/2);this.geo.push(floorGeo);
    const floor=new THREE.Mesh(floorGeo,this.floorMat);floor.receiveShadow=true;this.scene.add(floor);
    const light=new THREE.DirectionalLight(0xffffff,2.1);light.position.set(KEY_LIGHT.x*30,KEY_LIGHT.y*30,KEY_LIGHT.z*30-3);
    light.target.position.set(0,0,-3);light.castShadow=true;light.shadow.mapSize.set(2048,2048);
    Object.assign(light.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:0.1,far:100});light.shadow.bias=-0.0002;light.shadow.normalBias=0.015;
    this.scene.add(light,light.target,new THREE.AmbientLight(0xffffff,0.2));
    for(let i=0;i<19;i++){
      const mat=engraveMaterial({ink:lin('ink'),paper:lin('paper'),paperMap:true,pitch:5});mat.map=this.atlas;deform(mat,i,this.theta[i]!);this.materials.push(mat);
      const g=dominoGeometry(i);this.geo.push(g);const mesh=new THREE.Mesh(g,mat);mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;
      const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});deform(depth,i,this.theta[i]!);mesh.customDepthMaterial=depth;this.depth.push(depth);
      this.dominoes.push(mesh);this.scene.add(mesh);
      const group=new THREE.Group(),a=arcAt(i),yaw=yawAt(i);
      group.position.set(a.x+Math.sin(yaw)*D.d/2,0,a.z+Math.cos(yaw)*D.d/2);group.rotation.order='YXZ';group.rotation.y=yaw;
      this.scene.add(group);this.poses.push(group);
    }
    for(const [board,word] of [[0,this.T.count[0]!],[1,this.T.count[4]!],[2,this.T.count[6]!],[18,this.T.nineteen]] as const){
      // Nineteen fits along the long dimension of its narrow board. The glyph cap uses 90% of width.
      const cap=board===18?D.w*0.9:0.55,axes=this.voice.form(word,word.end).axes;
      const plane=new WordPlane(word.w,{capH:cap,axes,ax:0.5,ay:0.5,engrave:true,texCap:180});
      plane.mesh.position.set(0,D.h*0.5,-D.d-0.003);plane.mesh.rotation.y=Math.PI;
      const width=board===18?1.9:0.61, sx=Math.min(1,width/plane.w);plane.mesh.scale.set(sx,1,1);
      if(board===18){plane.mesh.rotation.z=Math.PI/2;plane.mesh.scale.set(Math.min(1,1.89/plane.w),1,1);}
      this.poses[board]!.add(plane.mesh);this.words.push({word,plane,board,cap,width});
    }
    for(const wdth of GREEN_WIDTHS){const text=new SolidText('GREEN',{capH:3.2,depth:0.6,axes:{wdth,wght:900},material:this.greenMat});text.letters.forEach((g,j)=>{g.mesh.material=this.greenLetters[j]!;});text.group.scale.x=6;text.group.position.set(-text.width*3,0,-19);this.scene.add(text.group);this.green.push(text);}
    const cursorGeo=new THREE.BoxGeometry(0.12,0.36,0.12);this.geo.push(cursorGeo);this.cursor=new THREE.Mesh(cursorGeo,this.cursorMat);this.cursor.castShadow=true;this.scene.add(this.cursor);
    const freeMat=engraveMaterial({ink:lin('ink'),paper:lin('clay'),pitch:5});this.materials.push(freeMat);
    this.free=new SolidText('free',{capH:0.9,depth:0.05,axes:this.carry.axes,material:freeMat,bevel:0});
    this.freePivot.add(this.free.group);this.freeAnchor.add(this.freePivot);this.scene.add(this.freeAnchor);
    // The carry starts on a plane normal to the opening camera, with the exact same ink box.
    this.rig.set(cameraAt(this.T.free.end-0.1,this.T));const cam=this.rig.cam;
    const at=new THREE.Vector3((this.carry.x/1920)*2-1,1-(this.carry.y/1080)*2,0).unproject(cam);
    const z=new THREE.Vector3().subVectors(at,cam.position).dot(cam.getWorldDirection(new THREE.Vector3()));
    const px=1080/(2*Math.tan(cam.fov*Math.PI/360)*z),scale=90/(this.free.capH*px);
    this.freeAnchor.position.copy(at);this.freeAnchor.quaternion.copy(cam.quaternion);this.freeAnchor.scale.setScalar(scale);
    // Match the lowercase ink's left bearing, not its advance box.
    this.freeBearing=-this.free.letters[0]!.mesh.geometry.boundingBox!.min.x;
    this.freePivot.position.x=this.free.width+this.freeBearing;this.free.group.position.x=-this.free.width;
    this.groundWords=layoutPath(this.T.count.filter((_,i)=>[1,2,3,5].includes(i)),{capH:0.7,axes:w=>this.voice.form(w,w.end).axes,s0:0,upper:true});
    this.groundPath=path3([p3(-9,0.015,1.5),p3(12,0.015,1.5)]);
  }
  dispose(){for(const w of this.words)w.plane.dispose();for(const t of this.green)t.dispose();this.free.dispose();for(const g of this.geo)g.dispose();for(const m of [...this.materials,...this.depth,...this.greenLetters,this.greenMat,this.floorMat,this.cursorMat])m.dispose();this.atlas.dispose();this.layer.texture.dispose();}
}
const worlds=new WeakMap<THREE.WebGLRenderer,World>();
export default class S16Green extends Scene {
  private w!:World;
  override init(){this.w=worlds.get(this.ctx.renderer)??new World(this.ctx);worlds.set(this.ctx.renderer,this.w);this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();worlds.delete(this.ctx.renderer);}}
  override render(f:Frame,out:THREE.WebGLRenderTarget){
    const w=this.w,T=w.T,t=f.t,r=this.ctx.renderer;w.rig.set(cameraAt(t,T));
    const flash=t>=T.greens[5]!.start&&t<T.greens[5]!.start+0.2?0.4:0;
    for(let i=0;i<19;i++){const theta=tiltAt(i,t,T);w.theta[i]!.value=theta;w.poses[i]!.rotation.x=theta;setEngrave(w.materials[i]!,{emissive:lin('pass'),emissiveK:flash});}
    for(const a of w.words){const form=w.voice.form(a.word,t),end=w.voice.form(a.word,a.word.end),sx=Math.min(1,(a.board===18?1.89:0.61)/a.plane.w);
      a.plane.mesh.visible=t>=a.word.start;a.plane.mesh.scale.x=sx*form.axes.wdth/end.axes.wdth;
      a.plane.set({prog:a.plane.karaoke(a.word,t),aDim:0,cSung:lin('ink'),cDone:lin('ink'),done:t>=a.word.end?1:0,heat:t>=a.word.start?Math.exp(-(t-a.word.start)/0.28):0,tone:0.7});
    }
    const hit=greenHit(t,T);w.green.forEach((g,i)=>{g.group.visible=hit?.i===i;if(hit?.i===i){g.group.position.y=1.5*(1-ease.inQuad(clamp((t-hit.word.start)/0.12)));const times=letterTimes({...hit.word,w:'GREEN'});g.letters.forEach((_,j)=>{g.setLetter(j,{visible:t>=times[j]!.t0});setEngrave(w.greenLetters[j]!,{emissiveK:t>=times[j]!.t0?Math.exp(-(t-times[j]!.t0)/0.28):0});});}});
    const cursor=cursorWorldAt(t,T);w.cursor.position.set(cursor.x,cursor.y,cursor.z);
    setEngrave(w.cursorMat,{emissive:lin('clay'),emissiveK:exitEnvelope(t,T.end).gain-1});
    // Retain the complete carry through its vocal tail, then let the physical word fall out with the world.
    const begin=T.free.end-0.1,k=ease.inQuad(clamp((t-begin)/0.24));w.freeAnchor.visible=t>=begin&&t<begin+0.24+0.12;
    // Rightward topple about the right baseline; timing/direction conflict is documented in final report.
    w.freePivot.rotation.z=-Math.PI/2*k;w.freePivot.position.y=-2*Math.max(0,(t-begin-0.24)/0.12);
    const oldShadow=r.shadowMap.enabled,oldType=r.shadowMap.type;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFShadowMap;
    r.setRenderTarget(out);r.setClearColor(new THREE.Color().setRGB(...lin('paper')),1);r.clear(true,true,true);
    try{r.render(w.scene,w.rig.cam);}finally{r.shadowMap.enabled=oldShadow;r.shadowMap.type=oldType;}
    w.layer.clear();const c=w.layer.ctx;
    if(t<begin)drawCarry(c,w.carry,carryLayout(w.carry));
    drawPathText(c,w.rig,w.groundPath,w.groundWords,t,{mode:'stand',base:'ink',on:'paper',axes:(g,t)=>w.voice.form(g.word,t).axes,minPx:50,maxPx:110});
    if(t>=T.nineteen.end){c.font=font(F.mono(500),20);c.fillStyle=css('ink');c.fillText('19 / 19 passed',96,1000);}
    this.ctx.comp.draw(r,w.layer.upload(),out);
    const hitAge=hit?t-hit.word.start-0.12:-1,shake=hitAge>=0?6*Math.exp(-hitAge/0.06)*Math.sin(hitAge*100):0;
    return {...postFor('paper'),hud:0,frame:0,vignette:0,grain:0.035,shake:[0,exitEnvelope(t,T.end).still?0:shake] as [number,number]};
  }
}
