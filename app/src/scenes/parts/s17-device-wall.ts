// One static, scale-aware atlas and one instanced draw call for the canonical 16x5 wall.
import * as THREE from 'three';
import { Layer2D, H, W } from '../../engine/gl';
import { F, font } from '../../engine/type';
import { css, lin } from '../../theme';
import { drawDevice } from '../../kit/devices';
import { WALL_CELLS } from './s17-release-state';
import { hash } from '../../engine/util';
import { heatColor, Voice, setLine } from '../../kit/lyric-moves';
import { fillRun } from '../../kit/vartype';
import { wallCells } from './s17-release-layout';

// S17's front-on engraved device stencil. DeviceWall below retains the S18 API.
// All non-vocal material is baked once; sung words are drawn on every occupied screen.
export class PrintedDeviceWall {
  layer = new Layer2D(W, 600);
  cells = wallCells();
  constructor() {
    const c = this.layer.ctx;
    this.layer.clear();
    for (const cell of this.cells) {
      c.save(); c.beginPath(); c.rect(cell.x, cell.y, cell.w, cell.h); c.clip();
      c.fillStyle = css(cell.k === 'D' ? 'ink' : 'clay'); c.fillRect(cell.x, cell.y, cell.w, cell.h);
      if (cell.k !== 'D') {
        c.fillStyle = css('paper', 0.42);
        for (let j = 0; j < 180; j++) c.fillRect(cell.x + hash(cell.i, j, 1) * cell.w,
          cell.y + hash(cell.i, j, 2) * cell.h, 0.7 + hash(cell.i, j, 3), 1);
        if (cell.i % 3 === 0) {
          c.strokeStyle = css('paper', 0.55); c.lineWidth = 1;
          for (let x = cell.x - cell.h; x < cell.x + cell.w; x += 4) {
            c.beginPath(); c.moveTo(x, cell.y + cell.h); c.lineTo(x + cell.h, cell.y); c.stroke();
          }
        } else if (cell.i % 3 === 1) {
          c.fillStyle = css('paper', 0.55);
          for (let y = cell.y + 3; y < cell.y + cell.h; y += 5)
            for (let x = cell.x + 3; x < cell.x + cell.w; x += 5) {
              c.beginPath(); c.arc(x, y, 0.8, 0, Math.PI * 2); c.fill();
            }
        }
      }
      // Short bezel registration ticks preserve the screen shape of each grid cell.
      c.fillStyle = css('paper', 0.6); c.fillRect(cell.x + 6, cell.y + 6, 12, 1);
      c.fillRect(cell.x + cell.w - 7, cell.y + cell.h - 18, 1, 12); c.restore();
    }
    // Sparse neighbouring impressions in the print; no extra devices or grid labels.
    for (const [col, row] of [[1, 0], [14, 0], [1, 1], [14, 1], [1, 3], [14, 3], [2, 4], [13, 4]]) {
      c.fillStyle = css('clay', 0.35);
      for (let j = 0; j < 110; j++) c.fillRect(30 + col! * 116.25 + hash(col!, row!, j) * 112,
        36 + row! * 96 + hash(row!, col!, j) * 92, 1.5, 1.5);
    }
  }

  draw(c: CanvasRenderingContext2D, v: Voice, t: number, opacity: number) {
    c.save(); c.globalAlpha = opacity;
    c.drawImage(this.layer.canvas, 0, 0, W, 600);
    const line = v.line('And it works on every machine'), forms = v.forms(line, t).slice(-2);
    const set = setLine(forms, 92);
    // The nominal cap height stays at the lyric level. A screen is deliberately narrow:
    // horizontal condensation fits the entire phrase without inventing a fourth font size.
    for (const cell of this.cells) {
      c.save(); c.beginPath(); c.rect(cell.x + 4, cell.y + 4, cell.w - 8, cell.h - 8); c.clip();
      c.translate(cell.x + 6, cell.y + cell.h / 2 + set.words[0]!.run.capH / 2);
      c.scale((cell.w - 12) / Math.max(1, set.width), 1);
      for (const s of set.words) if (s.form.born > 0) {
        c.globalAlpha = opacity * Math.min(1, s.form.born * 1.6);
        c.fillStyle = heatColor(s.form.stress ? (cell.k === 'D' ? 'clay' : 'ink') : 'paper', cell.k === 'D' ? 'ink' : 'clay', s.form.age); fillRun(c, s.run, s.x, 0);
      }
      c.restore();
    }
    c.restore();
  }
  dispose() { this.layer.texture.dispose(); }
}

