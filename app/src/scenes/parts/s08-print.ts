// Group C print geometry. The same mapped outlines drive rendering and numeric framing checks.
import { hash, lerp } from "../../engine/util";
import { css, type ThemeKey } from "../../theme";
import { varRun, type VarRun, type Axes } from "../../kit/vartype";
import * as Clawd from "../../kit/clawd";
import * as THREE from 'three';
import { F, font } from '../../engine/type';
import { fillRun } from '../../kit/vartype';
import { ATLAS, PAGE, floodEdge, floodRadius, printGlyphCount, type PrintWorld } from './s08-world';
import type { PressEvent } from './s08-layout';

export type Point = [number, number];
export type Quad = [Point, Point, Point, Point]; // TL, TR, BR, BL
export type Box = { x: number; y: number; w: number; h: number };
export const rectQuad = (b: Box): Quad => [
  [b.x, b.y],
  [b.x + b.w, b.y],
  [b.x + b.w, b.y + b.h],
  [b.x, b.y + b.h],
];
export function bounds(points: Point[]): Box {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1]);
  const x = Math.min(...xs),
    y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}
export function visibleBox(b: Box): Box {
  const x = Math.max(0, b.x),
    y = Math.max(0, b.y);
  return {
    x,
    y,
    w: Math.max(0, Math.min(1920, b.x + b.w) - x),
    h: Math.max(0, Math.min(1080, b.y + b.h) - y),
  };
}
export function mapQuad(q: Quad, u: number, v: number): Point {
  return [
    lerp(lerp(q[0][0], q[1][0], u), lerp(q[3][0], q[2][0], u), v),
    lerp(lerp(q[0][1], q[1][1], u), lerp(q[3][1], q[2][1], u), v),
  ];
}
/** Map the ink's actual outline extent, rather than its advance width, onto the printed quad. */
export function inkExtent(run: VarRun) {
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  for (const g of run.glyphs)
    for (let i = 0; i < g.o.xy.length; i += 2) {
      const x = g.x + (g.o.xy[i]! * run.size) / 1000,
        y = (g.o.xy[i + 1]! * run.size) / 1000;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
  return { x0, x1, y0, y1 };
}
export function mappedInk(run: VarRun, q: Quad): Point[] {
  const e = inkExtent(run),
    points: Point[] = [];
  for (const g of run.glyphs)
    for (let i = 0; i < g.o.xy.length; i += 2) {
      points.push(
        mapQuad(
          q,
          (g.x + (g.o.xy[i]! * run.size) / 1000 - e.x0) / (e.x1 - e.x0),
          ((g.o.xy[i + 1]! * run.size) / 1000 - e.y0) / (e.y1 - e.y0),
        ),
      );
    }
  return points;
}
export function drawWarped(
  c: CanvasRenderingContext2D,
  text: string,
  axes: Axes,
  q: Quad,
  color: ThemeKey,
  heat?: string,
) {
  const run = varRun(text, 100, axes),
    e = inkExtent(run),
    s = run.size / 1000;
  const path = new Path2D();
  for (const g of run.glyphs) {
    let j = 0;
    const next = (): Point => {
      const p = mapQuad(
        q,
        (g.x + g.o.xy[j++]! * s - e.x0) / (e.x1 - e.x0),
        (g.o.xy[j++]! * s - e.y0) / (e.y1 - e.y0),
      );
      return p;
    };
    for (const cmd of g.o.types) {
      if (cmd === "M") path.moveTo(...next());
      else if (cmd === "L") path.lineTo(...next());
      else if (cmd === "Q") {
        const a = next(),
          b = next();
        path.quadraticCurveTo(...a, ...b);
      } else if (cmd === "C") {
        const a = next(),
          b = next(),
          d = next();
        path.bezierCurveTo(...a, ...b, ...d);
      } else path.closePath();
    }
  }
  c.fillStyle = heat ?? css(color);
  c.fill(path);
}
export function polygon(
  c: CanvasRenderingContext2D,
  p: Point[],
  color: ThemeKey,
  alpha = 1,
) {
  c.beginPath();
  c.moveTo(...p[0]!);
  for (const a of p.slice(1)) c.lineTo(...a);
  c.closePath();
  c.fillStyle = css(color, alpha);
  c.fill();
}
export function rule(
  c: CanvasRenderingContext2D,
  a: Point,
  b: Point,
  color: ThemeKey,
  alpha = 1,
  width = 1,
) {
  c.strokeStyle = css(color, alpha);
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(...a);
  c.lineTo(...b);
  c.stroke();
}
/** Static, cached dry ink, halftone and paper fibres: no frame-dependent texture boiling. */
export function printTexture(seed: number): HTMLCanvasElement {
  const cv = document.createElement("canvas");
  cv.width = 480;
  cv.height = 270;
  const c = cv.getContext("2d")!;
  for (let i = 0; i < 4500; i++) {
    const x = hash(seed, i, 1) * 480,
      y = hash(seed, i, 2) * 270,
      r = 0.25 + hash(seed, i, 3) * 0.9;
    c.fillStyle = css(
      i % 3 === 0 ? "paper" : "ink",
      0.025 + hash(seed, i, 4) * 0.09,
    );
    c.fillRect(x, y, r, r);
    if (i % 11 === 0)
      rule(
        c,
        [x, y],
        [x + 3 + hash(seed, i, 5) * 5, y - 1],
        "paper",
        0.1,
        0.25,
      );
  }
  for (let y = 3; y < 270; y += 5)
    for (let x = 3; x < 480; x += 5) {
      c.fillStyle = css("ink", 0.025);
      c.fillRect(x, y, 0.6, 0.6);
    }
  return cv;
}
export interface Sprite {
  x: number;
  y: number;
  px: number;
  angle: number;
  pose: Clawd.Pose;
}
export function spritePoints(s: Sprite): Point[] {
  const co = Math.cos(s.angle),
    si = Math.sin(s.angle);
  return s.pose.cells.flatMap((cell) =>
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ].map(([dx, dy]) => {
      const x = (cell.x + s.pose.dx + dx!) * s.px,
        y = (cell.y + s.pose.dy + dy!) * s.px;
      return [s.x + x * co - y * si, s.y + x * si + y * co] as Point;
    }),
  );
}
export function drawSprite(
  c: CanvasRenderingContext2D,
  s: Sprite,
  body: ThemeKey,
  eye: ThemeKey,
) {
  c.save();
  c.translate(s.x, s.y);
  c.rotate(s.angle);
  Clawd.draw(c, 0, 0, s.pose, { px: s.px, body: css(body), eye: css(eye) });
  c.restore();
}

