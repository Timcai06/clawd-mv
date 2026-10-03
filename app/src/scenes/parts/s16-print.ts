// Dry ink, sharp engraved slab sides and flat hatched shadows. Shared only within F.
import { NIGHT } from '../../kit/night';
import { hash } from '../../engine/util';
import { css } from '../../theme';
import { F, font, ot } from '../../engine/type';
import { fillRun, runPath, type VarRun } from '../../kit/vartype';
import type { Rect, Pt } from '../../kit/handoff';
import * as THREE from 'three';
import { D } from './s16-world';

export function polygon(c: CanvasRenderingContext2D, points: readonly Pt[]) {
  c.beginPath(); c.moveTo(points[0]!.x, points[0]!.y);
  for (const p of points.slice(1)) c.lineTo(p.x, p.y);
  c.closePath();
}

// Bounds of the actual outline's control hull, not its advance width. Both the painter and
// tests use this transform, so bearings and descenders cannot shift the measured layout.
export function inkBounds(run: VarRun): Rect {
  const points: Pt[] = [];
  for (const g of run.glyphs) for (let i = 0; i < g.o.xy.length; i += 2)
    points.push({ x: g.x + g.o.xy[i]! * run.size / 1000, y: g.o.xy[i + 1]! * run.size / 1000 });
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function printTransform(run: VarRun, box: Rect) {
  const b = inkBounds(run), sx = box.w / b.w, sy = box.h / b.h;
  return { sx, sy, tx: box.x - b.x * sx, ty: box.y - b.y * sy };
}

export function printedPoints(run: VarRun, box: Rect): Pt[] {
  const m = printTransform(run, box), points: Pt[] = [];
  for (const g of run.glyphs) for (let i = 0; i < g.o.xy.length; i += 2)
    points.push({ x: m.tx + m.sx * (g.x + g.o.xy[i]! * run.size / 1000),
      y: m.ty + m.sy * g.o.xy[i + 1]! * run.size / 1000 });
  return points;
}

export function printRun(c: CanvasRenderingContext2D, run: VarRun, box: Rect,
  color: 'ink' | 'paper' | 'clay' | 'pass' | 'fail', seed: number, alpha = 1, heat?: string) {
  const b = inkBounds(run), m = printTransform(run, box);
  c.save(); c.transform(m.sx, 0, 0, m.sy, m.tx, m.ty);
  c.globalAlpha = alpha; c.fillStyle = heat ?? css(color); fillRun(c, run);
  c.clip(runPath(run)); c.fillStyle = css('paper', 0.3);
  for (let i = 0; i < 550; i++) c.fillRect(b.x + hash(seed, i, 1) * b.w,
    b.y + hash(seed, i, 2) * b.h, 0.35 + hash(seed, i, 3) * 0.7, 0.4);
  c.restore();
}


export const PRINT = { tile:256, height:768, columns:4, rows:5, markWidth:D.w*0.8, stroke:D.w*0.12, numberCap:D.w*0.16 } as const;
export function atlasTile(i:number,face:number){return {x:(i%4)*768+face*256,y:Math.floor(i/4)*768,w:256,h:768};}
export function markUV(i:number){const a=atlasTile(i,1);return {x:(a.x+128)/3072,y:1-(a.y+384)/3840};}
/** One atlas, with square printed marks on the 1:3 wide faces and ink on the edges. */
export function dominoAtlas():THREE.CanvasTexture {
  const cv=document.createElement('canvas');cv.width=3072;cv.height=3840;const c=cv.getContext('2d')!;
  c.fillStyle=css('ink');c.fillRect(0,0,cv.width,cv.height);
  for(let i=0;i<19;i++)for(let face=0;face<3;face++){
    const a=atlasTile(i,face);c.save();c.translate(a.x,a.y);
    if(face<2){
      c.fillStyle=css('paper');c.fillRect(0,0,256,768);
      const mono=ot(F.mono(600)),cap=mono.charToGlyph('H').getBoundingBox().y2/mono.unitsPerEm;
      c.font=font(F.mono(600),256*0.16/cap);c.fillStyle=css('ink');c.textAlign='center';
      c.fillText(face===0?`TEST ${String(i+1).padStart(2,'0')}`:'PASS',128,82);
      c.strokeStyle=css(face===0?'fail':'pass');c.lineWidth=256*(face===0?PRINT.stroke/D.w:.09);c.lineCap='square';c.lineJoin='miter';
      // Include the diagonal square caps in the specified total ink width.
      const half=(256*(face===0?PRINT.markWidth/D.w:.7)-c.lineWidth*Math.SQRT2)/2;c.beginPath();
      if(face===0){c.moveTo(128-half,384-half);c.lineTo(128+half,384+half);c.moveTo(128+half,384-half);c.lineTo(128-half,384+half);}
      else{c.moveTo(128-half,384);c.lineTo(128-half*0.35,384+half);c.lineTo(128+half,384-half);}
      c.stroke();
    }else{c.fillStyle=css('paper');c.font=font(F.mono(600),40);c.fillText(String(i+1).padStart(2,'0'),80,80);}
    c.restore();
  }
  const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=8;return tx;
}
export function dominoGeometry(i:number):THREE.BoxGeometry {
  const g=new THREE.BoxGeometry(D.w,D.h,D.d);g.translate(0,D.h/2,0);const uv=g.attributes.uv!;
  for(let face=0;face<6;face++){const a=atlasTile(i,face===4?0:face===5?1:2);for(let j=0;j<4;j++){const k=face*4+j,u=uv.getX(k),v=uv.getY(k);uv.setXY(k,(a.x+u*a.w)/3072,1-(a.y+(1-v)*a.h)/3840);}}
  return g;
}
