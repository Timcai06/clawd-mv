import { expect, test } from 'bun:test';
import { loadFonts, ot } from '../src/engine/type';
import type { Word } from '../src/engine/lyrics';
import { drawPathText, layoutPath, letterTimes, path3, pathAt, runInkBounds, samplePath, tangentAt, writeHead } from '../src/kit/pathtext';
import { Rig } from '../src/kit/rig';
import { varRun } from '../src/kit/vartype';

// Only browser registration/drawing is faked; all metrics/outlines are the shipped fonts.
const saved = { fetch: globalThis.fetch, document: globalThis.document, FontFace: globalThis.FontFace };
try {
  globalThis.document = { fonts: { add() {}, ready: Promise.resolve() } } as any;
  globalThis.FontFace = class { async load() { return this; } } as any;
  globalThis.fetch = (async (url: string) => new Response(await Bun.file(new URL(`../public/${url}`,import.meta.url)).arrayBuffer())) as any;
  await loadFonts();
} finally { Object.assign(globalThis,saved); }
export const word = (w: string, start = 1, end = 1.4): Word => ({ w,start,end,line: 0,index: 0,gi: 0 });
export class FakePath {
  static made = 0;
  commands: unknown[][] = [];
  constructor() { FakePath.made++; }
  moveTo(...v: number[]) { this.commands.push(['M',...v]); }
  lineTo(...v: number[]) { this.commands.push(['L',...v]); }
  quadraticCurveTo(...v: number[]) { this.commands.push(['Q',...v]); }
  bezierCurveTo(...v: number[]) { this.commands.push(['C',...v]); }
  closePath() { this.commands.push(['Z']); }
}
export class FakeCanvas {
  width = 0; height = 0;
  globalAlpha = 0.7; fillStyle = 'original'; strokeStyle = 'original'; lineWidth = 3; lineJoin = 'miter'; globalCompositeOperation = 'source-over';
  transforms: number[][] = [];
  draws: { m: number[]; color: string; alpha: number; path: FakePath; stroke: boolean }[] = [];
  private matrix = [1,0,0,1,0,0]; private stack: any[] = [];
  getContext() { return this; }
  save() { this.stack.push({ matrix: [...this.matrix], globalAlpha: this.globalAlpha,fillStyle: this.fillStyle,strokeStyle: this.strokeStyle,lineWidth: this.lineWidth,lineJoin: this.lineJoin,globalCompositeOperation: this.globalCompositeOperation }); }
  restore() { const { matrix,...state } = this.stack.pop(); this.matrix = matrix; Object.assign(this,state); }
  setTransform(...m: number[]) { this.matrix = m; this.transforms.push(m); }
  scale() {} fillRect() {}
  fill(path: FakePath) { this.draws.push({ m: [...this.matrix],color: this.fillStyle,alpha: this.globalAlpha,path,stroke: false }); }
  stroke(path: FakePath) { this.draws.push({ m: [...this.matrix],color: this.strokeStyle,alpha: this.globalAlpha,path,stroke: true }); }
  get ctx() { return this as unknown as CanvasRenderingContext2D; }
}
export function withCanvas<T>(f: () => T): T {
  const doc = globalThis.document, path = globalThis.Path2D;
  globalThis.Path2D = FakePath as any; globalThis.document = { createElement: () => new FakeCanvas() } as any;
  try { return f(); } finally { globalThis.document = doc; globalThis.Path2D = path; }
}
const rig = () => { const r = new Rig(); r.set({ pos: { x: 0,y: 0,z: 10 },tgt: { x: 0,y: 0,z: 0 },roll: 0,fov: 34 }); return r; };
const style = { mode: 'stand' as const,base: 'paper' as const,on: 'ink' as const,pop: 0,minPx: 0,maxPx: 10000 };

