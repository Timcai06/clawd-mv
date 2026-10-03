import * as THREE from 'three';
import type { AudioData } from '../../engine/audio';
import { clamp, ease, lerp, springStep } from '../../engine/util';
import { lin } from '../../theme';
import { Rig, orbitCam, mixCam, p3, type Cam, type P3, planeAffine } from '../../kit/rig';
import { engraveMaterial, setEngrave } from '../../kit/engrave-mat';
import { VoxelClawd } from '../../kit/clawd3d';
import * as Clawd from '../../kit/clawd';
import { WordPlane } from '../../kit/wordplane';
import { afterBeats, span } from '../../kit/time';
import { exitEnvelope, type Prim, type Rect } from '../../kit/handoff';
import { BLOCK, CELL, DATES, STREETS, dateBlock, streetAt } from './s04-city-model';
import { screenPoints } from './s17-swarm';
import { wallCam } from './s17-world';
import type { OutroTimes } from './s18-score';
import { AUTHOR } from '../../kit/credits';
import { varRun } from '../../kit/vartype';

export const STAR_RADIUS = 200, VOXEL = 0.12;
export const CITY = DATES.filter(d => d.day <= 31);
export const MONUMENT = { at: p3(0, 0, -8 * CELL), capH: 6.5, axes: { wdth: 87.5, wght: 900 } };
export function cityHeight(d: (typeof CITY)[number], audio: AudioData, t: number, T: OutroTimes): number {
  return d.height * (1 - ease.inOutCubic(span(t, T.shots[6]!.start, afterBeats(audio, T.shots[6]!.start, 4))));
}
export function sunAngle(t: number, T: OutroTimes) { return lerp(-4, 14, ease.outCubic(span(t, T.dawn, T.shots[5]!.start))); }
export const NIGHT_AMBIENT = 0.03;
export function lightAt(t: number, T: OutroTimes) {
  const k = ease.outCubic(span(t, T.dawn, T.shots[5]!.start));
  const noon=ease.inOutCubic(span(t,T.shots[6]!.start,T.flatAt));
  const angle=lerp(sunAngle(t,T),90,noon)*Math.PI/180;
  return { sun: p3(0, Math.sin(angle), -Math.cos(angle)), sunK: angle<0 ? 0 : 0.9/Math.max(0.15,Math.sin(angle)), daylight:k, toneCeiling:lerp(0.92,0.90,noon), skyTone: angle<0?0:Math.min(0.9,0.9/Math.max(0.15,Math.sin(angle))*Math.sin(angle)),
    moon: p3(-0.4 * Math.cos(55 * Math.PI / 180), Math.sin(55 * Math.PI / 180), 0.916515 * Math.cos(55 * Math.PI / 180)), moonK: 0.40 * (1 - k) };
}
/** Lighting before engraving: identical inputs and formula are injected into the city shader. */
export function surfaceTone(p:P3,n:P3,audio:AudioData,t:number,T:OutroTimes) {
  const l=lightAt(t,T), dot=(d:P3)=>Math.max(0,n.x*d.x+n.y*d.y+n.z*d.z);
  const moon=l.moonK*dot(l.moon)*shadowAt(p,l.moon,audio,t,T);
  const sun=l.sunK*dot(l.sun)*shadowAt(p,l.sun,audio,t,T);
  return Math.min(l.toneCeiling,Math.max(0.10,NIGHT_AMBIENT+0.15*l.daylight+moon+sun));
}
export const S18_LIGHT_GLSL = `float surfaceTone(vec3 n,float moonShadow,float sunShadow) {
  float moon=g7MoonK*max(0.0,dot(n,g7Moon))*moonShadow;
  float sun=g7SunK*max(0.0,dot(n,g7Light))*sunShadow;
  return min(g7MaxTone,max(0.10,0.03+0.15*g7Daylight+moon+sun));
}`;
/** CPU/GPU AABB twins; the analytic query also validates the standard shadow-map geometry. */
export function boxHit(p: P3, rd: P3, b: { x: number; z: number; half: number; height: number }) {
  if(Math.hypot(rd.x,rd.y,rd.z)<1e-10)return -1;
  let near = -Infinity, far = Infinity;
  for (const [o, d, lo, hi] of [[p.x, rd.x, b.x - b.half, b.x + b.half], [p.y, rd.y, 0, b.height], [p.z, rd.z, b.z - b.half, b.z + b.half]]) {
    if (Math.abs(d!) < 1e-10) { if (o! < lo! || o! > hi!) return -1; continue; }
    const a = (lo! - o!) / d!, c = (hi! - o!) / d!; near = Math.max(near, Math.min(a, c)); far = Math.min(far, Math.max(a, c));
  }
  return far > Math.max(near, 0) ? near : -1;
}
export const S18_WORLD_GLSL = `float boxHit(vec3 p, vec3 rd, vec4 b) {
  if(length(rd)<1e-10)return -1.0;
  vec3 lo=vec3(b.x-b.z,0,b.y-b.z), hi=vec3(b.x+b.z,b.w,b.y+b.z);
  float near=-1e30,far=1e30;
  for(int i=0;i<3;i++){
    if(abs(rd[i])<1e-10){if(p[i]<lo[i] || p[i]>hi[i])return -1.0;}
    else {float a=(lo[i]-p[i])/rd[i],c=(hi[i]-p[i])/rd[i];near=max(near,min(a,c));far=min(far,max(a,c));}
  }
  return far>max(near,0.0)?near:-1.0;
}`;
export function shadowAt(p:P3, dir:P3, audio:AudioData, t:number, T:OutroTimes) {
  const ro=p3(p.x+dir.x*0.02,p.y+dir.y*0.02,p.z+dir.z*0.02);
  return CITY.some(d=>boxHit(ro,dir,{x:d.x,z:d.z,half:BLOCK/2,height:cityHeight(d,audio,t,T)})>0)?0:1;
}
export function starDirections() {
  const rig = new Rig(); rig.set(wallCam(1));
  return screenPoints().map(p => {
    const v = new THREE.Vector3(p.x / 960 - 1, 1 - p.y / 540, 0.5).unproject(rig.cam).sub(rig.cam.position).normalize();
    return p3(v.x, v.y, v.z);
  });
}
export function skyPoint(direction: P3): P3 { const o = wallCam(1).pos; return p3(o.x + direction.x * STAR_RADIUS, o.y + direction.y * STAR_RADIUS, o.z + direction.z * STAR_RADIUS); }
export function constellationPoint(i: number): P3 {
  // All 80 sprite positions exist; vocal onsets reveal a subset of the occupied cells first.
  const cells = Clawd.pose(null, { beat: 0, beat0: 0, p: 0 }).cells.filter(c => c.k !== 'D');
  const c = cells[i % cells.length]!;
  const x = (c.x - 7.5) * 4, y = 64 + (2 - c.y) * 4, z = -170;
  const len = Math.hypot(x, y, z); return skyPoint(p3(x / len, y / len, z / len));
}
export function clawdAt(audio: AudioData, t: number, T: OutroTimes) {
  const home = T.shots[2]!.start, bye = T.shots[3]!.start, roof = dateBlock(31);
  const jumpAt = afterBeats(audio, bye, -1), endRoute = STREETS.dayAt[30]! / STREETS.total;
  const route = streetAt(endRoute * ease.inOutQuad(span(t, home, jumpAt)));
  const k = ease.outCubic(span(t, jumpAt, bye));
  const at = p3(lerp(route[0], roof.x, k), lerp(0.06, roof.height, k) + 1.4 * Math.sin(Math.PI * span(t, jumpAt, bye)), lerp(route[2], roof.z, k));
  const waveEnd = afterBeats(audio, bye, 2), sleeping = t >= waveEnd;
  const b = audio.beatAt(t), b0 = audio.beatAt(bye);
  const action = t < bye ? 'A5' : !sleeping ? null : t >= T.shots[5]!.start ? 'A2' : 'A1';
  const pose = Clawd.pose(action, { beat: b, beat0: action === 'A2' ? audio.beatAt(T.shots[5]!.start)-1 : b0, p: 0, travel: 0 });
  if(t>=bye && !sleeping) {
    // Exactly two raises across the two measured wave beats (A13's default has eight).
    const lift = Math.sin((b-b0)*Math.PI*2)>0 ? 2 : 0;
    pose.cells = pose.cells.map(c => c.y===2 && c.x>=14 ? {...c,y:c.y-lift} : c);
  }
  return { at, pose, sleeping, flatten: t >= T.shots[6]!.start ? 1 - span(t, T.shots[6]!.start, afterBeats(audio, T.shots[6]!.start, 4)) : 1 };
}
/** Fallback prescribed by V6-S18: G1 is absent, so solve S01 P0 at t=0 from its specification. */
export function loopTarget(): Rect {
  const rig = new Rig(); rig.set(loopCamera());
  const pts = [-0.09, 0.09].flatMap(x => [0, 0.4].flatMap(y => [1.22, 1.28].map(z => rig.proj(x, y, z)!)));
  const x = Math.min(...pts.map(p => p.x)), y = Math.min(...pts.map(p => p.y));
  return { x, y, w: Math.max(...pts.map(p => p.x)) - x, h: Math.max(...pts.map(p => p.y)) - y };
}
export const loopCamera = (): Cam => orbitCam(p3(0, 0.2, 1.25), 0.25, 0.12, 1.6, 28);
const roofCam = (roof: number, yaw: number, distance: number, pitch = 0.27) => {
  const d = dateBlock(roof); return orbitCam(p3(d.x, d.height, d.z), yaw, pitch, distance, 34);
};
export function calendarCam(): Cam { return orbitCam(p3(0, 0, -7.2), 0, Math.PI / 2 - 1e-5, 22.95, 34); }
export function cameraAt(audio: AudioData, t: number, T: OutroTimes): Cam {
  const at = (i: number) => T.shots[i]!.start, initial = wallCam(1);
  if (t < at(2)) {
    const k = ease.inOutCubic(span(t, T.start + 1 / 60, at(2)));
    return { ...initial, tgt: p3(initial.tgt.x, -3 * k, initial.tgt.z) };
  }
  const low = roofCam(31, 0.12, 18, 0.23);
  if (t < at(4)) {
    const k = ease.inOutQuad(span(t, at(2), at(4))), c = mixCam({ ...initial, tgt: p3(0, -3, 0) }, low, k);
    const cl = clawdAt(audio, t, T).at;
    c.tgt.x = lerp(c.tgt.x, cl.x, Math.sin(Math.PI * k) * 0.3); c.tgt.z = lerp(c.tgt.z, cl.z, Math.sin(Math.PI * k) * 0.3); return c;
  }
  const dawn = roofCam(31, 0.12 + 0.25 * span(t, at(4), at(5)), 18, 0.23);
  if (t < at(5)) return dawn;
  const ping = roofCam(1, 0.37, 12, 0.55);
  if (t < at(6)) return mixCam(roofCam(31, 0.37, 18, 0.23), ping, ease.inOutCubic(span(t, at(5), at(6))));
  const overhead = mixCam(ping, calendarCam(), ease.inOutCubic(span(t, at(6), afterBeats(audio, at(6), 4))));
  return mixCam(overhead, loopCamera(), ease.inOutCubic(span(t, afterBeats(audio,T.end,-2),T.end-0.1)));
}
export function entryPrim(_t: number): Prim {
  const rig = new Rig(); rig.set(wallCam(1));
  return { kind: 'points', pts: starDirections().map(d => { const p = skyPoint(d), q = rig.proj(p.x, p.y, p.z)!; return { x: q.x, y: q.y }; }) };
}
export const SIGNATURE = {x:1920/7,y:648,capH:224};
export function signatureGlyphs(audio:AudioData,t:number,T:OutroTimes) {
  const run=varRun(AUTHOR.latin,100,{wdth:75,wght:900}),k=SIGNATURE.capH/run.capH,cap=SIGNATURE.capH;
  const born=(i:number)=>afterBeats(audio,T.flatAt,i*0.5);
  const drop=(at:number)=>0.3*(1-ease.outCubic(span(t,at,at+0.12)));
  const glyphs=run.glyphs.map((g,i)=>({ch:g.ch,x:SIGNATURE.x+g.x*k,y:SIGNATURE.y,w:g.adv*k,at:born(i),drop:drop(born(i)),latin:true}));
  let x=SIGNATURE.x+run.width*k+cap*0.42;
  Array.from(AUTHOR.cjk).forEach((ch,j)=>{const at=born(3+j);glyphs.push({ch,x,y:SIGNATURE.y-cap*1.1*0.085,w:cap*1.1,at,drop:drop(at),latin:false});x+=cap*1.14;});
  const written=glyphs.filter(g=>t>=g.at).at(-1);
  return {glyphs,right:x,head:written ? written.x+written.w : SIGNATURE.x};
}
export function cursorScreenAt(audio: AudioData, t: number, T: OutroTimes): Rect {
  const loopStart = afterBeats(audio, T.end, -2), target = loopTarget();
  if(t>=T.end-0.1)return target;
  const rig = new Rig(); rig.set(cameraAt(audio, t, T));
  const exitAt = T.shots[1]!.start, exitEnd = afterBeats(audio,exitAt,1);
  if(t < exitEnd) {
    const star = skyPoint(starDirections()[0]!), q = rig.proj(star.x,star.y,star.z)!;
    const k = ease.inOutCubic(span(t,exitAt,exitEnd)), chars = Math.floor(span(t,exitAt,exitEnd)*8);
    return {x:lerp(q.x,96+chars*12,k),y:lerp(q.y-2.5,850,k),w:lerp(5,9,k),h:lerp(5,20,k)};
  }
  const signatureCursor = (rig: Rig): Rect => {
    const right=signatureGlyphs(audio,t,T).head;
    const aff=calendarAffine(rig)!;
    const points=[right+6,right+6+SIGNATURE.capH*0.45].flatMap(x=>[SIGNATURE.y-SIGNATURE.capH,SIGNATURE.y].map(y=>({x:aff.a*x+aff.c*y+aff.e,y:aff.b*x+aff.d*y+aff.f})));
    const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y));
    return {x,y,w:Math.max(...points.map(p=>p.x))-x,h:Math.max(...points.map(p=>p.y))-y};
  };
  if(t >= T.flatAt && t < loopStart) return signatureCursor(rig);
  if(t >= loopStart) {
    const from = new Rig(); from.set(cameraAt(audio,loopStart,T));
    const start = signatureCursor(from);
    const k = ease.inOutCubic(span(t,loopStart,T.end-0.1));
    return {x:lerp(start.x,target.x,k),y:lerp(start.y,target.y,k),w:lerp(start.w,target.w,k),h:lerp(start.h,target.h,k)};
  }
  const d = dateBlock(1), q = rig.proj(d.x, cityHeight(d, audio, t, T) + 0.05, d.z)!;
  const h = Math.max(12, q.s * 0.4), start = { x: q.x, y: q.y - h, w: h * 0.45, h };
  return start;
}
export const cursorGainAt = (t: number, T: OutroTimes) => exitEnvelope(t,T.end).gain;
export const exitPrim = (audio: AudioData, t: number, T: OutroTimes): Prim => ({ kind: 'rect', ...cursorScreenAt(audio, t, T) });
export function calendarAffine(rig: Rig, lift=0) {
  const unit=7*CELL/1920;
  return planeAffine(rig,p3(-3.5*CELL,0.06+lift,-4.5*CELL),p3(1,0,0),p3(0,0,(5*CELL/1080)/unit),unit);
}

