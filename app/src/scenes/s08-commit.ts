// S08 — chorus 1 (docs/STORYBOARD.md, shots S08-1..S08-12): the reference scene for the look.
// Freeze on the pickup, slam on the sung accent of com-MIT (Tim: hits follow the heard accent,
// not the bar line), brackets snapping on beats, three tap cuts, a second freeze/slam, then
// "works on my machine" with a one-cell hint of the bug.
//
// Visual spec v2: PAPER ground (live halftone + drafting grid, kick-reactive), and a CLAY flood
// on each sung accent (hook impact level 1); the clay cursor motif carries the freeze.
//
// All twelve shots share one world (module singleton): every moment is a pure function of t and
// the aligned lyric times, so cuts between shots are continuous by construction.
import type * as THREE from 'three';
import { Scene, type Frame, type SceneCtx } from '../engine/scene';
import { ease, frameIdx, hash, lerp } from '../engine/util';
import { F, font } from '../engine/type';
import { css, INK_SOFT } from '../theme';
import { Stage, type Panel, type CameraView } from '../kit/stage';
import { bigType, disc, caption, columns, frameOn } from '../kit/poster';
import { Ground, postFor, type GroundKind } from '../kit/ground';
import { drawCursor, blink } from '../kit/cursor';
import { lyricsTypeState, drawLyricsLine } from '../kit/lyrics-type';
import { Layer2D } from '../engine/gl';
import { drawEditor, type EditorState } from '../kit/editor';
import { drawCommitHash } from '../kit/gitlog';
import { drawKeyboard } from '../kit/keyboard';
import { drawCalendar } from '../kit/calendar';
import { COMMITS, FILE_TREE, MONTH_PATH, MONTH_SOURCE } from '../kit/content';
import { span, hitAfter, wordTime, afterBeats, beatsSince } from '../kit/time';
import * as Clawd from '../kit/clawd';

const EW = 1180, EH = 680; // editor panel
const KW = 1400, KH = 470; // keyboard panel
const PVW = 560, PVH = 470; // local preview (calendar)
const CPX = 10; // Clawd pixel size

interface Times {
  pick1: number; hit1: number; brackets: number; fit: number; taps: number[]; quit: number;
  pick2: number; hit2: number; works: number; machine: number; end: number;
}

class World {
  stage: Stage;
  ground = new Ground();
  overlay = new Layer2D();
  editor: Panel; hash1: Panel; hash2: Panel; keys: Panel; preview: Panel; clawd: Panel;
  times!: Times;
  users = 0;

  constructor(ctx: SceneCtx) {
    this.stage = new Stage(ctx.renderer, undefined, undefined, true);
    this.editor = this.stage.addPanel(EW, EH, 1.5);
    this.hash1 = this.stage.addPanel(1000, 300, 1.5);
    this.hash2 = this.stage.addPanel(1000, 300, 1.5);
    this.keys = this.stage.addPanel(KW, KH, 1.25);
    this.preview = this.stage.addPanel(PVW, PVH, 1.5);
    const s = Clawd.size(CPX);
    this.clawd = this.stage.addPanel(s.w + 8 * CPX, s.h + 10 * CPX, 2);
    this.resolveTimes(ctx);
  }

