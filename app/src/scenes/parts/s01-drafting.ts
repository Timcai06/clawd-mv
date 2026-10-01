// The two annotation sizes in group A use Plex Mono; sung words live in Voice/vartype.
import { F, font } from '../../engine/type';
import { css, type ThemeKey } from '../../theme';
export function mono(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 20, token: ThemeKey = 'ink', alpha = 0.6) {
  c.font = font(F.mono(), size); c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.fillStyle = css(token, alpha); c.fillText(text, x, y);
}
