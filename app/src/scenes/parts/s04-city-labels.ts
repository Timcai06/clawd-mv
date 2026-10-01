// Scale-aware date atlas. Glyph coverage is a mask; all display colours come from tokens.
import * as THREE from 'three';
import { SCALE, scaleContext2D } from '../../engine/gl';
import { F, font } from '../../engine/type';
import { css, lin } from '../../theme';

export class DateLabels {
  scene = new THREE.Scene();
  mesh: THREE.InstancedMesh;
  facade: THREE.Mesh;
  atlas: THREE.CanvasTexture;
  roofMaterial: THREE.RawShaderMaterial;
  faceMaterial: THREE.RawShaderMaterial;

  constructor(renderer: THREE.WebGLRenderer) {
    const cv = document.createElement('canvas');
    cv.width = 8 * 256 * SCALE;
    cv.height = 4 * 256 * SCALE;
    const c = scaleContext2D(cv.getContext('2d')!, SCALE);
    c.fillStyle = css('paper');
    c.font = font(F.archivo(87.5, 900), 184);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 32; i++) c.fillText(String(i + 1), (i % 8) * 256 + 128, Math.floor(i / 8) * 256 + 128);
    this.atlas = new THREE.CanvasTexture(cv);
    this.atlas.generateMipmaps = true;
    this.atlas.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlas.magFilter = THREE.LinearFilter;
    this.atlas.anisotropy = renderer.capabilities.getMaxAnisotropy();
    this.roofMaterial = this.material(true);
    this.faceMaterial = this.material(false);
    const geo = new THREE.PlaneGeometry(2.25, 2.25);
    geo.setAttribute('date', new THREE.InstancedBufferAttribute(Float32Array.from({ length: 32 }, (_, i) => i + 1), 1));
    this.mesh = new THREE.InstancedMesh(geo, this.roofMaterial, 32);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.facade = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), this.faceMaterial);
    this.facade.frustumCulled = false;
    this.scene.add(this.facade);
  }

  private material(instanced: boolean) {
    return new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: `precision highp float;
        in vec3 position; in vec2 uv;
        uniform mat4 modelViewMatrix, projectionMatrix;
        ${instanced ? 'in mat4 instanceMatrix; in float date;' : ''}
        out vec2 vUv; out float vDate;
        void main() {
          vUv = uv; vDate = ${instanced ? 'date' : '32.0'};
          gl_Position = projectionMatrix * modelViewMatrix * ${instanced ? 'instanceMatrix *' : ''} vec4(position, 1.0);
        }`,
      fragmentShader: `precision highp float;
        in vec2 vUv; in float vDate; out vec4 fragColor;
        uniform sampler2D atlas;
        uniform vec3 ink, clay;
        uniform float accented, visited, pulse;
        void main() {
          float i = vDate - 1.0;
          vec2 q = (vec2(mod(i, 8.0), 3.0 - floor(i / 8.0)) + vUv) / vec2(8.0, 4.0);
          float a = texture(atlas, q).a;
          if (a < 0.003) discard;
          float hot = float(abs(vDate - accented) < 0.1 && vDate < 31.5);
          vec3 c = mix(ink, clay, hot);
          float dim = hot > 0.5 ? 1.0 : 0.6;
          fragColor = vec4(c, a * dim);
        }`,
      uniforms: {
        atlas: { value: this.atlas },
        ink: { value: new THREE.Vector3(...lin('ink')) },
        clay: { value: new THREE.Vector3(...lin('clay')) },
        accented: { value: 1 }, visited: { value: 1 }, pulse: { value: 0 },
      },
      transparent: true, depthWrite: false, depthTest: true,
      side: THREE.DoubleSide, toneMapped: false,
    });
  }

  dispose() {
    this.mesh.geometry.dispose(); this.facade.geometry.dispose();
    this.roofMaterial.dispose(); this.faceMaterial.dispose(); this.atlas.dispose();
  }
}
