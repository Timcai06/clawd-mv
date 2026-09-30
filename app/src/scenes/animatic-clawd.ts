// Minimal pose diagrams, not the final character animation library.
import clawd from '../../../reference/clawd/clawd.json';

export const PIXELS = clawd.terminal_welcome.pixels;
export interface Pixel { x: number; y: number }

export function clawdPose(action: string | null, beat: number, localBeat: number, progress: number, jumpProgress: number): Pixel[] {
  if (!action) return [];
  const phase = beat - Math.floor(beat);
  let dx = 0, dy = 0;
  if (action === 'A1') dy = 0.5 - 0.5 * Math.cos(Math.PI * beat);
  if (action === 'A3') dy = -Math.sin(Math.PI * phase);
  if (action === 'A5') dx = 4 * (progress - 0.5);
  if (action === 'A6') dy = -4 * Math.sin(Math.PI * Math.min(1, Math.max(0, jumpProgress)));
  if (action === 'A8') dx = Math.sin(2 * Math.PI * beat * 16);
  if (action === 'A11') dy = 3 * progress;
  if (action === 'A12') dy = -3 * Math.sin(Math.PI * phase);
  const pixels: Pixel[] = [];
  PIXELS.forEach((row, y) => [...row].forEach((value, x) => {
    const closed = action === 'A1' || action === 'A9' || (action === 'A2' && localBeat < (x < 8 ? 0.25 : 0.75));
    if (value !== 'O' && !(value === 'D' && closed)) return;
    let px = x + dx, py = y + dy;
    const arm = y === 2 && (x < 2 || x > 13);
    if (arm && (action === 'A7' || action === 'A12')) py -= 1;
    if (arm && action === 'A4') py += (x < 8 ? 1 : -1) * Math.sin(beat * Math.PI * 8);
    if (arm && x > 13 && action === 'A10') px += 2 * Math.sin(Math.PI * phase);
    if (arm && x > 13 && action === 'A13') py -= 1 + Math.sin(beat * Math.PI * 2);
    if (y === 4 && (action === 'A4' || action === 'A9')) {
      const leg = [3, 5, 10, 12].indexOf(x);
      if (leg === Math.floor(beat * (action === 'A4' ? 8 : 1)) % 4) py -= 1;
    }
    if (y === 4 && action === 'A5') py -= (Math.floor(beat * 2) + x) % 2;
    pixels.push({ x: px, y: py });
  }));
  return pixels;
}
