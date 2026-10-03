// S03's printed form and sung fields, with a full-page flat plate at the keyframe.
import type { AudioData } from '../../engine/audio';
import { ease, hash } from '../../engine/util';
import { css } from '../../theme';
import { afterBeats, span } from '../../kit/time';
import { HANDOFF, lensRect, type Prim, type Rect } from '../../kit/handoff';
import type { LensView } from '../../kit/lens';
import { lerp } from '../../engine/util';
import { heatColor, Voice, drawSet, setLine, stamp } from '../../kit/lyric-moves';
import { affine, drawInscription, drawStrikeGuide, fitWidth, headX, inscribe, land, type Aff, type InGlyph, type Inscription } from '../../kit/inscribe';
import { mono } from './s01-drafting';
import { machineTitle, printInBox, mixRect } from './s01-print';
import type { OpeningTimes } from './s01-timing';
export const FORM = { x: 60, y: 57, w: 1790, h: 1000 };
export const FORM_ROLL = -0.032;
export const REPORT_CLAWD = { x: 1510, y: 941, px: 11, stretchY: 1.4 };
export const STAMP = { x: 1190, y: 766, angle: -0.21, w: 810, h: 340 };
export function handoffIn(t: number, audio: AudioData, T: OpeningTimes) {
  return mixRect(HANDOFF.card02, FORM, ease.outCubic(span(t, T.issue, afterBeats(audio, T.issue, 1))));
}
export function handoffOut(_t: number) { return { ...HANDOFF.month03 }; }
export function formBounds(t: number, audio: AudioData, T: OpeningTimes) {
  const b = handoffIn(t, audio, T), k = span(t, T.issue, afterBeats(audio, T.issue, 1));
  const r = FORM_ROLL * k, points = [[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]];
  const p = points.map(([x,y]) => [960 + (x!-960)*Math.cos(r)-(y!-540)*Math.sin(r),540+(x!-960)*Math.sin(r)+(y!-540)*Math.cos(r)]);
  const x = Math.max(0, Math.min(...p.map(p=>p[0]!))), y = Math.max(0, Math.min(...p.map(p=>p[1]!)));
  return { dominant: { x, y, w: Math.min(1920,Math.max(...p.map(p=>p[0]!)))-x, h: Math.min(1080,Math.max(...p.map(p=>p[1]!)))-y },
    clawd: { x: REPORT_CLAWD.x, y: REPORT_CLAWD.y, w: 16*REPORT_CLAWD.px, h: 5*REPORT_CLAWD.px*REPORT_CLAWD.stretchY } };
}
export function drawCalendar(c: CanvasRenderingContext2D, b: Rect) {
  c.save(); c.strokeStyle = css('ink', 0.6); c.lineWidth = 1; c.strokeRect(b.x,b.y,b.w,b.h);
  machineTitle(c,'OCTOBER',{x:b.x+26,y:b.y+18,w:260,h:50});
  const cw = b.w/7, rh=(b.h-70)/5;
  c.beginPath(); for(let i=0;i<=7;i++){c.moveTo(b.x+i*cw,b.y+70);c.lineTo(b.x+i*cw,b.y+b.h);}
  for(let i=0;i<=5;i++){c.moveTo(b.x,b.y+70+i*rh);c.lineTo(b.x+b.w,b.y+70+i*rh);} c.stroke();
  for(let day=1;day<=32;day++){
    const slot=day+2, x=b.x+(slot%7)*cw, y=b.y+70+Math.floor(slot/7)*rh;
    machineTitle(c,String(day),{x:x+cw*0.28,y:y+rh*0.2,w:cw*0.4,h:rh*0.6},day===32?1:0.6);
    if(day===32){c.strokeStyle=css('clay');c.lineWidth=4;c.beginPath();c.ellipse(x+cw*.5,y+rh*.5,cw*.65,rh*.43,-.3,0,Math.PI*2);c.stroke();}
  } c.restore();
}
export function drawForm(c: CanvasRenderingContext2D, rect: Rect) {
  c.save(); c.fillStyle=css('paper',0.94);c.fillRect(rect.x,rect.y,rect.w,rect.h);
  c.beginPath();c.rect(rect.x,rect.y,rect.w,rect.h);c.clip();c.strokeStyle=css('ink',0.55);c.lineWidth=1.3;
  c.strokeRect(FORM.x,FORM.y,FORM.w,FORM.h);
  c.beginPath();for(const y of [115,515,580,645,720,835,905,980]){c.moveTo(60,y);c.lineTo(1850,y);}
  for(const [x,y0,y1] of [[210,515,980],[580,515,580],[830,515,580],[1650,580,980]]){c.moveTo(x!,y0!);c.lineTo(x!,y1!);}c.stroke();
  // Report header and structured metadata stay at the same annotation size.
  mono(c,'ISSUE REPORT / FORM 032',84,97,20,'ink',0.6);
  mono(c,'ID / CAL-2026-01032   PRIORITY / HIGH',232,557,20,'ink',0.6);
  // These are contents of the form, not free-floating annotation legends. All are ≤60% ink.
  const fields = [
    ['COMPONENT', 'Calendar / Date Rendering', 625],
    ['ENVIRONMENT', 'Web v2.1.4 / macOS 14', 692],
    ['REPRODUCE', '1. Open Calendar', 761],
    ['', '2. Navigate to October 2026', 788],
    ['', '3. Observe final date in month view', 815],
    ['ACTUAL', 'Calendar shows October 32', 879],
    ['EXPECTED', 'Calendar shows October 31', 949],
  ] as const;
  for (const [label, text, y] of fields) {
    mono(c,label,76,y,18,'ink',.6);mono(c,text,232,y,20,'ink',.6);
  }
  for(let i=0;i<4;i++) {c.strokeRect(1680,625+i*70,22,22);}
  c.beginPath();c.moveTo(1680,625);c.lineTo(1702,647);c.moveTo(1702,625);c.lineTo(1680,647);c.stroke();
  for(let i=0;i<400;i++){const x=60+hash(301,i,1)*1790,y=57+hash(301,i,2)*1000;c.fillStyle=css('ink',.08);c.fillRect(x,y,.7,.7);}
  c.restore();
}
/** Title strip (between the header rule and the fields), in form px. */
export const TITLE_CLIP = { x: 60, y: 115, w: 1790, h: 865 };
const TITLE_ROWS = [{ x: 85, base: 480.6, w: 1150 }, { x: 85, base: 815.6, w: 1150 }];
// The rest of the line is typed into the ACTUAL field, after the machine text (inside title safe).
const TITLE_CAP = 315.6, NOTES = { x: 600, base: 893, cap: 42 };
/** Size whose cap height is `cap` px. */
const sizeForCap = (cap: number) => cap * 100 / inscribe([], 100).capH;

