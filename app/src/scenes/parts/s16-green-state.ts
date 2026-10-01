// Screen-space projection of the engraved arc in kf-S16. The foreshortened slabs have
// separate front/side polygons; no light rig or simulation is involved.
import type { AudioData } from '../../engine/audio';
import type { Lyrics, Word } from '../../engine/lyrics';
import { ease, lerp } from '../../engine/util';
import { HANDOFF, type Rect, type Pt } from '../../kit/handoff';
import { afterBeats, beatsSince, span, wordTime } from '../../kit/time';
import { resolveStoryboard, type Storyboard } from '../../storyboard';
import board from '../../../../storyboard/shots.json';
import type { Voice } from '../../kit/lyric-moves';

export interface GreenTimes {
  start: number; end: number; cuts: number[]; triggers: number[]; greens: Word[];
  nineteen: Word; incomingEnd: number; outgoingStart: number; outgoingEnd: number;
}

export function greenTimes(audio: AudioData, lyrics: Lyrics): GreenTimes {
  const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots.filter(s => s.scene === 'S16');
  const count = lyrics.get('One goes green, and two, and three');
  const repeated = lyrics.get('Green and green and green and green');
  const final = lyrics.get('Nineteen green!');
  const greens = [...count.words, ...repeated.words, ...final.words].filter(w => /^green\W*$/i.test(w.w));
  const launches = repeated.words.filter(w => /^green\W*$/i.test(w.w));
  const nineteen = final.words[0]!;
  const triggers = ['One', 'two', 'three'].map(w => wordTime(lyrics, count.text, w)!);
  launches.forEach((w, group) => {
    const next = launches[group + 1]?.start ?? nineteen.start;
    const n = group === 3 ? 3 : 4;
    for (let i = 0; i < n; i++) triggers.push(afterBeats(audio, w.start,
      beatsSince(audio, next, w.start) * ease.outQuad(i / n) * 0.92));
  });
  triggers.push(nineteen.start);
  const start = shots[0]!.start, end = shots.at(-1)!.end;
  return { start, end, cuts: shots.map(s => s.start), triggers, greens, nineteen,
    incomingEnd: afterBeats(audio, start, 1), outgoingStart: afterBeats(audio, end, -1),
    outgoingEnd: end - 1 / 60 };
}

export function bounds(points: readonly Pt[]): Rect {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function mixRect(a: Rect, b: Rect, p: number): Rect {
  return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), w: lerp(a.w, b.w, p), h: lerp(a.h, b.h, p) };
}

export interface Domino {
  i: number; passed: boolean; fall: number; front: Pt[]; side: Pt[];
  face: Rect; thickness: number; label?: Word;
}

function arcDomino(i: number, passed: boolean, fall: number): Domino {
  const u = i / 18, perspective = Math.pow(u, 1.4);
  const x = 190 + 1440 * perspective;
  const y = 465 + 230 * Math.sin(Math.PI * u) + 100 * u;
  const w = 22 + 112 * perspective, h = (105 + 340 * perspective) * (1 - 0.12 * fall);
  const lean = (8 + 100 * u) * (0.3 + 0.7 * fall), thickness = 4 + 22 * u;
  const front = [{ x, y }, { x: x + w, y: y - w * 0.2 },
    { x: x + w + lean, y: y + h - w * 0.15 }, { x: x + lean, y: y + h }];
  const side = [front[0]!, { x: x - thickness, y: y + thickness },
    { x: x + lean - thickness, y: y + h + thickness }, front[3]!];
  return { i, passed, fall, front, side, face: bounds(front), thickness };
}

function placeFace(card: Domino, rect: Rect, amount: number): Domino {
  const b = card.face;
  const map = (p: Pt) => ({ x: lerp(p.x, rect.x + (p.x - b.x) * rect.w / b.w, amount),
    y: lerp(p.y, rect.y + (p.y - b.y) * rect.h / b.h, amount) });
  // At the match cut the visible face is a rectangle, as specified in HANDOFF.
  const target = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h }];
  const front = card.front.map((p, i) => ({ x: lerp(p.x, target[i]!.x, amount), y: lerp(p.y, target[i]!.y, amount) }));
  return { ...card, front, side: card.side.map(map), face: bounds(front) };
}

export function handoffIn(t: number, audio: AudioData, T: GreenTimes): Rect {
  const fall = ease.inOutCubic(Math.min(1, Math.max(0, beatsSince(audio, t, T.triggers[0]!) / 0.8)));
  const normal = arcDomino(0, t >= T.triggers[0]!, fall).face;
  return mixRect(HANDOFF.domino15, normal, ease.inOutCubic(span(t, T.start, T.incomingEnd)));
}

export function handoffOut(t: number, audio: AudioData, T: GreenTimes): Rect {
  return mixRect(arcDomino(18, true, 1).face, HANDOFF.domino16,
    ease.inOutCubic(span(t, T.outgoingStart, T.outgoingEnd)));
}

export function greenState(audio: AudioData, lyrics: Lyrics, voice: Voice, t: number, T: GreenTimes) {
  const cards = T.triggers.map((at, i) => {
    const fall = ease.inOutCubic(Math.min(1, Math.max(0, beatsSince(audio, t, at) / (i < 3 ? 0.8 : 0.32))));
    let card = arcDomino(i, t >= at, fall);
    if (i === 0 && t < T.incomingEnd) card = placeFace(card, HANDOFF.domino15,
      1 - ease.inOutCubic(span(t, T.start, T.incomingEnd)));
    if (i === 18 && t >= T.outgoingStart) card = placeFace(card, HANDOFF.domino16,
      ease.inOutCubic(span(t, T.outgoingStart, T.outgoingEnd)));
    const count = lyrics.get('One goes green, and two, and three');
    card.label = i < 3 ? count.words[[0, 4, 6][i]!] : i === 18 ? T.nineteen : undefined;
    return card;
  });
  const word = T.greens.filter(w => t >= w.start).at(-1);
  const form = word ? voice.form(word, t, { minWidth: 75, maxWidth: 112.5, rest: 900 }) : undefined;
  const occurrence = word ? T.greens.indexOf(word) : 0;
  const headline = { x: -38, y: -24, w: 1460 + occurrence * 24 + (form ? form.axes.wdth - 75 : 0) * 2, h: 530 };
  const jumpAt = T.greens.filter(w => w.start <= t).at(-1)?.start ?? T.start;
  const beat = Math.max(0, beatsSince(audio, t, jumpAt));
  const clawd = { x: 1490, y: 346 - 12 * Math.sin(Math.PI * Math.min(1, beat)), px: 16.5 };
  return { cards, passed: cards.filter(c => c.passed).length, word, form, headline, clawd,
    plaqueBounds: bounds(cards.flatMap(c => [...c.front, ...c.side])) };
}

/** Geometry-only birth-time query: identical falling faces, no lyric/layout allocations. */
export function greenArcCards(audio: AudioData, t: number, T: GreenTimes) {
  return T.triggers.map((at,i) => {
    const fall=ease.inOutCubic(Math.min(1,Math.max(0,beatsSince(audio,t,at)/(i<3?0.8:0.32))));
    let card=arcDomino(i,t>=at,fall);
    if(i===0 && t<T.incomingEnd) card=placeFace(card,HANDOFF.domino15,1-ease.inOutCubic(span(t,T.start,T.incomingEnd)));
    if(i===18 && t>=T.outgoingStart) card=placeFace(card,HANDOFF.domino16,ease.inOutCubic(span(t,T.outgoingStart,T.outgoingEnd)));
    return card;
  });
}
