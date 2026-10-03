import { expect, test } from 'bun:test';
import { carryDrift, carryLayout, drawCarry, lerpAffines, type CarrySpec } from '../src/kit/carry';
import { runInkBounds } from '../src/kit/pathtext';
import { varRun } from '../src/kit/vartype';
import { FakeCanvas, withCanvas } from './kit-pathtext.test';

const spec: CarrySpec = { text: '“machine,”',size: 160,axes: { wdth: 103.25,wght: 815 },x: 120,y: 600,tracking: 0.025,color: 'paper' };
test('carryLayout ink box agrees with the same complete varRun within 0.5 px', () => {
  const aff = carryLayout(spec,1), run = varRun(spec.text,100,spec.axes,100*spec.tracking!), k = spec.size/run.capH;
  const ink = runInkBounds(run); let left = Infinity,right = -Infinity,top = Infinity,bottom = -Infinity;
  for (let i = 0; i < aff.length; i++) {
    const g = run.glyphs[i]!, m = aff[i]!, box = runInkBounds({ ...run,glyphs: [{ ...g,x: 0 }] });
    left = Math.min(left,m.e+m.a*box.x0); right = Math.max(right,m.e+m.a*box.x1);
    top = Math.min(top,m.f+m.d*box.y0); bottom = Math.max(bottom,m.f+m.d*box.y1);
  }
  const err = Math.max(Math.abs(left-spec.x),Math.abs(right-(spec.x+(ink.x1-ink.x0)*k)),Math.abs(top-(spec.y+ink.y0*k)),Math.abs(bottom-(spec.y+ink.y1*k)));
  console.log(`V6-K carry ink error: ${err.toExponential(3)} px`); expect(err).toBeLessThanOrEqual(0.5);
});
test('carry scale is relative to the fixed ink-left baseline anchor', () => {
  const a = carryLayout(spec), b = carryLayout(spec,0.5);
  for (let i = 0; i < a.length; i++) { expect(b[i]!.a).toBe(a[i]!.a/2); expect(b[i]!.e-spec.x).toBeCloseTo((a[i]!.e-spec.x)/2,10); expect(b[i]!.f).toBe(spec.y); }
});
test('carry drift zero is identity; held motion stays within rotation/lift limits', () => {
  expect(carryDrift(spec,100,0)).toEqual(carryLayout(spec));
  const base = carryLayout(spec), run = varRun(spec.text,100,spec.axes), em = 100*spec.size/run.capH;
  for (let t = 0; t < 4; t += 0.04) for (const [i,g] of carryDrift(spec,t,1).entries()) {
    expect(Math.abs(Math.atan2(g.b,g.a))).toBeLessThanOrEqual(0.05+1e-12);
    const x = run.glyphs[i]!.adv/2,y = -run.capH/2;
    const center = (m: typeof g) => [m.a*x+m.c*y+m.e,m.b*x+m.d*y+m.f];
    expect(center(g)[0]).toBeCloseTo(center(base[i]!)[0]!,10);
    const lift = center(base[i]!)[1]!-center(g)[1]!; expect(lift).toBeGreaterThanOrEqual(-1e-10); expect(lift).toBeLessThanOrEqual(em*0.06+1e-10);
  }
  expect(carryDrift(spec,2,1)).toEqual(carryDrift(spec,2,1));
});
test('affine interpolation has exact independent endpoints and correspondence checks', () => {
  const a = carryLayout(spec), b = carryDrift(spec,2,1);
  expect(lerpAffines(a,b,0)).toEqual(a); expect(lerpAffines(a,b,1)).toEqual(b);
  expect(lerpAffines(a,b,0)).not.toBe(a); expect(lerpAffines(a,b,0.5)[0]!.f).toBe((a[0]!.f+b[0]!.f)/2);
  expect(() => lerpAffines(a,[],0.5)).toThrow(); expect(() => lerpAffines(a,b.map(g => ({ ...g,ch: '?' })),0.5)).toThrow();
});
test('carry drawing uses provided affines and restores Canvas state', () => withCanvas(() => {
  const c = new FakeCanvas(), aff = carryDrift(spec,2,1);
  drawCarry(c.ctx,spec,aff,0.5); expect(c.transforms).toEqual(aff.map(g => [g.a,g.b,g.c,g.d,g.e,g.f]));
  expect(c.draws.every(g => g.alpha === 0.35)).toBe(true); expect(c.globalAlpha).toBe(0.7); expect(c.fillStyle).toBe('original');
}));
