import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { engraveMaterial } from '../kit/engrave-mat';
import { SolidText } from '../kit/solidtype';
import { Rig, orbitCam } from '../kit/rig';
import { lin, POSTER_POST } from '../theme';

/** A beat-long hop: quick rise, accelerating fall, then an exact ground contact. */
export function solidtypeHop(beat: number, i: number): number {
  const p = ((beat-i)%8+8)%8;
  if (p >= 0.85-1e-10) return 0;
  if (p < 0.25) return 0.55*(1-(1-p/0.25)**2);
  return 0.55*(1-((p-0.25)/0.6)**2);
}

export default class GallerySolidtype extends Scene {
  private world = new THREE.Scene();
  private rig = new Rig();
  private print = engraveMaterial({ ink: lin('ink'), paper: lin('paper') });
  private cursorMat = engraveMaterial({ ink: [0,0,0], paper: [0,0,0], emissive: lin('clay'), emissiveK: 1 });
  private word!: SolidText;
  private floorOffsets: number[] = [];
  private floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200), this.print);
  private cursor = new THREE.Mesh(new THREE.BoxGeometry(0.12,0.3,0.12), this.cursorMat);
  private light = new THREE.DirectionalLight(0xffffff, 2.8);

  override init(): void {
    this.world.background = new THREE.Color().setRGB(...lin('paper'), THREE.LinearSRGBColorSpace);
    this.word = new SolidText('COMMIT', { capH: 1, axes: { wdth: 100, wght: 900 }, depth: 0.25, material: this.print });
    this.word.group.position.set(-this.word.width/2, 0, 0);
    this.floorOffsets = this.word.letters.map(l => -l.mesh.geometry.boundingBox!.min.y);
    this.floor.rotation.x = -Math.PI/2;
    this.floor.receiveShadow = true;
    this.cursor.position.set(this.word.width/2+0.3,0.15,0.125);
    this.cursor.castShadow = this.cursor.receiveShadow = true;
    this.light.position.set(-6,3,5);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(2048,2048);
    Object.assign(this.light.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 0.1, far: 30 });
    this.light.shadow.bias = -0.0002;
    this.light.shadow.normalBias = 0.015;
    this.world.add(this.floor,this.word.group,this.cursor,this.light,this.light.target,new THREE.AmbientLight(0xffffff,0.25));
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    for (const letter of this.word.letters) this.word.setLetter(letter.i, { d: { x: 0, y: this.floorOffsets[letter.i]!+solidtypeHop(f.beat,letter.i), z: 0 } });
    this.rig.set(orbitCam({ x: 0, y: 0.55, z: 0 }, -0.25+f.t*0.06, 0.24, 9, 34));
    const r = this.ctx.renderer;
    const enabled = r.shadowMap.enabled, type = r.shadowMap.type;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    try { r.setRenderTarget(out); r.clear(true,true,true); r.render(this.world,this.rig.cam); }
    finally { r.shadowMap.enabled = enabled; r.shadowMap.type = type; }
    return { ...POSTER_POST, hud: 0, grain: 0 };
  }

  override dispose(): void {
    this.word.dispose(); this.floor.geometry.dispose(); this.cursor.geometry.dispose();
    this.print.dispose(); this.cursorMat.dispose(); this.light.dispose();
  }
}
