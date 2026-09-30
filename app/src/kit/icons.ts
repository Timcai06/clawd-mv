// Original, unbranded line symbols. All paths use a 24-unit coordinate system.
import { css } from '../theme';

export interface Box { x: number; y: number; width: number; height: number }
export type IconName = 'files' | 'search' | 'source' | 'run' | 'extensions' | 'folder' | 'file' | 'chevron' | 'down' | 'plus' | 'close' | 'check' | 'terminal';

export function drawIcon(c: CanvasRenderingContext2D, name: IconName, box: Box, color = css('ink')): void {
  c.save();
  c.translate(box.x, box.y); c.scale(box.width / 24, box.height / 24);
  c.strokeStyle = color; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath();
  const line = (...xy: number[]) => { c.moveTo(xy[0]!, xy[1]!); for (let i = 2; i < xy.length; i += 2) c.lineTo(xy[i]!, xy[i + 1]!); };
  const circle = (x: number, y: number, r: number) => { c.moveTo(x + r, y); c.arc(x, y, r, 0, Math.PI * 2); };
  switch (name) {
    case 'files': line(7, 3, 19, 3, 19, 16, 7, 16, 7, 3); line(4, 7, 4, 21, 15, 21); break;
    case 'file': line(5, 3, 14, 3, 19, 8, 19, 21, 5, 21, 5, 3); line(14, 3, 14, 8, 19, 8); break;
    case 'folder': line(3, 7, 3, 5, 10, 5, 13, 8, 21, 8, 21, 20, 3, 20, 3, 7); break;
    case 'search': circle(10, 10, 6); line(15, 15, 21, 21); break;
    case 'source': circle(6, 5, 2); circle(18, 8, 2); circle(6, 20, 2); line(6, 7, 6, 18); line(18, 10, 18, 13, 6, 16); break;
    case 'run': line(7, 4, 20, 12, 7, 20, 7, 4); line(3, 8, 3, 16); break;
    case 'extensions': c.rect(3, 3, 7, 7); c.rect(14, 3, 7, 7); c.rect(3, 14, 7, 7); line(14, 18, 21, 18); line(18, 14, 18, 21); break;
    case 'chevron': line(9, 6, 15, 12, 9, 18); break;
    case 'down': line(6, 9, 12, 15, 18, 9); break;
    case 'plus': line(5, 12, 19, 12); line(12, 5, 12, 19); break;
    case 'close': line(6, 6, 18, 18); line(6, 18, 18, 6); break;
    case 'check': line(4, 12, 9, 17, 20, 6); break;
    case 'terminal': line(4, 6, 10, 12, 4, 18); line(13, 18, 21, 18); break;
  }
  c.stroke(); c.restore();
}
