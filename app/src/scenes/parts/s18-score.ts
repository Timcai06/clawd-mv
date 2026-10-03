// Outro event score: vocal onsets are the unaligned oh events; no chorus carry.
import board from '../../../../storyboard/shots.json';
import { resolveStoryboard, type Storyboard, type ResolvedShot } from '../../storyboard';
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Line, Word } from '../../engine/lyrics';
import type { Voice } from '../../kit/lyric-moves';
import { CREDIT_LINES, type CreditsState } from '../../kit/credits';
import { afterBeats, beatsSince, span } from '../../kit/time';
import { ease } from '../../engine/util';
import { Rig } from '../../kit/rig';
import { starDirections, skyPoint, constellationPoint, cameraAt, entryPrim, CITY, clawdAt } from './s18-world';
export interface OutroTimes { shots: ResolvedShot[]; start: number; end: number; dawn: number; ohs: Word[]; carried: Line[] }
export const SIGNATURE_LABEL = 'A FILM BY  ·  作品';
export const CODE_LINE = '每一帧都由代码画出';
export function resolveOutroTimes(audio: AudioData, lyrics: Lyrics): OutroTimes {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots.filter(s => s.scene === 'S18');
  const start = shots[0]!.start, end = shots.at(-1)!.end;
  const events = audio.events('vocal', start, end).slice(0, 80);
  const ohs = events.map(([at], i): Word => ({ w: 'oh', start: at, end: Math.min(at + 0.4, events[i + 1]?.[0] ?? end), line: -1, index: i, gi: i }));
  return { shots, start, end, dawn: afterBeats(audio, shots[4]!.start, 8), ohs, carried: [] };
}
export function handoffIn(t: number, _audio: AudioData, _T: OutroTimes) { const p = entryPrim(t); return p.kind === 'points' ? p.pts : []; }
export const STAR_TARGETS = starDirections().map(skyPoint);
export const CONSTELLATION_EDGES = Array.from({ length: 79 }, (_, i) => [i, i + 1] as const);
export function starState(audio: AudioData, _voice: Voice, t: number, T: OutroTimes) {
  const rig = new Rig(); rig.set(cameraAt(audio, t, T));
  const loop = 1 - ease.inOutCubic(span(t, afterBeats(audio, T.end, -2), T.end - 1 / 60));
  const born = [...STAR_TARGETS.map(p => ({ p, at: T.start })), ...T.ohs.map((w, i) => ({ p: constellationPoint(i), at: w.start }))];
  return born.map(({ p, at }, i) => {
    const q = rig.proj(p.x, p.y, p.z), age = t - at;
    return { ...p, world: p, x: q?.x ?? -10000, y: q?.y ?? -10000, r: 2.5 + 1.5 * Math.exp(-Math.max(0, age) / 0.4),
      at, hot: Math.exp(-Math.max(0, age) / 0.4), alpha: age < 0 ? 0 : loop, i };
  });
}
export function outroState(audio: AudioData, t: number, T: OutroTimes) {
  let shot = 0; for (let i = 1; i < T.shots.length; i++) if (t >= T.shots[i]!.start) shot = i;
  return { shot, b: Math.max(0, beatsSince(audio, t, T.shots[shot]!.start)), dawn: ease.outCubic(span(t, T.dawn, T.shots[5]!.start)),
    flip: span(t, afterBeats(audio, T.shots[4]!.start, 4), afterBeats(audio, T.shots[4]!.start, 4) + 0.6),
    notification: ease.outCubic(span(t, T.shots[5]!.start, afterBeats(audio, T.shots[5]!.start, 1))),
    wave: t >= T.shots[3]!.start && t < afterBeats(audio, T.shots[3]!.start, 2) ? 1 : 0,
    fade: 0, loop: ease.inOutCubic(span(t, afterBeats(audio, T.end, -2), T.end - 1 / 60)) };
}
export function outroCredits(audio: AudioData, t: number, T: OutroTimes): CreditsState {
  return { color: 'ink', lines: CREDIT_LINES.map((text, i) => ({ text, progress: span(beatsSince(audio, t, afterBeats(audio, T.shots[6]!.start, i)), 0, 1.2) })) };
}
export function compositionAt(audio: AudioData, voice: Voice, t: number, T: OutroTimes) {
  const points = starState(audio, voice, t, T).filter(p => p.alpha > 0), rig = new Rig(); rig.set(cameraAt(audio, t, T));
  const bounds = (ps: { x: number; y: number }[]) => { const x = Math.min(...ps.map(p => p.x)), y = Math.min(...ps.map(p => p.y)); return { x, y, w: Math.max(...ps.map(p => p.x)) - x, h: Math.max(...ps.map(p => p.y)) - y }; };
  const c = clawdAt(audio, t, T).at;
  return { dominant: bounds(points.length ? points : [{ x: 0, y: 0 }]), clawd: bounds([-0.96, 0.96].flatMap(x => [0, 0.6].map(y => rig.proj(c.x + x, c.y + y, c.z)!))), buildings: CITY.length };
}
