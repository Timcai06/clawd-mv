// Impacts (stage 9 ②, docs/reference/polish-gaps.md G3): a scene lists the moments that hit — a
// kick, a snare, a stressed syllable, a stamp — and gets back the shake, the camera kick and
// whether this is an impact frame (the palette swap, pdoom hook.ts: two frames per slam). Pure
// functions of t; everything is zero for the last 0.1 s before the scene's cut (R4).
import { frameIdx, hash, pulse } from '../engine/util';

export interface Hit {
  t: number;
  /** Shake amplitude in px at the hit. */
  shake?: number;
  /** Camera kick (added zoom) at the hit. */
  kick?: number;
  /** Half-life of the decay in s (default 0.06). */
  half?: number;
  /** Swap ground and ink for two frames. */
  swap?: boolean;
}

export interface Impact { shake: [number, number]; kick: number; swap: boolean }

export function impact(t: number, hits: readonly Hit[], cut = Infinity): Impact {
  if (t >= cut - 0.1) return { shake: [0, 0], kick: 0, swap: false };
  let amp = 0, kick = 0, swap = false;
  for (const h of hits) {
    if (t < h.t) continue;
    const k = pulse(t, h.t, h.half ?? 0.06);
    amp += (h.shake ?? 0) * k; kick += (h.kick ?? 0) * k;
    if (h.swap && t < h.t + 2 / 60) swap = true;
  }
  // Direction is fixed per output frame (constant across the shutter's sub-frames).
  const fi = frameIdx(t);
  return { shake: [(hash(fi, 61) - 0.5) * 2 * amp, (hash(fi, 62) - 0.5) * 2 * amp], kick, swap };
}

/** Drum hits of a kind between t0 and t1 as Hits. */
export function drumHits(events: [number, number][], o: Omit<Hit, 't'>): Hit[] {
  return events.map(([t]) => ({ ...o, t }));
}