  /** Musical landmarks from the aligned lyrics; the storyboard fallbacks cover gaps. */
  private resolveTimes(ctx: SceneCtx) {
    const ly = ctx.lyrics as unknown as Parameters<typeof wordTime>[0];
    const au = ctx.audio;
    const hook = 'I need one more commit';
    const w = (line: string, word: string, occ = 1, fb = 0, syl?: number) => wordTime(ly, line, word, occ, syl) ?? fb;
    const tapLine = ctx.lyrics.lines.find((l) => l.text.toLowerCase().startsWith('tap-tap-tapping'));
    const tapWord = tapLine?.words[0];
    const taps = tapWord ? [0, 1, 2].map((i) => tapWord.start + ((tapWord.end - tapWord.start) * i) / 3) : [30.8, 31.3, 31.8];
    const worksLine = ctx.lyrics.lines.find((l) => l.text.toLowerCase().includes('works on my machine') && l.start < 50);
    this.times = {
      pick1: w(hook, 'I', 1, 24.5), hit1: w(hook, 'commit', 1, 26.94, 2),
      brackets: w("Every bracket's gonna fit", "bracket's", 1, 27.3), fit: w("Every bracket's gonna fit", 'fit', 1, 29.2),
      taps, quit: w('Tap-tap-tapping, never quit', 'quit', 1, 32.8),
      pick2: w(hook, 'I', 2, 34.3), hit2: w(hook, 'commit', 2, 37.68, 2),
      works: worksLine?.words.find((x) => x.w.toLowerCase().startsWith('works'))?.start ?? 38.4,
      machine: worksLine?.words.find((x) => x.w.toLowerCase().startsWith('machine'))?.start ?? 40.5,
      end: afterBeats(au, 40.5, 6),
    };
  }
}

let world: World | undefined;

export default class S08Commit extends Scene {
  private w!: World;

  override init() {
    this.w = world ??= new World(this.ctx);
    this.w.users++;
  }

  override dispose() {
    if (--this.w.users === 0) { this.w.stage.dispose(); world = undefined; }
  }

  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { stage, times: T } = this.w;
    const au = this.ctx.audio;
    const t = f.t;
    const pw = stage.pw, ph = stage.ph, fr = frameOn(pw, ph), g = columns(pw, ph);

    // ------------------------------------------------------------------ phases
    const frozen1 = t >= T.pick1 && t < T.hit1;
    const frozen2 = t >= T.pick2 && t < T.hit2;
    const inTaps = t >= T.taps[0]! && t < T.quit;
    const tapIdx = inTaps ? (t < T.taps[1]! ? 0 : t < T.taps[2]! ? 1 : 2) : -1;
    const slam1 = hitAfter(t, T.hit1, 0.09), slam2 = hitAfter(t, T.hit2, 0.09);
    const slam = Math.max(slam1, slam2);
    // CLAY flood from each sung accent to one beat later (hook impact level 1)
    const flood = (t >= T.hit1 && t < afterBeats(au, T.hit1, 1)) || (t >= T.hit2 && t < afterBeats(au, T.hit2, 1));
    const kind: GroundKind = flood ? 'clay' : 'paper';
    const typeTok = flood ? 'paper' : 'ink';

