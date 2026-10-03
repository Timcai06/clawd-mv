// S07 — engraved keycap landscape, rolled low lens and surface-bound lyric plates.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { FSPass, Layer2D } from '../engine/gl';
import { GLSL_COMMON } from '../engine/glsl/common';
import { F, font } from '../engine/type';
import { css, lin } from '../theme';
import { postFor, GlowLayer } from '../kit/ground';
import { Voice, Plate } from '../kit/lyric-moves';
import { affine, drawInscription, inscribe, type Inscription } from '../kit/inscribe';
import { varRun } from '../kit/vartype';
import { drawCursor } from '../kit/cursor';
import { afterBeats, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { resolveCTimes, keyboardState, type CTimes } from './parts/s06-timing';
import { KEY_FIELD, TERRAIN_KEYS, WORD_KEYS, RIDER_KEY, keyHeight, terrainOpacity, cameraAt, atScreen, handoffIn, handoffOut, riderAt, riderGeometry, titleSlice } from './parts/s07-terrain';
import { printRun } from './parts/s05-print';

export const TYPE_LEVELS = { giant: 540, lyric: 66, label: 18 }; // plate cap height before projection
const INK=lin('ink'),PAPER=lin('paper'),CLAY=lin('clay');
const KEY_VERT=/* glsl */ `
attribute vec4 keyMeta;
attribute float keySung;
uniform float beat,kick,landing;
varying vec3 vWorld,vNormal;
varying float vEnter;
varying float vSung;
void main() {
  float x=keyMeta.x,z=keyMeta.y;
  float height=0.48+sin(beat*3.14159265359-x*0.62-z*0.85)*0.16
    +sin(beat*3.14159265359*0.5+x*0.22)*0.055+kick*0.13*cos(x*0.34+z*0.5);
  if(keyMeta.w>0.5)height=0.5-landing*0.22;
  vec4 p=instanceMatrix*vec4(position,1.0);p.y+=height;
  vWorld=p.xyz;vNormal=normalize(mat3(instanceMatrix)*normal);vEnter=keyMeta.w;vSung=keySung;
  gl_Position=projectionMatrix*modelViewMatrix*p;
}`;
// v5: real light on the wave. The key tops follow one analytic height field (the same equation as
// KEY_VERT and parts/s07-terrain.ts keyHeight); each fragment marches toward a low key light over that
// field, so the wave's crests throw travelling shadows across the keys behind them (pdoom loss's
// terrain method), and the light is printed as engraving density.
const KEY_FRAG=/* glsl */ `
uniform vec3 paper,ink,clay;
uniform float opacity, glowOnly, beat, kick;
varying vec3 vWorld,vNormal;
varying float vEnter;
varying float vSung;
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
  float grain=hash12(floor(vWorld.xz*260.0));
  roof=mix(roof,ink,grain*0.035);
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


interface WordPlate {plate: Plate;texture: THREE.CanvasTexture;mesh: THREE.Mesh;key: typeof WORD_KEYS[number]}
class KeyboardWorld {
  users=0;
  times: CTimes;
  voice: Voice;
  scene=new THREE.Scene();
  camera=new THREE.PerspectiveCamera();
  bg=new FSPass(GROUND,{ink:{value:new THREE.Vector3(...INK)},paper:{value:new THREE.Vector3(...PAPER)},clay:{value:new THREE.Vector3(...CLAY)},t:{value:0},beat:{value:0}});
  caps: THREE.InstancedMesh;
  mat: THREE.ShaderMaterial;
  words: WordPlate[];
  /** Each key's word laid out once in its final shape (stage 9 ②: typed letter by letter). */
  private typed=new Map<number,Inscription>();
  keyWord(i: number) {
    let ins=this.typed.get(i);
    if(!ins){const wd=this.times.claws.words[i]!;ins=inscribe([{...this.voice.form(wd,wd.end),born:1,age:0}],92);this.typed.set(i,ins);}
    return ins;
  }
  legendAtlas=new Plate(512,512);
  legendTexture: THREE.CanvasTexture;
  legendKeys=TERRAIN_KEYS.filter(k=>!WORD_KEYS.some(w=>w.index===k.index));
  legends: THREE.InstancedMesh;
  hud=new Layer2D();
  glow=new GlowLayer();
  title=new Plate(1180,540);
  sprite=new Layer2D(160,50);
  clawd: THREE.Mesh;
  constructor(ctx: SceneCtx) {
    this.times=resolveCTimes(ctx.audio,ctx.lyrics);this.voice=new Voice(ctx.lyrics,ctx.audio);
    const geo=keycapGeometry();
    geo.setAttribute('keyMeta',new THREE.InstancedBufferAttribute(new Float32Array(KEY_FIELD.flatMap(k=>[k.x,k.z,k.index,k.enter?1:0])),4));
    geo.setAttribute('keySung',new THREE.InstancedBufferAttribute(new Float32Array(KEY_FIELD.length),1));
    this.mat=new THREE.ShaderMaterial({vertexShader:KEY_VERT,fragmentShader:GLSL_COMMON+KEY_FRAG,
      uniforms:{beat:{value:0},kick:{value:0},landing:{value:0},opacity:{value:1},glowOnly:{value:0},ink:{value:new THREE.Vector3(...INK)},paper:{value:new THREE.Vector3(...PAPER)},clay:{value:new THREE.Vector3(...CLAY)}},transparent:true});
    this.caps=new THREE.InstancedMesh(geo,this.mat,KEY_FIELD.length);
    const m=new THREE.Matrix4();
    KEY_FIELD.forEach((k,i)=>{m.makeScale(k.width,0.42,k.depth);m.setPosition(k.x,0,k.z);this.caps.setMatrixAt(i,m);});
    this.caps.frustumCulled=false;this.scene.add(this.caps);
    this.words=WORD_KEYS.map(key=>{
      const plate=new Plate(384,192),texture=new THREE.CanvasTexture(plate.canvas);
      texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=ctx.renderer.capabilities.getMaxAnisotropy();
      const mesh=new THREE.Mesh(new THREE.PlaneGeometry(key.width*0.86,key.depth*0.80),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,toneMapped:false,side:THREE.DoubleSide}));
      mesh.rotation.x=-Math.PI/2;this.scene.add(mesh);return {plate,texture,mesh,key};
    });
    // Intrinsic machine key legends share one atlas / draw call. They do not
    // repeat the sung line or introduce another typographic protagonist.
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
    this.title.ctx.fillStyle=css('paper',0.6);
    printRun(this.title.ctx,varRun('ENTER',740,{wdth:75,wght:900}),{x:0,y:0,w:1180,h:540},true);
    this.sprite.texture.magFilter=THREE.NearestFilter;this.sprite.texture.minFilter=THREE.NearestFilter;
    this.clawd=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.sprite.texture,transparent:true,depthWrite:false,depthTest:false,toneMapped:false}));
    this.clawd.renderOrder=2;this.scene.add(this.clawd);
  }
  dispose() {
    this.bg.mat.dispose();this.mat.dispose();this.caps.geometry.dispose();this.hud.texture.dispose();this.glow.dispose();this.sprite.texture.dispose();
    this.clawd.geometry.dispose();(this.clawd.material as THREE.Material).dispose();
    this.legendTexture.dispose();this.legends.geometry.dispose();(this.legends.material as THREE.Material).dispose();
    for(const w of this.words){w.texture.dispose();w.mesh.geometry.dispose();(w.mesh.material as THREE.Material).dispose();}
  }
}
let world: KeyboardWorld|undefined;
export default class S07Keyboard extends Scene {
  private w!: KeyboardWorld;
  override init(){this.w=world??=new KeyboardWorld(this.ctx);this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();world=undefined;}}

  override render(f: Frame,out: THREE.WebGLRenderTarget) {
    const w=this.w,T=w.times,au=this.ctx.audio,s=keyboardState(au,f.t,T),opacity=terrainOpacity(s.dive);
    w.camera=cameraAt(au,f.t,T);w.bg.u.t!.value=f.t;w.bg.u.beat!.value=f.beat;
    w.bg.render(this.ctx.renderer,out);
    w.mat.uniforms.beat!.value=f.beat;w.mat.uniforms.kick!.value=f.a.kick;w.mat.uniforms.landing!.value=s.landing;w.mat.uniforms.opacity!.value=opacity;
    // The first key receives S06's exact pen point, then returns to its world layout.
    const first=WORD_KEYS[0]!,height=keyHeight(first.x,first.z,false,f.beat,f.a.kick,0);
    const natural=new THREE.Vector3(first.x,height,first.z),tip=handoffIn(f.t,au,T);
    const shifted=atScreen(tip.x,tip.y,w.camera,natural.distanceTo(w.camera.position));
    const m=new THREE.Matrix4().makeScale(first.width,0.42,first.depth);
    m.setPosition(shifted.x,shifted.y-height,shifted.z);w.caps.setMatrixAt(first.index,m);w.caps.instanceMatrix.needsUpdate=true;
    const sung=w.caps.geometry.getAttribute('keySung') as THREE.InstancedBufferAttribute;
    (sung.array as Float32Array).fill(0);
    for(let i=0;i<w.words.length;i++) {
      const p=w.words[i]!,word=T.claws.words[i]!,form=w.voice.form(word,f.t),c=p.plate.ctx;
      sung.setX(p.key.index,form.born);
      p.plate.clear();
      if(i===0&&f.t<afterBeats(au,T.keyboard,1)) {c.fillStyle=css('clay');c.fillRect(0,0,384,192);}
      // Stage 9 ②: the word is typed into its keycap a letter at a time (a key strike per letter:
      // kick, misregistration, ink density), each letter while it is sung; nothing is predicted.
      if(form.born>0){
        const fin=w.keyWord(i),sc=Math.min(1,340/fin.width),x0=192-fin.width*sc/2;
        drawInscription(c,{...fin,glyphs:fin.glyphs.map(g=>({...g,form}))},f.t,{on:'clay',head:'type',scale:sc,place:(_g,x)=>affine(x0+x,132),seed:70+i});
      }
      p.texture.needsUpdate=true;
      const y=keyHeight(p.key.x,p.key.z,p.key.enter,f.beat,f.a.kick,s.landing)+0.012;
      p.mesh.position.set(p.key.x,y,p.key.z);if(i===0)p.mesh.position.copy(shifted).add(new THREE.Vector3(0,0.012,0));
      (p.mesh.material as THREE.MeshBasicMaterial).opacity=opacity;
    }
    sung.needsUpdate=true;
    const rotation=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2);
    w.legendKeys.forEach((k,i)=>{
      const y=keyHeight(k.x,k.z,false,f.beat,f.a.kick,0)+0.014;
      w.legends.setMatrixAt(i,new THREE.Matrix4().compose(new THREE.Vector3(k.x,y,k.z),rotation,new THREE.Vector3(k.width*0.75,k.depth*0.75,1)));
    });
    w.legends.instanceMatrix.needsUpdate=true;(w.legends.material as THREE.MeshBasicMaterial).opacity=0.6*opacity;
    // Actual flat nearest-neighbour sprite in the 3D scene, with pixel scale solved
    // from the low camera. Rigidly rotated, never turned into a 3D mascot.
    const rider=riderAt(au,f.t,T),{pos,units,support}=riderGeometry(au,f.t,T,w.camera);
    const crest=new THREE.Matrix4().makeScale(RIDER_KEY.width,0.42,RIDER_KEY.depth);
    crest.setPosition(support.x,support.y-keyHeight(RIDER_KEY.x,RIDER_KEY.z,false,f.beat,f.a.kick,0),support.z);
    w.caps.setMatrixAt(RIDER_KEY.index,crest);w.caps.instanceMatrix.needsUpdate=true;
    w.sprite.clear();Clawd.draw(w.sprite.ctx,0,0,Clawd.pose('A5',{beat:f.beat,beat0:au.beatAt(T.land),p:0,travel:0}),{px:10});w.sprite.upload();
    w.clawd.position.copy(pos);w.clawd.scale.set(16*rider.px*units,5*rider.px*units,1);
    w.clawd.quaternion.copy(w.camera.quaternion);w.clawd.rotateZ(-rider.roll);
    (w.clawd.material as THREE.MeshBasicMaterial).opacity=opacity;
    this.ctx.renderer.setRenderTarget(out);this.ctx.renderer.clearDepth();this.ctx.renderer.render(w.scene,w.camera);
    // Preserve key depth/coverage; hide paper legends and clay-surface ink lyrics in this pass.
    w.mat.uniforms.glowOnly!.value=1;
    w.legends.visible=false; for(const p of w.words)p.mesh.visible=false;
    w.sprite.clear();
    const auraPose=Clawd.pose('A5',{beat:f.beat,beat0:au.beatAt(T.land),p:0,travel:0});
    Clawd.draw(w.sprite.ctx,0,0,{...auraPose,cells:auraPose.cells.filter(cell=>cell.k==='O')},{px:10,alpha:0.25});w.sprite.upload();
    w.glow.renderScene(this.ctx.renderer,w.scene,w.camera);
    w.mat.uniforms.glowOnly!.value=0;
    w.legends.visible=true; for(const p of w.words)p.mesh.visible=true;
    w.hud.clear();w.glow.clear();const c=w.hud.ctx;
    // Slice the print plate on the ruled perspective plane; its horizon and enlarged
    // right edge match the storyboard's cropped title, without a lit billboard.
    c.globalAlpha=opacity;
    for(let x=0;x<1180;x+=10) {
      const q=titleSlice(x/1180),r=titleSlice((x+10)/1180);
      c.drawImage(w.title.canvas,x*w.title.canvas.width/1180,0,10*w.title.canvas.width/1180,w.title.canvas.height,q.x,q.top,r.x-q.x+0.5,q.bottom-q.top);
    }
    c.globalAlpha=1;
    // The full Enter is clay. A small clay-only halo and deterministic halftone
    // rays are printed around its surface; bloom never receives the paper caps.
    const exit=handoffOut(f.t,au,T),reveal=span(f.t,afterBeats(au,T.end,-1),T.end);
    if(reveal>0) {c.globalAlpha=reveal;drawCursor(c,exit);drawCursor(w.glow.ctx,{...exit,on:reveal});c.globalAlpha=1;}
    this.ctx.comp.draw(this.ctx.renderer,w.hud.upload(),out);w.glow.composite(this.ctx,out,1.4);
    return {...postFor('ink'),hud:0,frame:0,ca:0.6,grain:0.023,vignette:0};
  }
}
