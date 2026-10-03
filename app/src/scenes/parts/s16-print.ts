// Dry ink, sharp engraved slab sides and flat hatched shadows. Shared only within F.
import { NIGHT } from '../../kit/night';
import { hash } from '../../engine/util';
import { css } from '../../theme';
import { F, font } from '../../engine/type';
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


/** One texture atlas, separate UV tiles for fail/pass/numbered sides. */
export function dominoAtlas():THREE.CanvasTexture {
  const cv=document.createElement('canvas');cv.width=1536;cv.height=2048;const c=cv.getContext('2d')!;
  c.fillStyle=css('paper');c.fillRect(0,0,cv.width,cv.height);
  for(let i=0;i<19;i++){
    const y=i*104; c.font=font(F.mono(600),24);c.fillStyle=css('ink');
    c.fillText(`TEST ${String(i+1).padStart(2,'0')}`,16,y+30);c.fillText('PASS',528,y+30);c.fillText(String(i+1).padStart(2,'0'),1040,y+50);
    c.lineWidth=14;c.lineCap='square';c.strokeStyle=css('fail');c.beginPath();c.moveTo(188,y+46);c.lineTo(316,y+91);c.moveTo(316,y+46);c.lineTo(188,y+91);c.stroke();
    c.strokeStyle=css('pass');c.beginPath();c.moveTo(684,y+62);c.lineTo(734,y+88);c.lineTo(838,y+44);c.stroke();
  }
  const tx=new THREE.CanvasTexture(cv);tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=8;return tx;
}
export function dominoGeometry(i:number):THREE.BoxGeometry {
  const g=new THREE.BoxGeometry(D.w,D.h,D.d);g.translate(0,D.h/2,0);
  const uv=g.attributes.uv!;
  // BoxGeometry groups: +/-x, +/-y, +z (red front), -z (green back).
  for(let face=0;face<6;face++){const tile=face===4?0:face===5?1:2;for(let j=0;j<4;j++){const k=face*4+j,u=uv.getX(k),v=uv.getY(k);uv.setXY(k,(tile*512+8+u*496)/1536,1-(i*104+4+(1-v)*96)/2048);}}
  return g;
}
