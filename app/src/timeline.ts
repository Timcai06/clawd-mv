// The edit: storyboard/shots.json is the only cut list (see docs/ARCHITECTURE.md).
// Each shot plays the real scene module for its storyboard scene when one exists
// (scenes/sNN-*.ts, e.g. scenes/s08-commit.ts for S08), otherwise the graybox animatic,
// so the whole song always plays and exports while scenes are replaced one by one.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import boardJSON from '../../storyboard/shots.json';
import { resolveStoryboard, type Storyboard } from './storyboard';

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

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  const dev = gallery(au);
  if (dev) return dev;
  const board = boardJSON as Storyboard;
  const result = resolveStoryboard(board, ly, au);
  // Keep invalid cuts visible to the checker instead of silently rewriting the edit.
  return result.shots.map((shot) => {
    const file = sceneFile(shot.scene) ?? byName('animatic');
    return {
      id: shot.id, load: load(file), start: shot.start, end: shot.end,
      params: { shot, scene: board.scenes.find((s) => s.id === shot.scene)!, sceneIndex: board.scenes.findIndex((s) => s.id === shot.scene) },
    };
  });
}
