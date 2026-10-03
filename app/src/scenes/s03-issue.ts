// V6 S03: paper displacement, printed path type, a physical stamp and calendar dive.
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, SCALE, clearRT } from '../engine/gl';
import { GLSL_COMMON } from '../engine/glsl/common';
import { drawStrokeText } from '../engine/stroke';
import { clamp, noise1 } from '../engine/util';
import { css, lin, POSTER_POST } from '../theme';
import { Rig, orbitCam, p3 } from '../kit/rig';
import { engraveMaterial } from '../kit/engrave-mat';
import { SolidText } from '../kit/solidtype';
import { drawPathText } from '../kit/pathtext';
import { stamp as printStamp } from '../kit/lyric-moves';
import { SparkLines, sparkParticles } from '../kit/spark';
import { drawAffine } from './parts/s01-print';
import { drawForm, drawCalendar, FORM } from './parts/s03-form';
import { T, lyrics, voice } from './parts/s01-timing';
import { S03_GLSL, PAPER, CAL, STAMP, KEY, cameraAt, paperShift, paperNormal, paperY, paperLight, press,
  titleLayouts, notesLayout, textPath, calendarFit, calendarNumbers, circleStroke, stampPose, cursorAt,
  writeHeadWorld, incomingScreenAffines, gain, KEY_INTENSITY } from './parts/s03-world';
