// The editorial clock and immutable impacts of the level-two chorus.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Line, Word } from '../../engine/lyrics';
import { clamp, ease, frameIdx, hash } from '../../engine/util';
import { afterBeats, span } from '../../kit/time';
import { resolveStoryboard, type Storyboard, type ResolvedShot } from '../../storyboard';
import board from '../../../../storyboard/shots.json';

export function sceneScore(audio: AudioData, lyrics: Lyrics, scene: string): ResolvedShot[] {
  return resolveStoryboard(board as Storyboard, lyrics, audio).shots.filter(s => s.scene === scene);
}
export interface SlabEvent {
  at: number; kind: 'commit' | 'fix'; duration: number; height: number;
  hash: string; message: string; clay: boolean; words: Word[];
}
export interface Impact { at: number; amplitude: number; invertFrames: number; zoom: number }
export interface ChorusScore {
  shots: ResolvedShot[]; lines: Line[];
  start: number; hit1: number; fixes: number; tests: number;
  pickup2: number; hit2: number; split: number; collision: number; end: number;
  commit1: Word; commit2: Word; machine: Word; throwing: Word; fits: Word;
  slabs: SlabEvent[]; echoes: number[]; impacts: Impact[];
}
export function commitId(i: number): string {
  return ((Math.imul(i + 1, 0x45d9f3b) ^ 0x8c4e1f0) >>> 0).toString(16).padStart(8, '0').slice(0, 7);
}
export function chorusScore(audio: AudioData, lyrics: Lyrics): ChorusScore {
  const shots = sceneScore(audio, lyrics, 'S13'), at = (i: number) => shots[i]!.start;
  const hooks = lyrics.find('I need one more commit');
  const lines = [hooks[2]!, lyrics.get('fix a bit'), lyrics.get('Every test'), hooks[3]!, lyrics.get('But it works')];
  const commit1 = lines[0]!.words.at(-1)!, commit2 = lines[3]!.words.at(-1)!;
  const hit1 = at(1), hit2 = at(5);
  // Onset + actual grid beats. MIT's grid beat is 6.24 ms early: the authored syllable wins.
  const repeat = [commit2.start, ...audio.beats.filter(t => t > commit2.start && t < commit2.end)]
    .map(t => Math.abs(t - hit2) < 1 / 60 ? hit2 : t);
  const fixGroups = [[lines[1]!.words[0]!], [lines[1]!.words[2]!], lines[1]!.words.slice(4)];
  const slabs: SlabEvent[] = [
    { at: hit1, kind: 'commit' as const, duration: 0.18, height: 2.82, hash: '9e1c4ab', message: 'COMMIT', clay: false, words: [commit1] },
    ...fixGroups.map((words, i): SlabEvent => ({ at: words[0]!.start, kind: 'fix', duration: 0.18,
      height: 0.42, hash: commitId(i + 30), message: i === 2 ? 'fix a bit' : 'fix', clay: i === 2, words })),
    ...repeat.map((t, i): SlabEvent => ({ at: t, kind: 'commit', duration: [0.18, 0.12, 0.08][Math.min(2, i)]!,
      height: 2.82, hash: commitId(i + 40), message: 'COMMIT', clay: false, words: [commit2] })),
  ].sort((a, b) => a.at - b.at);
  const impacts: Impact[] = [
    ...[lines[0]!, lines[3]!].flatMap(l => l.words.slice(0, 4).map(w => ({ at: w.start, amplitude: 13, invertFrames: 2, zoom: 0 }))),
    ...slabs.map(s => ({ at: s.at, amplitude: s.at === hit2 ? 18 : 13,
      invertFrames: s.at === hit2 ? 3 : 2, zoom: s.at === hit1 || s.at === hit2 ? 0.05 : 0 })),
  ].sort((a, b) => a.at - b.at);
  return { shots, lines, start: at(0), hit1, fixes: at(2), tests: at(3), pickup2: at(4), hit2,
    split: at(6), collision: at(7), end: shots.at(-1)!.end, commit1, commit2,
    machine: lines[4]!.words.at(-1)!, throwing: lines[2]!.words[3]!, fits: lines[2]!.words[4]!,
    slabs, impacts, echoes: [0.5, 1, 1.5].map(b => afterBeats(audio, hit1, b)) };
}
export function impactAt(t: number, T: ChorusScore) {
  let amplitude = 0, zoom = 0, invert = 0;
  for (const hit of T.impacts) if (t >= hit.at) {
    const decay = Math.exp(-(t - hit.at) / 0.1);
    amplitude = Math.max(amplitude, hit.amplitude * decay); zoom = Math.max(zoom, hit.zoom * decay);
    if (frameIdx(t) - frameIdx(hit.at) < hit.invertFrames) invert = 1;
  }
  if (t >= T.end - 0.1) return { amplitude: 0, zoom: 0, invert: 0, shake: [0, 0] as [number, number] };
  const angle = hash(frameIdx(t), 131) * Math.PI * 2;
  return { amplitude, zoom, invert, shake: [Math.cos(angle) * amplitude, Math.sin(angle) * amplitude] as [number, number] };
}
export function collisionAt(t: number, T: ChorusScore) {
  return ease.inCubic(span(t, T.machine.start, T.machine.start + 0.2));
}
export function implosionAt(t: number, T: ChorusScore) {
  const done = T.end - 1 / 60;
  return ease.inCubic(span(t, Math.max(T.collision + 0.2, done - 0.066), done));
}
export function chorusState(_audio: AudioData, t: number, T: ChorusScore) {
  return { kind: 'clay' as const, clock: t, second: t >= T.pickup2,
    rowCount: T.slabs.filter(s => s.at <= t).length, testMode: t >= T.tests && t < T.pickup2,
    split: t >= T.split, crush: collisionAt(t, T), eject: clamp((t - T.machine.start - 0.12) / 0.08),
    implosion: implosionAt(t, T), impact: impactAt(t, T).amplitude };
}