/**
 * S03's sung words, typed into the form (stage 9 ②): "Got a bug / report," is struck letter by
 * letter into the title strip by a typewriter whose head is the clay cursor (pdoom bureau.ts
 * drawTyped, with the strike guide); on "the" the strip line-feeds up and out, bringing the form's
 * own title up from below; "the weirdest I've seen" is typed into the ACTUAL field. The BUG stamp
 * lands on "bug". No line fades: the words leave with the strip and, at the cut, with the form.
 */
export function drawReportLyrics(c: CanvasRenderingContext2D, v: Voice, t: number) {
  const line=v.line(1), forms=v.forms(line,t), the=line.words[4]!.start;
  const feed=land(t,the,0.32), lift=feed*720;
  c.save(); c.beginPath(); c.rect(TITLE_CLIP.x,TITLE_CLIP.y,TITLE_CLIP.w,TITLE_CLIP.h); c.clip();
  const size=sizeForCap(TITLE_CAP);
  [forms.slice(0,3),forms.slice(3,4)].forEach((row,r)=>{
    const ins=inscribe(row,size,{space:0.22}), sc=fitWidth(ins,TITLE_ROWS[r]!.w), R=TITLE_ROWS[r]!;
    const place=(_g:InGlyph,x:number)=>affine(R.x+x,R.base-lift);
    if(feed<1) {
      drawInscription(c,ins,t,{on:'paper',head:'type',place,scale:sc,seed:31+r});
      typeHead(c,ins,t,place,sc,row[0]!.t0,(r===0?forms[3]!:forms[4]!).t0);
    }
  });
  if(feed>0){
    c.save(); c.translate(0,720-lift);
    machineTitle(c,'Calendar shows',{x:85,y:165,w:1160,h:160});
    machineTitle(c,'October 32',{x:85,y:345,w:880,h:165});
    c.restore();
  }
  c.restore();
  const bug=v.form(line.words[2]!,t);
  if(bug.born>0) stamp(c,'BUG',STAMP.x,STAMP.y,460,{t,at:bug.t0,rot:STAMP.angle,color:bug.stress?'clay':'ink',axes:{wdth:bug.axes.wdth,wght:Math.max(800,bug.axes.wght)},seed:303});
  // ACTUAL: the rest of the line, typed at the lyric level after "Calendar shows October 32".
  const notes=inscribe(forms.slice(4),sizeForCap(NOTES.cap),{space:0.24});
  const place=(_g:InGlyph,x:number)=>affine(NOTES.x+x,NOTES.base);
  drawInscription(c,notes,t,{on:'paper',head:'type',place,seed:37});
  typeHead(c,notes,t,place,1,forms[4]!.t0,Infinity);
  // "There's a thirty-second…" belongs to S04 since the cut moved to the line break (R1).
}

