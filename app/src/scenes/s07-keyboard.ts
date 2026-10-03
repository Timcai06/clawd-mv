// S07 — engraved keycap landscape, rolled low lens and surface-bound lyric plates.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { GLSL_COMMON } from '../engine/glsl/common';
import { F, font } from '../engine/type';
import { css, lin } from '../theme';
import { postFor, GlowLayer } from '../kit/ground';
import { Voice } from '../kit/lyric-moves';
import { varRun } from '../kit/vartype';
import { drawCursor } from '../kit/cursor';
import { afterBeats, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { resolveCTimes, keyboardState, type CTimes } from './parts/s06-timing';
import { WordPlane } from '../kit/wordplane';
import { letterTimes } from '../kit/pathtext';
import { exitEnvelope } from '../kit/handoff';
import { keyTop,keyEvents,LOOKING_KEYS,ENTER } from './parts/s07-terrain';
import { KEY_FIELD, TERRAIN_KEYS, WORD_KEYS, RIDER_KEY, keyHeight, terrainOpacity, cameraAt, atScreen, handoffIn, handoffOut, riderAt, riderGeometry, titleSlice } from './parts/s07-terrain';
import { printRun } from './parts/s05-print';

export const TYPE_LEVELS = { giant: 540, lyric: 66, label: 18 }; // plate cap height before projection
const INK=lin('ink'),PAPER=lin('paper'),CLAY=lin('clay');
const KEY_VERT=/* glsl */ `
attribute vec4 keyMeta;
attribute float keySung;
attribute float keyLift; attribute float keyHeat;
uniform float beat,kick,landing;
varying vec3 vWorld,vNormal;
varying float vEnter;
varying float vSung; varying float vHeat;
void main() {
  float x=keyMeta.x,z=keyMeta.y;
  float height=0.48+sin(beat*3.14159265359-x*0.62-z*0.85)*0.16
    +sin(beat*3.14159265359*0.5+x*0.22)*0.055+kick*0.13*cos(x*0.34+z*0.5);
  if(keyMeta.w>0.5)height=0.5-landing*0.22;
  vec4 p=instanceMatrix*vec4(position,1.0);p.y+=height+keyLift;
  vWorld=p.xyz;vNormal=normalize(mat3(instanceMatrix)*normal);vEnter=keyMeta.w;vSung=keySung;vHeat=keyHeat;
  gl_Position=projectionMatrix*modelViewMatrix*p;
}`;
// v5: real light on the wave. The key tops follow one analytic height field (the same equation as
// KEY_VERT and parts/s07-terrain.ts keyHeight); each fragment marches toward a low key light over that
// field, so the wave's crests throw travelling shadows across the keys behind them (pdoom loss's
// terrain method), and the light is printed as engraving density.
const KEY_FRAG=/* glsl */ `
uniform vec3 paper,ink,clay;
uniform float opacity, glowOnly, beat, kick, exitGain;
varying vec3 vWorld,vNormal;
varying float vEnter;
varying float vSung; varying float vHeat;
float H(vec2 q) {
  return 0.48+sin(beat*3.14159265359-q.x*0.62-q.y*0.85)*0.16+sin(beat*3.14159265359*0.5+q.x*0.22)*0.055+kick*0.13*cos(q.x*0.34+q.y*0.5);
}
float waveShadow(vec3 p, vec3 L) {
  float res = 1.0;
  for (int i = 1; i <= 14; i++) {
    float s = 0.18 * float(i) * float(i) * 0.25 + 0.12 * float(i);
    vec3 q = p + L * s;
    float d = q.y - H(q.xz);
    res = min(res, smoothstep(-0.02, 0.06, d) );
    if (res < 0.01) break;
  }
  return res;
}
void main() {
  vec3 n = normalize(vNormal);
  float top=step(0.8,n.y);
  vec3 L = normalize(vec3(-0.75, 0.42, -0.5)); // low, from the far left: crests shade the keys behind them
  float sh = waveShadow(vWorld + n * 0.01, L);
  float lit = max(dot(n, L), 0.0) * sh;
  float tone = 0.1 + 0.9 * lit;
  // sides: vertical cuts whose width follows the light; deep shade adds a crossing pass
  float u = (abs(n.x)>0.5?vWorld.z:vWorld.x)*44.0+vWorld.y*5.0;
  float cuts=hatch(u, clamp(0.85 - 0.75 * tone, 0.1, 0.85));
  float cross=hatch((vWorld.y*0.9+(abs(n.x)>0.5?vWorld.z:vWorld.x)*0.5)*30.0, clamp(0.6 - 0.9 * tone, 0.0, 0.5));
  vec3 side=mix(paper,ink,max(cuts,cross)*0.85);
  // tops: paper in the light; in a crest's shadow, fine diagonal rules
  vec3 roof=mix(paper, ink, hatch((vWorld.x + vWorld.z * 0.6) * 22.0, (1.0 - sh) * 0.55) * 0.85);
  roof=mix(roof,clay,max(vEnter,vSung));
  if(vEnter>.5){float u=dot(FRAG_PX,vec2(-sin(.6),cos(.6)))/5.0;roof=mix(clay,ink,hatch(u,.20)*.75);}
  roof+=clay*vHeat;
  float grain=hash12(floor(vWorld.xz*260.0));
  roof=mix(roof,ink,grain*0.035);
  roof*=1.0+vEnter*(exitGain-1.0);
  vec3 col = mix(side,roof,top);
  float clayCoverage = top * max(vEnter,vSung);
  if (glowOnly > 0.5) col = clay * clayCoverage;
  gl_FragColor=vec4(col,opacity);
}`;
const GROUND=/* glsl */ `
uniform vec3 ink,paper,clay;
uniform float t,beat;
void main() {
  vec2 p=vec2(FRAG_PX.x,1080.0-FRAG_PX.y);
  float dot=step(0.78,hash12(floor(p/12.0)))*(1.0-smoothstep(0.5,1.3,length(mod(p,12.0)-6.0)));
  float band=step(1300.0,p.x)*step(550.0,p.y);
  fragColor=vec4(mix(mix(ink,paper,dot*0.045),clay,dot*band*0.4),1.0);
}`;
/** A flat-sided, bevelled keycap with no rounded toy-like silhouette. */
function keycapGeometry() {
  const pos: number[] = [], uv: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    for (const p of [a, b, d, b, c, d]) { pos.push(...p); uv.push(p[0]! + 0.5, p[2]! + 0.5); }
  };
  const corners = (s: number, y: number) => [[-s, y, -s], [-s, y, s], [s, y, s], [s, y, -s]];
  const lower = corners(0.5, -1), shoulder = corners(0.5, -0.09), top = corners(0.45, 0);
  quad(top[0]!, top[1]!, top[2]!, top[3]!);
  quad(lower[3]!, lower[2]!, lower[1]!, lower[0]!);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    quad(lower[i]!, lower[j]!, shoulder[j]!, shoulder[i]!);
    quad(shoulder[i]!, shoulder[j]!, top[j]!, top[i]!);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  return geo;
}


