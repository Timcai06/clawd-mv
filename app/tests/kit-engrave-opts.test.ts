import { expect, test } from 'bun:test';
import { engraveMaterial, setEngrave } from '../src/kit/engrave-mat';

const compile = (m: ReturnType<typeof engraveMaterial>) => {
  const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: '#include <common>\nvoid main(){\n#include <opaque_fragment>\n}', vertexShader: '' };
  (m.onBeforeCompile as unknown as (s: typeof shader) => void)(shader);
  return shader;
};

test('engrave options: lightLines, splitX and paperMap reach the shader', () => {
  const m = engraveMaterial({ ink: [0, 0, 0], paper: [1, 1, 1], lightLines: true, splitX: 624, paperMap: true });
  const s = compile(m);
  expect(s.uniforms.engraveLightLines!.value).toBe(1);
  expect(s.uniforms.engraveSplitX!.value).toBe(624);
  expect(s.uniforms.engraveUseMap!.value).toBe(1);
  expect(s.fragmentShader).toContain('engraveSwap');
  setEngrave(m, { splitX: null, lightLines: false, paperMap: false });
  expect(s.uniforms.engraveSplitX!.value).toBe(-1e9);
  expect(s.uniforms.engraveLightLines!.value).toBe(0);
  expect(s.uniforms.engraveUseMap!.value).toBe(0);
  m.dispose();
});