/** The typewriter's head: a clay block on the newest letter, the strike guide ahead of it; it
 *  blinks once the row is done and is gone when the next row starts. */
function typeHead(c: CanvasRenderingContext2D, ins: Inscription, t: number, place: (g: InGlyph, x: number) => Aff, sc: number, from: number, until: number) {
  if (t < from - 0.3 || t >= until) return;
  const last=ins.glyphs.at(-1)!, done=t>=last.t+0.06;
  const x=headX(ins,t,sc), m=place(last,x);
  if(!done) drawStrikeGuide(c,ins,t,place,sc,0.3);
  if(done && Math.floor((t-last.t)*2.2)%2===1) return;
  c.save(); c.transform(m.a,m.b,m.c,m.d,m.e,m.f);
  c.fillStyle=css('clay'); c.fillRect(ins.size*0.05,-ins.capH,ins.capH*0.14,ins.capH);
  c.restore();
}
/** S03's lens: the form is read up close (a breathing push that returns to identity at both cuts),
 *  with a punch on "weirdest". */
export function view03(t: number, T: OpeningTimes, weirdest: number): LensView {
  const p = span(t, T.issue, T.end - 0.1);
  const punch = t >= weirdest ? Math.pow(0.5, (t - weirdest) / 0.1) : 0;
  const zoom = 1 + 0.07 * Math.sin(Math.PI * p) + 0.05 * punch;
  return { zoom, fx: lerp(820, 960, p), fy: lerp(480, 540, p), rot: -0.012 * punch * (1 - p) };
}
/** C2: the form unfolding from the card's bar. */
export function entryPrim03(t: number, audio: AudioData, T: OpeningTimes, weirdest: number): Prim {
  return { kind: 'rect', ...lensRect(view03(t, T, weirdest), handoffIn(t, audio, T)) };
}
/** C3: the attached month. */
export function exitPrim03(t: number, T: OpeningTimes, weirdest: number): Prim {
  return { kind: 'rect', ...lensRect(view03(t, T, weirdest), handoffOut(t)) };
}
