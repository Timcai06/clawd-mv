import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { F, font } from '../engine/type';
import { prog } from '../engine/util';
import { css, INK_SOFT, POSTER_POST } from '../theme';
import clawd from '../../../reference/clawd/clawd.json';
import { deviceWallLayout, drawDevice, type DeviceType } from '../kit/devices';
import { drawCalendar } from '../kit/calendar';

export function galleryDevicesState(t: number) {
  return { lit: prog(t, 1, 4), wall: prog(t, 4, 5), wallLit: prog(t, 5, 9) };
}

export default class GalleryDevices extends Scene {
  private layer!: Layer2D;
  override init() { this.layer = new Layer2D(); }
  override render(f: Frame, out: THREE.WebGLRenderTarget) {
    const c = this.layer.ctx, state = galleryDevicesState(f.t);
    this.layer.clear(css('paper')); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillStyle = css('ink'); c.font = font(F.archivo(100, 900), 52); c.fillText('DEVICES / EVERY MACHINE', 48, 79);
    c.fillStyle = css('ink', INK_SOFT.strong); c.font = font(F.mono(), 18); c.fillText('S17 · OCTOBER / 31 DAYS', 48, 134);
    c.save(); c.globalAlpha = 1 - state.wall;
    (['computer', 'tablet', 'phone'] as DeviceType[]).forEach((type, i) => {
      drawDevice(c, { x: 100 + i * 595, y: 240, width: 530, height: 700 }, { type, content: (ctx, screen) => {
        ctx.globalAlpha *= prog(state.lit, i / 3, (i + 1) / 3);
        drawCalendar(ctx, screen, { highlightedDays: [31] });
      } });
    });
    c.restore(); c.save(); c.globalAlpha = state.wall;
    const wall = deviceWallLayout(clawd.terminal_welcome.pixels, { x: 80, y: 280, width: 1760, height: 660 });
    wall.forEach((device, i) => {
      drawDevice(c, device.box, { type: device.type, body: device.pixel === 'D' ? 'ink' : 'clay', content: (ctx, screen) => {
        ctx.globalAlpha *= prog(state.wallLit * wall.length, i, i + 1);
        drawCalendar(ctx, screen, { highlightedDays: [31] });
      } });
    });
    c.restore();
    this.ctx.comp.draw(this.ctx.renderer, this.layer.upload(), out, { mode: 'replace' });
    return { ...POSTER_POST, hud: 0 };
  }
  override dispose() { this.layer.texture.dispose(); }
}