export class TomorrowCity {
  scene = new THREE.Scene(); rig = new Rig(); blocks: THREE.InstancedMesh; floor: THREE.Mesh;
  clawd = new VoxelClawd(); moon = new THREE.DirectionalLight(0xffffff, 0.25); sun = new THREE.DirectionalLight(0xffffff, 0);
  disk = new THREE.Mesh(new THREE.CircleGeometry(2.6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(...lin('clay')) }));
  material = engraveMaterial({ paper: lin('ink'), ink: lin('paper'), lightLines: true, maxCov:0.3, gamma:1.6, pitch:14 });
  october = new WordPlane('OCTOBER', { capH: MONUMENT.capH, axes: MONUMENT.axes, ax: 0.5, ay: 0, engrave: true });
  november = new WordPlane('NOVEMBER', { capH: MONUMENT.capH, axes: MONUMENT.axes, ax: 0.5, ay: 0, engrave: true });
  private matrix = new THREE.Matrix4();
  private boxes={value:CITY.map(()=>new THREE.Vector4())};
  private key={value:new THREE.Vector3()};
  skyMaterial=engraveMaterial({paper:lin('paper'),ink:lin('ink'),faceAngles:false});
  sky=new THREE.Mesh(new THREE.PlaneGeometry(1,1),this.skyMaterial);
  private skyTone={value:0};
  private lightUniforms={g7Moon:{value:new THREE.Vector3()},g7MoonK:{value:0},g7SunK:{value:0},g7Daylight:{value:0},g7MaxTone:{value:0.92}};
  constructor() {
    const compile=this.material.onBeforeCompile.bind(this.material);
    this.material.onBeforeCompile=(shader,renderer)=>{
      compile(shader,renderer);shader.uniforms.g7Boxes=this.boxes;shader.uniforms.g7Light=this.key;Object.assign(shader.uniforms,this.lightUniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vG7World; varying vec3 vG7Normal;');
      shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
        vec4 g7p=vec4(transformed,1.0);
        #ifdef USE_INSTANCING
        g7p=instanceMatrix*g7p;
        #endif
        vG7World=(modelMatrix*g7p).xyz;vG7Normal=normalize(mat3(modelMatrix)*objectNormal);`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 vG7World; varying vec3 vG7Normal; uniform vec4 g7Boxes[31];uniform vec3 g7Light,g7Moon;uniform float g7MoonK,g7SunK,g7Daylight,g7MaxTone;
        ${S18_WORLD_GLSL}
        float g7Shadow(vec3 p,vec3 dir){for(int i=0;i<31;i++){
          if(g7Boxes[i].w>0.00001 && boxHit(p+dir*0.02,dir,g7Boxes[i])>0.0)return 0.0;
        }return 1.0;}
${S18_LIGHT_GLSL}`);
      shader.fragmentShader=shader.fragmentShader.replace(/vec3 outgoingLight = [^;]+;/, 'vec3 outgoingLight = vec3(surfaceTone(normalize(vG7Normal),g7Shadow(vG7World,g7Moon),g7Shadow(vG7World,g7Light)));');
    };
    this.material.customProgramCacheKey=()=> 'g7-city-analytic-shadow-v2';
    this.blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.material, 31); this.blocks.frustumCulled = false;
    this.blocks.castShadow = this.blocks.receiveShadow = true;
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), this.material); this.floor.rotation.x = -Math.PI / 2; this.floor.position.z = -8;
    this.floor.receiveShadow = true;
    this.clawd.mesh.scale.setScalar(VOXEL);
    this.october.mesh.geometry.translate(0,-MONUMENT.capH/2,0); this.november.mesh.geometry.translate(0,-MONUMENT.capH/2,0);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0002;
    Object.assign(this.sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 0.1, far: 240 });
    this.sun.target.position.set(0, 0, -8);
    this.scene.add(this.blocks, this.floor, this.clawd.mesh, this.moon, this.sun, this.sun.target, this.disk, this.october.mesh, this.november.mesh, new THREE.AmbientLight(0xffffff, NIGHT_AMBIENT));
    const skyCompile=this.skyMaterial.onBeforeCompile.bind(this.skyMaterial);
    this.skyMaterial.onBeforeCompile=(shader,renderer)=>{
      skyCompile(shader,renderer);shader.uniforms.g7SkyTone=this.skyTone;
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform float g7SkyTone;');
      shader.fragmentShader=shader.fragmentShader.replace(/vec3 outgoingLight = [^;]+;/,'vec3 outgoingLight = vec3(g7SkyTone);');
    };
    this.skyMaterial.customProgramCacheKey=()=> 'g7-uniform-engraved-sky';
    this.sky.material.depthWrite=false;this.sky.renderOrder=-1;this.scene.add(this.sky);
  }
  update(audio: AudioData, t: number, T: OutroTimes) {
    this.rig.set(cameraAt(audio, t, T)); const l = lightAt(t, T);
    this.moon.position.set(l.moon.x * 100, l.moon.y * 100, l.moon.z * 100); this.moon.intensity = l.moonK;
    this.sun.position.set(l.sun.x * 100, l.sun.y * 100, -8 + l.sun.z * 100); this.sun.intensity = l.sunK;
    this.key.value.set(l.sun.x,l.sun.y,l.sun.z).normalize();
    this.lightUniforms.g7Moon.value.set(l.moon.x,l.moon.y,l.moon.z);
    this.lightUniforms.g7MoonK.value=l.moonK;this.lightUniforms.g7SunK.value=l.sunK;this.lightUniforms.g7Daylight.value=l.daylight;this.lightUniforms.g7MaxTone.value=l.toneCeiling;
    this.skyTone.value=l.skyTone;
    const forward=new THREE.Vector3();this.rig.cam.getWorldDirection(forward);
    this.sky.position.copy(this.rig.cam.position).addScaledVector(forward,350);this.sky.quaternion.copy(this.rig.cam.quaternion);
    const height=700*Math.tan(this.rig.cam.fov*Math.PI/360);this.sky.scale.set(height*1920/1080,height,1);
    this.disk.position.copy(this.sun.position); this.disk.lookAt(this.rig.cam.position); this.disk.visible = t >= T.dawn;
    setEngrave(this.material, l.sunK > 0 ? { paper: lin('paper'), ink: lin('ink'), lightLines: false, maxCov:1, gamma:1.25, pitch:5 } : { paper: lin('ink'), ink: lin('paper'), lightLines: true, maxCov:0.3, gamma:1.6, pitch:14 });
    CITY.forEach((d, i) => { const h = cityHeight(d, audio, t, T); this.boxes.value[i]!.set(d.x,d.z,BLOCK/2,h);this.matrix.makeScale(BLOCK, Math.max(0.00001, h), BLOCK).setPosition(d.x, h / 2, d.z); this.blocks.setMatrixAt(i, this.matrix); });
    this.blocks.instanceMatrix.needsUpdate = true;
    const cl = clawdAt(audio, t, T); this.clawd.update(cl.pose); this.clawd.mesh.position.set(cl.at.x, cl.at.y, cl.at.z); this.clawd.mesh.scale.setScalar(VOXEL * cl.flatten);
    this.clawd.mesh.rotation.x = cl.sleeping ? -Math.PI / 2 : 0; this.clawd.light([l.sun.x, l.sun.y, l.sun.z], 0.95);
    const flipAt = afterBeats(audio, T.shots[4]!.start, 4), flip = t <= flipAt ? 0 : t >= flipAt + 0.6 ? 1 : springStep((t - flipAt) / 0.6);
    for (const [i, plane] of [this.october, this.november].entries()) {
      plane.mesh.position.set(MONUMENT.at.x, MONUMENT.capH / 2, MONUMENT.at.z);
      plane.mesh.rotation.x = Math.PI * flip + (i ? Math.PI : 0);
      plane.mesh.visible = i ? flip >= 0.5 : flip < 0.5;
      plane.set({ prog: 1, aDim: 0, cSung: lin(l.sunK ? 'ink' : 'paper'), tone: Math.max(0.05, l.sunK), heat: 0 });
    }
  }
  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget) {
    const enabled = r.shadowMap.enabled, auto = r.shadowMap.autoUpdate;
    r.shadowMap.enabled = true; r.shadowMap.autoUpdate = true; r.setRenderTarget(out); r.clearDepth(); r.render(this.scene, this.rig.cam);
    r.shadowMap.enabled = enabled; r.shadowMap.autoUpdate = auto;
  }
  dispose() { this.blocks.geometry.dispose(); this.floor.geometry.dispose(); this.material.dispose();this.sky.geometry.dispose();this.skyMaterial.dispose(); this.clawd.dispose(); this.disk.geometry.dispose(); (this.disk.material as THREE.Material).dispose(); this.october.dispose(); this.november.dispose(); this.sun.shadow.map?.dispose(); }
}
