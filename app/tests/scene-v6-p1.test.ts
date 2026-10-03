import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import { Rig, p3 } from '../src/kit/rig';
import { VoxelClawd } from '../src/kit/clawd3d';
import * as Clawd from '../src/kit/clawd';
import * as S05 from '../src/scenes/parts/s05-world';
import * as S08 from '../src/scenes/parts/s08-world';
import * as S13 from '../src/scenes/parts/s13-world';
import * as L13 from '../src/scenes/parts/s13-layout';
import { chorusScore } from '../src/scenes/parts/s13-score';
import { pathAt, drawPathText } from '../src/kit/pathtext';
import { SolidText } from '../src/kit/solidtype';
import { afterBeats } from '../src/kit/time';
import { platformTimes } from '../src/scenes/parts/s05-platform-model';
import { writeFileSync as writeEvidence } from 'node:fs';
import { FakeCanvas, withCanvas } from './kit-pathtext.test';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import a from '../../data/audio.json';
import l from '../../data/lyrics.json';

const audio=new AudioData(a),lyrics=new Lyrics(l),voice=new Voice(lyrics,audio);
const score=chorusScore(audio,lyrics),plans=L13.lyricPlans(score,voice);

const evidenceDir=new URL('../../out/v6-p1/',import.meta.url);
mkdirSync(evidenceDir,{recursive:true});

test('P1 S05 caps at the crack/claws midpoints are 60–90px and fit the drawer',()=>{
  const words=lyrics.get('crack my claws').words,T=platformTimes(audio,lyrics),records=[];
  for(const [row,word] of [words[2]!,words[4]!].entries()){
    const t=(word.start+word.end)/2,rig=S05.rigAt(t,audio,lyrics),layout=S05.leadLayouts(lyrics,audio)[row]!;
    const path=S05.leadPath(t,audio,T,row),p=path.pts[0]!,cap=Math.min(90,rig.proj(p.x,p.y,p.z)!.s*layout.capH);
    const drawer=S05.drawerBox(0,t,audio,T);
    records.push({word:word.w,t,cap,width:layout.s1,drawerWidth:drawer.hi.x-drawer.lo.x});
    expect(cap).toBeGreaterThanOrEqual(60);expect(cap).toBeLessThanOrEqual(90);
    expect(layout.s1).toBeLessThanOrEqual(drawer.hi.x-drawer.lo.x);
    expect(S05.cameraAt(t,audio,lyrics)).toEqual(S05.cameraAt(t,audio,lyrics));
  }
  writeEvidence(new URL('s05-projections.json',evidenceDir),JSON.stringify(records,null,2));
});

test('P1 C actor upper-half intersection is at most 6 percent at 60Hz',()=>{
  const vox=new VoxelClawd(),records=[];
  for(let f=0;score.fixes+f/60<score.tests;f++){
    const t=score.fixes+f/60,rig=new Rig();rig.set(S13.cameraAt(audio,t,score));const at=S13.clawdAt(audio,t,score,rig);
    vox.update(Clawd.pose('A4',{beat:audio.beatAt(t),beat0:audio.beatAt(score.start),p:0}));
    vox.mesh.rotation.y=S13.clawdYaw(audio,t,score);vox.mesh.scale.setScalar(S13.CLAWD_VOX);vox.mesh.position.set(at.x,at.y,at.z);vox.mesh.updateMatrixWorld(true);
    const points=[];
    for(let i=0;i<vox.mesh.count;i++){
      const m=new THREE.Matrix4();vox.mesh.getMatrixAt(i,m);m.premultiply(vox.mesh.matrixWorld);
      for(const x of [-.5,.5])for(const y of [-.5,.5])for(const z of [-.5,.5])points.push(new THREE.Vector3(x,y,z).applyMatrix4(m));
    }
    const box=L13.projectedBox(rig,points),width=Math.max(0,Math.min(1920,box.x+box.w)-Math.max(0,box.x)),
      height=Math.max(0,Math.min(540,box.y+box.h)-Math.max(0,box.y));
    records.push({t,box,fraction:width*height/(1920*1080)});
  }
  vox.dispose();writeEvidence(new URL('s13-actor.json',evidenceDir),JSON.stringify(records,null,2));
  for(const r of records)expect(r.fraction,String(r.t)).toBeLessThanOrEqual(.06);
});

