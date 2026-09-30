// Dev gallery (never in the edit): the poster stage with a floating editor panel and Clawd.
// 0-4 s: the camera faces the poster; 4-10 s: it orbits to a three-quarter view and back.
// Render: bun scripts/render.ts stills --gallery stage --t 1,5,7,9 --out ../out/wip/stage
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { W, H } from '../engine/gl';
import { F, font } from '../engine/type';
import { keys, ease, prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { Stage, type Panel } from '../kit/stage';
import { drawEditor } from '../kit/editor';
import { galleryEditorState } from './gallery-editor';
import * as Clawd from '../kit/clawd';

const EW = 1120, EH = 640, CPX = 9;

export default class GalleryStage extends Scene {
  private stage!: Stage;
  private editor!: Panel;
  private clawd!: Panel;

  override init() {
    this.stage = new Stage(this.ctx.renderer);
    this.editor = this.stage.addPanel(EW, EH, 1.5);
    const s = Clawd.size(CPX);
    this.clawd = this.stage.addPanel(s.w + 8 * CPX, s.h + 8 * CPX, 2);
  }

  private drawPoster() {
    const st = this.stage, c = st.poster, pw = st.pw, ph = st.ph;
    st.clearPoster();
    // 12-column modular grid of hairline ink rules
    const ox = (pw - W) / 2, oy = (ph - H) / 2, cols = 12, gut = 24, colW = (W - 2 * 80 - (cols - 1) * gut) / cols;
    c.strokeStyle = css('ink', INK_SOFT.mid);
    c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= cols; i++) {
      const x = ox + 80 + i * (colW + gut) - (i ? gut / 2 : 0);
      c.moveTo(x, 0); c.lineTo(x, ph);
    }
    for (const y of [oy + 96, oy + 540, oy + H - 96]) { c.moveTo(0, y); c.lineTo(pw, y); }
    c.stroke();
    // the big clay circle, partly off the sheet's visible frame
    c.fillStyle = css('clay');
    c.beginPath(); c.arc(ox + W - 180, oy + H - 60, 430, 0, Math.PI * 2); c.fill();
    // giant cropped grotesk, flush left
    c.fillStyle = css('ink');
    c.textBaseline = 'alphabetic';
    c.font = font(F.archivo(87.5, 900), 330);
    c.fillText('ONE', ox - 18, oy + 300);
    c.fillText('MORE', ox - 18, oy + 610);
    c.fillText('COMMIT', ox - 18, oy + 920);
    // the lyric line, small and on the grid
    c.font = font(F.mono(500), 22);
    c.fillText('I need one more commit', ox + 80 + 8 * (colW + gut), oy + 96 - 18);
    c.fillStyle = css('ink', INK_SOFT.strong);
    c.fillText('S08 · CHORUS 1', ox + 80, oy + 96 - 18);
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const t = f.t;
    this.drawPoster();
    // editor panel
    this.editor.clear();
    drawEditor(this.editor.ctx, { x: 0, y: 0, width: EW, height: EH }, galleryEditorState(Math.min(t, 1.6)));
    const px = this.stage.pw / 2 + 330, py = this.stage.ph / 2 + 20;
    this.editor.update({ x: px, y: py, z: 60, rz: -1.5 });
    // Clawd stands on the editor's top edge (its own small transparent panel, a hair higher)
    this.clawd.clear();
    const pose = Clawd.pose('A3', { beat: f.beat, beat0: Math.floor(f.beat), p: 0 });
    Clawd.draw(this.clawd.ctx, 4 * CPX, 6 * CPX, pose, { px: CPX });
    const s = Clawd.size(CPX);
    this.clawd.update({ x: px - EW / 2 + 140, y: py - EH / 2 - (s.h + 8 * CPX) / 2 + 2 * CPX, z: 62, rz: -1.5 });
    // camera: front view, then a three-quarter orbit and back
    const k = prog(t, 4, 7, ease.inOutCubic) - prog(t, 8, 10, ease.inOutCubic);
    this.stage.view({
      x: this.stage.pw / 2 + 160 * k, y: this.stage.ph / 2 + 40 * k,
      zoom: 1 + 0.45 * k, yaw: -24 * k, pitch: 14 * k, fov: keys(t, [[0, 30], [4, 30], [7, 34]]),
    });
    this.stage.render(out);
    return { ...POSTER_POST, hud: 0 };
  }

  override dispose() { this.stage.dispose(); }
}
