// The poster stage (docs/ARCHITECTURE.md): a flat Swiss poster lying in 3D at z = 0, physical
// UI panels floating above it with soft shadows on the paper, and a perspective camera that
// can dolly, pan and look at the poster obliquely.
//
// Units: everything is in "poster px" (logical px on the poster sheet, y down, origin top-left of
// the sheet). With the default camera the screen shows exactly W x H poster px centred on `look`.
// World space is x right, y up, z towards the camera; the sheet's centre is the world origin.
import * as THREE from 'three';
import { W, H, SCALE, scaleContext2D } from '../engine/gl';
import { lin, THEME } from '../theme';

export interface CameraView {
  /** Poster point (px) the camera looks at (default: the sheet's centre). */
  x?: number;
  y?: number;
  /** Zoom: 1 frames exactly W x H poster px at the look point; 2 shows half as much. */
  zoom?: number;
  /** Orbit around the look point, degrees: yaw turns left/right, pitch tilts (positive = look up the sheet). */
  yaw?: number;
  pitch?: number;
  roll?: number;
  /** Vertical field of view in degrees (perspective strength). Default 30. */
  fov?: number;
}

export interface Placement {
  /** Centre of the panel over the poster (poster px). */
  x: number;
  y: number;
  /** Height above the paper (poster px). Drives shadow offset, size and softness. */
  z?: number;
  /** Rotation in degrees about the panel's own axes. */
  rx?: number;
  ry?: number;
  rz?: number;
  /** 0..1 opacity of the panel (and its shadow). */
  alpha?: number;
  visible?: boolean;
}

function canvas2D(w: number, h: number, scale: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(w * scale));
  cv.height = Math.max(1, Math.round(h * scale));
  const ctx = scaleContext2D(cv.getContext('2d')!, scale);
  return { cv, ctx };
}

function canvasTexture(cv: HTMLCanvasElement, renderer: THREE.WebGLRenderer, mip: boolean) {
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = mip;
  tex.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

let shadowTex: THREE.CanvasTexture | undefined;
/** A soft rectangle (white on transparent) used, tinted, as every panel's shadow. */
function softRect(renderer: THREE.WebGLRenderer) {
  if (shadowTex) return shadowTex;
  const n = 256, pad = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = n;
  const c = cv.getContext('2d')!;
  c.filter = `blur(${pad / 2.5}px)`;
  c.fillStyle = '#fff';
  c.fillRect(pad, pad, n - 2 * pad, n - 2 * pad);
  shadowTex = new THREE.CanvasTexture(cv);
  shadowTex.generateMipmaps = true;
  shadowTex.minFilter = THREE.LinearMipmapLinearFilter;
  void renderer;
  return shadowTex;
}
/** Fraction of the soft rect texture covered by its blur margin on each side. */
const SHADOW_PAD = 64 / 256;

/** A physical panel: draw into `ctx` (logical px, w x h), then `update()` once per frame. */
export class Panel {
  ctx: CanvasRenderingContext2D;
  mesh: THREE.Mesh;
  shadow: THREE.Mesh;
  private tex: THREE.CanvasTexture;
  place: Placement = { x: 0, y: 0 };

  constructor(public w: number, public h: number, private stage: Stage, res = 1) {
    const { cv, ctx } = canvas2D(w, h, SCALE * res);
    this.ctx = ctx;
    this.tex = canvasTexture(cv, stage.renderer, true);
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    this.mesh.renderOrder = 2;
    const smat = new THREE.MeshBasicMaterial({
      alphaMap: softRect(stage.renderer), color: new THREE.Color().setRGB(...lin('ink'), THREE.LinearSRGBColorSpace),
      transparent: true, depthWrite: false, toneMapped: false,
    });
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), smat);
    this.shadow.renderOrder = 1;
    stage.scene.add(this.shadow, this.mesh);
  }

  /** Clear the panel canvas (transparent, or filled with a colour). */
  clear(color?: string) {
    const c = this.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (color) { c.fillStyle = color; c.fillRect(0, 0, this.w, this.h); } else c.clearRect(0, 0, this.w, this.h);
    c.restore();
  }

  /** Upload the canvas and apply a placement. */
  update(p: Placement) {
    this.place = p;
    this.tex.needsUpdate = true;
    const z = p.z ?? 40, a = p.alpha ?? 1, show = p.visible ?? true;
    const [wx, wy] = this.stage.toWorld(p.x, p.y);
    const D = THREE.MathUtils.DEG2RAD;
    this.mesh.position.set(wx, wy, z);
    this.mesh.rotation.set((p.rx ?? 0) * D, (p.ry ?? 0) * D, (p.rz ?? 0) * D, 'XYZ');
    (this.mesh.material as THREE.MeshBasicMaterial).opacity = a;
    this.mesh.visible = show;
    // Shadow: light from the upper left; it slides down-right, grows and softens with height.
    // Rotations about x/y shrink the footprint by the cosine (a flat-card approximation).
    const fx = Math.abs(Math.cos((p.ry ?? 0) * D)), fy = Math.abs(Math.cos((p.rx ?? 0) * D));
    const spread = 1 + z / 900;
    const sw = (this.w * fx * spread) / (1 - 2 * SHADOW_PAD * Math.min(1, 0.35 + z / 300));
    const sh = (this.h * fy * spread) / (1 - 2 * SHADOW_PAD * Math.min(1, 0.35 + z / 300));
    const [sx, sy] = this.stage.toWorld(p.x + z * 0.18, p.y + z * 0.32);
    this.shadow.position.set(sx, sy, 0.5);
    this.shadow.rotation.set(0, 0, (p.rz ?? 0) * D);
    this.shadow.scale.set(sw, sh, 1);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = a * THREE.MathUtils.clamp(0.22 - z / 4000, 0.06, 0.22);
    this.shadow.visible = show && z > 0.5;
  }
}