    // ------------------------------------------------------------------ poster
    const c = stage.poster;
    stage.clearPoster();
    // the clay circle breathes with each slam
    const circR = 420 * (1 + 0.08 * slam) * (t < T.hit1 ? 0.0 : ease.outBack(span(t, T.hit1, T.hit1 + 0.35)));
    if (!flood) disc(c, fr.x + fr.w - 210, fr.y + fr.h - 40, circR);
    if (t >= T.hit1) {
      // COMMIT slams at the sung accent: 1.35x -> 1 in ~0.2 s with a short overshoot
      const k = (hit: number) => 1 + 0.35 * Math.max(0, 1 - ease.outBack(span(t, hit, hit + 0.22)));
      const scale = t >= T.hit2 ? k(T.hit2) : k(T.hit1);
      // width stretches 125 -> 87.5 over the slam (Archivo width axis)
      const hitT = t >= T.hit2 ? T.hit2 : T.hit1;
      const wdt = lerp(125, 87.5, ease.outCubic(span(t, hitT, hitT + 0.35)));
      bigType(c, 'COMMIT', fr.x - 26, fr.y + fr.h - 70, { size: 400, width: wdt, scale, color: typeTok });
      bigType(c, 'ONE MORE', fr.x - 14, fr.y + fr.h - 470, { size: 200, width: 87.5, color: typeTok });
    } else if (!frozen1) {
      bigType(c, 'ONE MORE', fr.x - 14, fr.y + fr.h - 470, { size: 200, width: 87.5, alpha: INK_SOFT.faint });
    }
    // the cursor motif: during the freezes a big clay cursor holds the frame, blinking on beats
    if (frozen2) drawCursor(c, { x: fr.x + fr.w / 2 + 520 - 120, y: fr.y + fr.h / 2 + 40, h: 150, on: blink(f.beat) });
    // brackets fly in from both edges and snap into pairs, one pair per beat
    const pairs: [string, string][] = [['(', ')'], ['{', '}'], ['[', ']']];
    if (t >= T.brackets - 0.3 && t < T.quit) {
      c.save();
      c.font = font(F.mono(300), 230);
      c.textBaseline = 'alphabetic';
      pairs.forEach(([a, b], i) => {
        const land = afterBeats(au, T.brackets, i);
        const p = ease.outCubic(span(t, land - 0.35, land));
        const cy = fr.y + 250 + i * 190, cx = g.x(8) + 40;
        const hit = hitAfter(t, land, 0.1);
        c.fillStyle = css(hit > 0.5 ? 'clay' : typeTok);
        c.fillText(a, lerp(fr.x - 300, cx - 120, p), cy);
        c.fillText(b, lerp(fr.x + fr.w + 300, cx + 120, p), cy);
      });
      c.restore();
    }
    // the function block slots in on "fit": a clay bar across one grid row
    const fitK = span(t, T.fit, T.fit + 0.25) * (1 - span(t, T.fit + 0.6, T.fit + 1.2));
    if (fitK > 0) { c.fillStyle = css('clay', 0.9 * fitK); c.fillRect(g.x(6), fr.y + 540 - 34, g.x(11) + g.colW - g.x(6), 68); }
    // lyric line (temporary until the lyric layer lands, X8)
    caption(c, 'S08 · CHORUS 1', g.x(9), fr.y + 96 - 18, 22, flood ? 1 : INK_SOFT.strong);

    // ------------------------------------------------------------------ editor
    const ex = pw / 2 + 300, ey = ph / 2 + 30;
    const typingLine = 43;
    const typingT0 = T.brackets, typingT1 = T.quit;
    const scrollBeats = t >= T.quit ? beatsSince(au, t, T.quit) : 0;
    const firstLine = t >= T.quit && t < T.pick2 ? 1 + Math.floor(scrollBeats * 3) % Math.max(1, MONTH_SOURCE.length - 12) : 34;
    const chars = frozen1 || frozen2 ? Math.floor(MONTH_SOURCE[typingLine - 1]!.length * 0.55)
      : Math.floor(MONTH_SOURCE[typingLine - 1]!.length * span(t, typingT0, typingT1));
    const cursorOn = frozen1 || frozen2 ? Math.floor(beatsSince(au, t, T.pick1) * 2) % 2 === 0 : true;
    const est: EditorState = {
      activity: 'files',
      sidebar: { mode: 'files', files: FILE_TREE, expandedDepth: 2, selectedPath: MONTH_PATH },
      tabs: [{ id: MONTH_PATH, label: 'month.ts', modified: true }, { id: 't', label: 'month.test.ts' }],
      activeTab: MONTH_PATH, breadcrumbs: ['src', 'calendar', 'month.ts', 'daysIn'],
      lines: MONTH_SOURCE, firstLine, currentLine: t >= T.fit && t < T.fit + 1.2 ? 42 : typingLine,
      typing: { line: typingLine, chars }, cursor: { line: typingLine, column: chars, visible: cursorOn },
      status: { branch: 'fix/october' },
    };
    this.w.editor.clear();
    drawEditor(this.w.editor.ctx, { x: 0, y: 0, width: EW, height: EH }, est);
    const tapHide = inTaps ? 1 : 0;
    this.w.editor.update({ x: ex, y: ey, z: 60, rz: -1.2, alpha: 1 - 0.85 * tapHide });

