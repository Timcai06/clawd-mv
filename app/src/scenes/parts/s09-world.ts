// S09 v5: the oscilloscope's persistence becomes a landscape. Every test run is one sweep of the
// trace; the runs that already happened stand behind the glass as ridges, receding one slot per beat
// ("run the tests" again and again). The front view is the storyboard frame (the glass at z = 0 maps
// exactly onto the 2D instrument layout); on "waiting for a pass" the camera cranes up and turns, and
// the history is revealed as a ridgeline mountain (pdoom loss: a chart that is a world).
// World units: 1 = 100 logical px on the glass. x = (sx - 960) / 100, y = (540 - sy) / 100.
import type { AudioData } from '../../engine/audio';
import { clamp, ease, hash } from '../../engine/util';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { orbitCam, mixCam, p3, Rig, type Cam } from '../../kit/rig';
import type { X9Times } from '../s09-z-shared';
import { SCOPE, scopeY, scopeHead } from './s09-scope';

export const FRONT_DIST = 0.5 * 1080 / Math.tan((34 * Math.PI) / 360) / 100; // 1 unit = 100 px at z = 0
export const wx = (sx: number) => (sx - 960) / 100;
export const wy = (sy: number) => (540 - sy) / 100;
export const RIDGE_GAP = 0.95; // depth between runs
export const RIDGES = 22;

/** The camera: the storyboard's front view, then the crane that reveals the history. */
export function cameraAt(audio: AudioData, t: number, T: X9Times): Cam {
  const front = orbitCam(p3(0, 0, 0), 0, 0, FRONT_DIST, 34, 0);
  const a = ease.inOutCubic(span(t, T.terminal, T.scopeKey));
  const settle = orbitCam(p3(0.2, -0.15, 0), -0.03, 0.05, FRONT_DIST - 1.3, 34, 0.0);
  let c = mixCam(front, settle, a);
  const k = ease.inOutCubic(span(t, T.scopeKey - 0.2, afterBeats(audio, T.terminalEnd, -0.3)));
  const crane = orbitCam(p3(0.6, -0.9, -6.5), -0.42, 0.46, 19.5, 40, -0.02);
  c = mixCam(c, crane, k);
  return c;
}

/** Run k (0 = the current sweep at the glass). Depth eases back one slot on every beat. */
export function ridgeZ(audio: AudioData, t: number, T: X9Times, k: number) {
  const b = Math.max(0, beatsSince(audio, t, T.waiting));
  const ph = b - Math.floor(b);
  const push = t < T.waiting ? 1 : ease.outBack(clamp(ph / 0.35), 1.6);
  return -(k - 1 + push) * RIDGE_GAP;
}

/** Height (world) of run k's trace at screen-x sx: the heartbeat, varied per run, older runs lower. */
export function ridgeY(k: number, sx: number) {
  const ph = hash(k, 9, 1) * 0.6;
  // older runs rise into a mountain in the middle of the sweep (a ridgeline plot of the night's failures)
  const hill = 1 + 1.9 * Math.exp(-(((sx - 1010) / 430) ** 2)) * Math.min(1, k / 3);
  const amp = (k === 0 ? 1 : 0.6 + 0.7 * hash(k, 9, 2)) * hill * Math.exp(-k * 0.02);
  const local = (sx - SCOPE.traceX - 26) / SCOPE.period + ph;
  return wy(SCOPE.y) + (wy(scopeY(local)) - wy(SCOPE.y)) * amp;
}

let probe: Rig | undefined;
/** The scan head on screen (the glass plane through S09's camera); "pass" ends at its x. */
export function scanHeadScreen(audio: AudioData, t: number, T: X9Times) {
  const rig = (probe ??= new Rig()); rig.set(cameraAt(audio, t, T));
  return rig.proj(wx(scopeHead(t, T)), wy(SCOPE.y), 0) ?? { x: scopeHead(t, T), y: SCOPE.y, s: 100, w: 1 };
}
/** C8: the oscilloscope baseline on S09's first frame (front camera: the glass maps 1:1). */
export function baseScreen(audio: AudioData, t: number, T: X9Times, base: { x0: number; x1: number; y: number }) {
  const rig = (probe ??= new Rig()); rig.set(cameraAt(audio, t, T));
  const a = rig.proj(wx(base.x0), wy(base.y), 0)!, b = rig.proj(wx(base.x1), wy(base.y), 0)!;
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
}