test('letterTimes counts Unicode letters/numbers and attaches all punctuation', () => {
  const w = word('“’c-a9!”',2,2.3), times = letterTimes(w);
  expect(times).toHaveLength(8); expect(times[0]).toEqual(times[2]); expect(times[1]).toEqual(times[2]);
  expect(times[3]).toEqual(times[2]); expect(times[6]).toEqual(times[5]); expect(times[7]).toEqual(times[5]);
  expect(times[4]!.t0).toBeCloseTo(2.1,12); expect(times[5]!.t1).toBeCloseTo(2.3,12);
  expect(letterTimes(word('汉é𝟡',4,4.3)).length).toBe(3);
});
test('letterTimes short words use all duration; held words use 0.8 and 0.7 limits', () => {
  expect(letterTimes(word('AB',1,1.5)).at(-1)!.t1).toBe(1.5);
  expect(letterTimes(word('AB',1,1.6)).at(-1)!.t1).toBeCloseTo(1.48,12);
  expect(letterTimes(word('AB',1,3)).at(-1)!.t1).toBe(1.7);
  expect(letterTimes(word('AB',1,3),{ spread: 0.2,maxSpan: 0.3 }).at(-1)!.t1).toBe(1.3);
});
test('letterTimes never precedes the voice, including empty/zero/reversed tokens', () => {
  expect(letterTimes(word(''))).toEqual([]);
  for (const w of [word('—'),word('AB',2,2),word('AB',2,1),word('’cause',3,4)]) for (const g of letterTimes(w)) expect(g.t0).toBeGreaterThanOrEqual(w.start);
});
test('path arc lengths, clamp, repeated points, centered tangent and sampling', () => {
  const p = path3([{ x: 0,y: 0,z: 0 },{ x: 3,y: 0,z: 0 },{ x: 3,y: 4,z: 0 }]);
  expect(Array.from(p.cum)).toEqual([0,3,7]); expect(pathAt(p,5)).toEqual({ x: 3,y: 2,z: 0 });
  expect(pathAt(p,-1)).toEqual(p.pts[0]); expect(pathAt(p,10)).toEqual(p.pts[2]);
  expect(tangentAt(p,5)).toEqual({ x: 0,y: 1,z: 0 });
  expect(samplePath(u => ({ x: u,y: 0,z: 0 }),8).pts.length).toBe(9);
  expect(pathAt(path3([{ x: 1,y: 2,z: 3 }]),5)).toEqual({ x: 1,y: 2,z: 3 });
  expect(pathAt(path3([{ x: 0,y: 0,z: 0 },{ x: 0,y: 0,z: 0 },{ x: 1,y: 0,z: 0 }]),0.5).x).toBe(0.5);
  expect(() => path3([])).toThrow(); expect(() => samplePath(() => ({ x: 0,y: 0,z: 0 }),0)).toThrow();
});
test('layout uses varRun advances, kern, em tracking/space and notBefore duration shift', () => {
  const axes = { wdth: 100,wght: 800 }, run = varRun('AV',100,axes,5), m = 0.8/run.capH;
  const lay = layoutPath([word('AV'),word('A',2,2.2)],{ capH: 0.8,s0: 3,axes,tracking: 0.05,space: 0.32,notBefore: s => 4+s/10 });
  expect(lay.glyphs[1]!.s).toBeCloseTo(3+run.glyphs[1]!.x*m,12);
  expect(lay.glyphs[0]!.w).toBeCloseTo(run.glyphs[0]!.adv*m,12);
  expect(lay.glyphs[2]!.s).toBeCloseTo(3+(run.width+32)*m,12);
  for (const g of lay.glyphs) { expect(g.t0).toBeGreaterThanOrEqual(4+g.s/10); expect(g.t1-g.t0).toBeCloseTo(0.2,12); }
  expect(lay.s1).toBeCloseTo(lay.glyphs[2]!.s+lay.glyphs[2]!.w,12);
  expect(layoutPath([word('ab')],{ capH: 1,upper: true }).glyphs.map(g => g.ch).join('')).toBe('AB');
});
test('write head is monotone over punctuation, kern and between words', () => {
  const lay = layoutPath([word('AV,’'),word('To!',2,2.4)],{ capH: 1 });
  let last = lay.s0;
  for (let t = 0; t < 4; t += 0.002) { const s = writeHead(lay.glyphs,t); expect(s).toBeGreaterThanOrEqual(last); last = s; }
  expect(writeHead(lay.glyphs,0,7)).toBe(7); expect(writeHead([],0)).toBe(0);
  const g = lay.glyphs[0]!; expect(writeHead([g],(g.t0+g.t1)/2)).toBeCloseTo(g.s+g.w/2,10);
});
test('ink bounds match actual OpenType curve extrema', () => {
  const run = varRun('Ag,’',100,{ wdth: 100,wght: 700 }); const b = runInkBounds(run);
  const boxes = run.glyphs.map(g => ot('Archivo-1000-700').charToGlyph(g.ch).getPath(g.x,0,100).getBoundingBox());
  expect(b.x0).toBeCloseTo(Math.min(...boxes.map(b => b.x1)),4); expect(b.x1).toBeCloseTo(Math.max(...boxes.map(b => b.x2)),4);
  expect(b.y0).toBeCloseTo(Math.min(...boxes.map(b => b.y1)),4); expect(b.y1).toBeCloseTo(Math.max(...boxes.map(b => b.y2)),4);
});
test('stand advance equals projected endpoint distance and clamps angle', () => withCanvas(() => {
  const r = rig(), lay = layoutPath([word('A')],{ capH: 1 });
  const p = path3([{ x: 0,y: 0,z: 0 },{ x: 0.2,y: -3,z: 0 }]), c = new FakeCanvas();
  drawPathText(c.ctx,r,p,lay,2,{ ...style,maxAngle: 0.2 });
  const a = pathAt(p,0), b = pathAt(p,lay.glyphs[0]!.w), qa = r.proj(a.x,a.y,a.z)!, qb = r.proj(b.x,b.y,b.z)!, m = c.transforms[0]!;
  const width = Math.hypot(m[0]!,m[1]!)*varRun('A',100,{ wdth: 100,wght: 800 }).width;
  expect(Math.abs(width-Math.hypot(qb.x-qa.x,qb.y-qa.y))).toBeLessThanOrEqual(0.5); expect(Math.atan2(m[1]!,m[0]!)).toBeCloseTo(0.2,10);
}));
test('stand current advance stretches around fixed arc origins', () => withCanvas(() => {
  const lay = layoutPath([word('AA')],{ capH: 1 }), p = path3([{ x: 0,y: 0,z: 0 },{ x: 10,y: 0,z: 0 }]);
  const a = new FakeCanvas(), b = new FakeCanvas();
  drawPathText(a.ctx,rig(),p,lay,2,style); drawPathText(b.ctx,rig(),p,lay,2,{ ...style,axes: () => ({ wdth: 125,wght: 900 }) });
  expect(a.transforms.map(m => m.slice(4))).toEqual(b.transforms.map(m => m.slice(4)));
  expect(a.transforms[0]![0]).toBe(b.transforms[0]![0]);
  expect(varRun('A',100,{ wdth: 125,wght: 900 }).width).toBeGreaterThan(varRun('A',100,{ wdth: 100,wght: 800 }).width);
}));
test('lie uses a positive determinant and rejects missing normal/back surfaces', () => withCanvas(() => {
  const lay = layoutPath([word('A')],{ capH: 1 }), p = path3([{ x: 0,y: 0,z: 0 },{ x: 10,y: 0,z: 0 }]), c = new FakeCanvas();
  const st = { ...style,mode: 'lie' as const,normal: () => ({ x: 0,y: 0,z: 1 }) };
  expect(drawPathText(c.ctx,rig(),p,lay,2,st).drawn).toBe(1);
  const m = c.transforms[0]!; expect(m[0]!*m[3]!-m[1]!*m[2]!).toBeGreaterThan(0);
  expect(drawPathText(c.ctx,rig(),p,lay,2,{ ...st,normal: () => ({ x: 0,y: 0,z: -1 }) }).drawn).toBe(0);
  expect(() => drawPathText(c.ctx,rig(),p,lay,2,{ ...style,mode: 'lie' })).toThrow();
}));
test('unborn, back-facing, behind-camera and occluded glyphs are not drawn', () => withCanvas(() => {
  const lay = layoutPath([word('A')],{ capH: 1 }), r = rig(), c = new FakeCanvas();
  const p = path3([{ x: 0,y: 0,z: 0 },{ x: 10,y: 0,z: 0 }]);
  expect(drawPathText(c.ctx,r,p,lay,0,style).drawn).toBe(0);
  expect(drawPathText(c.ctx,r,path3([...p.pts].reverse()),lay,2,style).drawn).toBe(0);
  expect(drawPathText(c.ctx,r,path3([{ x: 0,y: 0,z: 20 },{ x: 10,y: 0,z: 20 }]),lay,2,style).head).toBeNull();
  expect(drawPathText(c.ctx,r,p,lay,2,{ ...style,visible: () => false })).toEqual({ drawn: 0,bbox: null,head: null });
}));
test('pop, heat, outline and offsets apply without leaking Canvas state', () => withCanvas(() => {
  const lay = layoutPath([word('A')],{ capH: 1 }), p = path3([{ x: 0,y: 0,z: 0 },{ x: 10,y: 0,z: 0 }]), r = rig(), c = new FakeCanvas();
  const born = drawPathText(c.ctx,r,p,lay,1,{ ...style,pop: 0.16 });
  const sy = c.transforms.at(-1)![3]!;
  drawPathText(c.ctx,r,p,lay,2,{ ...style,pop: 0.16 }); expect(sy/c.transforms.at(-1)![3]!).toBeCloseTo(0.3,10);
  expect(c.draws[0]!.color).toBe('rgb(255,243,224)'); expect(c.draws[1]!.color).not.toBe(c.draws[0]!.color);
  const before = r.proj(0,0,0)!, after = r.proj(1,2,0)!;
  drawPathText(c.ctx,r,p,lay,2,{ ...style,offset: () => ({ d: { x: 1,y: 2,z: 0 },alpha: 0.5 }),outline: { color: 'black',px: 16 } });
  expect(c.transforms.at(-1)![4]!-before.x).toBeCloseTo(after.x-before.x,10); expect(c.draws.at(-1)!.alpha).toBe(0.35);
  expect(c.draws.at(-2)!.stroke).toBe(true); expect(born.bbox).not.toBeNull();
  expect(c.globalAlpha).toBe(0.7); expect(c.fillStyle).toBe('original'); expect(c.lineWidth).toBe(3);
  expect(drawPathText(c.ctx,r,p,lay,2,{ ...style,offset: () => null }).drawn).toBe(0);
}));
test('spin and scale preserve the glyph center and deterministic transforms', () => withCanvas(() => {
  const lay = layoutPath([word('AB')],{ capH: 1 }), p = path3([{ x: 0,y: 0,z: 0 },{ x: 10,y: 0,z: 0 }]);
  const a = new FakeCanvas(), b = new FakeCanvas(), c = new FakeCanvas(), r = rig();
  const st = { ...style,offset: () => ({ spin: 0.4,scale: 1.2 }) };
  const f = drawPathText(a.ctx,r,p,lay,2,st); drawPathText(b.ctx,r,p,lay,1.1,st); drawPathText(c.ctx,r,p,lay,2,st);
  expect(a.transforms).toEqual(c.transforms); expect(drawPathText(new FakeCanvas().ctx,r,p,lay,2,st)).toEqual(f);
  const base = new FakeCanvas(); drawPathText(base.ctx,r,p,lay,2,style);
  const run = varRun('A',100,{ wdth: 100,wght: 800 }), x = run.width/2,y = -run.capH/2;
  const center = (m: number[]) => [m[0]!*x+m[2]!*y+m[4]!,m[1]!*x+m[3]!*y+m[5]!];
  expect(center(a.transforms[0]!)[0]).toBeCloseTo(center(base.transforms[0]!)[0]!,10);
  expect(center(a.transforms[0]!)[1]).toBeCloseTo(center(base.transforms[0]!)[1]!,10);
}));
test('glyph cache quantizes axes and clears all entries at 4096', () => withCanvas(() => {
  const lay = layoutPath([word('Q')],{ capH: 1 }), p = path3([{ x: 0,y: 0,z: 0 },{ x: 10,y: 0,z: 0 }]), r = rig();
  const draw = (wdth: number,wght: number) => drawPathText(new FakeCanvas().ctx,r,p,lay,2,{ ...style,axes: () => ({ wdth,wght }) });
  draw(62,300); const n = FakePath.made; draw(62.1,302); expect(FakePath.made).toBe(n);
  // More than one full cache worth, with a different weight/width at each draw.
  for (let i = 0; i < 4097; i++) draw(62+(i%127)*0.5,300+Math.floor(i/127)*5);
  const made = FakePath.made; draw(62,300); expect(FakePath.made).toBe(made+1);
  // Find one eviction boundary. The next generation must hold exactly 4096 entries.
  let boundary = -1;
  for (let i = 1; i <= 4096; i++) {
    draw(62+(i%127)*0.5,300+Math.floor(i/127)*5);
    const count = FakePath.made; draw(62,300);
    if (FakePath.made !== count) { boundary = i; break; }
  }
  expect(boundary).toBeGreaterThan(0);
  // The boundary inserted one other glyph plus the probe; fill the other 4094 slots.
  let inserted = 0;
  for (let i = 1; inserted < 4094; i++) {
    if (i === boundary) continue;
    draw(62+(i%127)*0.5,300+Math.floor(i/127)*5); inserted++;
    const count = FakePath.made; draw(62,300); expect(FakePath.made).toBe(count);
  }
  draw(125,900); const count = FakePath.made; draw(62,300); expect(FakePath.made).toBe(count+1);
}));
test('screen cap clamps, normalized world lift and lie offsets follow their contract', () => withCanvas(() => {
  const lay = layoutPath([word('A')],{ capH: 1 }), p = path3([{ x: 0,y: 0,z: 0 },{ x: 10,y: 0,z: 0 }]), r = rig();
  for (const [minPx,maxPx,want] of [[10,20,20],[300,400,300]]) {
    const c = new FakeCanvas(); drawPathText(c.ctx,r,p,lay,2,{ ...style,minPx,maxPx });
    expect(c.transforms[0]![3]!*varRun('A',100,{ wdth: 100,wght: 800 }).capH).toBeCloseTo(want!,9);
  }
  const c = new FakeCanvas(); drawPathText(c.ctx,r,p,lay,2,{ ...style,lift: 2,up: { x: 0,y: 4,z: 0 } });
  expect(c.transforms[0]![5]).toBeCloseTo(r.proj(0,2,0)!.y,10);
  const d = new FakeCanvas(); drawPathText(d.ctx,r,p,lay,2,{ ...style,mode: 'lie',normal: () => ({ x: 0,y: 0,z: 1 }),lift: 1,offset: () => ({ d: { x: 2,y: 3,z: 0 } }) });
  expect(d.transforms[0]![4]).toBeCloseTo(r.proj(2,3,1)!.x,10); expect(d.transforms[0]![5]).toBeCloseTo(r.proj(2,3,1)!.y,10);
}));
test('80 glyphs with changing axes average <= 1.5 ms JS per frame', () => withCanvas(() => {
  const lay = layoutPath([word('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQR',0,0.4)],{ capH: 0.1 });
  expect(lay.glyphs.length).toBe(80);
  const p = path3([{ x: -5,y: 0,z: 0 },{ x: 20,y: 0,z: 0 }]), r = rig();
  // Warm native font parsing/JIT; measure both path-cache misses and hits thereafter.
  const draw = (n: number) => drawPathText(new FakeCanvas().ctx,r,p,lay,2,{ ...style,axes: () => ({ wdth: 90+(n%50)*0.5,wght: 700+(Math.floor(n/50)%30)*5 }) });
  for (let i = 0; i < 60; i++) draw(i);
  const start = performance.now(); for (let i = 0; i < 240; i++) draw(i+60);
  const ms = (performance.now()-start)/240; console.log(`V6-K pathtext JS 80 glyphs: ${ms.toFixed(4)} ms/frame`); expect(ms).toBeLessThanOrEqual(1.5);
}));
