import { describe, expect, test } from 'bun:test';
import clawd from '../../reference/clawd/clawd.json';
import { deviceLayout, deviceWallLayout, drawDevice, type DeviceType } from '../src/kit/devices';

const pixels = clawd.terminal_welcome.pixels;
const box = { x: 50, y: 70, width: 1600, height: 500 };

describe('device frames and Clawd wall', () => {
  test('every O and D pixel maps to exactly one device, retaining the eye cells', () => {
    const wall = deviceWallLayout(pixels, box);
    const expected = pixels.flatMap((line, row) => [...line].flatMap((pixel, column) => /[OD]/.test(pixel) ? [{ row, column, pixel }] : []));
    expect(wall).toHaveLength(expected.length); expect(wall.map(({ row, column, pixel }) => ({ row, column, pixel }))).toEqual(expected);
    expect(wall.filter((d) => d.pixel === 'D').map((d) => [d.column, d.row])).toEqual([[4, 1], [11, 1]]);
    expect(new Set(wall.map((d) => d.type)).size).toBe(3);
    wall.forEach((d) => {
      expect(d.box.x + d.box.width / 2).toBeCloseTo(box.x + (d.column + 0.5) * 100);
      expect(d.box.y + d.box.height / 2).toBeCloseTo(box.y + (d.row + 0.5) * 100);
    });
  });
  test('wall scales uniformly and rejects noncanonical dimensions', () => {
    const a = deviceWallLayout(pixels, box), b = deviceWallLayout(pixels, { x: 25, y: 35, width: 800, height: 250 });
    expect(b.map((d) => d.type)).toEqual(a.map((d) => d.type));
    expect(b[0].box.x).toBe(a[0].box.x / 2); expect(b[0].box.width).toBe(a[0].box.width / 2);
    expect(() => deviceWallLayout(['O'], box)).toThrow('16x5');
    expect(deviceWallLayout(pixels, { ...box, width: 0 })).toEqual([]);
  });
  test('all device screens fit their bodies and callbacks receive the clipped screen', () => {
    for (const type of ['computer', 'tablet', 'phone'] as DeviceType[]) {
      const { body, screen } = deviceLayout(box, type);
      expect(screen.x).toBeGreaterThan(body.x); expect(screen.y).toBeGreaterThan(body.y);
      expect(screen.x + screen.width).toBeLessThan(body.x + body.width);
      expect(screen.y + screen.height).toBeLessThan(body.y + body.height);
      const events: string[] = [];
      const c = { save() { events.push('save'); }, restore() { events.push('restore'); },
        beginPath() {}, rect() {}, clip() { events.push('clip'); }, fillRect() {} } as unknown as CanvasRenderingContext2D;
      drawDevice(c, box, { type, content: (ctx, actual) => { expect(ctx).toBe(c); expect(actual).toEqual(screen); events.push('content'); } });
      expect(events).toEqual(['save', 'clip', 'clip', 'content', 'restore']);
    }
  });
});
