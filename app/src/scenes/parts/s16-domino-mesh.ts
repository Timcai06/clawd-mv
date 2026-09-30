// Nineteen engraved test plaques in a continuous serpentine track.
// The atlas is static, SCALE-aware, and shared by one instanced draw call.
import * as THREE from 'three';
import { Layer2D } from '../../engine/gl';
import { GLSL_COMMON } from '../../engine/glsl/common';
import { F, font } from '../../engine/type';
import { css, lin } from '../../theme';
import { CALENDAR_TESTS } from '../../kit/content';

export const PLAQUE = { width: 1.72, height: 3.16, depth: 0.32, pitch: 2.36 };
export const TILE = { w: 320, h: 600, cols: 4, rows: 5 };

export function dominoPosition(i: number): THREE.Vector3 {
  if (i < 7) return new THREE.Vector3((i - 3) * PLAQUE.pitch, 0, 4.9);
  if (i < 13) return new THREE.Vector3((3 - (i - 7)) * PLAQUE.pitch, 0, 0);
  return new THREE.Vector3((i - 13 - 2) * PLAQUE.pitch, 0, -4.9);
}

export function dominoDirection(i: number): THREE.Vector3 {
  const here = dominoPosition(i), next = dominoPosition(i < 18 ? i + 1 : i);
  if (i === 18) return new THREE.Vector3(1, 0, 0);
  return next.sub(here).normalize();
}

const VERT = /* glsl */ `
precision highp float;
in vec3 position, normal;
in vec2 uv;
in mat4 instanceMatrix;
in float cardIndex, passed;
uniform mat4 modelViewMatrix, projectionMatrix;
out vec3 vLocal, vNormal;
out vec2 vUv;
flat out float vCard, vPassed;
void main() {
  vLocal = position;
  vNormal = normal;
  vUv = uv;
  vCard = cardIndex; vPassed = passed;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;

const FRAG = /* glsl */ `
precision highp float;
precision highp int;
${GLSL_COMMON}
in vec3 vLocal, vNormal;
in vec2 vUv;
flat in float vCard, vPassed;
out vec4 fragColor;
uniform sampler2D atlas;
uniform vec3 paperColor, inkColor, passColor, failColor;