test('P1 F whole-word ink bounds enclose every letter within the 48px inset at 60Hz',()=>withCanvas(()=>{
  const records=[];
  for(let f=0;score.lines[4]!.words[0]!.start+f/60<score.end;f++){
    const t=score.lines[4]!.words[0]!.start+f/60;
    const boxes=L13.lyricInkBoxes(audio,t,score,voice,plans,new FakeCanvas().ctx,{x:960,y:540}).filter(b=>b.carrier==='ci'||b.carrier==='local');
    records.push({t,boxes});
  }
  writeEvidence(new URL('s13-walls.json',evidenceDir),JSON.stringify(records,null,2));
  for(const r of records)for(const b of r.boxes){
    expect(b.box.x,`${r.t} ${b.word.w}`).toBeGreaterThanOrEqual(48);
    expect(b.box.y).toBeGreaterThanOrEqual(48);expect(b.box.x+b.box.w).toBeLessThanOrEqual(1872);expect(b.box.y+b.box.h).toBeLessThanOrEqual(1032);
  }
}));

test('P1 second I: every actual block vertex stays beyond near + 0.5 for all 31 frames',()=>{
  const world=S08.printingWorld(audio,lyrics),mat=new THREE.MeshBasicMaterial(),records=[];
  const solids=world.events.map(e=>({e,solid:new SolidText(e.text,{capH:e.capH,axes:e.axes,depth:e.capH*.5,bevel:0,curveSegments:4,material:mat})}));
  for(let f=0;f<=30;f++){
    const t=35.2+f/60,cam=S08.cameraAt(t,world),rig=new Rig();rig.set(cam);
    for(const {e,solid} of solids){
      const p=S08.pressAt(e,t,world);if(!p.visible)continue;
      const at=S08.onPaper(p3(p.x,p.y,p.z),t,world);solid.group.position.set(at.x,at.y,at.z);
      solid.group.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),S08.screenTilt(t,world.T))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),e.rot))
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0),-Math.PI/2));
      solid.letters.forEach(g=>solid.setLetter(g.i,{d:p3(e.baselineX,-e.baselineZ,0)}));
      const points=solid.letters.flatMap(g=>{g.mesh.updateWorldMatrix(true,false);const a=g.mesh.geometry.getAttribute('position');
        return Array.from({length:a.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(g.mesh.matrixWorld));});
      const depth=S08.minimumViewDepth(points,cam),box=S08.projectedBox(points,cam);
      records.push({t,text:e.text,sung:t>=e.word.start,depth,near:rig.cam.near,box});
    }
  }
  solids.forEach(s=>s.solid.dispose());mat.dispose();
  writeEvidence(new URL('../../out/v6-p1/s08-projections.json',import.meta.url),JSON.stringify(records,null,2));
  for(const r of records){
    expect(r.depth,`${r.t} ${r.text}`).toBeGreaterThanOrEqual(.55-1e-8);
    if(!r.sung)continue;
    expect(r.box.h,`${r.t} ${r.text}`).toBeLessThanOrEqual(756);
    expect(r.box.x).toBeGreaterThanOrEqual(0);expect(r.box.x+r.box.w).toBeLessThanOrEqual(1920);
    expect(r.box.y).toBeGreaterThanOrEqual(0);expect(r.box.y+r.box.h).toBeLessThanOrEqual(1080);
  }
});

