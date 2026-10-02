// Colour tokens for the Swiss-poster x hi-fi-UI look (docs/TREATMENT.md, "视觉规范").
// Scenes and kit components use ONLY these tokens — never literal colours — so the grade
// can be changed in one place. engine/palette.ts is the upstream palette and is not used
// by our scenes.
import { hexToLinear } from './engine/util';

export const THEME = {
  paper: '#F2EFE9', // background, the poster sheet
  ink: '#1B2A4A', // main colour: display type, grid rules, UI text
  hot: '#FFF3E0', // white-hot lyric onset: rgb(255,243,224)
  clay: '#D77757', // the only accent: Clawd (same as the official clawd_body), hook word, current line, the big circle
  // Night-version trial (CONTEXT 夜景试验, 2026-10-02): the near-black the light comes out of.
  night: '#05070C',
  // Semantic colours: test state (fail / pass marks and counters) and PR diff lines.
  // Approved by Tim (2026-09-30) for test state and PR diff lines only; values provisional.
  fail: '#C8453B',
  pass: '#3F8F5F',
} as const;

export type ThemeKey = keyof typeof THEME;

/**
 * Post-processing for the poster look; every scene returns (at least) these overrides.
 * The upstream defaults (engine/post.ts) add bloom, halation, chromatic aberration and a
 * vignette, all banned by the spec; paper (#F2EFE9, ~0.88 linear) would also exceed the
 * bloom threshold and glow, and the highlight shoulder would darken it (and shift the brand
 * colours). A little grain stays as paper texture.
 */
export const POSTER_POST = { bloom: 0, halation: 0, ca: 0, vignette: 0, grain: 0.03, shoulder: 0 } as const;

/** Ink at the three spec'd strengths (secondary text, rules, separators and shadows). */
export const INK_SOFT = { strong: 0.6, mid: 0.3, faint: 0.12 } as const;

/** Linear RGB triplet for GL uniforms / three.js colours. */
export const lin = (k: ThemeKey): [number, number, number] => hexToLinear(THEME[k]);

/** CSS colour for Canvas2D, optionally with alpha (e.g. css('ink', INK_SOFT.mid)). */
export function css(k: ThemeKey, a = 1): string {
  const n = parseInt(THEME[k].slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
