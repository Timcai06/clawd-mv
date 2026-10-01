// Live grounds (visual spec v2, docs/TREATMENT.md): every scene sits on one of three grounds,
// rendered by a fullscreen shader that is never static.
//   PAPER — paper, ink hairline drafting grid, paper fibre, optional halftone field
//   INK   — deep ink blue (never black), paper hairline grid in parallax, depth haze, motion streaks
//   CLAY  — full clay flood (hook impacts only), faint paper halftone
// Everything is a pure function of the uniforms the scene passes in (time, camera, kick...).
// Also: GlowLayer (clay-only glow on INK) and per-ground post presets.
import * as THREE from 'three';
import { FSPass, Layer2D, makeRT, clearRT, type Compositor } from '../engine/gl';
import { lin, POSTER_POST } from '../theme';

export type GroundKind = 'paper' | 'ink' | 'clay';

export interface GroundState {
  kind: GroundKind;
  /** Song time (s) — drives slow drift of fibres / halftone. */
  t: number;
  /** Camera pan in logical px (grid parallax follows it), and zoom (grid scale). */
  camX?: number;
  camY?: number;
  zoom?: number;
  /** Grid visibility 0..1 (default 1) and cell size in logical px (default 60; majors every 4). */
  grid?: number;
  cell?: number;
  /** Kick pulse 0..1 (e.g. Frame.a.kick): brightens major rules for a moment. */
  kick?: number;
  /** INK: depth haze 0..1 (default 0.6) with its bright side at `hazeY` (0 bottom .. 1 top, default 0). */
  haze?: number;
  hazeY?: number;
  /** Motion streaks 0..1 along `streakAngle` (radians, 0 = vertical fall). */
  streaks?: number;
  streakAngle?: number;
  /** Streak travel (scene-provided, e.g. fall distance), so streaks move with the motion. */
  travel?: number;
  /** Halftone dot field 0..1 (PAPER / CLAY), dot pitch in logical px (default 14). */
  halftone?: number;
  pitch?: number;
  /** 0..1 cross-fade to a flat second ground (for hard flips pass 0 or 1). */
  flipTo?: GroundKind;
  flip?: number;
  /** Flip wipe direction: position of the flip edge across the frame (0..1, left to right); <0 = uniform. */
  wipe?: number;
}

const colours = (k: GroundKind) => {
  const bg = k === 'ink' ? lin('ink') : k === 'clay' ? lin('clay') : lin('paper');
  const fg = k === 'paper' ? lin('ink') : lin('paper');
  return { bg, fg };
};

const FRAG = /* glsl */ `
uniform float t, camX, camY, zoom, grid, cell, kick, haze, hazeY, streaks, streakAngle, travel, halftone, pitch, flip, wipe, isInk;
uniform vec3 bg, fg, bg2;
float gridLine(float coord, float period, float w) {
  float d = abs(fract(coord / period + 0.5) - 0.5) * period; // distance to nearest rule (logical px)
  return 1.0 - smoothstep(w * 0.5, w * 0.5 + 1.0 / PX_SCALE + 0.35, d);
}
void main() {
  vec2 px = FRAG_PX;                                     // logical px, y up
  vec2 q = (px - 0.5 * vec2(1920.0, 1080.0)) / zoom + vec2(camX, -camY);
  vec3 c = bg;
  // depth haze (INK only): a slightly lighter band towards hazeY
  float hz = isInk * haze * smoothstep(1.0, 0.0, abs(vUv.y - hazeY)) * 0.10;
  c = mix(c, fg, hz);
  // drafting grid: minor cells, majors every 4, majors flash on the kick
  float minor = max(gridLine(q.x, cell, 1.0), gridLine(q.y, cell, 1.0));
  float major = max(gridLine(q.x, cell * 4.0, 1.4), gridLine(q.y, cell * 4.0, 1.4));
  float gA = grid * (minor * (isInk > 0.5 ? 0.07 : 0.06) + major * (isInk > 0.5 ? 0.16 : 0.13) * (1.0 + 1.6 * kick));
  c = mix(c, fg, clamp(gA, 0.0, 1.0));
  // motion streaks (hashed columns sliding with travel)
  if (streaks > 0.0) {
    float ca = cos(streakAngle), sa = sin(streakAngle);
    vec2 r = vec2(ca * q.x - sa * q.y, sa * q.x + ca * q.y);
    float col = floor(r.x / 6.0);
    float n = hash12(vec2(col, 7.0));
    float s = smoothstep(0.975, 1.0, n) * smoothstep(0.55, 1.0, fract(r.y / 900.0 + travel * (0.4 + n) + n * 13.0));
    c = mix(c, fg, s * streaks * 0.22);
  }
  // halftone field (PAPER / CLAY): dots of fg, radius swelling slowly across the sheet
  if (halftone > 0.0) {
    vec2 cellId = floor(q / pitch), f = fract(q / pitch) - 0.5;
    float field = 0.5 + 0.5 * snoise(vec3(cellId * 0.045, t * 0.15));
    float rad = 0.42 * field * halftone;
    float dot = 1.0 - smoothstep(rad - 0.06, rad + 0.06, length(f));
    c = mix(c, fg, dot * 0.10);
  }
  // paper fibre (PAPER only): faint low-frequency mottling
  if (isInk < 0.5) c *= 1.0 - 0.018 * fbm(q * 0.008 + vec2(0.0, t * 0.01), 3);
  // flips: uniform cross-fade, or a hard wipe edge
  float k = wipe < 0.0 ? flip : step(vUv.x, wipe);
  c = mix(c, bg2, clamp(k, 0.0, 1.0));
  fragColor = vec4(c, 1.0);
}`;

