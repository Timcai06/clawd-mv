// Static keyboard layout plus a pure analytic height field. GPU deformation and
// CPU line placement use the same equation; seeking never integrates a simulation.
import { keyboardKeys } from '../../kit/keyboard';
import { KEYBOARD_ROWS } from '../../kit/content';

export const TERRAIN_KEYS = keyboardKeys({}).map((k) => ({
  index: k.index, label: k.label, row: k.row,
  x: (k.x + k.width / 2) / 80 - 7.5,
  z: (k.y + k.height / 2) / 80 - 2.6875,
  width: k.width / 80, depth: k.height / 80,
  enter: k.label === 'Enter',
}));
export const ENTER = TERRAIN_KEYS.find((k) => k.enter)!;
export const KEY_COUNT = KEYBOARD_ROWS.reduce((sum, row) => sum + row.length, 0);

export function keyHeight(x: number, z: number, enter: boolean, beat: number, kick: number, landing: number) {
  if (enter) return 0.5 - landing * 0.22;
  return 0.48 + Math.sin(beat * Math.PI - x * 0.62 - z * 0.85) * 0.16
    + Math.sin(beat * Math.PI * 0.5 + x * 0.22) * 0.055
    + kick * 0.13 * Math.cos(x * 0.34 + z * 0.5);
}

/** Release the terrain continuously before the cursor hold; no hidden hard cut. */
export function terrainOpacity(dive: number) {
  const p = Math.max(0, Math.min(1, (dive - 0.72) / 0.26));
  return 1 - p * p * (3 - 2 * p);
}
