import * as THREE from 'three';
import { varGlyph, varRun, type Axes } from './vartype';
import type { P3 } from './rig';

export interface SolidTextOpts {
  capH: number;
  axes: Axes;
  depth: number;
  bevel?: number;
  tracking?: number;
  material: THREE.Material;
  curveSegments?: number;
}

const cache = new Map<string, THREE.ExtrudeGeometry>();

function reverseContour(path: THREE.Path): void {
  path.curves = path.curves.slice().reverse().map(curve => {
    if (curve instanceof THREE.LineCurve) return new THREE.LineCurve(curve.v2.clone(),curve.v1.clone());
    if (curve instanceof THREE.QuadraticBezierCurve) return new THREE.QuadraticBezierCurve(curve.v2.clone(),curve.v1.clone(),curve.v0.clone());
    if (curve instanceof THREE.CubicBezierCurve) return new THREE.CubicBezierCurve(curve.v3.clone(),curve.v2.clone(),curve.v1.clone(),curve.v0.clone());
    throw new TypeError(`unsupported font curve ${curve.type}`);
  });
}

/** Shared geometries outlive words; call only after all their users are disposed. */
export function disposeSolidCache(): void {
  for (const geometry of cache.values()) geometry.dispose();
  cache.clear();
}

export function solidLetterGeometry(ch: string, axes: Axes, capH: number, depth: number, bevel: number, curveSegments = 6): THREE.ExtrudeGeometry {
  const ax = { wdth: Math.round(axes.wdth*2)/2, wght: Math.round(axes.wght/5)*5 };
  const key = JSON.stringify([ch, ax.wdth, ax.wght, capH, depth, bevel, curveSegments]);
  const hit = cache.get(key);
  if (hit) return hit;
  // varRun defines the cap-height/em conversion used by fillRun. Glyph coordinates
  // are obtained at size 100 as well, avoiding an assumed unitsPerEm constant.
  const run = varRun('H', 100, ax), o = varGlyph(ch, ax);
  const fontScale = run.glyphs[0]!.adv/run.glyphs[0]!.o.adv;
  const s = fontScale*capH/run.capH;
  const path = new THREE.ShapePath();
  let j = 0;
  for (const t of o.types) {
    if (t === 'M') { path.moveTo(o.xy[j]! * s, -o.xy[j+1]! * s); j += 2; }
    else if (t === 'L') { path.lineTo(o.xy[j]! * s, -o.xy[j+1]! * s); j += 2; }
    else if (t === 'Q') { path.quadraticCurveTo(o.xy[j]! * s, -o.xy[j+1]! * s, o.xy[j+2]! * s, -o.xy[j+3]! * s); j += 4; }
    else if (t === 'C') {
      path.bezierCurveTo(o.xy[j]! * s, -o.xy[j+1]! * s, o.xy[j+2]! * s, -o.xy[j+3]! * s, o.xy[j+4]! * s, -o.xy[j+5]! * s); j += 6;
    } else if (t === 'Z') path.currentPath!.closePath();
  }
  // r186 toShapes() uses nonzero winding; the former isCCW argument is gone.
  path.userData.style = { fillRule: 'nonzero' };
  const shapes = path.toShapes();
  for (const shape of shapes) {
    if (THREE.ShapeUtils.area(shape.getPoints(curveSegments)) < 0) reverseContour(shape);
    for (const hole of shape.holes) if (THREE.ShapeUtils.area(hole.getPoints(curveSegments)) > 0) reverseContour(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel,
    bevelSegments: 2, curveSegments,
  });
  // ExtrudeGeometry bevel extends behind zero. Preserve the baseline in x/y,
  // move only z so the backmost surface can sit flush against a plane.
  geometry.translate(0, 0, bevel);
  geometry.computeBoundingBox();
  cache.set(key, geometry);
  return geometry;
}

export class SolidText {
  readonly group = new THREE.Group();
  readonly letters: { ch: string; mesh: THREE.Mesh; x: number; adv: number; i: number }[] = [];
  readonly width: number;
  readonly capH: number;
  private centers: THREE.Vector3[] = [];
  private position = new THREE.Vector3();
  private rotation = new THREE.Euler();
  private quaternion = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private pivot = new THREE.Matrix4();

  constructor(text: string, o: SolidTextOpts) {
    const run = varRun(text, 100, o.axes, (o.tracking ?? 0)*100);
    const s = o.capH/run.capH;
    this.width = run.width*s;
    this.capH = o.capH;
    for (const g of run.glyphs) {
      const geometry = solidLetterGeometry(g.ch, o.axes, o.capH, o.depth, o.bevel ?? o.depth*0.1, o.curveSegments);
      const mesh = new THREE.Mesh(geometry, o.material);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.letters.push({ ch: g.ch, mesh, x: g.x*s, adv: g.adv*s, i: g.i });
      this.centers.push(geometry.boundingBox!.getCenter(new THREE.Vector3()));
      this.group.add(mesh);
      this.setLetter(g.i, {});
    }
  }

  /** Absolute pose; omitted components return to the baseline pose. XYZ Euler radians. */
  setLetter(i: number, p: { d?: P3; rot?: P3; scale?: P3; visible?: boolean }): void {
    const letter = this.letters[i];
    if (!letter) throw new RangeError(`letter index ${i}`);
    const c = this.centers[i]!;
    this.position.set(letter.x+c.x+(p.d?.x ?? 0), c.y+(p.d?.y ?? 0), c.z+(p.d?.z ?? 0));
    this.rotation.set(p.rot?.x ?? 0, p.rot?.y ?? 0, p.rot?.z ?? 0);
    this.quaternion.setFromEuler(this.rotation);
    this.scale.set(p.scale?.x ?? 1, p.scale?.y ?? 1, p.scale?.z ?? 1);
    this.pivot.makeTranslation(-c.x, -c.y, -c.z);
    letter.mesh.matrix.compose(this.position, this.quaternion, this.scale).multiply(this.pivot);
    letter.mesh.matrixWorldNeedsUpdate = true;
    letter.mesh.visible = p.visible ?? true;
  }

  /** Transformed corners of the glyph's local AABB, including every ancestor. */
  letterCorners(i: number): P3[] {
    const letter = this.letters[i];
    if (!letter) throw new RangeError(`letter index ${i}`);
    const box = letter.mesh.geometry.boundingBox!;
    if (box.isEmpty()) return [];
    letter.mesh.updateWorldMatrix(true, false);
    const points: P3[] = [];
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const v = new THREE.Vector3(x, y, z).applyMatrix4(letter.mesh.matrixWorld);
      points.push({ x: v.x, y: v.y, z: v.z });
    }
    return points;
  }

  /** Material ownership stays with the caller; cached geometries remain reusable. */
  dispose(): void { this.group.removeFromParent(); this.group.clear(); }
}