export class Ground {
  pass = new FSPass(FRAG, {
    t: { value: 0 }, camX: { value: 0 }, camY: { value: 0 }, zoom: { value: 1 }, grid: { value: 1 }, cell: { value: 60 },
    kick: { value: 0 }, haze: { value: 0.6 }, hazeY: { value: 0 }, streaks: { value: 0 }, streakAngle: { value: 0 },
    travel: { value: 0 }, halftone: { value: 0 }, pitch: { value: 14 }, flip: { value: 0 }, wipe: { value: -1 }, isInk: { value: 0 },
    bg: { value: new THREE.Vector3() }, fg: { value: new THREE.Vector3() }, bg2: { value: new THREE.Vector3() },
  });

  render(renderer: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, s: GroundState) {
    const u = this.pass.u;
    const { bg, fg } = colours(s.kind);
    const bg2 = colours(s.flipTo ?? s.kind).bg;
    (u.bg!.value as THREE.Vector3).set(...bg);
    (u.fg!.value as THREE.Vector3).set(...fg);
    (u.bg2!.value as THREE.Vector3).set(...bg2);
    u.isInk!.value = s.kind === 'ink' ? 1 : 0;
    u.t!.value = s.t;
    u.camX!.value = s.camX ?? 0; u.camY!.value = s.camY ?? 0; u.zoom!.value = s.zoom ?? 1;
    u.grid!.value = s.grid ?? 1; u.cell!.value = s.cell ?? 60; u.kick!.value = s.kick ?? 0;
    u.haze!.value = s.haze ?? 0.6; u.hazeY!.value = s.hazeY ?? 0;
    u.streaks!.value = s.streaks ?? 0; u.streakAngle!.value = s.streakAngle ?? 0; u.travel!.value = s.travel ?? 0;
    u.halftone!.value = s.halftone ?? 0; u.pitch!.value = s.pitch ?? 14;
    u.flip!.value = s.flipTo ? s.flip ?? 0 : 0; u.wipe!.value = s.flipTo && s.wipe !== undefined ? s.wipe : -1;
    this.pass.render(renderer, out);
  }
}

/**
 * Clay-only glow on INK: draw glowing things (cursor, Clawd's aura, hook word) into `layer`
 * in plain clay, then `composite()` adds them back at HDR intensity so the bloom picks them up.
 */
export class GlowLayer {
  layer = new Layer2D();
  private target?: THREE.WebGLRenderTarget;
  private occlusion?: THREE.MeshBasicMaterial;
  /** Additional clay-only 3D draw, using the scene's unchanged geometry/camera. */
  renderScene(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, occluders?: THREE.Scene) {
    this.target ??= makeRT();
    clearRT(renderer, this.target, [0, 0, 0], 0);
    if (occluders) {
      this.occlusion ??= new THREE.MeshBasicMaterial({ color: 0, toneMapped: false });
      const saved = occluders.overrideMaterial;
      occluders.overrideMaterial = this.occlusion;
      renderer.render(occluders, camera); occluders.overrideMaterial = saved;
    }
    renderer.render(scene, camera);
  }
  dispose() { this.layer.texture.dispose(); this.target?.dispose(); this.occlusion?.dispose(); }
  get ctx() { return this.layer.ctx; }
  clear() { this.layer.clear(); }
  composite(ctx: { renderer: THREE.WebGLRenderer; comp: Compositor }, out: THREE.WebGLRenderTarget, intensity = 2.2, mask?: FSPass) {
    if (mask) {
      this.target ??= makeRT();
      ctx.comp.draw(ctx.renderer, this.layer.upload(), this.target);
      mask.render(ctx.renderer, this.target);
      ctx.comp.draw(ctx.renderer, this.target.texture, out, { mode: 'add', premult: false, tint: [intensity, intensity, intensity] });
      return;
    }
    if (this.target) ctx.comp.draw(ctx.renderer, this.target.texture, out, { mode: 'add', premult: false, tint: [intensity, intensity, intensity] });
    ctx.comp.draw(ctx.renderer, this.layer.upload(), out, { mode: 'add', tint: [intensity, intensity, intensity] });
  }
}

/** Post-processing per ground. Glow only exists on INK (threshold above paper-on-ink text). */
export function postFor(kind: GroundKind) {
  // knee 0.04: the soft knee starts at 0.91 linear, above paper (0.89), so paper type never blooms;
  // only GlowLayer-boosted clay and the white-hot heat of a freshly sung word reach it.
  if (kind === 'ink') return { ...POSTER_POST, bloom: 0.7, bloomThreshold: 0.95, bloomKnee: 0.04, bloomRadius: 0.8, vignette: 0.18, grain: 0.04, shoulder: 1 };
  return { ...POSTER_POST };
}