test('P1 D rows never overlap at 0.1s sampling and baseline distance exceeds 1.4 caps',()=>withCanvas(()=>{
  const records=[];
  for(let i=0;score.tests+i/10<score.pickup2;i++){
    const t=score.tests+i/10,rig=new Rig();rig.set(S13.cameraAt(audio,t,score));
    const paths=plans.paths.filter(p=>p.kind==='tests');
    const centers=paths.map(p=>pathAt(L13.pathFor(audio,t,p,score,rig),p.layout.s1/2)),qs=centers.map(p=>rig.proj(p.x,p.y,p.z)!);
    const ratio=Math.abs(qs[0]!.y-qs[1]!.y)/(.7*Math.max(qs[0]!.s,qs[1]!.s));
    const boxes=L13.lyricInkBoxes(audio,t,score,voice,plans,new FakeCanvas().ctx,{x:960,y:540}).filter(b=>b.carrier==='tests');
    const overlaps=boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>a.word.gi!==b.word.gi&&a.box.x<b.box.x+b.box.w&&a.box.x+a.box.w>b.box.x&&a.box.y<b.box.y+b.box.h&&a.box.y+a.box.h>b.box.y).map(b=>[a.word.w,b.word.w]));
    records.push({t,ratio,boxes,overlaps});
  }
  writeEvidence(new URL('../../out/v6-p1/s13-rows.json',import.meta.url),JSON.stringify(records,null,2));
  for(const r of records){expect(r.ratio,String(r.t)).toBeGreaterThanOrEqual(1.4);expect(r.overlaps,String(r.t)).toEqual([]);}
}));

