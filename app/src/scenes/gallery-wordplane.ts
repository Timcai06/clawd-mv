import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { clearRT } from '../engine/gl';
import { clamp } from '../engine/util';
import { lin, POSTER_POST } from '../theme';
import { WordPlane } from '../kit/wordplane';
import { Rig, orbitCam } from '../kit/rig';
import type { Word } from '../engine/lyrics';

export default class GalleryWordplane extends Scene {
  private world = new THREE.Scene();
  private rig = new Rig();
  private planes: WordPlane[] = [];
  private detached: WordPlane[] = [];
  private commit!: Word;
  private machine!: Word;
  override init() {
    this.commit = this.ctx.lyrics.findWords('commit')[0]!; this.machine = this.ctx.lyrics.findWords('machine')[0]!;
    if (!this.commit || !this.machine) throw new Error('gallery needs aligned commit and machine');
    this.planes = [new WordPlane('commit',{ capH: 0.8,ax: 0.5 }),new WordPlane('machine',{ capH: 0.8,ax: 0.5 }),new WordPlane('commit',{ capH: 0.8,ax: 0.5,engrave: true })];
    this.planes[1]!.set({ dir: -1 });
    for (let i = 0; i < 3; i++) { this.planes[i]!.mesh.position.set((i-1)*5.5,1.7,0); this.world.add(this.planes[i]!.mesh); }
    const source = new WordPlane('machine',{ capH: 0.75,ax: 0.5 }); this.detached = source.letters(); source.dispose();
    for (const p of this.detached) this.world.add(p.mesh);
  }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const lt = ((f.t-10)%4+4)%4, t = 10+lt;
    this.rig.set(orbitCam({ x: 0,y: 0,z: 0 },0.05,0.12,23,34));
    const light = new THREE.Vector3(-0.4,0.6,1).normalize();
    this.planes.forEach((p,i) => {
      const word = i === 1 ? this.machine : this.commit, sungT = word.start+lt;
      p.mesh.rotation.set(0.08*Math.sin(t*0.4+i),0.5*Math.sin(t*0.6+i),0.04*Math.sin(t*0.7+i));
      const normal = new THREE.Vector3(0,0,1).applyQuaternion(p.mesh.quaternion);
      p.set({ prog: p.karaoke(word,sungT),done: clamp((sungT-word.end)/0.7),tone: clamp(normal.dot(light)),cDim: lin('paper'),cSung: lin('clay'),cDone: lin('paper') });
    });
    this.detached.forEach((p,i) => {
      const age = Math.max(0,lt-1.1-i*0.17);
      p.mesh.position.set(0,-1.8-2.2*age*age,0); p.mesh.rotation.set(0,0,age*(i%2 ? 0.18 : -0.18));
      p.set({ prog: 1,heat: Math.exp(-age/0.28)*clamp(age/0.03),opacity: clamp(1-age/2) });
    });
    clearRT(this.ctx.renderer,out,lin('ink')); this.ctx.renderer.setRenderTarget(out); this.ctx.renderer.render(this.world,this.rig.cam);
    return { ...POSTER_POST,hud: 0 };
  }
  override dispose() { for (const p of [...this.planes,...this.detached]) p.dispose(); }
}
