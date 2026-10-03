// V6 S02: extruded P/N/G, an emissive cursor-I, a two-light engraved poster.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, SCALE, clearRT } from '../engine/gl';
import { noise1 } from '../engine/util';
import { css, lin, POSTER_POST } from '../theme';
import { SolidText } from '../kit/solidtype';
import { engraveMaterial } from '../kit/engrave-mat';
import { Rig } from '../kit/rig';
import { letterTimes } from '../kit/pathtext';
import { audio, lyrics, T, voice } from './parts/s01-timing';
import { pingLayout, SPLIT_X } from './parts/s02-layout';
import { drawAffine, affineBounds, projectedBox } from './parts/s01-print';
import { S02_GLSL, BEVEL, DEPTH, FRONT, cameraAt, letterPose, lightIntensity, cursorAt, continuationGlyphs,
  continuationAffines, line01Incoming, screenAffines, landingAt, rippleCenters, gain } from './parts/s02-world';
export { cursorAt } from './parts/s02-world';
export const TYPE_LEVELS={giant:625,lyric:50.8,label:20};
import { varRun } from '../kit/vartype';
export function configureSolid(material:THREE.Material){
  const lay=pingLayout(),run=varRun('PING',lay.size,lay.axes);
  const solid=new SolidText('PING',{capH:run.capH/100,axes:lay.axes,depth:DEPTH,bevel:BEVEL,material});
  const sy=625/(625+2*BEVEL*100);
  solid.group.scale.set(lay.scaleX,sy,1);
  solid.group.position.set(lay.x/100-9.6,5.4-lay.y/100+BEVEL*sy,0);
  solid.setLetter(1,{visible:false});return solid;
}
export function pingBounds(t:number){
  const solid=configureSolid(new THREE.MeshBasicMaterial()),rig=new Rig();rig.set(cameraAt(t));
  const points=[0,2,3].flatMap(i=>solid.letterCorners(i));
  const b=pingLayout().letters[1]!;
  points.push(...[b.x,b.x+b.w].flatMap(x=>[b.y,b.y+b.h].map(y=>({x:x/100-9.6,y:5.4-y/100,z:FRONT}))));
  const rect=projectedBox(rig,points);solid.dispose();(solid.letters[0]!.mesh.material as THREE.Material).dispose();return rect;
}
class NotifyWorld {
  users=0;scene=new THREE.Scene();rig=new Rig();layer=new Layer2D();
  material=engraveMaterial({ink:lin('ink'),paper:lin('paper'),splitX:SPLIT_X,angle:0.6,pitch:5,faceAngles:true});
  posterMaterial=engraveMaterial({ink:lin('ink'),paper:lin('paper'),splitX:SPLIT_X,angle:0.6,pitch:5,faceAngles:false});
  poster=new THREE.Mesh(new THREE.PlaneGeometry(80,45),this.posterMaterial);
  solid=configureSolid(this.material);
  cursorMat=new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(...lin('clay')),toneMapped:false});
  cursor=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),this.cursorMat);
  point=new THREE.PointLight(new THREE.Color().setRGB(...lin('paper')),1,60,2);
  key=new THREE.DirectionalLight(new THREE.Color().setRGB(...lin('paper')),0.55);
  rippleUniforms={rippleAge:{value:new THREE.Vector3()},rippleCenters:{value:[0,2,3].map(i=>new THREE.Vector2(rippleCenters()[i]!.x,1080-rippleCenters()[i]!.y))}};
  constructor(){
    // Keep the kit's lighting/shadow conversion; alter only the scene's hatch
    // coordinate to produce the specified 1.5× moving engraving spacing.
    const compile=this.posterMaterial.onBeforeCompile;
    this.posterMaterial.onBeforeCompile=(shader,renderer)=>{
      compile(shader,renderer);Object.assign(shader.uniforms,this.rippleUniforms);
      shader.fragmentShader=shader.fragmentShader.replace('uniform vec3 engraveInk, engravePaper;',
        'uniform vec3 engraveInk, engravePaper;\nuniform vec3 rippleAge;uniform vec2 rippleCenters[3];\n'+S02_GLSL)
        .replace('float engraveU = dot(engravePx,vec2(-sin(engraveA),cos(engraveA)))/engravePitch;',
          `float ripple=1.0;for(int i=0;i<3;i++)ripple=max(ripple,posterRipple(engravePx,rippleCenters[i],rippleAge[i]));
          float engraveU=dot(engravePx,vec2(-sin(engraveA),cos(engraveA)))/(engravePitch*ripple);`);
    };
    this.posterMaterial.customProgramCacheKey=()=>`s02-engrave-ripple-${SCALE}`;
    this.poster.receiveShadow=true;this.scene.add(this.poster,this.solid.group,this.cursor,this.point,this.key,this.key.target);
    this.point.castShadow=this.key.castShadow=true;
    this.point.shadow.mapSize.set(512*SCALE,512*SCALE);this.point.shadow.camera.near=0.05;this.point.shadow.camera.far=60;this.point.shadow.bias=-0.0004;
    this.key.position.set(-12,14,8);this.key.target.position.set(0,0,0);this.key.shadow.mapSize.set(1024*SCALE,1024*SCALE);
    Object.assign(this.key.shadow.camera,{left:-15,right:15,top:12,bottom:-12,near:0.1,far:60});this.key.shadow.bias=-0.0002;
  }
  dispose(){this.poster.geometry.dispose();this.material.dispose();this.posterMaterial.dispose();this.cursor.geometry.dispose();this.cursorMat.dispose();
    this.solid.dispose();this.layer.texture.dispose();this.point.shadow.dispose();this.key.shadow.dispose();}
}
let shared:NotifyWorld|undefined;
export default class S02Notify extends Scene {
  private w!:NotifyWorld;
  override init(){this.w=shared??=new NotifyWorld();this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();shared=undefined;}}
  override render(f:Frame,out:THREE.WebGLRenderTarget){
    const w=this.w,t=f.t,r=this.ctx.renderer;w.rig.set(cameraAt(t));
    for(const i of [0,2,3]){
      const p=letterPose(i,t),letter=w.solid.letters[i]!,box=letter.mesh.geometry.boundingBox!,cy=(box.min.y+box.max.y)/2,cz=(box.min.z+box.max.z)/2;
      // SolidText rotates about the glyph centre. This offset makes its bottom
      // baseline the fixed pivot, as required by the falling-letter exit.
      const dy=cy*(Math.cos(p.rotX)-1)-cz*Math.sin(p.rotX),dz=cy*Math.sin(p.rotX)+cz*(Math.cos(p.rotX)-1);
      w.solid.setLetter(i,{d:{x:0,y:p.dy+dy,z:p.z+dz},rot:{x:p.rotX,y:0,z:0},scale:{x:1,y:1,z:p.scaleZ},visible:p.visible});
      letter.mesh.castShadow=p.castShadow;
    }
    const cur=cursorAt(t),rect=pingLayout().letters[1]!,k=1-cur.h/rect.h,ip=letterPose(1,t);
    const pxPerUnit=540/Math.tan(34*Math.PI/360)/(w.rig.cam.position.z-FRONT);
    const width=rect.w*(1-k)+7*k,height=cur.h;
    w.cursor.scale.set(width/pxPerUnit,height/pxPerUnit,DEPTH);
    w.cursor.position.set((cur.x-960)/pxPerUnit,(540-cur.y)/pxPerUnit,FRONT-DEPTH/2);
    w.cursor.rotation.x=ip.rotX;w.cursor.position.y+=(height/pxPerUnit/2)*(Math.cos(ip.rotX)-1)+ip.dy;
    w.cursor.position.z+=(height/pxPerUnit/2)*Math.sin(ip.rotX);w.cursor.visible=ip.emissive||ip.visible;
    w.cursorMat.color.setRGB(...lin(ip.emissive?'clay':'paper')).multiplyScalar(ip.emissive?lightIntensity(t):1);
    w.point.position.set(w.cursor.position.x,w.cursor.position.y,DEPTH+0.1);w.point.intensity=ip.emissive?lightIntensity(t):0;
    if(t>=T.issue-1/60)w.cursorMat.color.multiplyScalar(gain(t));
    w.rippleUniforms.rippleAge.value.set(...[0,2,3].map(i=>t-landingAt(i)) as [number,number,number]);
    const enabled=r.shadowMap.enabled,type=r.shadowMap.type;
    try{r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFShadowMap;clearRT(r,out,lin('ink'));r.render(w.scene,w.rig.cam);}
    finally{r.shadowMap.enabled=enabled;r.shadowMap.type=type;}
    w.layer.clear();const c=w.layer.ctx,initial=lyrics.lines[0]!.words.slice(0,3),times=initial.flatMap(word=>letterTimes(word));
    line01Incoming().forEach((g,i)=>{if(t<times[i]!.t0)return;const word=initial.find(wd=>t>=wd.start&&times[i]!.t0>=wd.start&&times[i]!.t0<wd.end)??initial.at(-1)!;
      drawAffine(c,g,voice.form(word,word.end).axes,t-times[i]!.t0,affineBounds(g,voice.form(word,word.end).axes).x+affineBounds(g,voice.form(word,word.end).axes).w/2<SPLIT_X?'ink':'paper',1,true);});
    const glyphs=continuationGlyphs(),aff=continuationAffines(t),screen=screenAffines(t);let si=0;
    glyphs.forEach((g,i)=>{const a=g.word.index===6?screen[si++]!:aff[i]!;if(t<g.t0)return;
      drawAffine(c,a,voice.form(g.word,t).axes,t-g.t0,affineBounds(a,voice.form(g.word,t).axes).x+affineBounds(a,voice.form(g.word,t).axes).w/2<SPLIT_X?'ink':'paper');});
    // The relay block sits on the actual paper edge's upper endpoint.
    if(k>=0.999){c.fillStyle=css('clay');c.fillRect(cur.x-3.5,cur.y-6,7,12);}
    this.ctx.comp.draw(r,w.layer.upload(),out);
    let shake=0;if(t<T.issue-0.1)for(const i of [0,2,3])if(t>=landingAt(i))shake+=6*Math.exp(-(t-landingAt(i))/0.08);
    return {...POSTER_POST,hud:0,shake:[noise1(t*71,2)*shake,noise1(t*83,3)*shake] as [number,number]};
  }
}
