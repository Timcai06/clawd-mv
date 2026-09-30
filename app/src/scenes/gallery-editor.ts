// Dev-only plates: 0..2s full editor, 2..4s comparison, 4s+ source control.
// Gallery time is independent of the song edit; production scenes supply beat timing.
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { drawEditor, type EditorState } from '../kit/editor';
import { COMMITS, FILE_TREE, MONTH_PATH, MONTH_SOURCE } from '../kit/content';

export function galleryEditorState(t: number): EditorState {
  // kit/time.ts is not present yet; prog is the engine's shared time helper.
  const chars = Math.floor(MONTH_SOURCE[42].length * prog(t, 0, 1.6));
  return {
    activity: 'files',
    sidebar: { mode: 'files', files: FILE_TREE, expandedDepth: 2, selectedPath: MONTH_PATH },
    tabs: [{ id: MONTH_PATH, label: 'month.ts', modified: true }, { id: 'tests', label: 'month.test.ts' }, { id: 'view', label: 'view.ts' }],
    activeTab: MONTH_PATH, breadcrumbs: ['src', 'calendar', 'month.ts', 'daysIn'],
    lines: MONTH_SOURCE, firstLine: 34, currentLine: 42,
    emphasis: [{ line: 42, start: 20, end: 22 }],
    typing: { line: 43, chars }, cursor: { line: 43, column: chars, visible: t < 1.6 },
    terminal: { height: 165, state: { command: 'git status', lines: [
      { kind: 'text', text: 'On branch main', muted: true },
      { kind: 'text', text: 'modified: src/calendar/month.ts' },
    ] } },
    status: { branch: 'fix/october' },
  };
}

export function gallerySourceState(t: number): EditorState {
  return {
    ...galleryEditorState(2), activity: 'source', sidebarWidth: 310,
    sidebar: { mode: 'source', message: 'fix: calendar loop', messageChars: Math.floor(18 * prog(t, 2, 3.2)),
      commits: COMMITS, newCommitHash: COMMITS[0]!.hash, branch: 'fix/october' },
    cursor: { line: 42, column: 20, visible: false },
    terminal: { height: 165, state: { command: 'git log --oneline -2', lines: COMMITS.slice(0, 2).map((commit) => ({ kind: 'text', text: `${commit.hash} ${commit.message}` })) } },
  };
}

export default class GalleryEditor extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper'));
    if (f.t < 2 || f.t >= 4) {
      drawEditor(c, { x: 0, y: 0, width: W, height: H }, f.t < 2 ? galleryEditorState(f.t) : gallerySourceState(f.t));
    } else {
      c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.font = font(F.archivo(100, 900), 52); c.fillStyle = css('ink');
      c.fillText('EDITOR / CALENDAR', 48, 79);
      c.font = font(F.mono(), 16); c.fillStyle = css('ink', INK_SOFT.strong);
      c.fillText('01  FILES · LINE 42', 48, 126);
      c.fillText('02  SOURCE CONTROL · NEW COMMIT', 1352, 126);
      drawEditor(c, { x: 48, y: 145, width: 1248, height: 702 }, galleryEditorState(f.t));
      drawEditor(c, { x: 1352, y: 145, width: 520, height: 340 }, gallerySourceState(f.t));
      c.fillText('03  COMPACT · FILE TREE', 1352, 552);
      drawEditor(c, { x: 1352, y: 571, width: 520, height: 293 }, {
        ...galleryEditorState(f.t), terminal: undefined, firstLine: 1,
        currentLine: 8, cursor: { line: 8, column: 0, visible: false },
      });
      c.font = font(F.archivo(100, 700), 32); c.fillStyle = css('clay'); c.fillText('42', 48, 928);
      c.font = font(F.mono(), 23); c.fillStyle = css('ink'); c.fillText(MONTH_SOURCE[41], 106, 928);
      c.font = font(F.mono(), 16); c.fillStyle = css('ink', INK_SOFT.strong);
      c.fillText('src / calendar / month.ts', 48, 997);
    }
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }

  override dispose() { this.layer.texture.dispose(); }
}
