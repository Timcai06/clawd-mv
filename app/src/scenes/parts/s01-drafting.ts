// Vector drafting and word-timed cursor writing, shared only by group A.
import { F, font, plain } from '../../engine/type';
import { strokeText, drawStrokeText, writtenLength, type StrokeText } from '../../engine/stroke';
import type { Line } from '../../engine/lyrics';
import { LineBatch } from '../../engine/lines';
import { css, lin, type ThemeKey } from '../../theme';
import { drawCursor } from '../../kit/cursor';
import type { View } from './s01-timing';

export function viewCanvas(c: CanvasRenderingContext2D, v: View) {
  c.translate(960, 540); c.rotate(v.roll); c.scale(v.zoom, v.zoom); c.translate(-v.x, -v.y);
}
export function project(v: View, x: number, y: number): [number, number] {
  const a = (x - v.x) * v.zoom, b = (y - v.y) * v.zoom;
  return [960 + a * Math.cos(v.roll) - b * Math.sin(v.roll), 540 + a * Math.sin(v.roll) + b * Math.cos(v.roll)];
}
export function rule(lines: LineBatch, v: View, a: [number, number], b: [number, number], alpha = 0.6, token: ThemeKey = 'paper', width = 1.2) {
  lines.seg2(...project(v, ...a), ...project(v, ...b), width * v.zoom, lin(token), alpha);
}
export function plotPath(lines: LineBatch, v: View, pts: [number, number][], p: number, token: ThemeKey = 'paper') {
  const lengths = pts.slice(1).map((pt, i) => Math.hypot(pt[0] - pts[i]![0], pt[1] - pts[i]![1]));
  let left = Math.max(0, Math.min(1, p)) * lengths.reduce((a, b) => a + b, 0);
  let head = pts[0]!;
  for (let i = 0; i < lengths.length && left > 0; i++) {
    const a = pts[i]!, b = pts[i + 1]!, k = Math.min(1, left / lengths[i]!);
    head = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    rule(lines, v, a, head, 0.72, token); left -= lengths[i]!;
  }
  return head;
}
export function mono(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 22, token: ThemeKey = 'ink', alpha = 1) {
  c.font = font(F.mono(), size); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = css(token, alpha); c.fillText(text, x, y);
}

export class WrittenLyric {
  stroke: StrokeText;
  times: [number, number][];
  constructor(public line: Line, size = 38) {
    const text = line.words.map(w => plain(w.w)).join(' ');
    this.stroke = strokeText(text, 'readable', size);
    this.times = [];
    line.words.forEach((w, index) => {
      for (let i = 0; i < w.w.length; i++) this.times.push([
        w.start + (w.end - w.start) * i / w.w.length,
        w.start + (w.end - w.start) * (i + 1) / w.w.length,
      ]);
      if (index < line.words.length - 1) this.times.push([w.end, w.end]);
    });
  }
  draw(c: CanvasRenderingContext2D, t: number, x: number, y: number, token: ThemeKey = 'ink') {
    c.save(); c.translate(x, y); c.strokeStyle = css(token); c.lineWidth = 1.7; c.lineCap = 'round';
    const head = drawStrokeText(c, this.stroke, writtenLength(this.stroke, this.times, t));
    if (head && t < this.line.end) drawCursor(c, { x: head.x + 5, y: head.y + 10, h: 24 });
    c.restore();
    return head && t < this.line.end ? { x: x + head.x + 5, y: y + head.y + 10, h: 24 } : null;
  }
}

// A printed attachment, rather than the filled tiles of the calendar-world scene.
export function calendarForm(c: CanvasRenderingContext2D, x: number, y: number, scale = 1) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  mono(c, 'OCTOBER / 2026', 0, 0, 24);
  const weekdays = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  for (let i = 0; i < 7; i++) mono(c, weekdays[i]!, i * 120 + 12, 50, 15, 'ink', 0.6);
  c.strokeStyle = css('ink', 0.3); c.lineWidth = 1;
  c.beginPath();
  for (let i = 0; i <= 7; i++) { c.moveTo(i * 120, 70); c.lineTo(i * 120, 430); }
  for (let i = 0; i <= 5; i++) { c.moveTo(0, 70 + i * 72); c.lineTo(840, 70 + i * 72); }
  c.stroke();
  for (let day = 1; day <= 32; day++) {
    const slot = day + 2, column = slot % 7, row = Math.floor(slot / 7);
    mono(c, String(day).padStart(2, '0'), column * 120 + 16, 116 + row * 72, 30, day === 32 ? 'clay' : 'ink');
  }
  c.restore();
}
