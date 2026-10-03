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
import { Voice } from '../kit/lyric-moves';
import { drawCarry, carryLayout } from '../kit/carry';
import { exitEnvelope } from '../kit/handoff';
import { drawPathText, letterTimes } from '../kit/pathtext';
import { postFor } from '../kit/ground';
import { greenTimes, greenHit, GREEN_WIDTHS, type GreenTimes } from './parts/s16-green-state';
import { D, KEY_LIGHT, S16_GLSL, yawAt, arcAt, tiltAt, cameraAt, cursorWorldAt, LIGHT_INTENSITY, AMBIENT_TONE, groundLyrics, freeBody, freeTiltAt, checkScaleAt, shakeAt, GreenRig, nineteenFrame } from './parts/s16-world';
import { resolveFTimes } from './parts/s15-f-timing';
import { freeCarrySpec } from './parts/s15-layout';
import { dominoAtlas, dominoGeometry, markUV } from './parts/s16-print';
export { cursorAt, cameraAt } from './parts/s16-world';
export const TYPE_LEVELS = { giant: 320, lyric: 70, label:20 };

function deform(m:THREE.Material,i:number,theta:{value:number},check?:{value:number}) {
  const prior=m.onBeforeCompile.bind(m);
  m.onBeforeCompile=(s,r)=>{
    prior(s,r);
    s.fragmentShader=s.fragmentShader.replace('engraveSat(engraveL)','clamp(engraveL,0.0,0.90)');
    if(check){
      s.uniforms.checkScale=check;const center=markUV(i);
      s.fragmentShader=s.fragmentShader.replace('#include <common>','#include <common>\nuniform float checkScale;');
      const uv=`vec2(${center.x},${center.y})`;
      const map=THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )',`texture2D(map, stampUV)`);
      s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>',`vec2 stampUV=vMapUv;vec2 delta=vMapUv-${uv};
        if(abs(delta.x)<${0.35/D.w*256/3072} && abs(delta.y)<${0.35/D.h*768/3840})stampUV=${uv}+delta/checkScale;
        ${map}`);
    }
    s.uniforms.dominoI={value:i};s.uniforms.dominoTheta=theta;
    s.vertexShader=s.vertexShader.replace('#include <common>','#include <common>\n'+S16_GLSL+'\nuniform float dominoI, dominoTheta;');
    s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','vec3 transformed=dominoPoint(dominoI,position,dominoTheta);');
    // Normals undergo the same rigid transform, excluding the pivot's translation.
    s.vertexShader=s.vertexShader.replace('#include <beginnormal_vertex>',`vec3 objectNormal=dominoPoint(dominoI,normal,dominoTheta)-dominoPoint(dominoI,vec3(0.0),dominoTheta);`);
  };
  const key=m.customProgramCacheKey.bind(m);m.customProgramCacheKey=()=>key()+'-s16-pose-v2'+(check?'-check':'');
}
/** Ink solids retain ink as the body; etched paper strokes carry at most 18% contrast. */
function inkSolidMaterial(){
  const material=engraveMaterial({ink:lin('paper'),paper:lin('ink'),lightLines:false,pitch:5,emissive:lin('hot'),emissiveK:0});
  const prior=material.onBeforeCompile.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{prior(shader,renderer);shader.fragmentShader=shader.fragmentShader.replace('engraveI,engraveCov)','engraveI,engraveCov*0.18)');};
  material.customProgramCacheKey=()=> 's16-ink-etch-v1';return material;
}
/** GREEN remains an opaque ink body through every word onset and width swap. */
export function greenMaterial(){
  const material=engraveMaterial({ink:lin('paper'),paper:lin('ink'),lightLines:true,maxCov:0.3,pitch:5,emissiveK:0});
  const prior=material.onBeforeCompile.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
    prior(shader,renderer);
    // The shared maxCov clamps the *sampled mask opacity*. For this ink solid,
    // bound the physical line width instead: opaque paper strokes on opaque ink.
    shader.fragmentShader=shader.fragmentShader.replace(
      'min(engraveMaxCov, engraveTone(engraveU,engraveLL ? 1.0-engraveT : engraveT))',
      'engraveHatch(engraveU,engraveMaxCov*pow(min(engraveT,0.90),3.0))');
  };
  material.customProgramCacheKey=()=> 's16-green-fine-light-lines-v3';return material;
}
class World {
  users=0;T:GreenTimes;checkScale={value:1};edges:THREE.MeshLambertMaterial[]=[];voice:Voice;scene=new THREE.Scene();rig=new GreenRig();layer=new Layer2D();
  atlas=dominoAtlas();materials:THREE.MeshLambertMaterial[]=[];geo:THREE.BufferGeometry[]=[];
  theta=Array.from({length:19},()=>({value:0}));dominoes:THREE.Mesh[]=[];poses:THREE.Group[]=[];
  words:{word:GreenTimes['nineteen'];plane:WordPlane;board:number;cap:number;width:number}[]=[];
  green:SolidText[]=[];greenLetters=Array.from({length:5},()=>greenMaterial());greenMat=greenMaterial();
  floorMat=engraveMaterial({ink:lin('ink'),paper:lin('paper'),pitch:5});
  cursorMat=engraveMaterial({ink:lin('ink'),paper:lin('clay'),pitch:5});cursor:THREE.Mesh;
  free:SolidText;freeAnchor=new THREE.Group();freePivot=new THREE.Group();freeData:ReturnType<typeof freeBody>;carry:ReturnType<typeof freeCarrySpec>;
  ground:ReturnType<typeof groundLyrics>;
  depth:THREE.MeshDepthMaterial[]=[];
  constructor(ctx:SceneCtx){
    this.T=greenTimes(ctx.audio,ctx.lyrics);this.voice=new Voice(ctx.lyrics,ctx.audio);
    this.carry=freeCarrySpec(this.voice,resolveFTimes(ctx));
    const floorGeo=new THREE.PlaneGeometry(400,400);floorGeo.rotateX(-Math.PI/2);this.geo.push(floorGeo);
    const floor=new THREE.Mesh(floorGeo,this.floorMat);floor.receiveShadow=true;this.scene.add(floor);
    const light=new THREE.DirectionalLight(0xffffff,LIGHT_INTENSITY);light.position.set(KEY_LIGHT.x*30,KEY_LIGHT.y*30,KEY_LIGHT.z*30-3);
    light.target.position.set(0,0,-3);light.castShadow=true;light.shadow.mapSize.set(2048,2048);
    Object.assign(light.shadow.camera,{left:-24,right:24,top:24,bottom:-24,near:0.1,far:100});light.shadow.bias=-0.0002;light.shadow.normalBias=0.015;
    this.scene.add(light,light.target,new THREE.AmbientLight(0xffffff,Math.PI*AMBIENT_TONE));
    for(let i=0;i<19;i++){
      const mat=engraveMaterial({ink:lin('ink'),paper:lin('paper'),paperMap:true,pitch:5});mat.map=this.atlas;deform(mat,i,this.theta[i]!,i===18?this.checkScale:undefined);this.materials.push(mat);
      const edge=inkSolidMaterial();edge.map=this.atlas;setEngrave(edge,{paperMap:true});deform(edge,i,this.theta[i]!);this.edges.push(edge);
      const g=dominoGeometry(i);this.geo.push(g);g.groups.forEach((group,j)=>group.materialIndex=j<4?1:0);const mesh=new THREE.Mesh(g,[mat,edge]);mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;
      const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking});deform(depth,i,this.theta[i]!);mesh.customDepthMaterial=depth;this.depth.push(depth);
      this.dominoes.push(mesh);this.scene.add(mesh);
      const group=new THREE.Group(),a=arcAt(i),yaw=yawAt(i);
      group.position.set(a.x+Math.sin(yaw)*D.d/2,0,a.z+Math.cos(yaw)*D.d/2);group.rotation.order='YXZ';group.rotation.y=yaw;
      this.scene.add(group);this.poses.push(group);
    }
    for(const [board,word] of [[0,this.T.count[0]!],[1,this.T.count[4]!],[2,this.T.count[6]!],[18,this.T.nineteen]] as const){
      // The final print uses the narrow face's width and a fixed face-local readable basis.
      const cap=board===18?D.w*0.9:0.7,axes=this.voice.form(word,word.end).axes;
      const plane=new WordPlane(word.w,{capH:cap,axes,ax:0.5,ay:0.5,engrave:true,texCap:180});
      plane.mesh.position.set(0,D.h*0.5,-D.d-0.003);plane.mesh.rotation.y=Math.PI;
      const width=board===18?nineteenFrame().width:0.61, sx=Math.min(1,width/plane.w);plane.mesh.scale.set(sx,board===18?sx:1,1);
      if(board===18){const {origin,u,v}=nineteenFrame();plane.mesh.position.set(origin.x,origin.y,origin.z-D.d/2);
        plane.mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(u.x,u.y,u.z),new THREE.Vector3(v.x,v.y,v.z),new THREE.Vector3(0,0,-1)));}
      this.poses[board]!.add(plane.mesh);this.words.push({word,plane,board,cap,width});
    }
    for(const wdth of GREEN_WIDTHS.slice(0,5)){const text=new SolidText('GREEN',{capH:3.2,depth:0.6,axes:{wdth,wght:900},material:this.greenMat});text.letters.forEach((g,j)=>{g.mesh.material=this.greenLetters[j]!;});text.group.position.set(-text.width/2,0,-19);this.scene.add(text.group);this.green.push(text);}
    const cursorGeo=new THREE.BoxGeometry(0.12,0.36,0.12);this.geo.push(cursorGeo);this.cursor=new THREE.Mesh(cursorGeo,this.cursorMat);this.cursor.castShadow=true;this.scene.add(this.cursor);
    const freeMat=engraveMaterial({ink:lin('ink'),paper:lin('clay'),pitch:5});this.materials.push(freeMat);
    this.freeData=freeBody(this.carry,this.T);this.free=this.freeData.solid;
    this.free.letters.forEach(g=>g.mesh.material=freeMat);
    this.free.group.position.x=-this.freeData.right;
    this.freePivot.add(this.free.group);this.freeAnchor.add(this.freePivot);this.scene.add(this.freeAnchor);
    const pivot=this.freeData.pivot,a=arcAt(0),yaw=yawAt(0);
    this.freeAnchor.position.set(a.x+Math.cos(yaw)*pivot.x+Math.sin(yaw)*pivot.z,0,a.z-Math.sin(yaw)*pivot.x+Math.cos(yaw)*pivot.z);
    this.freeAnchor.rotation.y=yaw;
    this.ground=groundLyrics(this.T,this.voice);
    // Solve before playback; no numerical camera search runs on a vocal impact frame.
    cameraAt(this.T.greens[0]!.start,this.T);
  }
  dispose(){for(const w of this.words)w.plane.dispose();for(const t of this.green)t.dispose();this.free.dispose();for(const g of this.geo)g.dispose();for(const m of [...this.materials,...this.edges,...this.depth,...this.greenLetters,this.greenMat,this.floorMat,this.cursorMat])m.dispose();this.atlas.dispose();this.layer.texture.dispose();}
}
const worlds=new WeakMap<THREE.WebGLRenderer,World>();
export default class S16Green extends Scene {
  private w!:World;
  override init(){this.w=worlds.get(this.ctx.renderer)??new World(this.ctx);worlds.set(this.ctx.renderer,this.w);this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();worlds.delete(this.ctx.renderer);}}
  override render(f:Frame,out:THREE.WebGLRenderTarget){
    const w=this.w,T=w.T,t=f.t,r=this.ctx.renderer;w.rig.set(cameraAt(t,T));
    w.checkScale.value=checkScaleAt(t,T);
    const flash=t>=T.greens[5]!.start&&t<T.greens[5]!.start+0.2?0.4:0;
    for(let i=0;i<19;i++){const theta=tiltAt(i,t,T);w.theta[i]!.value=theta;w.poses[i]!.rotation.x=theta;setEngrave(w.materials[i]!,{emissive:lin('pass'),emissiveK:flash});}
    for(const a of w.words){const form=w.voice.form(a.word,t),end=w.voice.form(a.word,a.word.end),sx=Math.min(1,a.width/a.plane.w);
      a.plane.mesh.visible=t>=a.word.start;a.plane.mesh.scale.x=sx*form.axes.wdth/end.axes.wdth;
      a.plane.set({prog:a.plane.karaoke(a.word,t),aDim:0,cSung:lin('ink'),cDone:lin('ink'),done:t>=a.word.end?1:0,heat:t>=a.word.start?Math.exp(-(t-a.word.start)/0.28):0,tone:0.7});
    }
    const hit=greenHit(t,T);w.green.forEach((g,i)=>{g.group.visible=hit!==null&&Math.min(4,hit.i)===i;if(hit&&Math.min(4,hit.i)===i){g.group.position.y=1.5*(1-ease.inQuad(clamp((t-T.greens[i]!.start)/0.12)));const word=T.greens[i]!;const times=letterTimes({...word,w:'GREEN'});g.letters.forEach((_,j)=>g.setLetter(j,{visible:t>=times[j]!.t0}));}});
    const cursor=cursorWorldAt(t,T);w.cursor.position.set(cursor.x,cursor.y,cursor.z);
    setEngrave(w.cursorMat,{emissive:lin('clay'),emissiveK:exitEnvelope(t,T.end).gain-1});
    const begin=T.triggers[0]!-0.24;
    w.freeAnchor.visible=t>=begin;
    w.freePivot.rotation.z=t<=T.start?0:-freeTiltAt(t,T,w.freeData.angle);
    // After contact it continues to the ground and is covered by the receiving floor.
    w.freePivot.position.y=-2*clamp((t-T.triggers[0]!-0.24)/0.12);
    const oldShadow=r.shadowMap.enabled,oldType=r.shadowMap.type;r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFShadowMap;
    r.setRenderTarget(out);r.setClearColor(new THREE.Color().setRGB(...lin('paper')),1);r.clear(true,true,true);
    try{r.render(w.scene,w.rig.cam);}finally{r.shadowMap.enabled=oldShadow;r.shadowMap.type=oldType;}
    w.layer.clear();const c=w.layer.ctx;
    if(t<begin)drawCarry(c,w.carry,carryLayout(w.carry));
    for(const ground of w.ground)drawPathText(c,w.rig,ground.path,ground.layout,t,{mode:'stand',base:'ink',on:'paper',axes:(g,t)=>w.voice.form(g.word,t).axes,minPx:50,maxPx:110});
    if(t>=T.nineteen.end){c.font=font(F.mono(500),20);c.fillStyle=css('ink');c.fillText('19 / 19 passed',96,1000);}
    this.ctx.comp.draw(r,w.layer.upload(),out);
    return {...postFor('paper'),hud:0,frame:0,vignette:0,grain:0.035,shake:[0,shakeAt(t,T)] as [number,number]};
  }
}