export class DeviceWall {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, W / H, 1, 10000);
  atlas = new Layer2D(1536, 384);
  mesh: THREE.InstancedMesh;
  material: THREE.ShaderMaterial;

  constructor(renderer: THREE.WebGLRenderer) {
    const c = this.atlas.ctx;
    this.atlas.clear();
    for (let i = 0; i < 3; i++) {
      drawDevice(c, { x: i * 512 + 12, y: 12, width: 488, height: 360 }, {
        type: (['computer', 'tablet', 'phone'] as const)[i]!, body: 'clay',
        content: (ctx, screen) => {
          // A compact calendar keeps all 31 dates readable on the close device shot.
          ctx.save();
          ctx.translate(screen.x, screen.y);
          ctx.scale(screen.width / 320, screen.height / 260);
          ctx.fillStyle = css('ink'); ctx.font = font(F.mono(600), 22);
          ctx.fillText('OCT / 31', 14, 31);
          ctx.fillStyle = css('ink', 0.3); ctx.fillRect(12, 43, 296, 1);
          ctx.font = font(F.mono(), 21);
          for (let d = 1; d <= 31; d++) {
            const x = 14 + ((d - 1) % 7) * 43, y = 78 + Math.floor((d - 1) / 7) * 37;
            ctx.fillStyle = css(d === 31 ? 'clay' : 'ink');
            ctx.fillText(String(d), x, y);
          }
          ctx.restore();
        },
      });
    }
    this.atlas.upload();
    this.atlas.texture.generateMipmaps = true;
    this.atlas.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlas.texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const geometry = new THREE.PlaneGeometry(110, 110);
    geometry.setAttribute('deviceKind', new THREE.InstancedBufferAttribute(new Float32Array(WALL_CELLS.map(cell => (cell.x + cell.y * 2) % 3)), 1));
    geometry.setAttribute('deviceEye', new THREE.InstancedBufferAttribute(new Float32Array(WALL_CELLS.map(cell => cell.k === 'D' ? 1 : 0)), 1));
    geometry.setAttribute('deviceIndex', new THREE.InstancedBufferAttribute(new Float32Array(WALL_CELLS.map((_, i) => i)), 1));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      uniforms: {
        atlas: { value: this.atlas.texture }, lit: { value: 0 }, opacity: { value: 1 },
        beat: { value: 0 }, kick: { value: 0 }, ink: { value: new THREE.Vector3(...lin('ink')) },
      },
      vertexShader: /* glsl */ `
        attribute float deviceKind, deviceEye, deviceIndex;
        varying vec2 atlasUv; varying float eye, index;
        uniform float beat, kick;
        void main() {
          atlasUv = vec2((uv.x + deviceKind) / 3.0, uv.y);
          eye = deviceEye; index = deviceIndex;
          vec3 p = position;
          p.z += sin(beat * 0.26 + deviceIndex * 0.31) * 7.0 + kick * 8.0;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D atlas; uniform float lit, opacity; uniform vec3 ink;
        varying vec2 atlasUv; varying float eye, index;
        void main() {
          vec4 pixel = texture2D(atlas, atlasUv);
          float on = step(index, lit - 0.5);
          // The sRGB texture format is decoded by the GPU when sampled.
          vec3 rgb = pixel.rgb;
          rgb = mix(ink, rgb, on * (1.0 - eye));
          gl_FragColor = vec4(rgb, pixel.a * opacity);
        }`,
    });
    this.mesh = new THREE.InstancedMesh(geometry, this.material, WALL_CELLS.length);
    this.mesh.frustumCulled = false;
    const transform = new THREE.Object3D();
    WALL_CELLS.forEach((cell, i) => {
      transform.position.set((cell.x - 7.5) * 120, (2 - cell.y) * 120, 0);
      transform.updateMatrix(); this.mesh.setMatrixAt(i, transform.matrix);
    });
    this.scene.add(this.mesh);
  }

  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, s: {
    zoom: number; lit: number; beat: number; kick: number; opacity?: number; x?: number; y?: number; yaw?: number;
  }) {
    const u = this.material.uniforms;
    u.lit!.value = s.lit; u.opacity!.value = s.opacity ?? 1; u.beat!.value = s.beat; u.kick!.value = s.kick;
    const distance = H / 2 / Math.tan(Math.PI / 12) / s.zoom;
    const yaw = s.yaw ?? 0;
    this.camera.position.set((s.x ?? 0) + Math.sin(yaw) * distance, s.y ?? 0, Math.cos(yaw) * distance);
    this.camera.lookAt(s.x ?? 0, s.y ?? 0, 0);
    renderer.setRenderTarget(out); renderer.clear(false, true, false);
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.mesh.geometry.dispose(); this.material.dispose(); this.atlas.texture.dispose();
  }
}
