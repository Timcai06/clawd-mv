import { afterAll, describe, expect, test } from 'bun:test';
import * as THREE from 'three';
import { loadFonts } from '../src/engine/type';
import { varRun, tracePath } from '../src/kit/vartype';
import { SolidText, solidLetterGeometry, disposeSolidCache } from '../src/kit/solidtype';
import { engraveMaterial, setEngrave } from '../src/kit/engrave-mat';
import GallerySolidtype, { solidtypeHop } from '../src/scenes/gallery-solidtype';

// Load the real shipped fonts into the production registry; replace only browser
// font registration, restoring the globals before any tests execute.
const saved = { fetch: globalThis.fetch, document: globalThis.document, FontFace: globalThis.FontFace };
try {
  globalThis.document = { fonts: { add() {}, ready: Promise.resolve() } } as any;
  globalThis.FontFace = class { async load() { return this; } } as any;
  globalThis.fetch = (async (url: string) => new Response(await Bun.file(new URL(`../public/${url}`, import.meta.url)).arrayBuffer())) as any;
  await loadFonts();
} finally { Object.assign(globalThis, saved); }
afterAll(disposeSolidCache);

const axes = { wdth: 100, wght: 900 };
const material = new THREE.MeshLambertMaterial();
afterAll(() => material.dispose());
const make = (text: string, capH = 1, tracking = 0) => new SolidText(text, { capH, tracking, axes, depth: 0.25, material });
const shapes = (ch: string) => {
  const s = solidLetterGeometry(ch, axes, 1, 0.25, 0.025).parameters.shapes;
  return Array.isArray(s) ? s : [s];
};
const compile = (m: THREE.MeshLambertMaterial) => {
  const shader = { vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
  m.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
};

test('records first and cached ten-letter construction timing with real outlines', () => {
  disposeSolidCache();
  const start = performance.now(), word = make('ABCDEFGHIJ'), first = performance.now()-start;
  word.dispose();
  const cachedStart = performance.now(), cached = make('ABCDEFGHIJ'), reused = performance.now()-cachedStart;
  cached.dispose();
  console.log(`SolidText 10 letters: first ${first.toFixed(3)} ms; cached ${reused.toFixed(3)} ms (includes lazy font parsing if not initialized)`);
  expect(first).toBeLessThan(30); expect(reused).toBeLessThan(2);
});

describe('SolidText outlines and layout', () => {
  test('flips the font y axis; outer area is positive, hole area negative', () => {
    const [o] = shapes('O');
    expect(THREE.ShapeUtils.area(o!.getPoints(6))).toBeGreaterThan(0);
    expect(THREE.ShapeUtils.area(o!.holes[0]!.getPoints(6))).toBeLessThan(0);
    const b = solidLetterGeometry('H',axes,1,0.25,0).boundingBox!;
    expect(b.min.y).toBeCloseTo(0,6);
    const run = varRun('H',100,axes), outline = run.glyphs[0]!.o;
    const ys = Array.from(outline.xy).filter((_,i) => i%2===1);
    expect(b.max.y).toBeCloseTo(-Math.min(...ys)*0.1/run.capH,6);
  });

  test('O is one shape with one through-hole, which front-face triangles do not fill', () => {
    const geo = solidLetterGeometry('O',axes,1,0.25,0.025), [o] = shapes('O');
    expect(shapes('O')).toHaveLength(1);
    expect(o!.holes).toHaveLength(1);
    const hole = o!.holes[0]!.getPoints(6);
    const center = new THREE.Box2().setFromPoints(hole).getCenter(new THREE.Vector2());
    const ray = new THREE.Raycaster(new THREE.Vector3(center.x,center.y,2),new THREE.Vector3(0,0,-1));
    expect(ray.intersectObject(new THREE.Mesh(geo,material))).toHaveLength(0);
  });

  test('A/e retain their holes and i retains its separate dot', () => {
    expect(shapes('A')[0]!.holes).toHaveLength(1);
    expect(shapes('e')[0]!.holes).toHaveLength(1);
    expect(shapes('i')).toHaveLength(2);
  });

  test('M/L/Q/C/Z match the production 2D outline after y flip', () => {
    for (const ch of ['COMMIT','O','e','g'].join('')) {
      const run = varRun(ch,100,axes), calls: number[][] = [];
      const recorder = Object.fromEntries(['moveTo','lineTo','quadraticCurveTo','bezierCurveTo'].map(k => [k,(...a: number[]) => calls.push(a)]));
      recorder.closePath = () => {};
      tracePath(recorder as any,run.glyphs[0]!.o,0,0,0.1/run.capH);
      const points = shapes(ch).flatMap(s => [s,...s.holes]).flatMap(p => p.curves);
      // Every outline control/end coordinate survives conversion, at world capH 1.
      const actual: number[][] = points.flatMap(c => {
        const q = c as any;
        if (q.isLineCurve) return [q.v1.toArray(),q.v2.toArray()];
        if (q.isQuadraticBezierCurve) return [q.v0.toArray(),q.v1.toArray(),q.v2.toArray()];
        if (q.isCubicBezierCurve) return [q.v0.toArray(),q.v1.toArray(),q.v2.toArray(),q.v3.toArray()];
        return [];
      });
      for (const call of calls) for (let i=0;i<call.length;i+=2) expect(actual.some(a => Math.abs(a[0]!-call[i]!)<1e-6 && Math.abs(a[1]!+call[i+1]!)<1e-6)).toBe(true);
    }
  });

  test('letter x/advance and whole width match varRun, including kern and em tracking', () => {
    for (const capH of [0.2,1,3.4]) for (const ax of [axes,{wdth:87.73,wght:713}]) for (const tracking of [0,0.07]) {
      const word = new SolidText('AV To Oe', { capH, axes:ax, tracking, depth:0.25, material });
      const run = varRun('AV To Oe',100,ax,tracking*100), s = capH/run.capH;
      for (const l of word.letters) {
        expect(Math.abs(l.x-run.glyphs[l.i]!.x*s)).toBeLessThan(0.001*capH);
        expect(l.adv).toBeCloseTo(run.glyphs[l.i]!.adv*s,8);
      }
      expect(word.width).toBeCloseTo(run.width*s,8);
      expect(word.group.children).toHaveLength(word.letters.length);
      word.dispose();
    }
  });

  test('cache quantizes axes deterministically and keys every geometry option', () => {
    const a = solidLetterGeometry('O',{wdth:100.1,wght:899},1,0.25,0.025);
    expect(a).toBe(solidLetterGeometry('O',axes,1,0.25,0.025));
    for (const b of [solidLetterGeometry('O',{wdth:101,wght:900},1,0.25,0.025),solidLetterGeometry('O',axes,2,0.25,0.025),solidLetterGeometry('O',axes,1,0.3,0.025),solidLetterGeometry('O',axes,1,0.25,0.02),solidLetterGeometry('O',axes,1,0.25,0.025,12)]) expect(b).not.toBe(a);
    expect(Array.from(a.getAttribute('position').array)).toEqual(Array.from(solidLetterGeometry('O',axes,1,0.25,0.025).getAttribute('position').array));
  });

  test('back is at z=0; front faces +z and bevel parameters are retained', () => {
    const geo = solidLetterGeometry('H',axes,1,0.25,0.025), normal = geo.getAttribute('normal'), pos = geo.getAttribute('position');
    expect(geo.boundingBox!.min.z).toBeCloseTo(0,7);
    expect(geo.boundingBox!.max.z).toBeCloseTo(0.3,6);
    expect(geo.parameters.options).toMatchObject({depth:0.25,bevelEnabled:true,bevelThickness:0.025,bevelSize:0.025,bevelSegments:2,curveSegments:6});
    let front = 0;
    for (let i=0;i<normal.count;i++) if (pos.getZ(i)>0.299) { expect(normal.getZ(i)).toBeGreaterThan(0); front++; }
    expect(front).toBeGreaterThan(0);
  });
});

describe('SolidText transforms and ownership', () => {
  test('moves by absolute offset and rotates/scales about its own center without rebuilding geometry', () => {
    const word = make('HI'), l = word.letters[1]!, geo = l.mesh.geometry, box = geo.boundingBox!, center = box.getCenter(new THREE.Vector3());
    word.setLetter(1,{d:{x:0.4,y:2,z:-0.1},rot:{x:0,y:0,z:Math.PI/2},scale:{x:2,y:3,z:4},visible:false});
    const actual = center.clone().applyMatrix4(l.mesh.matrix);
    expect(actual.x).toBeCloseTo(l.x+center.x+0.4,8);
    expect(actual.y).toBeCloseTo(center.y+2,8);
    expect(actual.z).toBeCloseTo(center.z-0.1,8);
    expect(l.mesh.geometry).toBe(geo);
    expect(l.mesh.visible).toBe(false);
    expect(l.mesh.matrixAutoUpdate).toBe(false);
    const matrix = l.mesh.matrix.clone();
    word.setLetter(1,{d:{x:0.4,y:2,z:-0.1},rot:{x:0,y:0,z:Math.PI/2},scale:{x:2,y:3,z:4},visible:false});
    expect(l.mesh.matrix.equals(matrix)).toBe(true);
    word.setLetter(1,{});
    expect(l.mesh.matrix.equals(new THREE.Matrix4().makeTranslation(l.x,0,0))).toBe(true);
    expect(l.mesh.visible).toBe(true);
    word.dispose();
  });

  test('eight world corners include letter rotation/scale and ancestor transforms', () => {
    const word = make('O'), l = word.letters[0]!, root = new THREE.Group();
    root.position.set(4,2,-3); root.rotation.y = 0.3; root.scale.setScalar(1.5); root.add(word.group);
    word.group.position.set(1,2,3);
    word.setLetter(0,{d:{x:0.1,y:0.2,z:0.3},rot:{x:0.2,y:0.5,z:-0.3},scale:{x:2,y:0.7,z:1.3}});
    const corners = word.letterCorners(0), box = l.mesh.geometry.boundingBox!;
    expect(corners).toHaveLength(8);
    let i = 0;
    for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) {
      const expected = new THREE.Vector3(x,y,z).applyMatrix4(l.mesh.matrix).applyMatrix4(word.group.matrix).applyMatrix4(root.matrix);
      const actual = corners[i++]!;
      for (const axis of ['x','y','z'] as const) expect(actual[axis]).toBeCloseTo(expected[axis],10);
    }
    word.dispose();
  });

  test('space/empty words have no solid bounds; invalid indices report an error', () => {
    const word = make(' '), empty = make('');
    expect(word.letterCorners(0)).toEqual([]);
    expect(empty.width).toBe(0);
    expect(() => empty.setLetter(0,{})).toThrow(RangeError);
    expect(() => word.letterCorners(1)).toThrow(RangeError);
    word.dispose(); empty.dispose();
  });

  test('dispose preserves shared geometry/material; explicit cache disposal releases geometry', () => {
    const word = make('Z'), geo = word.letters[0]!.mesh.geometry;
    let geometryDisposals = 0, materialDisposals = 0;
    const onGeo = () => geometryDisposals++, onMat = () => materialDisposals++;
    geo.addEventListener('dispose',onGeo); material.addEventListener('dispose',onMat);
    word.dispose();
    expect(geometryDisposals).toBe(0); expect(materialDisposals).toBe(0);
    const other = make('Z'); expect(other.letters[0]!.mesh.geometry).toBe(geo); other.dispose();
    disposeSolidCache(); expect(geometryDisposals).toBe(1); expect(materialDisposals).toBe(0);
    expect(solidLetterGeometry('Z',axes,1,0.25,0.025)).not.toBe(geo);
    material.removeEventListener('dispose',onMat);
  });
});