export class Stage {
  scene = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  /** The poster sheet: draw into `poster` (poster px), it is uploaded in render(). */
  poster: CanvasRenderingContext2D;
  panels: Panel[] = [];
  private posterTex: THREE.CanvasTexture;

  /** `pw` x `ph`: size of the poster sheet in poster px (larger than the screen so the camera can move). */
  constructor(public renderer: THREE.WebGLRenderer, public pw = W * 1.5, public ph = H * 1.5) {
    const { cv, ctx } = canvas2D(pw, ph, SCALE);
    this.poster = ctx;
    this.posterTex = canvasTexture(cv, renderer, true);
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph),
      new THREE.MeshBasicMaterial({ map: this.posterTex, toneMapped: false }));
    sheet.renderOrder = 0;
    this.scene.add(sheet);
    this.cam = new THREE.PerspectiveCamera(30, W / H, 1, 100000);
    this.view({});
  }

  /** Poster px (y down, from the sheet's top-left) -> world x, y. */
  toWorld(x: number, y: number): [number, number] {
    return [x - this.pw / 2, this.ph / 2 - y];
  }

  addPanel(w: number, h: number, res = 1) {
    const p = new Panel(w, h, this, res);
    this.panels.push(p);
    return p;
  }

  /** Clear the poster sheet to paper. */
  clearPoster() {
    const c = this.poster;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = THEME.paper;
    c.fillRect(0, 0, this.pw, this.ph);
    c.restore();
  }

  /** Point the camera. */
  view(v: CameraView) {
    const fov = v.fov ?? 30, zoom = v.zoom ?? 1;
    const D = THREE.MathUtils.DEG2RAD;
    this.cam.fov = fov;
    this.cam.updateProjectionMatrix();
    const [lx, ly] = this.toWorld(v.x ?? this.pw / 2, v.y ?? this.ph / 2);
    const dist = H / 2 / Math.tan((fov * D) / 2) / zoom;
    const yaw = (v.yaw ?? 0) * D, pitch = (v.pitch ?? 0) * D;
    this.cam.position.set(
      lx + dist * Math.sin(yaw) * Math.cos(pitch),
      ly - dist * Math.sin(pitch),
      dist * Math.cos(yaw) * Math.cos(pitch),
    );
    this.cam.up.set(Math.sin((v.roll ?? 0) * D), Math.cos((v.roll ?? 0) * D), 0);
    this.cam.lookAt(lx, ly, 0);
  }

  /** Render the stage into `out` (fully overwrites it). */
  render(out: THREE.WebGLRenderTarget) {
    this.posterTex.needsUpdate = true;
    const r = this.renderer;
    r.setRenderTarget(out);
    r.setClearColor(new THREE.Color().setRGB(...lin('paper'), THREE.LinearSRGBColorSpace), 1);
    r.clear(true, true, true);
    r.render(this.scene, this.cam);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.MeshBasicMaterial;
        if (m.map && m.map !== shadowTex) m.map.dispose();
        m.dispose();
      }
    });
  }
}
