import { expect, test } from 'bun:test';
import * as THREE from 'three';
import { WordPlane } from '../src/kit/wordplane';
import { letterTimes, runInkBounds } from '../src/kit/pathtext';
import { varRun } from '../src/kit/vartype';
import { withCanvas, word, FakePath } from './kit-pathtext.test';

const material = (p: WordPlane) => p.mesh.material as THREE.RawShaderMaterial;
test('WordPlane R/G texture, mipmaps, anchors, depth and linear uniforms', () => withCanvas(() => {
  const p = new WordPlane('Ag',{ capH: 2,texCap: 160,ax: 0.5,ay: 0 });
  const m = material(p), tex = m.uniforms.map!.value as THREE.CanvasTexture;
  expect(tex.colorSpace).toBe(THREE.NoColorSpace); expect(tex.anisotropy).toBe(8); expect(tex.generateMipmaps).toBe(true); expect(tex.minFilter).toBe(THREE.LinearMipmapLinearFilter);
  expect(m.glslVersion).toBe(THREE.GLSL3); expect(m.transparent).toBe(true); expect(m.depthTest).toBe(true); expect(m.depthWrite).toBe(false);
  expect(m.uniforms.feather!.value).toBe(0.04); expect(m.uniforms.aDim!.value).toBe(0.35);
  const cv = tex.image as any; expect(cv.draws.length).toBe(2); expect(cv.draws[0].color).toBe('#f00'); expect(cv.draws[1].color).toBe('#0f0');
  const run = varRun('Ag',100,{ wdth: 87.5,wght: 900 }), ink = runInkBounds(run);
  expect(p.w).toBeCloseTo((ink.x1-ink.x0)*2/run.capH,10); expect(p.h).toBe(2);
  p.mesh.geometry.computeBoundingBox(); const bounds = p.mesh.geometry.boundingBox!;
  const u = m.uniforms, W = tex.image.width, H = tex.image.height;
  const worldLeft = bounds.min.x+(u.u0!.value)*((bounds.max.x-bounds.min.x));
  expect(worldLeft).toBeCloseTo(-p.w/2,6); expect(W).toBeGreaterThan(160); expect(H).toBeGreaterThan(160);
  p.set({ cSung: [1.2,0.4,0.1],dir: -1,heat: 0.3,opacity: 0.8,tone: 0.1,hatchAngle: 1,hatchPx: 7 });
  expect((u.cSung!.value as THREE.Vector3).toArray()).toEqual([1.2,0.4,0.1]); expect(u.uHeat!.value).toBe(0.3); expect(u.dir!.value).toBe(-1);
  p.dispose();
}));
test('WordPlane karaoke matches each letter boundary and holds after the last letter', () => withCanvas(() => {
  const p = new WordPlane('commit',{ capH: 1 }), w = word('commit',1,2.5), times = letterTimes(w), u = material(p).uniforms;
  const left = u.u0!.value, width = u.u1!.value-left;
  expect(p.karaoke(w,0)).toBe(0);
  for (let i = 0; i < times.length; i++) {
    const tm = times[i]!, g = p.glyphU[i]!;
    expect(p.karaoke(w,tm.t0)).toBeCloseTo((g.u0-left)/width,8);
    expect(p.karaoke(w,(tm.t0+tm.t1)/2)).toBeCloseTo(((g.u0+g.u1)/2-left)/width,8);
  }
  expect(p.karaoke(w,4)).toBe(1); expect(() => p.karaoke(word('other'),2)).toThrow(); p.dispose();
}));
test('right-to-left karaoke starts at the rightmost glyph and advances monotonically', () => withCanvas(() => {
  const p = new WordPlane('machine',{ capH: 1 }); p.set({ dir: -1 });
  const w = word('machine',1,1.4), times = letterTimes(w), u = material(p).uniforms;
  const left = u.u0!.value, span = u.u1!.value-left;
  for (let i = 0; i < times.length; i++) {
    const tm = times[i]!, g = p.glyphU.at(-1-i)!;
    expect(p.karaoke(w,(tm.t0+tm.t1)/2)).toBeCloseTo(1-((g.u0+g.u1)/2-left)/span,8);
  }
  let last = 0; for (let t = 0; t < 3; t += 0.003) { const k = p.karaoke(w,t); expect(k).toBeGreaterThanOrEqual(last); last = k; }
  expect(p.karaoke(w,3)).toBe(1); p.dispose();
}));
test('punctuation shares letter times and zero-duration karaoke finishes', () => withCanvas(() => {
  const p = new WordPlane('’cause!',{ capH: 1 }), w = word('’cause!');
  expect(p.karaoke(w,0)).toBe(0); expect(p.karaoke(w,3)).toBe(1);
  expect(p.karaoke(w,w.start)).toBe(0);
  const u = material(p).uniforms, tm = letterTimes(w)[0]!;
  const mid = (p.glyphU[0]!.u0+p.glyphU[1]!.u1)/2;
  expect(p.karaoke(w,(tm.t0+tm.t1)/2)).toBeCloseTo((mid-u.u0!.value)/(u.u1!.value-u.u0!.value),8);
  const q = new WordPlane('A',{ capH: 1 }); expect(q.karaoke(word('A',1,1),1)).toBe(1); p.dispose(); q.dispose();
}));
test('letters retain the whole-word world pose, kern, tracking and anchor', () => withCanvas(() => {
  const axes = { wdth: 100,wght: 800 }, p = new WordPlane('AVg',{ capH: 1.2,axes,tracking: 0.03,ax: 0.7,ay: 0.2 });
  p.mesh.position.set(3,2,-4); p.mesh.rotation.set(0.1,0.3,0.2); p.mesh.scale.setScalar(0.8); p.set({ prog: 0.6,heat: 0.3 });
  const letters = p.letters(), run = varRun('AVg',100,axes,3), ink = runInkBounds(run), scale = 1.2/run.capH;
  expect(letters.length).toBe(3);
  letters.forEach((q,i) => {
    expect(q.mesh.position.toArray()).toEqual(p.mesh.position.toArray()); expect(q.mesh.quaternion.toArray()).toEqual(p.mesh.quaternion.toArray());
    expect(material(q).uniforms.prog!.value).toBe(0.6); expect(material(q).uniforms.uHeat!.value).toBe(0.3);
    const tex = material(q).uniforms.map!.value, cv = tex.image as any;
    // Recover the original letter baseline from its geometry and texture's red outline.
    const path = cv.draws[0].path as FakePath, command = path.commands.find(c => c[0] === 'M')!;
    q.mesh.geometry.computeBoundingBox(); const box = q.mesh.geometry.boundingBox!;
    const uvX = (command[1] as number)/cv.width, uvY = 1-(command[2] as number)/cv.height;
    const local = new THREE.Vector3(box.min.x+uvX*(box.max.x-box.min.x),box.min.y+uvY*(box.max.y-box.min.y),0);
    const g = run.glyphs[i]!, original = g.o.xy;
    const expected = new THREE.Vector3((g.x+original[0]!*g.adv/g.o.adv-ink.x0-(ink.x1-ink.x0)*0.7)*scale,(-original[1]!*g.adv/g.o.adv-run.capH*0.2)*scale,0);
    expect(local.distanceTo(expected)).toBeLessThan(1e-6);
    q.dispose();
  });
  p.dispose();
}));
test('RTL keeps trailing punctuation grouped with its letter at the first note', () => withCanvas(() => {
  const p = new WordPlane('cause!',{ capH: 1 }); p.set({ dir: -1 });
  const w = word('cause!'), tm = letterTimes(w)[0]!, u = material(p).uniforms;
  const lo = p.glyphU[4]!.u0, hi = p.glyphU[5]!.u1;
  expect(p.karaoke(w,(tm.t0+tm.t1)/2)).toBeCloseTo(1-((lo+hi)/2-u.u0!.value)/(u.u1!.value-u.u0!.value),8);
  expect(p.karaoke(w,w.start)).toBe(0); expect(p.karaoke(w,3)).toBe(1); p.dispose();
}));
test('engraving shader uses logical hatch spacing and solid G outlines; disposal once', () => withCanvas(() => {
  const p = new WordPlane('commit',{ capH: 1,engrave: true }), m = material(p), tex = m.uniforms.map!.value as THREE.CanvasTexture;
  expect(m.uniforms.engraved!.value).toBe(true); expect(m.fragmentShader).toContain('pxLine(dist/fw'); expect(m.fragmentShader).toContain('max(tx.r*cov,tx.g)');
  let n = 0; p.mesh.geometry.addEventListener('dispose',() => n++); m.addEventListener('dispose',() => n++); tex.addEventListener('dispose',() => n++);
  p.dispose(); p.dispose(); expect(n).toBe(3);
}));
