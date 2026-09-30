// Colour tokens for the Swiss-poster x hi-fi-UI look (docs/TREATMENT.md, "视觉规范").
// Scenes and kit components use ONLY these tokens — never literal colours — so the grade
// can be changed in one place. engine/palette.ts is the upstream palette and is not used
// by our scenes.
import { hexToLinear } from './engine/util';

export const THEME = {
  paper: '#F2EFE9', // background, the poster sheet
  ink: '#1B2A4A', // main colour: display type, grid rules, UI text
  clay: '#D77757', // the only accent: Clawd (same as the official clawd_body), hook word, current line, the big circle
  // Semantic colours, ONLY for test state (fail / pass marks and counters).
  // Values are provisional until Tim confirms semantic colours are allowed.
  fail: '#C8453B',
  pass: '#3F8F5F',
} as const;

export type ThemeKey = keyof typeof THEME;

/** Ink at the three spec'd strengths (secondary text, rules, separators and shadows). */
export const INK_SOFT = { strong: 0.6, mid: 0.3, faint: 0.12 } as const;

/** Linear RGB triplet for GL uniforms / three.js colours. */
export const lin = (k: ThemeKey): [number, number, number] => hexToLinear(THEME[k]);

/** CSS colour for Canvas2D, optionally with alpha (e.g. css('ink', INK_SOFT.mid)). */
export function css(k: ThemeKey, a = 1): string {
  const n = parseInt(THEME[k].slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
