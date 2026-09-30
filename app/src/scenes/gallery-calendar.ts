import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import { CALENDAR_MONTHS, CALENDAR_ROLLOVER } from '../kit/content';
import { drawCalendar, type CalendarState } from '../kit/calendar';

export function galleryCalendarState(t: number): CalendarState {
  if (t < 2) return { highlightedDays: [Math.min(31, 1 + Math.floor(30 * prog(t, 0, 2)))] };
  if (t < 6) return { dayCount: 32, extraPop: prog(t, 2, 3), errorPhase: prog(t, 3, 4), extraBurst: prog(t, 4, 6) };
  return { highlightedDays: [31], nextHighlightedDays: [1], nextMonth: CALENDAR_MONTHS.november, flip: prog(t, 7, 9) };
}

export default class GalleryCalendar extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx;
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('CALENDAR / ONE DAY TOO MANY', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S03 · S04 · S08 · S15 · S17 · S18', 48, 134);
    drawCalendar(c, { x: 480, y: 172, width: 1000, height: 820 }, galleryCalendarState(f.t));
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 175); c.fillText(f.t >= 9 ? '01' : '31', 48, 401);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText(`${CALENDAR_ROLLOVER.from} → ${CALENDAR_ROLLOVER.to}`, 48, 461);
    c.fillText('COMPACT / 31 DAYS', 1510, 200);
    drawCalendar(c, { x: 1510, y: 226, width: 350, height: 287 }, { highlightedDays: [31] });
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
