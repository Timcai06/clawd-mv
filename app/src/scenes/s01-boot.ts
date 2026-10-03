// V6 S01: the cursor is the only point light; geometry and letters query its world.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { lin, POSTER_POST } from '../theme';
import { RaymarchPass } from '../kit/raymarch';
import { Rig } from '../kit/rig';
import { drawPathText, pathAt } from '../kit/pathtext';
import { SparkLines, heatTrail } from '../kit/spark';
import { drawNote } from '../kit/note';
import { afterBeats } from '../kit/time';
import { audio, T, voice, bootState } from './parts/s01-timing';
import { S01_GLSL, cameraAt, cursorSolidPoints, cursorCenter, cursorAt, cursorGain, blink, flare, worldBoxes,
  lyricPath, line01Layout, lyricAlpha, FRAME_PATH } from './parts/s01-world';
export { cameraAt, cursorAt, line01Affines, line01Next } from './parts/s01-world';
export const TYPE_LEVELS={giant:null,lyric:50.8,label:20};
const SHADE=/* glsl */`
${S01_GLSL}
uniform vec3 paperC,inkC,clayC,lightPos;uniform float lightI;
float pointShadow(vec3 p,vec3 n,vec3 L,float stop){
  float shadow=1.0;vec3 ro=p+n*0.01,inv=1.0/(L+vec3(1e-20));
  for(int i=0;i<32;i++){
    if(i>=boxN)break;vec3 a=(boxC[i]-boxH[i]-ro)*inv,b=(boxC[i]+boxH[i]-ro)*inv;
    vec3 mn=min(a,b),mx=max(a,b);float near=max(mn.x,max(mn.y,mn.z)),far=min(mx.x,min(mx.y,mx.z));
    if(far>max(near,0.001)&&near<stop)return 0.0;
    float d=clamp(near,0.03,stop);shadow=min(shadow,10.0*max(0.0,sdBoxW(ro+L*d-boxC[i],boxH[i]))/d);
  }return clamp(shadow,0.0,1.0);
}
vec3 background(vec3 rd,vec2 px){return inkC;}
vec3 shade(vec3 p,vec3 n,vec3 rd,float id,float travel){
  vec3 delta=lightPos-p;float d2=dot(delta,delta);vec3 L=normalize(delta);
  float E=lightI*max(dot(n,L),0.0)/(d2+0.35)*pointShadow(p,n,L,sqrt(d2));
  float tone=clamp(0.04+E,0.0,1.0);
  float u=id<0.5?p.z/0.05:faceU(p,n,20.0,0.0);
  // A lit dark-ground surface receives paper lines; a dark one remains ink.
  float coverage=engraveTone(u,1.0-tone);
  return mix(inkC,id>2.5?clayC:paperC,coverage);
}`;
class BootWorld {
  users=0;rig=new Rig();layer=new Layer2D();sparks=new SparkLines();
  scene=new THREE.Scene();cursorGeo=new THREE.BufferGeometry();cursorMat=new THREE.MeshBasicMaterial({toneMapped:false,side:THREE.DoubleSide});
  cursor:THREE.Mesh;
  rm=new RaymarchPass(SHADE,{
    boxC:{value:Array.from({length:32},()=>new THREE.Vector3())},boxH:{value:Array.from({length:32},()=>new THREE.Vector3())},
    boxID:{value:new Float32Array(32)},boxN:{value:0},
    paperC:{value:new THREE.Vector3(...lin('paper'))},inkC:{value:new THREE.Vector3(...lin('ink'))},clayC:{value:new THREE.Vector3(...lin('clay'))},
    lightPos:{value:new THREE.Vector3()},lightI:{value:1},
  });
  constructor(){
    // An AABB supplies the exact first possible hit of every SDF primitive.
    // Skip empty marching intervals, then refine against the same union SDF.
    // SS_TAP and the full-resolution four-tap main() remain the kit's version.
    const declarations='uniform vec3 boxC[32],boxH[32];uniform float boxID[32];uniform int boxN;';
    const shader=this.rm.pass.mat.fragmentShader.replace(declarations,'');
    const accelerated=/* glsl */`
vec3 render(vec2 px){
  vec3 rd=normalize(camF*focal+camR*px.x+camU*px.y),inv=1.0/(rd+vec3(1e-20));
  float travel=rd.y<0.0?-camPos.y/rd.y:1e9,id=0.0;int hit=-1;
  for(int i=0;i<32;i++){
    if(i>=boxN)break;vec3 a=(boxC[i]-boxH[i]-camPos)*inv,b=(boxC[i]+boxH[i]-camPos)*inv;
    vec3 mn=min(a,b),mx=max(a,b);float near=max(mn.x,max(mn.y,mn.z)),far=min(mx.x,min(mx.y,mx.z));
    if(far>=max(near,0.0)&&near>=0.0&&near<travel){travel=near;hit=i;id=boxID[i];}
  }
  if(travel>maxDist)return background(rd,px);
  // A short SDF refinement makes the acceleration valid for the union, not
  // just an independently painted list of boxes.
  float refined=travel;
  for(int i=0;i<2;i++){float mid;float d=map(camPos+rd*refined,mid);if(abs(d)<0.0001)break;refined+=d*0.9;}
  vec3 p=camPos+rd*refined,n=vec3(0,1,0);
  if(hit>=0){vec3 q=p-boxC[hit],d=abs(abs(q)-boxH[hit]);
    n=d.x<=d.y&&d.x<=d.z?vec3(sign(q.x),0,0):d.y<=d.z?vec3(0,sign(q.y),0):vec3(0,0,sign(q.z));}
  return shade(p,n,rd,id,refined);
}
`;
    this.rm.pass.mat.fragmentShader=shader.slice(0,shader.indexOf('vec3 render(vec2 px)'))+declarations+'\n'+accelerated+shader.slice(shader.indexOf('void main()'));
    this.cursorGeo.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(24),3));
    this.cursorGeo.setIndex([0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]);this.cursor=new THREE.Mesh(this.cursorGeo,this.cursorMat);this.cursor.frustumCulled=false;this.scene.add(this.cursor);}
  dispose(){this.rm.dispose();this.layer.texture.dispose();this.sparks.dispose();this.cursorGeo.dispose();this.cursorMat.dispose();}
}
let shared:BootWorld|undefined;
export default class S01Boot extends Scene {
  private w!:BootWorld;
  override init(){this.w=shared??=new BootWorld();this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();shared=undefined;}}
  override render(f:Frame,out:THREE.WebGLRenderTarget){
    const w=this.w,t=f.t,r=this.ctx.renderer,cam=cameraAt(t),boxes=worldBoxes(t);
    w.rig.set(cam);w.rm.setCam(cam);w.rm.u.boxN!.value=boxes.length;
    boxes.forEach((b,i)=>{w.rm.u.boxC!.value[i].set(b.c.x,b.c.y,b.c.z);w.rm.u.boxH!.value[i].set(b.h.x,b.h.y,b.h.z);w.rm.u.boxID!.value[i]=b.id;});
    const light=cursorCenter(t);w.rm.u.lightPos!.value.set(light.x,light.y,light.z);w.rm.u.lightI!.value=blink(t)*(1+3*flare(t));
    w.rm.render(r,out);
    const ps=cursorSolidPoints(t),attr=w.cursorGeo.getAttribute('position');ps.forEach((p,i)=>attr.setXYZ(i,p.x,p.y,p.z));attr.needsUpdate=true;
    w.cursorMat.color.setRGB(...lin('clay')).multiplyScalar(cursorGain(t));
    r.setRenderTarget(out);r.clearDepth();r.render(w.scene,w.rig.cam);
    w.layer.clear();const c=w.layer.ctx;w.sparks.begin(c,undefined,'ink');
    drawPathText(c,w.rig,lyricPath,line01Layout(),t,{mode:'stand',base:'paper',on:'ink',axes:(g,time)=>voice.form(g.word,time).axes,
      offset:(g,time)=>({alpha:lyricAlpha(pathAt(lyricPath,g.s+g.w/2),time)})});
    // Exact glyph births and an exact 0.12 s flight are not exposed by
    // sparkParticles. These one-per-letter arcs therefore use the same line batch.
    for(const g of line01Layout().glyphs){if(!/[\p{L}\p{N}]/u.test(g.ch))continue;const age=t-g.t0;if(age<0||age>=0.12)continue;
      const born=cursorAt(g.t0),p=pathAt(lyricPath,g.s),end=w.rig.proj(p.x,p.y,p.z);if(!end)continue;
      const at=(k:number)=>({x:born.x+(end.x-born.x)*k,y:born.y+(end.y-born.y)*k-100*4*k*(1-k)}),a=at(Math.max(0,(age-0.018)/0.12)),b=at(age/0.12);
      w.sparks.seg2(a.x,a.y,b.x,b.y,1.6,lin('clay'),1);
    }
    const frameEnd=afterBeats(audio,T.welcome,1.4);
    for(let seg=0;seg<4;seg++)heatTrail(w.sparks,t,tb=>{
      const k=Math.max(0,Math.min(1,(bootState(audio,tb,T).frame*FRAME_PATH.length-FRAME_PATH.starts[seg]!)/FRAME_PATH.edges[seg]!));
      const points=[[-4.8,0.62+4.79*k],[-4.8+9.6*k,5.41],[-4.8+9.6*k,0.62],[4.8,0.62+4.79*k]];
      const p=points[seg]!,q=w.rig.proj(p[0]!,p[1]!,0.18);return q?{x:q.x,y:q.y}:null;
    },{from:afterBeats(audio,T.welcome,1.4*FRAME_PATH.starts[seg]!/FRAME_PATH.length),to:afterBeats(audio,T.welcome,1.4*(FRAME_PATH.starts[seg]!+FRAME_PATH.edges[seg]!)/FRAME_PATH.length),width:1.5,cold:t>frameEnd+0.3});
    const cur=cursorAt(t);drawNote(c,{ax:cur.x,ay:cur.y,x:cur.x+80,y:cur.y-70,text:'pid 1031 · idle',t0:T.start,t1:T.welcome,on:'ink'},t);
    this.ctx.comp.draw(r,w.layer.upload(),out);w.sparks.finish(this.ctx,out);
    return {...POSTER_POST,hud:0};
  }
}