/** Data canvases deliberately ignore output SCALE. No history is painted incrementally:
 * an event-set cache skips identical uploads; any changed set rebuilds both maps from scratch. */
export class PressAtlas {
  readonly PRINT = document.createElement('canvas');
  readonly DEBOSS = document.createElement('canvas');
  readonly printTexture: THREE.CanvasTexture;
  readonly depthTexture: THREE.CanvasTexture;
  private signature = '';
  private runs = new Map<string,ReturnType<typeof varRun>>();
  constructor(private readonly model: PrintWorld) {
    for (const canvas of [this.PRINT,this.DEBOSS]) {
      canvas.width=ATLAS.w; canvas.height=ATLAS.h;
      // Fix Canvas rasterization to the CPU path: otherwise Chrome changes its
      // antialiasing backend after readback, making identical event sets differ.
      canvas.getContext('2d',{ willReadFrequently:true });
    }
    this.printTexture = new THREE.CanvasTexture(this.PRINT);
    this.printTexture.colorSpace=THREE.SRGBColorSpace;
    this.depthTexture = new THREE.CanvasTexture(this.DEBOSS);
    this.depthTexture.colorSpace=THREE.NoColorSpace;
    for (const tex of [this.printTexture,this.depthTexture]) {
      tex.generateMipmaps=false; tex.minFilter=THREE.LinearFilter; tex.magFilter=THREE.LinearFilter; tex.anisotropy=8;
    }
    for (const e of model.events) this.runs.set(e.id,varRun(e.text,100,e.axes));
  }
  key(t: number): string {
    const T=this.model.T, flood=t >= T.mit2 ? T.mit2 : t >= T.mit1 ? T.mit1 : Infinity;
    const radius=Number.isFinite(flood) ? floodRadius(t,flood) : 0;
    const on=T.machineLine.words[3]!.start;
    return `${this.model.events.map(e => printGlyphCount(e,t)).join(',')}:${radius}:${t >= on}`;
  }
  update(t: number): boolean {
    const key=this.key(t);
    if (key === this.signature) return false;
    this.signature=key;
    const c=this.PRINT.getContext('2d')!, d=this.DEBOSS.getContext('2d')!;
    for (const ctx of [c,d]) {
      ctx.setTransform(1,0,0,1,0,0); ctx.globalCompositeOperation='source-over';
      ctx.fillStyle=ctx === c ? css('paper') : 'rgb(0,0,0)'; ctx.fillRect(0,0,ATLAS.w,ATLAS.h);
      ctx.setTransform(ATLAS.w/PAGE.w,0,0,ATLAS.h/PAGE.h,ATLAS.w/2,ATLAS.h/2);
    }
    const T=this.model.T, flood=t >= T.mit2 ? T.mit2 : t >= T.mit1 ? T.mit1 : Infinity;
    if (Number.isFinite(flood)) {
      const R=floodRadius(t,flood); c.beginPath();
      for (let i=0;i<=256;i++) {
        const a=i/256*Math.PI*2,r=R*floodEdge(a),x=r*Math.cos(a),z=r*Math.sin(a);
        if (i) c.lineTo(x,z); else c.moveTo(x,z);
      }
      c.closePath(); c.fillStyle=css('clay'); c.fill();
    }
    for (const e of this.model.events) {
      const count=printGlyphCount(e,t); if (!count) continue;
      // The clay flood covers earlier ink; the recess data and both COMMIT impressions persist.
      if (e.kind === 'commit' || !Number.isFinite(flood) || e.tp > flood) this.stamp(c,e,count,css(e.ink));
      d.globalCompositeOperation='lighter'; this.stamp(d,e,count,'rgb(32,32,32)');
    }
    if (t >= T.machineLine.words[3]!.start) { this.calendar(c,false); this.calendar(d,true); }
    this.printTexture.needsUpdate=true; this.depthTexture.needsUpdate=true;
    return true;
  }
  private stamp(c: CanvasRenderingContext2D, e: PressEvent, count: number, color: string) {
    const run=this.runs.get(e.id)!, s=e.capH/run.capH;
    c.save(); c.translate(e.x,e.z); c.rotate(-e.rot); c.scale(s,s); c.fillStyle=color;
    fillRun(c,{ ...run,glyphs:run.glyphs.slice(0,count) },e.baselineX/s,e.baselineZ/s);
    c.restore();
  }
  private calendar(c: CanvasRenderingContext2D, data: boolean) {
    c.save(); c.translate(-20,0); c.fillStyle=data ? 'rgb(32,32,32)' : css('ink');
    c.strokeStyle=c.fillStyle; c.lineWidth=0.06; c.font=font(F.mono(500),0.55);
    for (let day=1;day<=35;day++) {
      const x=((day-1)%7)*1.5,z=Math.floor((day-1)/7)*1.15;
      c.strokeRect(x,z,1.35,1); if (day <= 32) c.fillText(String(day),x+0.12,z+0.75);
      if (day === 32) {
        c.beginPath(); c.moveTo(x+0.08,z+0.1); c.lineTo(x+1.27,z+0.9);
        c.moveTo(x+1.27,z+0.1); c.lineTo(x+0.08,z+0.9); c.stroke();
      }
    }
    c.restore();
  }
  dispose() { this.printTexture.dispose(); this.depthTexture.dispose(); }
}
