// A sung word as a row of 3D letters (v4): each glyph its own WordPlane, positioned by the
// continuous-Archivo layout, so letters can be written one by one as the word is sung (the pdoom
// loss/canyon method: each glyph gets its moment inside the word, flashes white-hot and cools).
import * as THREE from 'three';
import type { Word } from '../engine/lyrics';
import { lerp, clamp } from '../engine/util';
import { varRun, type Axes } from './vartype';
import { WordPlane, heat } from './wordplane';

export interface Letter { plane: WordPlane; ch: string; x: number; t0: number }

export class LetterRow {
  group = new THREE.Group();
  letters: Letter[] = [];
  width: number;
  constructor(text: string, capH: number, axes: Axes, word?: Word, span?: [number, number]) {
    const run = varRun(text, 220, axes);
    const k = capH / run.capH;
    this.width = run.width * k;
    const chars = run.glyphs;
    const [a, b] = span ?? (word ? [word.start, word.end] : [0, 0]);
    // letters arrive over the first 70 % of the sung word (the rest of a held note stretches nothing here)
    chars.forEach((g, i) => {
      if (g.ch === ' ') return;
      const plane = new WordPlane(g.ch, capH, g.axes);
      plane.mesh.position.set(g.x * k, 0, 0);
      this.group.add(plane.mesh);
      this.letters.push({ plane, ch: g.ch, x: g.x * k, t0: lerp(a, a + (b - a) * 0.7, i / Math.max(1, chars.length)) });
    });
  }
  /**
   * Write the letters at t: each appears at its t0 (rising from `rise` of its height), white-hot,
   * cooling to `rgb` over `cool` seconds. `alpha` fades the whole row.
   */
  write(t: number, rgb: readonly number[], alpha = 1, cool = 0.3, pop = 0.14) {
    for (const L of this.letters) {
      const age = t - L.t0;
      if (age < 0) { L.plane.set(rgb, 0); continue; }
      const p = clamp(age / pop);
      const e = 1 - Math.pow(1 - p, 3);
      L.plane.mesh.scale.set(1, 0.3 + 0.7 * e, 1);
      L.plane.set(heat(rgb, Math.exp(-age / cool)), alpha);
    }
  }
  dispose() { for (const L of this.letters) L.plane.dispose(); }
}
