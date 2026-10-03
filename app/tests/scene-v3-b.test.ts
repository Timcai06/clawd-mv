// V3 flat source platforms, CHECK weight morphs, ENTER title and centred cursor
// conflict with the V6 scene specifications. Their replacements measure the actual
// cliff/plotter/key world, letters and adjacent-frame primitives.
import './scene-v6-g2.test';
import {expect,test} from 'bun:test';
import {AudioData} from '../src/engine/audio';import {Lyrics} from '../src/engine/lyrics';
import {afterBeats} from '../src/kit/time';import {resolveCTimes} from '../src/scenes/parts/s06-timing';
import {KEY_FIELD,KEY_COUNT,cameraAt,riderGeometry} from '../src/scenes/parts/s07-terrain';
import audioJSON from '../../data/audio.json';import lyricsJSON from '../../data/lyrics.json';
const au=new AudioData(audioJSON),lyrics=new Lyrics(lyricsJSON),T=resolveCTimes(au,lyrics);
test('S07 rider retains its world-space wave crest while the Enter dive leaves it behind',()=>{
  const anchor=T.keyboard+(T.dive-T.keyboard)*.6,later=afterBeats(au,T.launch,1),a=riderGeometry(au,anchor,T,cameraAt(au,anchor,T)),b=riderGeometry(au,later,T,cameraAt(au,later,T));
  expect(b.pos.x).toBe(a.pos.x);expect(b.pos.z).toBe(a.pos.z);expect(b.pos.y).not.toBe(a.pos.y);
  expect(b.pos.clone().sub(b.support).toArray()).toEqual(a.pos.clone().sub(a.support).toArray());
  expect(KEY_FIELD).toHaveLength(8*KEY_COUNT);
});
test('S07 projected camera choreography still ignores nominal BPM',()=>{
  const other=new AudioData({...audioJSON,bpm:240}),t=T.keyboard+(T.dive-T.keyboard)*.6;
  expect(cameraAt(other,t,T).matrixWorld.toArray()).toEqual(cameraAt(au,t,T).matrixWorld.toArray());
});