    // ------------------------------------------------------------------ commit hashes
    const hashY = ey - EH / 2 - 120;
    this.w.hash1.clear();
    drawCommitHash(this.w.hash1.ctx, { x: 0, y: 0, width: 1000, height: 300 }, { commit: COMMITS[0], pop: span(t, T.hit1, T.hit1 + 0.35) });
    this.w.hash1.update({ x: ex - 60, y: hashY - (t >= T.hit2 ? 150 * ease.outCubic(span(t, T.hit2, T.hit2 + 0.3)) : 0), z: 150, visible: t >= T.hit1 && !inTaps });
    this.w.hash2.clear();
    drawCommitHash(this.w.hash2.ctx, { x: 0, y: 0, width: 1000, height: 300 }, { commit: COMMITS[1] ?? COMMITS[0], pop: span(t, T.hit2, T.hit2 + 0.35) });
    this.w.hash2.update({ x: ex - 60, y: hashY, z: 170, visible: t >= T.hit2 });

    // ------------------------------------------------------------------ keyboard (tap cuts)
    const kx = pw / 2, ky = ph / 2 + 120;
    this.w.keys.clear();
    drawKeyboard(this.w.keys.ctx, { x: 0, y: 0, width: KW, height: KH }, {
      wavePhase: f.beat * 2, waveAmount: inTaps ? 1 : 0.3, highlightKey: 'Enter', highlight: hitAfter(t, T.taps[0]!, 0.2),
    });
    this.w.keys.update({ x: kx, y: ky, z: 30, visible: inTaps });

    // ------------------------------------------------------------------ local preview (works on my machine)
    const pvPop = ease.outBack(span(t, T.works, T.works + 0.4));
    const hint = t >= T.machine && t < T.machine + 0.45 && Math.floor((t - T.machine) * 12) % 2 === 0;
    this.w.preview.clear(css('paper'));
    drawCalendar(this.w.preview.ctx, { x: 20, y: 20, width: PVW - 40, height: PVH - 40 }, {
      dayCount: 31, highlightedDays: [], cellStates: hint ? { 31: 'error' } : {}, errorPhase: 0.5,
    });
    const pvx = ex + EW / 2 - 120, pvy = ey + 80;
    this.w.preview.update({ x: pvx, y: pvy, z: 110 * pvPop, rz: 2.5, alpha: span(t, T.works, T.works + 0.15), visible: t >= T.works });

    // ------------------------------------------------------------------ Clawd
    const cl = this.w.clawd;
    const s = Clawd.size(CPX);
    let action: Clawd.Action = 'A3', beat0 = Math.floor(f.beat), where = { x: ex - EW / 2 + 160, y: ey - EH / 2, z: 62 };
    if (t >= T.hit1 && t < T.hit1 + 0.6) { action = 'A6'; beat0 = au.beatAt(T.hit1); }
    else if (t >= T.hit2 && t < T.hit2 + 0.6) { action = 'A6'; beat0 = au.beatAt(T.hit2); }
    else if (t >= T.brackets && t < T.quit) action = 'A4';
    else if (t >= T.works) { action = 'A7'; where = { x: pvx - 40, y: pvy - PVH / 2, z: 112 * pvPop }; }
    if (inTaps) where = { x: kx - 40, y: ky - KH / 2 + 40, z: 34 };
    if (frozen1 || frozen2) action = 'A3';
    cl.clear();
    const pose = Clawd.pose(frozen1 || frozen2 ? null : action, { beat: f.beat, beat0, p: 0, jumpBeats: 1 });
    Clawd.draw(cl.ctx, 4 * CPX, 8 * CPX, pose, { px: CPX, body: flood ? css('paper') : undefined });
    cl.update({ x: where.x, y: where.y - (s.h + 10 * CPX) / 2 + 3 * CPX, z: where.z + 1, rz: inTaps ? 0 : -1.2 });

