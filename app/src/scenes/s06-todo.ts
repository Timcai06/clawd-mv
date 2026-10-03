// V6 — one plotter, one paper bed, one lowering directional light.
import * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D, clearRT } from '../engine/gl';
import { LineBatch } from '../engine/lines';
import { F,font } from '../engine/type';
import { lin,css } from '../theme';
import { engraveMaterial } from '../kit/engrave-mat';
import { SolidText } from '../kit/solidtype';
import { Rig,planeAffine } from '../kit/rig';
import { afterBeats,span } from '../kit/time';
import { heatColor } from '../kit/lyric-moves';
import { exitEnvelope } from '../kit/handoff';
import { resolveCTimes } from './parts/s06-timing';
import { setCamera } from './parts/s05-print';
import * as W from './parts/s06-world';
export const TYPE_LEVELS={giant:526,lyric:62,label:18};
class Plotter {
  users=0;T;scene=new THREE.Scene();rig=new Rig();layer=new Layer2D();
  lines=new LineBatch(5000,{screen2D:false,blend:'normal',depthTest:true});
  mat=engraveMaterial({ink:lin('ink'),paper:lin('paper')});
  clay=new THREE.MeshBasicMaterial({color:new THREE.Color(...lin('clay'))});
  light=new THREE.DirectionalLight(0xffffff,1);check:SolidText;
  beam:THREE.Mesh;carriage:THREE.Mesh;pen:THREE.Mesh;tip:THREE.Mesh;
  constructor(ctx:SceneCtx){
    this.T=resolveCTimes(ctx.audio,ctx.lyrics);this.scene.add(new THREE.AmbientLight(0xffffff,.12));
    this.light.castShadow=true;this.light.shadow.mapSize.set(1024,1024);Object.assign(this.light.shadow.camera,{left:-20,right:20,top:18,bottom:-18,near:.1,far:100});this.light.shadow.bias=-.0004;this.scene.add(this.light,this.light.target);
    const paper=new THREE.Mesh(new THREE.BoxGeometry(W.PAPER_W,.025,W.PAPER_D),this.mat);paper.position.y=-.013;paper.receiveShadow=true;this.scene.add(paper);
    const table=new THREE.Mesh(new THREE.BoxGeometry(24,.3,14),engraveMaterial({ink:lin('paper'),paper:lin('ink'),lightLines:true}));table.position.y=-.2;table.receiveShadow=true;this.scene.add(table);
    this.check=new SolidText('CHECK',{axes:{wdth:100,wght:900},capH:4.2,depth:.25,bevel:0,material:this.mat});this.check.group.rotation.x=-Math.PI/2;this.check.group.position.set(-this.check.width/2,.012,-2.6);this.scene.add(this.check.group);
    const box=(x:number,y:number,z:number)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(x,y,z),this.mat);m.castShadow=m.receiveShadow=true;this.scene.add(m);return m;};
    this.beam=box(21,.3,.4);this.carriage=box(.5,.5,.6);
    this.pen=new THREE.Mesh(new THREE.CylinderGeometry(.035,.025,.8,8),this.mat);this.pen.castShadow=true;this.scene.add(this.pen);
    this.tip=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),this.clay);this.scene.add(this.tip);
  }
  dispose(){this.check.dispose();this.lines.geo.dispose();this.lines.mat.dispose();this.layer.texture.dispose();this.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();if(o.material!==this.mat&&o.material!==this.clay&&!Array.isArray(o.material))o.material.dispose();}});this.mat.dispose();this.clay.dispose();this.light.dispose();}
}
let world:Plotter|undefined;
export default class S06Todo extends Scene {
  w!:Plotter;override init(){this.w=world??=new Plotter(this.ctx);this.w.users++;}override dispose(){if(--this.w.users===0){this.w.dispose();world=undefined;}}
  override render(f:Frame,out:THREE.WebGLRenderTarget){
    const w=this.w,T=w.T,a=this.ctx.audio,t=f.t,p=W.penAt(t,a,T);
    setCamera(w.rig,W.cameraAt(t,a,T));const L=W.checkLight(t,T).dir;w.light.position.set(L.x,L.y,L.z).multiplyScalar(35);
    w.beam.position.set(0,.9,p.z);w.carriage.position.set(p.x,.75,p.z);w.pen.position.set(p.x,p.y+.4,p.z);w.tip.position.set(p.x,p.y+.01,p.z);w.clay.color.setRGB(...lin('clay'),THREE.LinearSRGBColorSpace).multiplyScalar(exitEnvelope(t,T.keyboard).gain);
    // Tip radius is six logical pixels at every camera distance.
    const q=w.rig.proj(p.x,p.y,p.z);if(q)w.tip.scale.setScalar(6/q.s/.035);
    clearRT(this.ctx.renderer,out,lin('ink'));const r=this.ctx.renderer,shadow=r.shadowMap.enabled;r.shadowMap.enabled=true;r.setRenderTarget(out);r.clearDepth();r.render(w.scene,w.rig.cam);r.shadowMap.enabled=shadow;
    const lb=w.lines;lb.clear();
    const seg=(A:{x:number;y:number;z:number},B:typeof A,color:[number,number,number],width=2,alpha=1)=>lb.seg(A.x,A.y,A.z,B.x,B.y,B.z,width,...color,alpha);
    for(let k=0;k<3;k++){
      const [A,B]=W.rowLine(k),cool=k===0?1-span(t,T.todo,afterBeats(a,T.todo,.5)):0,ink=lin('ink'),clay=lin('clay'),color=ink.map((v,i)=>v+(clay[i]!-v)*cool) as [number,number,number];seg(A,B,color,k===0?3:1,.6);
      const z=A.z-.275,x=A.x-.7,pts=[{x,y:.007,z},{x:x+.55,y:.007,z},{x:x+.55,y:.007,z:z+.55},{x,y:.007,z:z+.55}];for(let j=0;j<4;j++){
        const P=pts[j]!,Q=pts[(j+1)%4]!,mid={x:(P.x+Q.x)/2,y:.007,z:(P.z+Q.z)/2},scale=w.rig.proj(mid.x,mid.y,mid.z)?.s??0;
        seg(P,Q,lin('ink'),.025*scale,.8);
      }
      if(t>=T.checks[k]!){const u=span(t,T.checks[k]!,afterBeats(a,T.checks[k]!,.27)),points=W.checkPoints(k),mid=W.checkPoint(k,u);seg(points[0]!,u<.35?mid:points[1]!,lin('clay'),4);if(u>=.35)seg(points[1]!,mid,lin('clay'),4);}
    }
    for(const writing of W.writings(T)){
      const {st,times,origin}=writing;
      // Each segment keeps its own birth time; cooling follows ink deposition, not row completion.
      for(let i=0;i<st.strokes.length;i++){
        const ci=st.charOf[i]!,[t0,t1]=times[ci]!,[lo,hi]=st.charRange[ci]!,len=t<=t0?lo:t>=t1?hi:lo+(hi-lo)*(t-t0)/(t1-t0);
        if(t<t0)continue;
        const points=st.strokes[i]!,L=st.lens[i]!,start=st.startLen[i]!;
        for(let j=1;j<points.length;j++){
          const rem=len-start-L[j-1]!;if(rem<=0)break;const u=Math.min(1,rem/Math.max(1e-8,L[j]!-L[j-1]!)),A=points[j-1]!,B=points[j]!;
          const born=t0+(start+L[j-1]!-lo)/Math.max(1e-8,hi-lo)*(t1-t0),age=t-born;
          const clay=Math.exp(-Math.max(0,age)/.28),ink=lin('ink'),hot=lin('clay'),color=ink.map((v,k)=>v+(hot[k]!-v)*clay) as [number,number,number];
          seg({x:origin.x+A.x,y:origin.y,z:origin.z+A.y},{x:origin.x+A.x+(B.x-A.x)*u,y:origin.y,z:origin.z+A.y+(B.y-A.y)*u},color,2.4);
        }
      }
    }
    lb.render(r,out,w.rig.cam);w.layer.clear();const c=w.layer.ctx,P={x:-2.4,y:.012,z:W.rowLine(2)[0].z-.08},aff=planeAffine(w.rig,P,{x:1,y:0,z:0},{x:0,y:0,z:1},.42/.7/100);
    if(aff){c.save();c.setTransform(aff.a,aff.b,aff.c,aff.d,aff.e,aff.f);c.font=font(F.mono(),100);c.fillStyle=css('ink',.6);c.fillText('Fix October',0,0);c.restore();}
    this.ctx.comp.draw(r,w.layer.upload(),out);return {hud:0,frame:0,bloom:.18,grain:.02,exposure:1+(exitEnvelope(t,T.keyboard).gain-1)*.04};
  }
}
