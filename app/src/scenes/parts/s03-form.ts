// S03's printed form and sung fields, with a full-page flat plate at the keyframe.
import { hash } from '../../engine/util';
import { css } from '../../theme';
import { type Rect } from '../../kit/handoff';
import { mono } from './s01-drafting';
import { machineTitle } from './s01-print';
export const FORM = { x: 60, y: 57, w: 1790, h: 1000 };
export const FORM_ROLL = -0.032;
export function drawCalendar(c: CanvasRenderingContext2D, b: Rect, opts: { header?: number; numbersAlpha?: number; circle?: boolean; gain?: number } = {}) {
  const header=opts.header??70;
  c.save(); c.strokeStyle = css('ink', Math.min(1,0.6*(opts.gain??1))); c.lineWidth = 1; c.strokeRect(b.x,b.y,b.w,b.h);
  machineTitle(c,'OCTOBER',{x:b.x+26,y:b.y+18,w:260,h:50});
  const cw = b.w/7, rh=(b.h-header)/5;
  c.beginPath(); for(let i=0;i<=7;i++){c.moveTo(b.x+i*cw,b.y+header);c.lineTo(b.x+i*cw,b.y+b.h);}
  for(let i=0;i<=5;i++){c.moveTo(b.x,b.y+header+i*rh);c.lineTo(b.x+b.w,b.y+header+i*rh);} c.stroke();
  for(let day=1;day<=32;day++){
    const slot=day+2, x=b.x+(slot%7)*cw, y=b.y+header+Math.floor(slot/7)*rh;
    machineTitle(c,String(day),{x:x+cw*0.28,y:y+rh*0.2,w:cw*0.4,h:rh*0.6},opts.numbersAlpha??(day===32?1:0.6));
    if(day===32&&opts.circle!==false){c.strokeStyle=css('clay');c.lineWidth=4;c.beginPath();c.ellipse(x+cw*.5,y+rh*.5,cw*.65,rh*.43,-.3,0,Math.PI*2);c.stroke();}
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
