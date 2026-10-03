// B-group print geometry. Layouts and drawing use these same transforms, so acceptance
// measures the objects actually submitted to Canvas / GL, not a separate mock layout.
import type { Rect } from '../../kit/handoff';
import { fillRun, runPath, type VarRun } from '../../kit/vartype';
import { css } from '../../theme';

export function clipBox(b: Rect): Rect {
  const x = Math.max(0, b.x), y = Math.max(0, b.y);
  return { x, y, w: Math.max(0, Math.min(1920, b.x + b.w) - x), h: Math.max(0, Math.min(1080, b.y + b.h) - y) };
}

export function unionBoxes(boxes: Rect[]): Rect {
  const x = Math.min(...boxes.map(b => b.x)), y = Math.min(...boxes.map(b => b.y));
  return { x, y, w: Math.max(...boxes.map(b => b.x + b.w)) - x, h: Math.max(...boxes.map(b => b.y + b.h)) - y };
}

/** Control hull of the interpolated outlines, in run px (conservative for curves). */
export function inkBox(run: VarRun): Rect {
  const points = run.glyphs.flatMap(g => Array.from(g.o.xy).reduce<{ x: number; y: number }[]>((a, v, i, xy) => {
    if (i % 2 === 0) a.push({ x: g.x + v * run.size / 1000, y: xy[i + 1]! * run.size / 1000 });
    return a;
  }, []));
  const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
  return { x, y, w: Math.max(...points.map(p => p.x)) - x, h: Math.max(...points.map(p => p.y)) - y };
}

/** Fit the ink hull, rather than the font's advance or baseline, to the print rectangle. */
export function printRun(c: CanvasRenderingContext2D, run: VarRun, box: Rect, hatch = false) {
  const b = inkBox(run);
  c.save(); c.translate(box.x, box.y); c.scale(box.w / b.w, box.h / b.h); c.translate(-b.x, -b.y);
  fillRun(c, run);
  if (hatch) {
    c.clip(runPath(run)); c.strokeStyle = css('ink', 0.85); c.lineWidth = b.h / box.h;
    c.beginPath();
    for (let y = b.y + b.h * 0.18; y < b.y + b.h; y += b.h / box.h * 5) {
      c.moveTo(b.x, y); c.lineTo(b.x + b.w, y);
    }
    c.stroke();
  }
  c.restore();
}

export function hatchBlock(c: CanvasRenderingContext2D, b: Rect, alpha: number, pitch = 12) {
  c.save(); c.beginPath(); c.rect(b.x, b.y, b.w, b.h); c.clip();
  c.strokeStyle = css('paper', alpha); c.lineWidth = 1; c.beginPath();
  for (let x = b.x - b.h; x < b.x + b.w; x += pitch) {
    c.moveTo(x, b.y + b.h); c.lineTo(x + b.h, b.y);
  }
  c.stroke(); c.restore();
}

// Scene-owned projection solvers. They calibrate the submitted camera, never a HUD proxy.
import * as THREE from 'three';
import { Rig, orbitCam, type Cam, type P3 } from '../../kit/rig';
export type ProjectCam = Cam & { offsetX?: number; offsetY?: number; stretchX?: number };
export function setCamera(rig: Rig, c: ProjectCam) {
  rig.set(c);
  rig.cam.setViewOffset(1920,1080,c.offsetX ?? 0,c.offsetY ?? 0,1920,1080);
  rig.cam.updateProjectionMatrix();
  rig.cam.projectionMatrix.elements[0]! *= c.stretchX ?? 1;
  rig.cam.projectionMatrixInverse.copy(rig.cam.projectionMatrix).invert();
  rig.vp.multiplyMatrices(rig.cam.projectionMatrix,rig.cam.matrixWorldInverse);
}
export function solvePoint(p: P3, scale: number, screen: {x:number;y:number}, yaw=0, pitch=0, fov=34, roll=0): ProjectCam {
  const dist=540/Math.tan(fov*Math.PI/360)/scale;
  const c: ProjectCam=orbitCam(p,yaw,pitch,dist,fov,roll);
  c.offsetX=960-screen.x;c.offsetY=540-screen.y;
  return c;
}
export function solveLine(a: P3,b: P3,screen: {x0:number;y0:number;x1:number;y1:number},yaw=0,pitch=0,fov=34): ProjectCam {
  const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2,z:(a.z+b.z)/2},r=new Rig();
  let lo=.5,hi=200,c: ProjectCam=orbitCam(mid,yaw,pitch,20,fov);
  const want=Math.hypot(screen.x1-screen.x0,screen.y1-screen.y0);
  for(let i=0;i<55;i++) {
    const dist=(lo+hi)/2;c=orbitCam(mid,yaw,pitch,dist,fov);setCamera(r,c);
    const A=r.proj(a.x,a.y,a.z)!,B=r.proj(b.x,b.y,b.z)!;
    if(Math.hypot(B.x-A.x,B.y-A.y)>want)lo=dist;else hi=dist;
  }
  setCamera(r,c);let A=r.proj(a.x,a.y,a.z)!,B=r.proj(b.x,b.y,b.z)!;
  c.roll=Math.atan2(screen.y1-screen.y0,screen.x1-screen.x0)-Math.atan2(B.y-A.y,B.x-A.x);
  setCamera(r,c);A=r.proj(a.x,a.y,a.z)!;B=r.proj(b.x,b.y,b.z)!;
  c.offsetX=(A.x+B.x-screen.x0-screen.x1)/2;c.offsetY=(A.y+B.y-screen.y0-screen.y1)/2;
  return c;
}
export function projectedBounds(r: Rig, points: P3[], clip=false): Rect {
  const ps=points.map(p=>r.proj(p.x,p.y,p.z)).filter(p=>p!==null);
  if(!ps.length)return {x:0,y:0,w:0,h:0};
  const x=Math.max(clip?0:-Infinity,Math.min(...ps.map(p=>p.x))),y=Math.max(clip?0:-Infinity,Math.min(...ps.map(p=>p.y)));
  return {x,y,w:Math.max(0,Math.min(clip?1920:Infinity,Math.max(...ps.map(p=>p.x)))-x),h:Math.max(0,Math.min(clip?1080:Infinity,Math.max(...ps.map(p=>p.y)))-y)};
}
export type Box3 = {lo:P3;hi:P3};
export function boxCorners(b: Box3): P3[] {
  return [b.lo.x,b.hi.x].flatMap(x=>[b.lo.y,b.hi.y].flatMap(y=>[b.lo.z,b.hi.z].map(z=>({x,y,z}))));
}

/** Scene-owned pigment override; pathtext currently always applies heatColor. */
export function solidInkContext(c:CanvasRenderingContext2D,color:string):CanvasRenderingContext2D {
  return new Proxy(c,{set(target,key,value){Reflect.set(target,key,key==='fillStyle'?color:value,target);return true;},
    get(target,key){const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
}
