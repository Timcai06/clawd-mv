// A deliberately small TypeScript lexer, not a parser. Template literals are one
// string token (including interpolation); regex literals and JSX are not special.
import { css, INK_SOFT } from '../theme';

export type TokenKind = 'keyword' | 'string' | 'number' | 'comment' | 'identifier' | 'punctuation' | 'whitespace';
export interface Token { kind: TokenKind; text: string; start: number; end: number }
/** Columns are zero-based UTF-16 offsets; ranges are half-open. */
export type Emphasis = { start: number; end: number } | { word: string; occurrence?: number };
export interface SyntaxRun extends Token { accent: boolean }

const KEYWORDS = new Set(('abstract as async await boolean break case catch class const continue debugger declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let module namespace never new null number object of private protected public readonly return satisfies set static string super switch symbol this throw true try type typeof undefined unique unknown var void while with yield').split(' '));
const LEX = /\s+|\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|"(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?|`(?:\\[\s\S]|[^`\\])*`?|(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?[\d_]+)?)n?|[$_\p{ID_Start}][$\u200c\u200d\p{ID_Continue}]*|[^]/gu;

export function tokenize(source: string): Token[] {
  // matchAll clones the regexp, so neither callers nor subsequent frames share a cursor.
  return Array.from(source.matchAll(LEX), (m) => {
    const text = m[0], start = m.index!;
    const kind: TokenKind = /^\s/.test(text) ? 'whitespace'
      : text.startsWith('//') || text.startsWith('/*') ? 'comment'
      : /^["'`]/.test(text) ? 'string'
      : /^(?:\d|\.\d)/.test(text) ? 'number'
      : KEYWORDS.has(text) ? 'keyword'
      : /^[$_\p{ID_Start}]/u.test(text) ? 'identifier' : 'punctuation';
    return { kind, text, start, end: start + text.length };
  });
}

/** Lex the entire document before splitting so scrolling preserves block comments. */
export function tokenizeLines(lines: readonly string[]): Token[][] {
  const result: Token[][] = lines.map(() => []);
  let row = 0, column = 0;
  for (const token of tokenize(lines.join('\n'))) {
    const parts = token.text.split('\n');
    parts.forEach((text, i) => {
      if (i) { row++; column = 0; }
      if (text && result[row]) result[row].push({ kind: token.kind, text, start: column, end: column + text.length });
      column += text.length;
    });
  }
  return result;
}

/** Truncate a typed prefix without exposing half of a surrogate pair. */
export function typedText(text: string, chars = text.length): string {
  const count = Number.isNaN(chars) ? 0 : Math.max(0, Math.min(text.length, Math.floor(chars)));
  const prefix = text.slice(0, count);
  return /[\uD800-\uDBFF]$/.test(prefix) ? prefix.slice(0, -1) : prefix;
}

export function syntaxRuns(tokens: readonly Token[], emphasis: readonly Emphasis[] = [], chars = Infinity): SyntaxRun[] {
  const ranges = emphasis.flatMap((e) => {
    if ('start' in e) return [e];
    const matches = tokens.filter((token) => token.text === e.word && token.kind !== 'whitespace');
    return e.occurrence === undefined ? matches : matches.slice(e.occurrence, e.occurrence + 1);
  });
  return tokens.flatMap((token) => {
    const end = token.start + typedText(token.text, chars - token.start).length;
    if (end <= token.start) return [];
    const cuts = [...new Set([token.start, end, ...ranges.flatMap((r) => [r.start, r.end])
      .filter((n) => n > token.start && n < end)])].sort((a, b) => a - b);
    return cuts.slice(0, -1).map((start, i) => ({
      kind: token.kind, start, end: cuts[i + 1]!, text: token.text.slice(start - token.start, cuts[i + 1]! - token.start),
      accent: ranges.some((r) => start >= r.start && start < r.end),
    }));
  });
}

export function syntaxStyle(kind: TokenKind, accent = false): { color: string; weight: number } {
  return {
    color: accent ? css('clay') : css('ink', kind === 'comment' ? INK_SOFT.mid
      : kind === 'string' || kind === 'punctuation' ? INK_SOFT.strong : 1),
    weight: kind === 'keyword' ? 600 : kind === 'number' ? 500 : 400,
  };
}
