// The edit: storyboard/shots.json is the only cut list (see docs/ARCHITECTURE.md).
// Each shot plays the real scene module for its storyboard scene when one exists
// (scenes/sNN-*.ts, e.g. scenes/s08-commit.ts for S08), otherwise the graybox animatic,
// so the whole song always plays and exports while scenes are replaced one by one.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import boardJSON from '../../storyboard/shots.json';
import platesJSON from '../../storyboard/plates.json';
import { resolveStoryboard, type Anchor, type Storyboard } from './storyboard';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const load = (file: string) => () => modules[file]!();
const byName = (name: string) => `./scenes/${name}.ts`;

/** Module file for a storyboard scene id ('S08' -> './scenes/s08-commit.ts'), if one exists. */
export function sceneFile(sceneId: string): string | undefined {
  const prefix = `./scenes/${sceneId.toLowerCase()}-`;
  return Object.keys(modules).find((k) => k.startsWith(prefix));
}

/**
 * Dev-only component gallery: `?gallery=<name>` plays scenes/gallery-<name>.ts over the
 * whole song instead of the edit (for rendering kit stills; never used by the video).
 */
function gallery(au: AudioData): TimelineEntry[] | null {
  const name = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('gallery') : null;
  if (!name) return null;
  const file = byName(`gallery-${name}`);
  if (!modules[file]) throw new Error(`gallery scene not found: ${file}`);
  return [{ id: `gallery-${name}`, load: load(file), start: 0, end: au.duration }];
}

export interface PlateDef { id: string; file: string; name: string; from: Anchor & { t: number }; to: Anchor & { t: number } }
export interface ResolvedPlate extends PlateDef { start: number; end: number }

/** v4 plates (storyboard/plates.json): anchors resolved exactly like shot anchors. */
export function resolvePlates(ly: Lyrics, au: AudioData): ResolvedPlate[] {
  const defs = (platesJSON as { plates: PlateDef[] }).plates;
  return defs.map((p) => {
    const board: Storyboard = { song: { file: '', duration: au.duration }, scenes: [], shots: [
      { id: 'from', scene: p.id, t: p.from.t, anchor: p.from, clawd: null, camera: '', visual: '' },
      { id: 'to', scene: p.id, t: p.to.t, anchor: p.to, clawd: null, camera: '', visual: '' },
    ] };
    const [a, b] = resolveStoryboard(board, ly, au).shots;
    return { ...p, start: a!.start, end: b!.start };
  });
}

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  const dev = gallery(au);
  if (dev) return dev;
  const board = boardJSON as Storyboard;
  const result = resolveStoryboard(board, ly, au);
  const plates = resolvePlates(ly, au);
  // Keep invalid cuts visible to the checker instead of silently rewriting the edit.
  const shots: TimelineEntry[] = result.shots.map((shot) => {
    const file = sceneFile(shot.scene) ?? byName('animatic');
    return {
      id: shot.id, load: load(file), start: shot.start, end: shot.end,
      params: { shot, scene: board.scenes.find((s) => s.id === shot.scene)!, sceneIndex: board.scenes.findIndex((s) => s.id === shot.scene) },
    };
  });
  if (!plates.length) return shots;
  // Plates replace the shots inside their windows; shots straddling a plate edge are clipped.
  const out: TimelineEntry[] = [];
  for (const e of shots) {
    let pieces: [number, number][] = [[e.start, e.end]];
    for (const p of plates) pieces = pieces.flatMap(([a, b]) => {
      if (b <= p.start || a >= p.end) return [[a, b] as [number, number]];
      const r: [number, number][] = [];
      if (a < p.start) r.push([a, p.start]);
      if (b > p.end) r.push([p.end, b]);
      return r;
    });
    pieces.forEach(([a, b], i) => out.push({ ...e, id: pieces.length > 1 ? `${e.id}${'abc'[i]}` : e.id, start: a, end: b }));
  }
  for (const p of plates) out.push({ id: p.id, load: load(byName(p.file)), start: p.start, end: p.end, params: { plate: p } });
  return out.sort((x, y) => x.start - y.start);
}
