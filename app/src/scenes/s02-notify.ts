// S02: the first light/dark reversal, on the resolved ping beat. The camera
// holds the editor, snaps to the lower-right notification, then passes through it.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { css } from '../theme';
import { Ground, postFor } from '../kit/ground';
import { drawNotify } from '../kit/notify';
import { drawEditor } from '../kit/editor';
import { FILE_TREE, MONTH_PATH, MONTH_SOURCE } from '../kit/content';
import { drawCursor, blink } from '../kit/cursor';
import { afterBeats, span } from '../kit/time';
import * as Clawd from '../kit/clawd';
import { openingTimes, notifyState } from './parts/s01-timing';
import { mono, project, viewCanvas, WrittenLyric } from './parts/s01-drafting';
import { drawForm } from './parts/s03-form';

const EDITOR = { x: 216, y: 118, w: 1488, h: 804 };
const NOTIFY = { x: 1080, y: 668, width: 720, height: 200 };

class NotifyWorld {
  users = 0;
  ground = new Ground();
  layer = new Layer2D();
  editor = new Layer2D(EDITOR.w, EDITOR.h);
  T;
  lyric;
  report;
  constructor(ctx: SceneCtx) {
    this.T = openingTimes(ctx.audio, ctx.lyrics);
    this.lyric = new WrittenLyric(ctx.lyrics.get("Nine o'clock"));
    this.report = new WrittenLyric(ctx.lyrics.get('Got a bug report'), 32);
    // Static editor ink is rasterised once at output scale, not once per sub-frame.
    drawEditor(this.editor.ctx, { x: 0, y: 0, width: EDITOR.w, height: EDITOR.h }, {
      activity: 'files', sidebar: { mode: 'files', files: FILE_TREE, expandedDepth: 1, selectedPath: MONTH_PATH },
      tabs: [{ id: MONTH_PATH, label: 'month.ts' }, { id: 'preview', label: 'October' }],
      activeTab: MONTH_PATH, breadcrumbs: ['src', 'calendar', 'month.ts'],
      lines: MONTH_SOURCE, firstLine: 34, currentLine: 42, status: { branch: 'main' },
    });
  }
  dispose() {
    this.ground.pass.mat.dispose(); this.ground.pass.mesh.geometry.dispose();
    this.layer.texture.dispose(); this.editor.texture.dispose();
  }
}
let shared: NotifyWorld | undefined;

export default class S02Notify extends Scene {
  private w!: NotifyWorld;
  override init() { this.w = shared ??= new NotifyWorld(this.ctx); this.w.users++; }
  override dispose() { if (--this.w.users === 0) { this.w.dispose(); shared = undefined; } }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const w = this.w, T = w.T, au = this.ctx.audio, s = notifyState(au, f.t, T), v = s.view;
    w.ground.render(this.ctx.renderer, out, {
      kind: s.kind, t: f.t, camX: (v.x - 960) * 0.6 + f.beat * 4,
      camY: (v.y - 540) * 0.6, zoom: Math.min(v.zoom, 2),
      grid: 0.6, cell: 72, kick: f.a.kick, halftone: 0.4,
      haze: 0.3, streaks: 0.3 * s.push, streakAngle: Math.PI / 2, travel: s.push,
    });
    w.layer.clear();
    const c = w.layer.ctx;
    c.save(); viewCanvas(c, v);
    c.drawImage(w.editor.canvas, EDITOR.x, EDITOR.y, EDITOR.w, EDITOR.h);
    const wake = Clawd.pose('A2', {
      beat: f.beat, beat0: au.beatAt(T.ping) - 1,
      p: span(f.t, T.ping, T.screen),
    });
    // One eye is open at ping; the second opens on the next measured beat.
    Clawd.draw(c, 456, 674, wake, { px: 14 });
    mono(c, '09:00', 400, 244, 21, 'ink', 0.6);
    drawCursor(c, { x: 848, y: 615, h: 25, on: blink(f.beat) });
    // A clay line leads the typing pen to the notification's left edge.
    if (s.pop > 0) {
      c.strokeStyle = css('clay', 0.6); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(848, 615); c.lineTo(1004, 615); c.lineTo(1004, 702); c.lineTo(1080, 702); c.stroke();
    }
    drawNotify(c, NOTIFY, { pop: s.pop });
    // The notification becomes an aperture. Its rule and subject field align
    // with the incoming document before the shot changes modules.
    if (s.push > 0.1) {
      const k = span(s.push, 0.1, 0.5);
      c.fillStyle = css('paper', k); c.fillRect(NOTIFY.x + 12, NOTIFY.y + 16, 696, 168);
      c.globalAlpha = k;
      mono(c, 'CALENDAR / INCIDENT REPORT', 1112, 708, 15);
      mono(c, 'NO. 1031', 1112, 741, 15, 'ink', 0.6);
      mono(c, 'ATTACHMENT 01', 1112, 794, 12, 'ink', 0.6);
      c.globalAlpha = 1;
    }
    c.restore();
    // Destination is drawn as vectors at the current output scale. Expanding
    // the aperture does not enlarge a low-resolution screenshot of the UI.
    if (s.document > 0) {
      const a = project(v, NOTIFY.x, NOTIFY.y), b = project(v, NOTIFY.x + 720, NOTIFY.y + 200);
      const k = s.document;
      const x = a[0] * (1 - k), y = a[1] * (1 - k);
      const width = (b[0] - a[0]) * (1 - k) + 1920 * k;
      const height = (b[1] - a[1]) * (1 - k) + 1080 * k;
      c.save(); c.beginPath(); c.rect(x, y, width, height); c.clip();
      c.globalAlpha = k; drawForm(c, 0, f.beat);
      this.w.report.draw(c, f.t, 288, 936);
      c.restore();
    }
    if (s.document < 0.8) {
      // The first sung line stays screen-readable during the notification dive.
      const top = f.t >= T.screen;
      w.lyric.draw(c, f.t, 260, top ? 150 : 1008, 'ink');
    }
    this.ctx.comp.draw(this.ctx.renderer, w.layer.upload(), out);
    return { ...postFor(s.kind), hud: 0, grain: 0.025, bloom: 0 };
  }
}