    // ------------------------------------------------------------------ camera
    const cursorX = ex - EW / 2 + 520, cursorY = ey - 40;
    const wide: CameraView = { x: pw / 2 + 90, y: ph / 2 - 30, zoom: 1.0 };
    let v: CameraView = wide;
    const pull = (hit: number) => ease.outExpo(span(t, hit, hit + 0.5));
    const lerpView = (a: CameraView, b: CameraView, k: number): CameraView => ({
      x: lerp(a.x!, b.x!, k), y: lerp(a.y!, b.y!, k), zoom: lerp(a.zoom ?? 1, b.zoom ?? 1, k),
      yaw: lerp(a.yaw ?? 0, b.yaw ?? 0, k), pitch: lerp(a.pitch ?? 0, b.pitch ?? 0, k), fov: lerp(a.fov ?? 30, b.fov ?? 30, k),
    });
    const close: CameraView = { x: cursorX, y: cursorY, zoom: 2.4 };
    if (frozen1 || frozen2) v = close;
    else if (t >= T.hit1 && t < T.brackets) v = lerpView(close, wide, pull(T.hit1));
    else if (t >= T.hit2 && t < T.works) v = lerpView(close, wide, pull(T.hit2));
    else if (inTaps) {
      const kv: CameraView[] = [
        { x: kx, y: ky - 40, zoom: 1.7 },
        { x: kx - 60, y: ky - 20, zoom: 1.9, yaw: -38, pitch: 16, fov: 36 },
        { x: kx + 40, y: ky - 60, zoom: 2.3, yaw: 0, pitch: -4, fov: 26 },
      ];
      v = kv[tapIdx]!;
    } else if (t >= T.quit && t < T.pick2) v = lerpView(wide, { ...wide, zoom: 0.86, yaw: 8, pitch: 6 }, ease.inOutCubic(span(t, T.quit, T.pick2)));
    else if (t >= T.works) v = lerpView(wide, { x: pvx - 80, y: pvy - 60, zoom: 1.35, yaw: 10, pitch: 8 }, ease.inOutCubic(span(t, T.works, T.works + 1.2)));
    stage.view(v);
    this.w.ground.render(this.ctx.renderer, out, {
      kind, t, camX: (v.x! - pw / 2) * 0.35, camY: (v.y! - ph / 2) * 0.35, zoom: v.zoom ?? 1, kick: f.a.kick,
      halftone: kind === 'clay' ? 0.8 : 0.35 + 0.4 * slam, grid: frozen1 || frozen2 ? 0.4 : 1,
    });
    stage.render(out);
    // lyric line (skipped on the hook lines: the poster slam is the hook typography)
    const lyr = lyricsTypeState(this.ctx.lyrics, t, au);
    const ov = this.w.overlay;
    ov.clear();
    if (lyr.style === 'small') drawLyricsLine(ov.ctx, { x: 96, y: 960, width: 1100, height: 60 }, lyr, kind);
    // matched cut from S07: its outgoing cursor sits at screen centre (960, 540), 72 px tall,
    // baseline 576; the first freeze holds exactly that cursor, growing a little into the slam
    if (frozen1) {
      const h = lerp(72, 110, ease.inCubic(span(t, T.pick1, T.hit1)));
      drawCursor(ov.ctx, { x: 960 - h * 0.275, y: 576 + (h - 72) / 2, h, on: blink(au.beatAt(t)) });
    }
    this.ctx.comp.draw(this.ctx.renderer, ov.upload(), out);

    // ------------------------------------------------------------------ post: shake on slams and on "machine"
    const shakeK = 16 * slam + 7 * hitAfter(t, T.machine, 0.1);
    const fi = frameIdx(t);
    return { ...postFor(kind), hud: 0, shake: [shakeK * (hash(fi, 1) - 0.5) * 2, shakeK * (hash(fi, 2) - 0.5) * 2] as [number, number] };
  }
}