if(!process.env.P1_CPU_ONLY)test('P1 rendered RGBA measurements',async()=>{
  const server=Bun.spawn(['bunx','vite','--port','5398','--strictPort'],{cwd:new URL('..',import.meta.url).pathname,stdout:'ignore',stderr:'ignore',env:{...process.env,CLAWD_NO_HMR:'1'}});
  try{
    for(let i=0;i<100;i++){try{if((await fetch('http://localhost:5398')).ok)break;}catch{}await Bun.sleep(50);}
    const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-angle=metal','--ignore-gpu-blocklist']});
    try{
      const page=await browser.newPage(),errors:string[]=[],resources:unknown[]=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'){if(m.text().includes('404'))resources.push({text:m.text(),location:m.location()});else errors.push(m.text());}});
      page.on('response',r=>{if(r.status()>=400)resources.push({url:r.url(),status:r.status()});});
      await page.goto('http://localhost:5398/?export=1');await page.waitForFunction(()=>(window as any).__clawd?.ready,null,{timeout:120000});
      const facts=await page.evaluate(async({a,l})=>{
        const P=(window as any).__clawd;
        const [au,ly,vm,rigmod,s5,w5,s12,w12,l12,s13,sw,release,s18,p18,score18,pt,solid,three,theme]=await Promise.all([
          import('/src/engine/audio.ts'),import('/src/engine/lyrics.ts'),import('/src/kit/lyric-moves.ts'),import('/src/kit/rig.ts'),
          import('/src/scenes/s05-platform.ts'),import('/src/scenes/parts/s05-world.ts'),import('/src/scenes/s12-rerun.ts'),
          import('/src/scenes/parts/s12-world.ts'),import('/src/scenes/parts/s12-layout.ts'),import('/src/scenes/s13-gitfall.ts'),
          import('/src/scenes/parts/s17-swarm.ts'),import('/src/scenes/parts/s17-release-state.ts'),import('/src/scenes/parts/s18-world.ts'),
          import('/src/scenes/parts/s18-print.ts'),import('/src/scenes/parts/s18-score.ts'),import('/src/kit/pathtext.ts'),import('/src/kit/solidtype.ts'),import('/node_modules/.vite/deps/three.js'),import('/src/theme.ts')]);
        const audio=new au.AudioData(a),lyrics=new ly.Lyrics(l),voice=new vm.Voice(lyrics,audio);
        const canvas=()=>{const c=document.createElement('canvas');c.width=1920;c.height=1080;return c;};
        const cv=canvas(),c=cv.getContext('2d',{willReadFrequently:true})!,mask=canvas(),mc=mask.getContext('2d',{willReadFrequently:true})!;
        const read=async(t:number)=>{P.still(t);const im=new Image();im.src='data:image/png;base64,'+await P.png();await im.decode();c.clearRect(0,0,1920,1080);c.drawImage(im,0,0);return c.getImageData(0,0,1920,1080).data;};
        const lum=(p:Uint8ClampedArray,i:number)=>(p[i]!*0.2126+p[i+1]!*0.7152+p[i+2]!*0.0722)/255;
        const white=new Proxy(mc,{set(target,key,value){Reflect.set(target,key,key==='fillStyle'?'white':value,target);return true;},get(target,key){const v=Reflect.get(target,key,target);return typeof v==='function'?v.bind(target):v;}});
        const maskAlpha=()=>{const p=mc.getImageData(0,0,1920,1080).data;return Uint8Array.from({length:1920*1080},(_,i)=>p[i*4+3]!>240?1:0);};
        // Exact square erosion/dilation via a summed-area table, in logical pixels.
        const morphology=(m:Uint8Array,r:number,erode=false)=>{
          const integral=new Int32Array(1921*1081),out=new Uint8Array(m.length);
          for(let y=0;y<1080;y++){let sum=0;for(let x=0;x<1920;x++){sum+=m[y*1920+x]!;integral[(y+1)*1921+x+1]=integral[y*1921+x+1]!+sum;}}
          for(let y=0;y<1080;y++)for(let x=0;x<1920;x++){
            const x0=Math.max(0,x-r),x1=Math.min(1920,x+r+1),y0=Math.max(0,y-r),y1=Math.min(1080,y+r+1);
            const sum=integral[y1*1921+x1]!-integral[y0*1921+x1]!-integral[y1*1921+x0]!+integral[y0*1921+x0]!;
            out[y*1920+x]=erode?+(sum===(2*r+1)**2):+(sum>0);
          }return out;
        };
        const statistics=(p:Uint8ClampedArray,m:Uint8Array)=>{
          const interior=morphology(m,2,true),outer=morphology(m,6);let n=0,s=0,rn=0,rs=0,mn=0,ms=0;
          for(let i=0;i<m.length;i++){if(m[i]){mn++;ms+=lum(p,i*4);}if(interior[i]){n++;s+=lum(p,i*4);}if(outer[i]&&!m[i]){rn++;rs+=lum(p,i*4);}}
          return {maskPixels:mn,maskMean:ms/mn,interiorPixels:n,inside:s/n,ringPixels:rn,ring:rs/rn,contrast:Math.abs(s/n-rs/rn)};
        };
        const result:any={s05:[],s12:{},s13:[],s17:[],s17Framing:[],s17Devices:[],s18:{},errors:P.errors};
        for(const t of [14.4,15.5]){
          const p=await read(t);mc.clearRect(0,0,1920,1080);s5.drawLeadText(mc,w5.rigAt(t,audio,lyrics),t,audio,lyrics,undefined,true);
          result.s05.push({t,...statistics(p,maskAlpha())});
        }
        const t12=await import('/src/scenes/s09-z-shared.ts');const T12=t12.resolveX9Times({audio,lyrics});
        {
          const p=await read(66.1),rig=new rigmod.Rig();rig.set(w12.cameraAt(voice,66.1,T12));
          mc.clearRect(0,0,1920,1080);const ly=l12.countLyrics(voice);
          pt.drawPathText(white,rig,ly.path,ly.layout,66.1,{mode:'stand',base:'ink',on:'paper',pop:0,minPx:50,maxPx:110,axes:(g:any,t:number)=>voice.form(g.word,t).axes});
          result.s12.text=statistics(p,maskAlpha());
          // Rasterize actual extrusion triangles, with CPU transforms, to define number ink.
          mc.clearRect(0,0,1920,1080);const mat=new three.MeshBasicMaterial();
          for(let k=0;k<10;k++){
            const pose=w12.numberAt(voice,k,66.1),text=new solid.SolidText(String(k+1),{capH:pose.capH,axes:pose.axes,depth:.2,bevel:.015,material:mat});
            text.group.position.set(pose.x,pose.y,pose.z);text.group.rotation.x=pose.rx;text.group.updateMatrixWorld(true);
            for(const g of text.letters){g.mesh.updateWorldMatrix(true,false);const v=g.mesh.geometry.getAttribute('position');
              for(let i=0;i<v.count;i+=3){const ps=[0,1,2].map(j=>{const p=new three.Vector3().fromBufferAttribute(v,i+j).applyMatrix4(g.mesh.matrixWorld);return rig.proj(p.x,p.y,p.z);});
                if(ps.every(Boolean)){mc.beginPath();ps.forEach((p:any,j:number)=>j?mc.lineTo(p.x,p.y):mc.moveTo(p.x,p.y));mc.closePath();mc.fillStyle='white';mc.fill();}}
            }text.dispose();
          }mat.dispose();result.s12.numbers=statistics(p,maskAlpha());
        }
        for(const t of Array.from({length:6},(_,i)=>T12.end-.1+(i+.01)/60)){
          const p=await read(t);let n=0,sum=[0,0,0];
          for(let y=0;y<1080;y++)for(let x=Math.ceil(1010-250*y/1080+21);x<1920;x++){const i=(y*1920+x)*4;n++;sum=sum.map((v,j)=>v+p[i+j]!/255);}
          const rgb=sum.map(v=>v/n);result.s12['right'+t]={rgb,error:Math.max(...rgb.map((v,i)=>Math.abs(v-[27,42,74][i]!/255)))};
        }
        for(const t of [71.6,72.5]){
          const p=await read(t),raw=s13.pixelMask(P.engine.renderer,'fix-text'),buf=raw.pixels,hit=raw.transform;
          // Apply the exact final post translation/zoom to the technical mask.
          const tmp=canvas(),tc=tmp.getContext('2d')!,im=tc.createImageData(1920,1080);
          for(let y=0;y<1080;y++)for(let x=0;x<1920;x++){const i=(y*1920+x)*4,j=((1079-y)*1920+x)*4;im.data[i]=im.data[i+1]=im.data[i+2]=255;im.data[i+3]=buf[j]!;}
          tc.putImageData(im,0,0);mc.clearRect(0,0,1920,1080);mc.save();const z=1+hit.zoom;mc.translate(960+hit.shake[0]*z,540-hit.shake[1]*z);mc.scale(z,z);mc.drawImage(tmp,-960,-540);mc.restore();
          result.s13.push({t,...statistics(p,maskAlpha())});
        }
        const R=release.resolveReleaseTimes(audio,lyrics),swarm=sw.buildSwarm(sw.makeRasters());sw.configureFraming(swarm,R);
        const hardware=new sw.SwarmMesh(),matrix=new three.Matrix4();
        for(let frame=0;frame<4;frame++){
          const t=R.hit+(frame+.5)/60,ds=sw.devicesAt(swarm,audio,lyrics,t,R),cam=sw.cameraAt(audio,lyrics,t,R);
          hardware.update(ds,cam,ds.length,sw.paletteFlipped(t,R));let dark=0,hidden=0,lit=0,shown=0;
          for(let i=0;i<ds.length;i++){
            hardware.body.getMatrixAt(i,matrix);const body=matrix.determinant();hardware.screens.getMatrixAt(i,matrix);const screen=matrix.determinant();
            if(ds[i].lit===0){dark++;if(body===0&&screen===0)hidden++;}else{lit++;if(body>0&&screen>0)shown++;}
          }result.s17Devices.push({t,dark,hidden,lit,shown});
        }hardware.dispose();
        const beat=await import('/src/kit/time.ts'),me=lyrics.get('Then you wrote, “Looks good to me”').words[6];
        for(let t=beat.afterBeats(audio,R.release[4].start,1);t<R.release[5].start;t+=1/60){
          const cam=sw.cameraAt(audio,lyrics,t,R),tilt=-.1*Math.min(1,Math.max(0,(t-me.start)/(me.end-me.start)));
          result.s17Framing.push({t,check:sw.deviceBounds(sw.formation(swarm,'CHECK').filter((d:any)=>d.lit),cam),comment:sw.commentBounds(cam,tilt)});
        }
        for(const t of [115.89,116.3]){
          const p=await read(t),cam=sw.cameraAt(audio,lyrics,t,R),ds=sw.formation(swarm,'COMMIT'),rig=new rigmod.Rig();rig.set(cam);
          const vt=await import('/src/kit/vartype.ts'),run=vt.varRun('COMMIT',100,{wdth:100,wght:900}),k=Math.min(94/run.width,18/run.capH),left=(96-run.width*k)/2;
          const post=sw.impactAt(t,R),hit=(q:any)=>({x:(q.x-960+post.shake[0])*post.zoom+960,y:(q.y-540-post.shake[1])*post.zoom+540});
          const letters=[];
          for(const g of run.glyphs.slice(1,5)){
            const x0=left+g.x*k,x1=x0+g.adv*k;mc.clearRect(0,0,1920,1080);
            for(const d of ds){if(!d.lit||d.pixel<0||d.pixel%96<x0||d.pixel%96>=x1)continue;
              const ps=[[-.43,-.41],[.43,-.41],[.43,.41],[-.43,.41]].map(([x,y])=>{const q=sw.devicePoint(rigmod.p3(x,y,.501),d,rigmod.p3(d.w,d.h,d.d),d.yaw);return hit(rig.proj(q.x,q.y,q.z));});
              mc.beginPath();ps.forEach((q:any,i:number)=>i?mc.lineTo(q.x,q.y):mc.moveTo(q.x,q.y));mc.closePath();mc.fillStyle='white';mc.fill();
            }
            const roi=morphology(maskAlpha(),1,true);let n=0,bright=0;for(let i=0;i<roi.length;i++)if(roi[i]){n++;if(lum(p,i*4)>.35)bright++;}
            letters.push({letter:g.ch,pixels:n,brightFraction:bright/n});
          }result.s17.push({t,letters});
        }
        {
          const t=157,p=await read(t),T=score18.resolveOutroTimes(audio,lyrics),rig=new rigmod.Rig();rig.set(s18.cameraAt(audio,t,T));
          const boxes=p18.creditInkBoxes(mc,rig,audio,t,T),region=(r:number)=>{mc.clearRect(0,0,1920,1080);mc.beginPath();for(const b of boxes)mc.rect(b.x-r,b.y-r,b.w+2*r,b.h+2*r);mc.fillStyle='white';mc.fill();return maskAlpha();};
          const inner=region(4),outer=region(24);let n=0,dark=0;for(let i=0;i<outer.length;i++)if(outer[i]&&!inner[i]){n++;if(lum(p,i*4)<.4)dark++;}
          result.s18={boxes,pixels:n,darkFraction:dark/n};
        }
        return result;
      },{a,l});
      facts.errors.push(...errors);facts.resources=resources;mkdirSync(new URL('../../out/v6-p1/',import.meta.url),{recursive:true});
      writeFileSync(new URL('../../out/v6-p1/pixel-statistics.json',import.meta.url),JSON.stringify(facts,null,2));
      expect(facts.errors).toEqual([]);
      for(const r of facts.s05){expect(r.interiorPixels).toBeGreaterThan(100);expect(r.contrast,String(r.t)).toBeGreaterThanOrEqual(.4);}
      expect(facts.s12.text.interiorPixels).toBeGreaterThan(100);expect(facts.s12.text.inside).toBeLessThanOrEqual(.3);
      expect(facts.s12.numbers.interiorPixels).toBeGreaterThan(100);expect(facts.s12.numbers.maskMean).toBeLessThanOrEqual(.35);
      for(const [key,value] of Object.entries(facts.s12))if(key.startsWith('right'))expect((value as any).error).toBeLessThanOrEqual(20/255);
      for(const r of facts.s13){expect(r.interiorPixels).toBeGreaterThan(100);expect(r.inside).toBeGreaterThanOrEqual(.75);}
      for(let i=0;i<4;i++){
        const x=facts.s17[0].letters[i],y=facts.s17[1].letters[i];expect(x.pixels).toBeGreaterThan(100);expect(y.pixels).toBeGreaterThan(100);
        expect(Math.abs(x.brightFraction-y.brightFraction)).toBeLessThanOrEqual(.1);
      }
      for(const r of facts.s17Devices){expect(r.dark).toBeGreaterThan(0);expect(r.hidden).toBe(r.dark);expect(r.shown).toBe(r.lit);}
      expect(facts.s17Framing.length).toBeGreaterThan(0);
      for(const r of facts.s17Framing){
        expect(r.check.w).toBeGreaterThanOrEqual(1920*.45);
        for(const b of [r.check,r.comment]){expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);expect(b.x+b.w).toBeLessThanOrEqual(1920);expect(b.y+b.h).toBeLessThanOrEqual(1080);}
        expect(r.check.x+r.check.w).toBeLessThan(r.comment.x);
      }
      expect(facts.s18.pixels).toBeGreaterThan(100);expect(facts.s18.darkFraction).toBeLessThanOrEqual(.03);
    }finally{await browser.close();}
  }finally{server.kill();}
},180000);