describe('engrave Lambert shader', () => {
  test('preserves standard lights/shadows and injects engraving after lighting, before output', () => {
    const m = engraveMaterial({ink:[0,0,0],paper:[1,1,1]}), s = compile(m).fragmentShader;
    for (const chunk of ['lights_fragment_begin','lights_fragment_end','shadowmap_pars_fragment','opaque_fragment']) expect(s).toContain(`#include <${chunk}>`);
    expect(s).toContain('float engraveTone(');
    expect(s).toContain('gl_FragCoord.xy/PX_SCALE'); expect(s).toContain('fwidth(u)');
    expect(s.indexOf('float engraveL =')).toBeGreaterThan(s.indexOf('#include <lights_fragment_end>'));
    expect(s.indexOf('outgoingLight = mix')).toBeLessThan(s.indexOf('#include <opaque_fragment>'));
    expect(s).not.toMatch(/uniform float (time|t);|random|noise/);
    expect(compile(m).fragmentShader).toBe(s);
    m.dispose();
  });

  test('defaults match engraveTone including interleaved deep shadow coverage', () => {
    const m = engraveMaterial({ink:[0,0,0],paper:[1,1,1]}), s = compile(m);
    expect(s.uniforms.engraveGamma!.value).toBe(1.25); expect(s.uniforms.engraveMinCov!.value).toBe(0.02);
    expect(s.uniforms.engraveAngle!.value).toBe(0.6); expect(s.uniforms.engravePitch!.value).toBe(5); expect(s.uniforms.engraveFaceAngles!.value).toBe(1);
    expect(s.fragmentShader).toContain('pow(dark,engraveGamma)*0.95');
    expect(s.fragmentShader).toContain('dark*1.8-1.15');
    m.dispose();
  });

  test('setEngrave updates already compiled uniforms and linear emissive without a recompile', () => {
    const m = engraveMaterial({ink:[0,0,0],paper:[1,1,1]}), shader = compile(m), version = m.version;
    setEngrave(m,{ink:[0.1,0.2,0.3],paper:[0.6,0.7,0.8],angle:1,pitch:7,faceAngles:false,gamma:1.4,minCov:0.05,emissive:[0.3,0.2,0.1],emissiveK:2});
    expect(shader.uniforms.engraveInk!.value.toArray()).toEqual([0.1,0.2,0.3]);
    expect(shader.uniforms.engravePaper!.value.toArray()).toEqual([0.6,0.7,0.8]);
    for (const [k,v] of [['engraveAngle',1],['engravePitch',7],['engraveFaceAngles',0],['engraveGamma',1.4],['engraveMinCov',0.05]] as const) expect(shader.uniforms[k]!.value).toBe(v);
    expect(m.emissive.toArray()).toEqual([0.3,0.2,0.1]); expect(m.emissiveIntensity).toBe(2);
    expect(m.version).toBe(version);
    expect(shader.fragmentShader).toContain('outgoingLight-totalEmissiveRadiance');
    expect(shader.fragmentShader).toContain('+totalEmissiveRadiance;');
    m.dispose();
  });

  test('unowned materials are rejected and undefined options preserve values', () => {
    expect(() => setEngrave(material,{})).toThrow(TypeError);
    const m = engraveMaterial({ink:[0,0,0],paper:[1,1,1]}), s = compile(m);
    setEngrave(m,{}); expect(s.uniforms.engravePitch!.value).toBe(5); m.dispose();
  });
});

