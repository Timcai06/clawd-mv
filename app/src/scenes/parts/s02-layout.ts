// PING's font outlines own C1; there is no notification-card handoff in V6.
import { varRun, fitVar, type Axes } from '../../kit/vartype';
import { runInkBounds } from '../../kit/pathtext';
import type { Rect } from '../../kit/handoff';
export const PING_BOX = { x: -70, y: 170, w: 2060, h: 625 };
export const SPLIT_X = 624;
export interface PingLayout { axes: Axes; size: number; x: number; y: number; scaleX: number; letters: Rect[] }
let cached: PingLayout | undefined;
export function pingLayout(): PingLayout {
  if (cached) return cached;
  // fitVar solves em size, not the width axis. Solve wdth by bisection of the
  // actual ink ratio, then use fitVar for the em size at that width.
  const inkRatio=(wdth:number)=>{const b=runInkBounds(varRun('PING',100,{wdth,wght:900}));return (b.x1-b.x0)/(b.y1-b.y0);};
  const wanted=PING_BOX.w/PING_BOX.h;
  let lo=62,hi=125;
  for(let n=0;n<32;n++){const mid=(lo+hi)/2;if(inkRatio(mid)<wanted)lo=mid;else hi=mid;}
  const axes={wdth:(lo+hi)/2,wght:900};
  const base=varRun('PING',100,axes), b=runInkBounds(base);
  const size=fitVar('PING',base.width*PING_BOX.h/(b.y1-b.y0),axes);
  const run=varRun('PING',size,axes), ink=runInkBounds(run);
  // If the installed font's wdth range cannot reach the specified ink ratio,
  // preserve cap height and use a single horizontal fit (reported explicitly).
  const scaleX=PING_BOX.w/(ink.x1-ink.x0), x=PING_BOX.x-ink.x0*scaleX,y=PING_BOX.y-ink.y0;
  const letters=run.glyphs.map(g=>{
    const r=runInkBounds(varRun(g.ch,size,axes));
    return {x:x+(g.x+r.x0)*scaleX,y:y+r.y0,w:(r.x1-r.x0)*scaleX,h:r.y1-r.y0};
  });
  return cached={axes,size,x,y,scaleX,letters};
}
export function iStemRect(): Rect { return {...pingLayout().letters[1]!}; }
