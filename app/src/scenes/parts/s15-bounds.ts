// Screen-space bounding boxes (shared by S15's composition tests).
import type { Pose } from '../../kit/clawd';
import { clamp } from '../../engine/util';

export type Point = { x: number; y: number };
export type Box = Point & { w: number; h: number };
export function bounds(points: readonly Point[], clip = false): Box {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = clip ? clamp(Math.min(...xs), 0, 1920) : Math.min(...xs);
  const y = clip ? clamp(Math.min(...ys), 0, 1080) : Math.min(...ys);
  const right = clip ? clamp(Math.max(...xs), 0, 1920) : Math.max(...xs);
  const bottom = clip ? clamp(Math.max(...ys), 0, 1080) : Math.max(...ys);
  return { x, y, w: right - x, h: bottom - y };
}

/** The actual square cells drawn by Clawd.draw, including its 0.35px seam overlap. */
export function spriteBounds(pose: Pose, cx: number, cy: number, px: number, roll = 0): Box {
  const co = Math.cos(roll), si = Math.sin(roll);
  const corners = pose.cells.flatMap(cell => [0, 1].flatMap(dx => [0, 1].map(dy => {
    const x = (cell.x + pose.dx - 8) * px + dx * (px + 0.35);
    const y = (cell.y + pose.dy - 2.5) * px + dy * (px + 0.35);
    return { x: cx + co * x - si * y, y: cy + si * x + co * y };
  })));
  return bounds(corners);
}

