// The edit: which scene plays when. Boundaries should be anchored to lyric lines and snapped
// to the beat grid (see reference/pdoom/app-timeline.ts for the pattern), never hard-coded.
import type { TimelineEntry } from './engine/engine';
import type { SceneClass } from './engine/scene';
import type { Lyrics } from './engine/lyrics';
import type { AudioData } from './engine/audio';
import boardJSON from '../../storyboard/shots.json';
import { resolveStoryboard, type Storyboard } from './storyboard';

// Scene modules are discovered lazily so a missing/broken scene never breaks the build.
const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

export function makeTimeline(ly: Lyrics, au: AudioData): TimelineEntry[] {
  const board = boardJSON as Storyboard;
  const result = resolveStoryboard(board, ly, au);
  // Keep invalid cuts visible to the checker instead of silently rewriting the edit.
  return result.shots.map((shot) => ({
    id: shot.id, load: scene('animatic'), start: shot.start, end: shot.end,
    params: { shot, scene: board.scenes.find((s) => s.id === shot.scene)!, sceneIndex: board.scenes.findIndex((s) => s.id === shot.scene) },
  }));
}
