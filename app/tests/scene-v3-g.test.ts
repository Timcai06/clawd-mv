// Old v3 screen-space arc/carry/fade assertions replaced by the V6 world contract.
import { expect, test } from 'bun:test';
import { AudioData } from '../src/engine/audio';
import { Lyrics } from '../src/engine/lyrics';
import { Voice } from '../src/kit/lyric-moves';
import { afterBeats } from '../src/kit/time';
import { CREDIT_LINES } from '../src/kit/credits';
import { primError } from '../src/kit/handoff';
import { resolveOutroTimes, outroState, outroCredits, starState, handoffIn } from '../src/scenes/parts/s18-score';
import { screenPoints } from '../src/scenes/parts/s17-swarm';
import { cursorScreenAt, loopTarget, cameraAt } from '../src/scenes/parts/s18-world';
import a from '../../data/audio.json';
import l from '../../data/lyrics.json';
const audio=new AudioData(a),lyrics=new Lyrics(l),voice=new Voice(lyrics,audio),T=resolveOutroTimes(audio,lyrics);
test('V6 incoming points match actual wall projections, rather than the six v3 git nodes',()=>{expect(primError({kind:'points',pts:handoffIn(T.start,audio,T)},{kind:'points',pts:screenPoints()}).px).toBeLessThanOrEqual(2);});
test('V6 chorus does not carry or re-layout any line in the outro',()=>{expect(T.carried).toEqual([]);expect(T.ohs.length).toBe(audio.events('vocal',T.start,T.end).length);});
test('V6 stars light by vocal onsets and remain seek safe',()=>{for(const t of [T.start,T.dawn,T.end]){const s=starState(audio,voice,t,T);starState(audio,voice,T.end,T);expect(starState(audio,voice,t,T)).toEqual(s);expect(cameraAt(audio,t,T)).toEqual(cameraAt(audio,t,T));}});
test('V6 preserves every credit row and its measured beat reveal',()=>{const at=T.shots[6]!.start;expect(outroCredits(audio,at,T).lines.every(x=>x.progress===0)).toBe(true);for(let i=0;i<6;i++)expect(outroCredits(audio,afterBeats(audio,at,i+1.2),T).lines[i]!.progress).toBeCloseTo(1,10);expect(outroCredits(audio,T.end,T).lines.map(x=>x.text)).toEqual([...CREDIT_LINES]);});
test('V6 last frame contains the cursor without a global fade',()=>{expect(outroState(audio,T.end-1/60,T).fade).toBe(0);expect(outroState(audio,T.end-1/60,T).loop).toBe(1);expect(primError({kind:'rect',...cursorScreenAt(audio,T.end-1/60,T)},{kind:'rect',...loopTarget()}).px).toBeLessThanOrEqual(2);});