interface KeyWord {plane:WordPlane;key:typeof TERRAIN_KEYS[number];wi:number;letter?:number}
class KeyboardWorld {
  users=0;times:CTimes;voice:Voice;scene=new THREE.Scene();camera=new THREE.PerspectiveCamera();
  bg=new FSPass(GROUND,{ink:{value:new THREE.Vector3(...INK)},paper:{value:new THREE.Vector3(...PAPER)},clay:{value:new THREE.Vector3(...CLAY)},t:{value:0},beat:{value:0}});
  caps:THREE.InstancedMesh;mat:THREE.ShaderMaterial;words:KeyWord[]=[];
  legendAtlas=new Layer2D(512,512);legendTexture:THREE.CanvasTexture;
  legendKeys=TERRAIN_KEYS.filter(k=>!WORD_KEYS.some(w=>w.index===k.index)&&!LOOKING_KEYS.some(w=>w.index===k.index));legends:THREE.InstancedMesh;
  sprite=new Layer2D(160,50);clawd:THREE.Mesh;
  constructor(ctx:SceneCtx){
    this.times=resolveCTimes(ctx.audio,ctx.lyrics);this.voice=new Voice(ctx.lyrics,ctx.audio);
    const geo=keycapGeometry();geo.setAttribute('keyMeta',new THREE.InstancedBufferAttribute(new Float32Array(KEY_FIELD.flatMap(k=>[k.x,k.z,k.index,k.enter?1:0])),4));
    for(const name of ['keySung','keyLift','keyHeat'])geo.setAttribute(name,new THREE.InstancedBufferAttribute(new Float32Array(KEY_FIELD.length),1));
    this.mat=new THREE.ShaderMaterial({vertexShader:KEY_VERT,fragmentShader:GLSL_COMMON+KEY_FRAG,uniforms:{beat:{value:0},kick:{value:0},landing:{value:0},opacity:{value:1},glowOnly:{value:0},exitGain:{value:1},ink:{value:new THREE.Vector3(...INK)},paper:{value:new THREE.Vector3(...PAPER)},clay:{value:new THREE.Vector3(...CLAY)}}});
    this.caps=new THREE.InstancedMesh(geo,this.mat,KEY_FIELD.length);const m=new THREE.Matrix4();KEY_FIELD.forEach((k,i)=>{m.makeScale(k.width,.42,k.depth);m.setPosition(k.x,0,k.z);this.caps.setMatrixAt(i,m);});this.caps.frustumCulled=false;this.scene.add(this.caps);
    this.times.claws.words.forEach((word,wi)=>{
      const axes=this.voice.form(word,word.end).axes,parent=new WordPlane(word.w.toUpperCase(),{capH:.55,axes,ay:0,ax:0,outline:0});
      const planes=wi===7?parent.letters():[parent];if(wi===7)parent.dispose();
      planes.forEach((plane,j)=>{plane.mesh.geometry.computeBoundingBox();plane.mesh.geometry.translate(-plane.mesh.geometry.boundingBox!.min.x,0,0);plane.mesh.rotation.x=-Math.PI/2;plane.set({aDim:0,cSung:CLAY,cDone:INK});this.words.push({plane,key:wi===7?LOOKING_KEYS[j]!:WORD_KEYS[wi]!,wi,...(wi===7?{letter:j}:{})});this.scene.add(plane.mesh);});
    });
    const lc=this.legendAtlas.ctx;lc.fillStyle=css('ink');lc.font=font(F.mono(500),26);lc.textAlign='center';
    for(const k of this.legendKeys)lc.fillText(k.label.length>2?k.label.slice(0,2):k.label,(k.index%8)*64+32,Math.floor(k.index/8)*64+43);
    this.legendTexture=new THREE.CanvasTexture(this.legendAtlas.canvas);this.legendTexture.colorSpace=THREE.SRGBColorSpace;
    this.legendTexture.anisotropy=ctx.renderer.capabilities.getMaxAnisotropy();
    const legendGeo=new THREE.PlaneGeometry(1,1);
    legendGeo.setAttribute('legendCell',new THREE.InstancedBufferAttribute(new Float32Array(this.legendKeys.map(k=>k.index)),1));
    const legendMat=new THREE.MeshBasicMaterial({map:this.legendTexture,transparent:true,depthWrite:false,toneMapped:false,opacity:0.6});
    legendMat.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float legendCell; varying vec2 vCell;')
        .replace('#include <begin_vertex>','#include <begin_vertex>\nvCell=vec2(mod(legendCell,8.0),7.0-floor(legendCell/8.0))/8.0;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vCell;')
        .replace('#include <map_fragment>','diffuseColor *= texture2D(map, vMapUv/8.0+vCell);');
    };
    this.legends=new THREE.InstancedMesh(legendGeo,legendMat,this.legendKeys.length);this.legends.frustumCulled=false;this.scene.add(this.legends);