test('gallery hop is deterministic, sequential, nonnegative, and lands exactly', () => {
  for (let i=0;i<6;i++) {
    expect(solidtypeHop(i,i)).toBe(0); expect(solidtypeHop(i+0.25,i)).toBe(0.55); expect(solidtypeHop(i+0.85,i)).toBe(0);
    for (let b=0;b<16;b+=0.05) { const h = solidtypeHop(b,i); expect(h).toBeGreaterThanOrEqual(0); expect(h).toBeLessThanOrEqual(0.55); expect(solidtypeHop(b,i)).toBe(h); }
  }
});

test('gallery letters contact the plane on landing and restore renderer shadow state', () => {
  let world!: THREE.Scene, camera!: THREE.Camera, shadowed = false;
  const renderer = {
    shadowMap: { enabled: false, type: THREE.BasicShadowMap }, setRenderTarget() {}, clear() {},
    render(s: THREE.Scene,c: THREE.Camera) { world=s; camera=c; shadowed=this.shadowMap.enabled; },
  };
  const scene = new GallerySolidtype({renderer} as any);
  scene.init();
  const draw = (t: number,beat: number) => scene.render({t,beat} as any,{} as any);
  draw(1.25,7);
  expect(shadowed).toBe(true); expect(renderer.shadowMap.enabled).toBe(false); expect(renderer.shadowMap.type).toBe(THREE.BasicShadowMap);
  const word = world.children.find(c => c instanceof THREE.Group)!;
  word.updateWorldMatrix(true,true);
  expect(word.children).toHaveLength(6);
  for (const child of word.children) {
    const mesh = child as THREE.Mesh;
    const box = mesh.geometry.boundingBox!.clone().applyMatrix4(mesh.matrixWorld);
    expect(box.min.y).toBeCloseTo(0,10); expect(mesh.castShadow && mesh.receiveShadow).toBe(true);
  }
  draw(1.25,0.25); word.updateWorldMatrix(true,true);
  const first = word.children[0] as THREE.Mesh;
  expect(first.geometry.boundingBox!.clone().applyMatrix4(first.matrixWorld).min.y).toBeCloseTo(0.55,10);
  const pose = first.matrix.clone(), view = camera.matrixWorld.clone();
  draw(3.5,4.25); draw(1.25,0.25);
  expect(first.matrix.equals(pose)).toBe(true); expect(camera.matrixWorld.equals(view)).toBe(true);
  scene.dispose();
});
