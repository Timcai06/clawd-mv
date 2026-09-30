import { describe, expect, test } from 'bun:test';
import { syntaxRuns, syntaxStyle, tokenize, tokenizeLines, typedText } from '../src/kit/syntax';
import { css, INK_SOFT } from '../src/theme';

describe('TypeScript syntax', () => {
  test('classifies the story loop and preserves every source character', () => {
    const source = '  for (let d = 0; d <= days; d++) { // October';
    const tokens = tokenize(source);
    expect(tokens.map((t) => t.text).join('')).toBe(source);
    expect(tokens.find((t) => t.text === 'for')?.kind).toBe('keyword');
    expect(tokens.find((t) => t.text === 'days')?.kind).toBe('identifier');
    expect(tokens.find((t) => t.text === '0')?.kind).toBe('number');
    expect(tokens.find((t) => t.text === '<')?.kind).toBe('punctuation');
    expect(tokens.at(-1)?.kind).toBe('comment');
    for (const token of tokens) expect(source.slice(token.start, token.end)).toBe(token.text);
  });

  test('keeps escaped strings, templates, comments and numeric literals intact', () => {
    const source = '"a\\\"b" \'text\' `day ${d}` 0xff 0b10 1_000 .5 2e-3 42n /* 19 */';
    expect(tokenize(source).filter((t) => t.kind !== 'whitespace').map((t) => t.kind))
      .toEqual(['string', 'string', 'string', 'number', 'number', 'number', 'number', 'number', 'number', 'comment']);
    expect(tokenize('const 日 = "October";').find((t) => t.text === '日')?.kind).toBe('identifier');
  });

  test('scrolling into a multiline comment or template does not reset lexical context', () => {
    const lines = ['/* first', 'for 42', '*/ const text = `one', 'two`;'];
    const tokens = tokenizeLines(lines);
    expect(tokens[1]!.every((t) => t.kind === 'comment')).toBe(true);
    expect(tokens[3]![0]!.kind).toBe('string');
    expect(tokens.map((row) => row.map((t) => t.text).join(''))).toEqual(lines);
    expect(tokenizeLines(['', '', ''])).toEqual([[], [], []]);
  });

  test('emphasizes a word occurrence or an exact span without coloring neighbors', () => {
    const tokens = tokenize('days + days <= 31');
    const runs = syntaxRuns(tokens, [{ word: 'days', occurrence: 1 }, { start: 12, end: 14 }]);
    expect(runs.filter((r) => r.accent).map((r) => r.text).join('')).toBe('days<=');
    expect(runs[0]!.accent).toBe(false);
    expect(syntaxStyle('keyword').weight).toBe(600);
    expect(syntaxStyle('comment').color).toBe(css('ink', INK_SOFT.mid));
    expect(syntaxStyle('identifier', true).color).toBe(css('clay'));
  });

  test('typing clips within a token, including emphasized runs', () => {
    expect(syntaxRuns(tokenize('const days = 31;'), [{ start: 6, end: 10 }], 8)
      .map((r) => r.text).join('')).toBe('const da');
    expect(syntaxRuns(tokenize('const'), [], 0)).toEqual([]);
  });

  test('typed prefixes clamp counts and never split a surrogate pair', () => {
    expect(typedText('npm test', 4.9)).toBe('npm ');
    expect(typedText('npm test', -3)).toBe('');
    expect(typedText('npm test', Infinity)).toBe('npm test');
    expect(typedText('npm test', NaN)).toBe('');
    expect(typedText('a🦀b', 2)).toBe('a');
    expect(typedText('a🦀b', 3)).toBe('a🦀');
  });
});