float segD(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b - a;
  return length(p - a - ab * clamp(dot(p - a, ab) / dot(ab, ab), 0.0, 1.0));
}
void main() {
  bool front = vNormal.z > 0.5;
  vec2 surface = abs(vNormal.z) > 0.5 ? vLocal.xy
    : abs(vNormal.x) > 0.5 ? vLocal.zy : vLocal.xz;
  float darkness = front ? 0.13 : abs(vNormal.y) > 0.5 ? 0.38 : 0.72;
  float cuts = engrave(surface, darkness, 48.0, 0.7);
  vec3 base = mix(paperColor, inkColor, front ? 0.0 : 0.12);
  // All semantic ink belongs to the plaque's test status; it never reaches the ground.
  if (front) base = mix(base, passColor, vPassed);
  vec3 foreground = front ? mix(inkColor, paperColor, vPassed) : inkColor;
  vec3 color = mix(base, foreground, cuts * (front ? 0.18 : 0.85));
  if (front) {
    vec2 tile = vec2(mod(vCard, 4.0), floor(vCard / 4.0));
    vec2 sampleUv = (tile + vec2(vUv.x, vUv.y)) / vec2(4.0, 5.0);
    float text = texture(atlas, sampleUv).a;
    color = mix(color, foreground, text);
    vec2 q = vec2(vUv.x, vUv.y);
    float failMark = min(segD(q, vec2(0.38, 0.71), vec2(0.62, 0.59)),
      segD(q, vec2(0.38, 0.59), vec2(0.62, 0.71)));
    float passMark = min(segD(q, vec2(0.34, 0.65), vec2(0.46, 0.59)),
      segD(q, vec2(0.46, 0.59), vec2(0.68, 0.72)));
    float markD = mix(failMark, passMark, vPassed);
    float mark = 1.0 - smoothstep(0.014, 0.014 + fwidth(markD), markD);
    color = mix(color, mix(failColor, paperColor, vPassed), mark);
    // An unpassed plaque only carries a narrow failed-test strip.
    float statusStrip = 1.0 - smoothstep(0.02, 0.024, q.y);
    color = mix(color, mix(failColor, passColor, vPassed), statusStrip);
  }
  fragColor = vec4(color, 1.0);
}`;

function wrap(c: CanvasRenderingContext2D, text: string, width: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(' ')) {
    if (row && c.measureText(`${row} ${word}`).width > width) { rows.push(row); row = word; }
    else row += `${row ? ' ' : ''}${word}`;
  }
  if (row) rows.push(row);
  return rows;
}

export class DominoMesh {
  atlas = new Layer2D(TILE.cols * TILE.w, TILE.rows * TILE.h);
  material: THREE.RawShaderMaterial;
  geometry = new THREE.BoxGeometry(PLAQUE.width, PLAQUE.height, PLAQUE.depth);
  mesh: THREE.InstancedMesh;
  status = new THREE.InstancedBufferAttribute(new Float32Array(19), 1);

  constructor(renderer: THREE.WebGLRenderer) {
    this.buildAtlas();
    this.atlas.texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.atlas.texture.magFilter = THREE.LinearFilter;
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        atlas: { value: this.atlas.upload() },
        paperColor: { value: new THREE.Vector3(...lin('paper')) },
        inkColor: { value: new THREE.Vector3(...lin('ink')) },
        passColor: { value: new THREE.Vector3(...lin('pass')) },
        failColor: { value: new THREE.Vector3(...lin('fail')) },
      },
      depthTest: true, depthWrite: true,
    });
    this.geometry.setAttribute('cardIndex', new THREE.InstancedBufferAttribute(
      Float32Array.from({ length: 19 }, (_, i) => i), 1));
    this.status.setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('passed', this.status);
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, 19);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
  }

  private buildAtlas() {
    this.atlas.clear();
    const c = this.atlas.ctx;
    CALENDAR_TESTS.forEach((text, i) => {
      // Canvas is top-down while the atlas UVs are bottom-up.
      const col = i % TILE.cols, row = TILE.rows - 1 - Math.floor(i / TILE.cols);
      c.save(); c.translate(col * TILE.w, row * TILE.h);
      c.fillStyle = css('ink'); c.font = font(F.mono(500), 21);
      c.fillText('MONTH.TEST.TS', 25, 47);
      c.font = font(F.archivo(100, 800), 108);
      c.fillText(String(i + 1).padStart(2, '0'), 25, 145);
      c.fillRect(25, 303, 270, 1.5);
      c.font = font(F.mono(500), 24);
      wrap(c, text, 265).forEach((line, j) => c.fillText(line, 25, 349 + j * 34));
      c.font = font(F.mono(400), 19);
      c.fillText(`TEST ${String(i + 1).padStart(2, '0')} / 19`, 25, 556);
      c.restore();
    });
  }

  setState(cards: readonly { passed: boolean; angle: number }[]) {
    const matrix = new THREE.Matrix4(), q = new THREE.Quaternion();
    const center = new THREE.Vector3(), axis = new THREE.Vector3();
    cards.forEach((card, i) => {
      const position = dominoPosition(i), direction = dominoDirection(i);
      axis.set(direction.z, 0, -direction.x);
      q.setFromAxisAngle(axis, card.angle);
      center.set(0, PLAQUE.height / 2, 0).applyQuaternion(q).add(position);
      matrix.compose(center, q, new THREE.Vector3(1, 1, 1));
      this.mesh.setMatrixAt(i, matrix);
      this.status.setX(i, card.passed ? 1 : 0);
    });
    this.status.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.updateMatrixWorld(true);
  }

  dispose() {
    this.geometry.dispose(); this.material.dispose(); this.atlas.texture.dispose();
    this.mesh.dispose();
  }
}
