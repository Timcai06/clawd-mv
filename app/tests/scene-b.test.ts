import { describe, expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { afterBeats } from '../src/kit/time';
import { DATES, STREETS, cityState, cityTimes, dateBlock, streetAt } from '../src/scenes/parts/s04-city-model';
import { HERO_ROWS, platformState, platformTimes, projectPlatform } from '../src/scenes/parts/s05-platform-model';
import { resolveStoryboard, type Storyboard } from '../src/storyboard';
import audioJSON from '../../data/audio.json';
import lyricsJSON from '../../data/lyrics.json';
import board from '../../storyboard/shots.json';

const audio = new AudioData(audioJSON), lyrics = new Lyrics(lyricsJSON);
const city = cityTimes(audio, lyrics);
const platform = platformTimes(audio, lyrics);

describe('B / calendar city', () => {
  test('scene cues come from resolved shots, including the next scene boundary', () => {
    const shots = resolveStoryboard(board as Storyboard, lyrics, audio).shots;
    expect(city).toMatchObject({ start: shots.find((s) => s.id === 'S04-1')!.start,
      rise: shots.find((s) => s.id === 'S04-2')!.start,
      end: shots.find((s) => s.id === 'S05-1')!.start });
    expect(city.countEnd).toBeGreaterThan(city.start);
    expect(city.countEnd).toBeLessThan(city.rise);
    expect(city.october).toBeGreaterThan(city.rise);
  });

  test('October begins on Thursday, ends on Saturday, and the extra day starts a sixth row', () => {
    expect(DATES).toHaveLength(32);
    expect(dateBlock(1)).toMatchObject({ column: 4, row: 0 });
    expect(dateBlock(31)).toMatchObject({ column: 6, row: 4 });
    expect(dateBlock(32)).toMatchObject({ column: 0, row: 5 });
    expect(new Set(DATES.map((d) => `${d.x},${d.z}`)).size).toBe(32);
    for (let day = 1; day <= 31; day++) {
      const d = dateBlock(day);
      expect(STREETS.points.some((p) => p[0] === d.x && p[2] > d.z && p[2] < d.z + 1.8)).toBe(true);
    }
    for (let i = 1; i < STREETS.points.length; i++) {
      const a = STREETS.points[i - 1]!, b = STREETS.points[i]!;
      expect(a[0] === b[0] || a[2] === b[2]).toBe(true);
    }
  });

  test('32 stays underground until its cut, springs up, and remains visible for the hold', () => {
    expect(cityState(audio, city.rise - 1e-5, city)).toMatchObject({ rising: false, lift: 0 });
    expect(cityState(audio, city.rise, city)).toMatchObject({ rising: true, lift: 0 });
    expect(cityState(audio, city.end - 1e-5, city).travel).toBeCloseTo(1);
    expect(cityState(audio, afterBeats(audio, city.rise, 0.6), city).lift).toBeGreaterThan(1);
    expect(cityState(audio, city.end - 1e-5, city).roof32).toBeCloseTo(dateBlock(32).height);
  });

  test('the sung thirty-second counts 1 → 31 over the city, then overflows to 32 on the cut', () => {
    expect(cityState(audio, city.start, city).accented).toBe(1);
    let prev = 0;
    for (let t = city.start; t < city.countEnd; t += 0.05) {
      const n = cityState(audio, t, city).count;
      expect(n).toBeGreaterThanOrEqual(prev); prev = n;
    }
    expect(cityState(audio, city.countEnd, city).accented).toBe(31);
    expect(cityState(audio, city.rise, city).visited).toBe(31);
    expect(cityState(audio, afterBeats(audio, city.rise, 1), city).counter).toBeCloseTo(32, 3);
    expect(streetAt(0)).toEqual(STREETS.points[0]!);
    expect(streetAt(1)).toEqual(STREETS.points.at(-1)!);
  });

  test('nominal BPM and seek history do not affect geometry or animation', () => {
    const otherBpm = new AudioData({ ...audioJSON, bpm: 42 });
    const t = afterBeats(audio, city.rise, 0.7);
    const a = cityState(audio, t, city);
    cityState(audio, city.end, city); cityState(audio, city.start, city);
    expect(cityState(audio, t, city)).toEqual(a);
    expect(cityState(otherBpm, t, city)).toEqual(a);
  });
});

// The retired 2D lenses/side-scroll are replaced by the cliff-world assertions in scene-v6-g2.
// Keep the beat-grid and seek invariants against the submitted V6 world.
import * as cliff from '../src/scenes/parts/s05-world';
describe('B / source cliff timing invariants',()=>{
  test('the three shot boundaries still use the resolved storyboard',()=>{
    const cuts=resolveStoryboard(board as Storyboard,lyrics,audio).shots;
    for(const [key,id] of [['start','S05-1'],['read','S05-2'],['scroll','S05-3'],['end','S06-1']] as const)
      expect(platform[key]).toBe(cuts.find(s=>s.id===id)!.start);
  });
  test('revised beat grids retime drawers and nominal BPM does not',()=>{
    const other=new AudioData({...audioJSON,bpm:280}),t=afterBeats(audio,platform.read,1.3);
    for(let k=0;k<3;k++)expect(cliff.drawerBox(k,t,other,platform)).toEqual(cliff.drawerBox(k,t,audio,platform));
    const shifted=new AudioData({...audioJSON,beats:audioJSON.beats.map((t:number)=>t+.2),downbeats:audioJSON.downbeats.map((t:number)=>t+.2)}),retimed=platformTimes(shifted,lyrics);
    expect(retimed.drawers[1]).toBeCloseTo(afterBeats(shifted,retimed.read,1),7);
  });
  test('out-of-order world evaluation preserves the production fixtures',()=>{
    const before=JSON.stringify({lyricsJSON,audioJSON,board}),t=platform.read+.3,result=cliff.cameraAt(t,audio,lyrics);
    cliff.cameraAt(platform.end,audio,lyrics);cliff.cameraAt(platform.start,audio,lyrics);
    expect(cliff.cameraAt(t,audio,lyrics)).toEqual(result);expect(JSON.stringify({lyricsJSON,audioJSON,board})).toBe(before);
  });
});
test('only one discoverable main module exists for each B scene', () => {
  const files = [...new Bun.Glob('s*.ts').scanSync({ cwd: new URL('../src/scenes/', import.meta.url).pathname })];
  expect(files.filter((name) => name.startsWith('s04-'))).toEqual(['s04-calendar.ts']);
  expect(files.filter((name) => name.startsWith('s05-'))).toEqual(['s05-platform.ts']);
});