    this.sprite.texture.magFilter=THREE.NearestFilter;this.sprite.texture.minFilter=THREE.NearestFilter;
    this.clawd=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.sprite.texture,transparent:true,depthWrite:false,depthTest:true,toneMapped:false}));this.scene.add(this.clawd);
  }
  dispose(){this.bg.mat.dispose();this.mat.dispose();this.caps.geometry.dispose();this.words.forEach(w=>w.plane.dispose());this.legendTexture.dispose();this.legendAtlas.texture.dispose();this.legends.geometry.dispose();(this.legends.material as THREE.Material).dispose();this.sprite.texture.dispose();this.clawd.geometry.dispose();(this.clawd.material as THREE.Material).dispose();}
}
let world:KeyboardWorld|undefined;
export default class S07Keyboard extends Scene {
  w!:KeyboardWorld;override init(){this.w=world??=new KeyboardWorld(this.ctx);this.w.users++;}override dispose(){if(--this.w.users===0){this.w.dispose();world=undefined;}}
  override render(f:Frame,out:THREE.WebGLRenderTarget){
    const w=this.w,T=w.times,a=this.ctx.audio,t=f.t,s=keyboardState(a,t,T);w.camera=cameraAt(a,t,T);w.bg.u.t!.value=t;w.bg.u.beat!.value=f.beat;w.bg.render(this.ctx.renderer,out);
    w.mat.uniforms.beat!.value=f.beat;w.mat.uniforms.kick!.value=a.hit('kick',t);w.mat.uniforms.landing!.value=s.landing;w.mat.uniforms.exitGain!.value=exitEnvelope(t,T.end).gain;
    const lift=w.caps.geometry.getAttribute('keyLift') as THREE.InstancedBufferAttribute,sung=w.caps.geometry.getAttribute('keySung') as THREE.InstancedBufferAttribute,heat=w.caps.geometry.getAttribute('keyHeat') as THREE.InstancedBufferAttribute,events=keyEvents(T);
    KEY_FIELD.forEach((key,i)=>{lift.setX(i,keyTop(key,t,a,T)-keyHeight(key.x,key.z,key.enter,f.beat,a.hit('kick',t),s.landing));const event=events.filter(e=>e.key.index===key.index&&t>=e.at).at(-1);sung.setX(i,event?1:0);heat.setX(i,event?Math.exp(-(t-event.at)/.28):0);});lift.needsUpdate=sung.needsUpdate=heat.needsUpdate=true;
    for(const item of w.words){const {plane,key,wi,letter}=item,word=T.claws.words[wi]!,times=letterTimes(word),at=times[letter??0]!.t0;
      const size=Math.min(1,key.width*.85/plane.w);plane.mesh.scale.set(size,1,1);plane.mesh.position.set(key.x-plane.w*size/2,keyTop(key,t,a,T)+.004,key.z+.28);
      const target=letter===undefined?{...word,w:word.w.toUpperCase()}:{...word,w:Array.from(word.w.toUpperCase())[letter]!,start:times[letter]!.t0,end:times[letter]!.t1};
      plane.set({prog:plane.karaoke(target,t),done:t>=word.end?1:0,heat:t<at?0:Math.exp(-(t-at)/.28)});plane.mesh.visible=t>=at;
    }
    const m=new THREE.Matrix4(),q=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2),sc=new THREE.Vector3();
    w.legendKeys.forEach((key,i)=>{sc.set(key.width*.72,key.depth*.62,1);m.compose(new THREE.Vector3(key.x,keyTop(key,t,a,T)+.005,key.z),q,sc);w.legends.setMatrixAt(i,m);});w.legends.instanceMatrix.needsUpdate=true;
    const rider=riderGeometry(a,t,T,w.camera),R=riderAt(a,t,T);w.sprite.clear();Clawd.draw(w.sprite.ctx,0,0,Clawd.pose('A5',{beat:f.beat,beat0:a.beatAt(T.land),p:0,travel:0}),{px:10});w.sprite.upload();w.clawd.position.copy(rider.pos);w.clawd.quaternion.copy(w.camera.quaternion);w.clawd.scale.set(16*R.px*rider.units,5*R.px*rider.units,1);
    const r=this.ctx.renderer;r.setRenderTarget(out);r.clearDepth();r.render(w.scene,w.camera);return {hud:0,frame:0,bloom:.45,grain:.02};
  }
}
