import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { css, lin } from '../theme';
import { varRun } from '../kit/vartype';
import { Voice } from '../kit/lyric-moves';
import { Ground, postFor } from '../kit/ground';
import { engraveMaterial } from '../kit/engrave-mat';
import { SolidText, solidLetterGeometry } from '../kit/solidtype';
import { Rig } from '../kit/rig';
import { drawPathText } from '../kit/pathtext';
import { drawCarry } from '../kit/carry';
import { resolveX9Times, type X9Times } from './s09-z-shared';
import { mono } from './parts/s09-type';
import { SHEET, copies, sheetAt, scanAt, scraperX, numberAt, paperY, PAPER_GLSL, cameraAt, slotCorners, cursorWorld, numberTimes, KEY_INTENSITY, AMBIENT_TONE, LINE_GLSL, LINE_INTENSITY } from './parts/s12-world';
import { clearLyrics, countLyrics, whyIncoming } from './parts/s12-layout';
import { drawCopy, TEX_W, TEX_H } from './parts/s12-copy';
export { cursorAt } from './parts/s12-world';
export const TYPE_LEVELS={giant:null,lyric:66,label:18};
// Scene-local light hook: evaluate a finite line in world space before engraveTone.
// It is illumination, never emission; the standard key shadow term is retained.
function lineLit(mat:THREE.MeshLambertMaterial,u:Record<string,THREE.IUniform>) {
  const compile=mat.onBeforeCompile;
  mat.onBeforeCompile=(shader,renderer)=>{
    compile.call(mat,shader,renderer);Object.assign(shader.uniforms,u);
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 copierWorld;')
      .replace('#include <project_vertex>','copierWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\n#include <project_vertex>');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 copierWorld;uniform vec3 copierA,copierB;uniform float copierI;${LINE_GLSL}`)
      .replace('float engraveFace =','engraveL=min(0.92,engraveL+copierLine(copierWorld,inverseTransformDirection(normal,viewMatrix),copierA,copierB,copierI));\nfloat engraveFace =');
  };
  mat.customProgramCacheKey=()=> 'v6-s12-line-light';return mat;
}
class World {
  users=0;times:X9Times;voice:Voice;rig=new Rig();scene=new THREE.Scene();ground=new Ground();layer=new Layer2D();
  sheets:{mesh:THREE.Mesh;canvas:HTMLCanvasElement;texture:THREE.CanvasTexture}[]=[];
  numbers:SolidText[]=[];
  lineUniforms={copierA:{value:new THREE.Vector3()},copierB:{value:new THREE.Vector3()},copierI:{value:0}};
  paper=engraveMaterial({paper:lin('paper'),ink:lin('ink'),paperMap:true,pitch:5,angle:0.6});
  table=engraveMaterial({paper:lin('ink'),ink:lin('paper'),lightLines:true,pitch:5});
  numberMat=engraveMaterial({paper:lin('ink'),ink:lin('paper'),lightLines:true,maxCov:0.3,pitch:5,gamma:18});
  clay=new THREE.MeshLambertMaterial({color:0,emissive:new THREE.Color().setRGB(...lin('clay')),emissiveIntensity:1,toneMapped:false});
  scan=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.05,3.4),new THREE.MeshLambertMaterial({color:0,emissive:new THREE.Color().setRGB(...lin('clay')),emissiveIntensity:1,toneMapped:false}));
  scraperMat=engraveMaterial({paper:lin('paper'),ink:lin('ink'),pitch:5});
  scraper=new THREE.Mesh(new THREE.BoxGeometry(6,0.15,0.3),this.scraperMat);
  desk=new THREE.Mesh(new THREE.PlaneGeometry(300,300),this.table);

  constructor(ctx:SceneCtx) {
    this.times=resolveX9Times(ctx);this.voice=new Voice(ctx.lyrics,ctx.audio);
    const desk=this.desk;desk.rotation.x=-Math.PI/2;desk.receiveShadow=true;this.scene.add(desk);
    lineLit(this.table,this.lineUniforms);lineLit(this.numberMat,this.lineUniforms);lineLit(this.scraperMat,this.lineUniforms);
    const numberCompile=this.numberMat.onBeforeCompile;
    this.numberMat.onBeforeCompile=(shader,renderer)=>{
      numberCompile(shader,renderer);
      shader.fragmentShader=shader.fragmentShader.replace('float engraveT = engraveSat(engraveL);','float engraveT = min(0.92,engraveSat(engraveL));')
        .replace('float engraveCov = min(engraveMaxCov, engraveTone(engraveU,engraveLL ? 1.0-engraveT : engraveT));',
          'float engraveCov = engraveMaxCov * engraveHatch(engraveU,max(engraveMinCov,pow(engraveT,engraveGamma)*0.95));');
    };this.numberMat.customProgramCacheKey=()=> 's12-ink-number-p1';
    this.scene.add(new THREE.AmbientLight(0xffffff,AMBIENT_TONE*Math.PI));
    const key=new THREE.DirectionalLight(0xffffff,KEY_INTENSITY);key.position.set(5,10,4);key.castShadow=true;
    key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-15,right:25,top:12,bottom:-12,near:0.1,far:50});key.shadow.bias=-0.0003;
    this.scene.add(key,key.target);

    for(let k=0;k<5;k++){
      const canvas=document.createElement('canvas');canvas.width=TEX_W;canvas.height=TEX_H;
      const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;
      const mat=lineLit(engraveMaterial({paper:lin('paper'),ink:lin('ink'),paperMap:true,pitch:5}),this.lineUniforms);const compile=mat.onBeforeCompile;mat.onBeforeCompile=(shader,renderer)=>{compile.call(mat,shader,renderer);shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\n'+PAPER_GLSL).replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.y=paperY(position.x,position.z);');};
      mat.customProgramCacheKey=()=> 'v6-s12-paper-line-light';mat.map=texture;mat.side=THREE.DoubleSide;
      const geo=new THREE.PlaneGeometry(SHEET.w,SHEET.h,30,42);geo.rotateX(-Math.PI/2);
      // Actual displaced mesh; same world field exported in GLSL for GPU parity / future GPU displacement.
      const pos=geo.getAttribute('position');for(let i=0;i<pos.count;i++)pos.setY(i,paperY(pos.getX(i),pos.getZ(i)));
      geo.computeVertexNormals();
      const mesh=new THREE.Mesh(geo,mat);mesh.castShadow=mesh.receiveShadow=true;this.scene.add(mesh);this.sheets.push({mesh,canvas,texture});
    }
    for(let i=0;i<11;i++){
      const state=numberAt(this.voice,i,0),text=new SolidText(String(i+1),{capH:state.capH,axes:{wdth:75,wght:900},depth:0.2,bevel:i===10?0:0.015,material:i===10?this.clay:this.numberMat});
      this.numbers.push(text);this.scene.add(text.group);
    }
    this.scene.add(this.scan,this.scraper);
  }
  dispose() {
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh && !this.numbers.some(n=>n.letters.some(l=>l.mesh===o)))o.geometry.dispose();});
    for(const s of this.sheets){s.texture.dispose();(s.mesh.material as THREE.Material).dispose();}
    this.numbers.forEach(n=>n.dispose());this.paper.dispose();this.table.dispose();this.numberMat.dispose();this.scraperMat.dispose();this.clay.dispose();
    (this.scan.material as THREE.Material).dispose();this.ground.pass.mat.dispose();this.layer.texture.dispose();
  }
}
let world:World|undefined;
export default class S12Rerun extends Scene {
  private w!:World;
  override init(){this.w=world??=new World(this.ctx);this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();world=undefined;}}
  override render(f:Frame,out:THREE.WebGLRenderTarget) {
    const w=this.w,v=w.voice,t=f.t,T=w.times,r=this.ctx.renderer;
    w.ground.render(r,out,{kind:'ink',t,grid:0,haze:0});w.rig.set(cameraAt(v,t,T));
    // At the parked macro cut only the clay stem remains against ink space.
    // The engraved table otherwise projects through the entire right half.
    w.desk.visible=t<T.end-.1;
    for(let k=0;k<5;k++){
      const s=w.sheets[k]!,pose=sheetAt(v,k,t);s.mesh.visible=pose.visible;
      s.mesh.position.set(pose.x,pose.y,pose.z);s.mesh.rotation.set(pose.rx,pose.ry,pose.rz);
      if(pose.visible){drawCopy(s.canvas.getContext('2d')!,v,k,t);s.texture.needsUpdate=true;}
    }
    const scan=scanAt(v,t);w.scan.visible=scan.visible;w.scan.position.set(scan.p.x,scan.p.y,scan.p.z);
    if(t>=T.count){const head=cursorWorld(v,t);w.scan.position.set(head.x,head.y,head.z);w.scan.visible=t<numberTimes(v)[10]!+0.18;w.scan.scale.set(1,1,0.1);}else w.scan.scale.set(1,1,1);
    w.scan.rotation.y=Math.PI/2; // 3.4-world-unit light bar spans the paper's x axis; its 0.12 axis scans -z.
    w.lineUniforms.copierI.value=scan.visible?LINE_INTENSITY:0;
    w.lineUniforms.copierA.value.set(scan.p.x-1.7,scan.p.y,scan.p.z);w.lineUniforms.copierB.value.set(scan.p.x+1.7,scan.p.y,scan.p.z);
    w.scraper.visible=t>=T.clear && t<T.count;w.scraper.position.set(scraperX(v,t),0.15,0);
    for(let k=0;k<11;k++){
      const number=w.numbers[k]!,pose=numberAt(v,k,t);number.group.visible=pose.visible;
      number.group.position.set(pose.x,pose.y,pose.z);number.group.rotation.x=pose.rx;
      if(k<10&&t>=T.end-.1)number.group.visible=false;
      if(k===9){
        for(const letter of number.letters)letter.mesh.geometry=solidLetterGeometry(letter.ch,pose.axes,1.6,0.2,0.015);
        const run=v.form(v.line('Clear the cache and count to ten').words[6]!,t).axes;
        const ref=number.letters[1];if(ref){const r10=varRun('10',100,pose.axes);ref.mesh.matrix.elements[12]=r10.glyphs[1]!.x*1.6/r10.capH;ref.mesh.matrixWorldNeedsUpdate=true;}
      }
      if(k===10)w.clay.emissive.setRGB(...lin(pose.fail?'fail':'clay'));
    }
    const shadowEnabled=r.shadowMap.enabled,shadowType=r.shadowMap.type;
    r.shadowMap.enabled=true;r.shadowMap.type=THREE.PCFShadowMap;
    r.setRenderTarget(out);r.clearDepth();r.render(w.scene,w.rig.cam);r.shadowMap.enabled=shadowEnabled;r.shadowMap.type=shadowType;
    w.layer.clear();const c=w.layer.ctx;
    if(t<T.clear) {
      c.strokeStyle=css('paper');c.lineWidth=4;c.setLineDash([6,5]);
      for(let k=0;k<9;k++){if(k<5 && t>=copies(v)[k]!.start)continue;const ps=slotCorners(v,k,t,T).map(p=>w.rig.proj(p.x,p.y,p.z)!);
        c.beginPath();ps.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.stroke();}
      c.setLineDash([]);
    }
    const why=whyIncoming(v,T,t);if(why.draw)drawCarry(c,why.spec,why.aff);
    if(t>=T.clear && t<T.count){const ly=clearLyrics(v,t);drawPathText(c,w.rig,ly.path,ly.layout,t,{mode:'lie',normal:()=>({x:0,y:1,z:0}),base:'paper',on:'ink',pop:0,axes:(g,at)=>v.form(g.word,at).axes});}
    if(t>=v.line('Clear the cache and count to ten').words[3]!.start) {
      const ly=countLyrics(v);
      const ink=new Proxy(c,{set(target,key,value){Reflect.set(target,key,key==='fillStyle'?css('ink'):value,target);return true;},
        get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      drawPathText(ink,w.rig,ly.path,ly.layout,t,{mode:'stand',base:'ink',on:'paper',pop:0,minPx:50,maxPx:110,axes:(g,at)=>v.form(g.word,at).axes});
    }
    if(t>=copies(v)[0]!.start && t<T.clear) {
      const k=copies(v).reduce((a,w,i)=>t>=w.start?i:a,0),p=w.rig.proj(k*2.4+1.15,0.1,0);
      if(p)mono(c,'gen 1 → gen '+(k+1),p.x,p.y,18,'paper',1);
    }
    this.ctx.comp.draw(r,w.layer.upload(),out);
    return {...postFor('ink'),hud:0,ca:0,bloom:0,shoulder:0,vignette:0,exposure:1};
  }
}