export { cursorAt } from './parts/s03-world';
export const TYPE_LEVELS={giant:315.6,lyric:50.8,label:20};
const VERT=/* glsl */`
precision highp float;in vec3 position;in vec2 uv;
uniform mat4 modelViewMatrix,projectionMatrix;uniform float slide;
out vec2 vUv;out vec3 vWorld;
${S03_GLSL}
void main(){vec3 p=position;p.y=paperY(p.x,p.z);vUv=uv;vWorld=p;p.x+=slide;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1);}
`;
const ENGRAVE=/* glsl */`
float engraveTone(float u,float tone){float dark=clamp(1.0-tone,0.0,1.0);return max(hatch(u,pow(dark,1.25)*0.95),hatch(u+0.5,clamp(dark*1.8-1.15,0.0,1.0)));}
`;
const FRAG=/* glsl */`
precision highp float;in vec2 vUv;in vec3 vWorld;out vec4 fragColor;
${GLSL_COMMON}
${S03_GLSL}
${ENGRAVE}
uniform sampler2D printMap;uniform vec3 keyL,paperC,inkC;
void main(){
  vec3 n=paperNormal(vWorld.x,vWorld.z);
  float light=clamp(0.18+${KEY_INTENSITY}*max(dot(n,keyL),0.0),0.0,1.0);
  vec3 printC=texture(printMap,vUv).rgb;
  vec3 base=printC*(0.6+0.4*light);
  float lines=engraveTone(vWorld.z/0.035,light);
  fragColor=vec4(mix(base,inkC,lines),1.0);
}`;
const TABLE_VERT=/* glsl */`
precision highp float;in vec3 position;uniform mat4 modelViewMatrix,projectionMatrix;out vec3 vWorld;
void main(){vWorld=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}
`;
const TABLE_FRAG=/* glsl */`
precision highp float;in vec3 vWorld;out vec4 fragColor;
${GLSL_COMMON}
${S03_GLSL}
${ENGRAVE}
uniform float slide;uniform vec3 keyL,inkC,paperC;
float heightShadow(vec3 p){
  float shadow=1.0;
  for(int i=1;i<=16;i++){
    vec3 q=p+keyL*(float(i)*0.12);float x=q.x-slide;
    if(x<PAPER.x||x>PAPER.x+PAPER.z||q.z<PAPER.y||q.z>PAPER.y+PAPER.w)continue;
    shadow=min(shadow,smoothstep(-0.01,0.06,q.y-paperY(x,q.z)));
  }return shadow;
}
void main(){float light=0.18+${KEY_INTENSITY}*max(keyL.y,0.0)*heightShadow(vWorld);
  float line=engraveTone(vWorld.z/0.05,1.0-clamp(light,0.0,1.0));
  fragColor=vec4(mix(inkC,paperC,line*0.045),1.0);
}`;
function paperGeometry(x:number,z:number,w:number,h:number,nx:number,ny:number){
  const g=new THREE.PlaneGeometry(w,h,nx,ny);g.rotateX(-Math.PI/2);g.translate(x+w/2,0,z+h/2);return g;
}
export function stampBodyGeometry(){
  const s=new THREE.Shape(),w=STAMP.w/2-0.03,h=STAMP.h/2-0.03,r=STAMP.r;
  s.moveTo(-w+r,-h);s.lineTo(w-r,-h);s.quadraticCurveTo(w,-h,w,-h+r);s.lineTo(w,h-r);s.quadraticCurveTo(w,h,w-r,h);
  s.lineTo(-w+r,h);s.quadraticCurveTo(-w,h,-w,h-r);s.lineTo(-w,-h+r);s.quadraticCurveTo(-w,-h,-w+r,-h);
  const g=new THREE.ExtrudeGeometry(s,{depth:STAMP.depth-0.06,bevelEnabled:true,bevelSize:0.03,bevelThickness:0.03,bevelSegments:2,curveSegments:5});g.translate(0,0,0.03);return g;
}
class IssueWorld {
  users=0;rig=new Rig();printRig=new Rig();scene=new THREE.Scene();
  paperPrint=new Layer2D(FORM.w,FORM.h);calendarPrint=new Layer2D(CAL.w*100,CAL.h*100);
  stampPrint=new Layer2D(1100,600);overlay=new Layer2D();sparks=new SparkLines();
  uniforms={paperPress:{value:0},slide:{value:0},keyL:{value:new THREE.Vector3(KEY.x,KEY.y,KEY.z).normalize()},
    paperC:{value:new THREE.Vector3(...lin('paper'))},inkC:{value:new THREE.Vector3(...lin('ink'))}};
  material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:VERT,fragmentShader:FRAG,
    uniforms:{...this.uniforms,printMap:{value:this.paperPrint.texture}},side:THREE.DoubleSide});
  calendarMat=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:VERT,fragmentShader:FRAG,
    uniforms:{...this.uniforms,printMap:{value:this.calendarPrint.texture}},side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  tableMat=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,vertexShader:TABLE_VERT,fragmentShader:TABLE_FRAG,uniforms:this.uniforms});
  paper=new THREE.Mesh(paperGeometry(PAPER.x0,PAPER.z0,PAPER.w,PAPER.h,480,270),this.material);
  attachment=new THREE.Mesh(paperGeometry(CAL.x,CAL.z,CAL.w,CAL.h,140,100),this.calendarMat);
  table=new THREE.Mesh(paperGeometry(-80,-60,160,120,1,1),this.tableMat);
  stampGroup=new THREE.Group();stampMat=engraveMaterial({ink:lin('ink'),paper:lin('paper'),faceAngles:true,pitch:4});
  stampBody=new THREE.Mesh(stampBodyGeometry(),this.stampMat);
  stampType=new SolidText('BUG',{capH:2.25,axes:{wdth:100,wght:900},depth:0.08,bevel:0.008,material:this.stampMat});
  key=new THREE.DirectionalLight(new THREE.Color().setRGB(...lin('paper')),0.7);
  cursor=new THREE.Mesh(new THREE.BoxGeometry(0.07,0.16,0.06),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(...lin('clay')),toneMapped:false}));
  constructor(){
    for(const layer of [this.paperPrint,this.calendarPrint]){layer.texture.generateMipmaps=true;layer.texture.minFilter=THREE.LinearMipmapLinearFilter;layer.texture.anisotropy=8;}
    // The printable carrier is the xz paper itself. A distant top-down Rig
    // converts its metres to the texture's 100 px/m (not the movie viewport).
    const focal=540/Math.tan(0.02*Math.PI/360);
    this.printRig.set(orbitCam(p3(10.2,0,5.97),0,Math.PI/2,focal/100,0.02));
    this.scene.add(this.table,this.paper,this.attachment,this.stampGroup,this.key,this.key.target,new THREE.AmbientLight(new THREE.Color().setRGB(...lin('paper')),0.18),this.cursor);
    this.stampGroup.add(this.stampBody,this.stampType.group);
    this.stampType.group.position.set(this.stampType.width/2,1.125,-0.005);this.stampType.group.rotation.y=Math.PI;
    this.stampGroup.quaternion.setFromAxisAngle(new THREE.Vector3(0,1,0),-STAMP.angle).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
    this.key.position.set(-8,7,-1);this.key.target.position.set(8,0,5);
    const cv=this.stampPrint.ctx;cv.translate(550,300);
    // Render the already cooled worn-rubber impression once; its time controls
    // attachment to the paper, not an animation-state accumulator.
    printStamp(cv,'BUG',0,0,330,{t:T.bug+1,at:T.bug,rot:0,color:'clay',axes:{wdth:100,wght:900},seed:303});
  }
  dispose(){for(const m of [this.material,this.calendarMat,this.tableMat,this.stampMat,this.cursor.material])m.dispose();
    for(const mesh of [this.paper,this.attachment,this.table,this.stampBody,this.cursor])mesh.geometry.dispose();
    this.stampType.dispose();for(const l of [this.paperPrint,this.calendarPrint,this.stampPrint,this.overlay])l.texture.dispose();this.sparks.dispose();}
}
let shared:IssueWorld|undefined;
export default class S03Issue extends Scene {
  private w!:IssueWorld;
  override init(){this.w=shared??=new IssueWorld();this.w.users++;}
  override dispose(){if(--this.w.users===0){this.w.dispose();shared=undefined;}}
  override render(f:Frame,out:THREE.WebGLRenderTarget){
    const w=this.w,t=f.t,r=this.ctx.renderer;w.rig.set(cameraAt(t));w.uniforms.paperPress.value=press(t);w.uniforms.slide.value=paperShift(t);
    const c=w.paperPrint.ctx;w.paperPrint.clear();c.save();c.translate(-FORM.x,-FORM.y);drawForm(c,FORM);
    const lays=titleLayouts();for(const [i,row] of (['got','report'] as const).entries()){
      drawPathText(c,w.printRig,textPath(row,t,false),lays[i]!,t,{mode:'lie',normal:s=>paperNormal(0.85+s,row==='got'?4.806:8.156,t),
        base:'ink',on:'paper',pop:0,axes:(g,time)=>voice.form(g.word,time).axes,
        offset:(g,time)=>({scale:1-0.08*(1-clamp((time-g.t0)/0.05))})});
    }
    drawPathText(c,w.printRig,textPath('notes',t,false),notesLayout(),t,{mode:'lie',normal:s=>paperNormal(4.2+s,9.72,t),
      base:'ink',on:'paper',pop:0,axes:(g,time)=>voice.form(g.word,time).axes,offset:(g,time)=>({scale:1-0.08*(1-clamp((time-g.t0)/0.05))})});
    const pose=stampPose(t);if(pose.ink){c.save();c.translate(STAMP.x*100,STAMP.z*100);c.rotate(STAMP.angle);
      c.drawImage(w.stampPrint.canvas,0,0,w.stampPrint.canvas.width,w.stampPrint.canvas.height,-STAMP.w*50,-STAMP.h*50,STAMP.w*100,STAMP.h*100);c.restore();}
    c.restore();w.paperPrint.upload();
    const cc=w.calendarPrint.ctx;w.calendarPrint.clear();cc.fillStyle=css('paper');cc.fillRect(0,0,CAL.w*100,CAL.h*100);
    drawCalendar(cc,{x:0,y:0,w:CAL.w*100,h:CAL.h*100},{header:calendarFit().header*100,numbersAlpha:calendarNumbers(t),circle:false,gain:gain(t)});
    const st=circleStroke(),progress=clamp((t-lyrics.lines[1]!.words[5]!.start)/(lyrics.lines[1]!.words[6]!.start-lyrics.lines[1]!.words[5]!.start));
    cc.save();cc.translate(-CAL.x*100,-CAL.z*100);cc.strokeStyle=css('clay');cc.lineWidth=4;drawStrokeText(cc,st,st.total*progress);cc.restore();w.calendarPrint.upload();
    w.stampGroup.visible=pose.visible;w.stampGroup.position.set(pose.x,pose.y,pose.z);
    w.stampType.group.visible=t>=T.bug;
    const head=writeHeadWorld(t);w.cursor.position.set(head.x,head.y+0.08,head.z);w.cursor.visible=t<T.end-0.1;
    clearRT(r,out,lin('ink'));r.render(w.scene,w.rig.cam);
    w.overlay.clear();const oc=w.overlay.ctx;w.sparks.begin(oc,undefined,'paper');
    const carry=lyrics.lines[0]!.words[6]!,aff=incomingScreenAffines(t);
    aff.forEach((g,i)=>{const times=voice.form(carry,t);const births=carry.start+Math.min((carry.end-carry.start)*0.8,0.7)*i/6;
      if(t<births)return;drawAffine(oc,g,times.axes,t-births,'paper');});
    // Six printed sparks per letter; birth is local to that letter, never the
    // global random-particle clock. They attach to the current paper geometry.
    const all=[...titleLayouts().flatMap(l=>l.glyphs),...notesLayout().glyphs];
    for(const g of all){if(!/[\p{L}\p{N}]/u.test(g.ch))continue;const age=t-g.t0;if(age<0||age>0.18)continue;
      const born=writeHeadWorld(g.t0),q=w.rig.proj(born.x-paperShift(g.t0)+paperShift(t),paperY(born.x-paperShift(g.t0),born.z,t),born.z);if(!q)continue;sparkParticles(w.sparks,age,b=>b>=0&&b<0.006?q:null,{rate:1000,life:0.18,speed:70,gravity:220,seed:300+g.word.gi*31+g.i,on:'paper',width:1.2});}
    this.ctx.comp.draw(r,w.overlay.upload(),out);
    const shake=t>=T.bug&&t<T.end-0.1?9*Math.exp(-(t-T.bug)/0.10):0;
    return {...POSTER_POST,hud:0,shake:[noise1(t*79,31)*shake,noise1(t*97,32)*shake] as [number,number]};
  }
}
