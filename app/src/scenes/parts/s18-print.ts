import { lin } from '../../theme';
import { F, font } from '../../engine/type';
import type { AudioData } from '../../engine/audio';
import { AUTHOR, creditsLayout } from '../../kit/credits';
import { runInkBounds } from '../../kit/pathtext';
import { varRun } from '../../kit/vartype';
import type { Rig } from '../../kit/rig';
import { calendarAffine, signatureGlyphs, SIGNATURE } from './s18-world';
import { outroCredits, SIGNATURE_LABEL, CODE_LINE, type OutroTimes } from './s18-score';

export interface CreditBox { x:number;y:number;w:number;h:number }
/** Font ink rectangles transformed by the exact calendar affine used for print. */
export function creditInkBoxes(c:CanvasRenderingContext2D,rig:Rig,audio:AudioData,t:number,T:OutroTimes):CreditBox[] {
  if(t<T.flatAt)return [];
  const boxes:CreditBox[]=[];
  const add=(b:CreditBox,lift=0)=>{
    const m=calendarAffine(rig,lift);if(!m)return;
    const ps=[b.x,b.x+b.w].flatMap(x=>[b.y,b.y+b.h].map(y=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f})));
    const x=Math.min(...ps.map(p=>p.x)),y=Math.min(...ps.map(p=>p.y));
    boxes.push({x,y,w:Math.max(...ps.map(p=>p.x))-x,h:Math.max(...ps.map(p=>p.y))-y});
  };
  const text=(value:string,x:number,y:number,face:string,maxWidth=Infinity)=>{
    c.save();c.font=face;const m=c.measureText(value);c.restore();
    add({x:x-m.actualBoundingBoxLeft,y:y-m.actualBoundingBoxAscent,
      w:Math.min(maxWidth,m.actualBoundingBoxLeft+m.actualBoundingBoxRight),h:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent});
  };
  text(SIGNATURE_LABEL,1920/7,216,font(F.mono(500),22));
  const run=varRun(AUTHOR.latin,100,{wdth:75,wght:900}),k=SIGNATURE.capH/run.capH;
  for(const [i,g] of signatureGlyphs(audio,t,T).glyphs.entries()){
    if(g.latin){const ink=runInkBounds({...run,glyphs:[{...run.glyphs[i]!,x:0}]});
      add({x:g.x+ink.x0*k,y:g.y+ink.y0*k,w:(ink.x1-ink.x0)*k,h:(ink.y1-ink.y0)*k},g.drop);
    }else{
      c.save();c.font=`600 ${SIGNATURE.capH*1.1}px "PingFang SC", sans-serif`;const m=c.measureText(g.ch);c.restore();
      add({x:g.x-m.actualBoundingBoxLeft,y:g.y-m.actualBoundingBoxAscent,w:m.actualBoundingBoxLeft+m.actualBoundingBoxRight,h:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent},g.drop);
    }
  }
  for(const row of creditsLayout({x:1920/7,y:666,width:5*1920/7,height:194},{...outroCredits(audio,t,T),columns:1}))
    text(row.text,row.x,row.y,font(F.mono(),row.size),row.width);
  text(CODE_LINE,1920/7,864,'500 22px "PingFang SC", sans-serif');
  return boxes;
}
/** Attenuate only calendar ink, in a union of screen-pixel-expanded ink boxes. */
export function quietCalendarInk(c:CanvasRenderingContext2D,boxes:CreditBox[],opacity:number) {
  if(!boxes.length)return;
  c.save();c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='destination-out';c.globalAlpha=1-opacity;c.fillStyle='#000';
  c.beginPath();for(const b of boxes)c.rect(b.x-24,b.y-24,b.w+48,b.h+48);c.fill();c.restore();
}

const pigment = (k: 'paper' | 'ink' | 'clay') => `vec3(${lin(k).join(',')})`;

// Binary pigment coverage: paper/ink/clay tokens. Fibre noise, stochastic dots and
// broken horizontal engraved lines replace the reference's dawn gradient.
export const DAWN_PAPER_GLSL = /* glsl */ `float dawnPaper(vec2 p, float dawn) {
  float boundary = 1605.0 - 235.0 * dawn + 26.0 * sin(p.y * 0.008);
  float coverage = clamp((p.x - boundary + 145.0) / 280.0, 0.0, 1.0);
  float dotNoise = hash12(floor(p / 1.6));
  float row = floor(p.y / 5.2);
  float end = boundary + 80.0 + (hash11(row) - 0.5) * 120.0;
  float hatch = step(mod(p.y, 5.2), 1.15) * step(boundary - 190.0, p.x) * step(p.x, end);
  return step(dotNoise, coverage) * (1.0 - hatch);
}`;

export const S18_PAPER = /* glsl */ `
uniform float dawn, glowOnly;
const vec3 S18_PAPER = ${pigment('paper')};
const vec3 S18_INK = ${pigment('ink')};
const vec3 S18_CLAY = ${pigment('clay')};
${DAWN_PAPER_GLSL}
void main() {
  vec2 p = vec2(FRAG_PX.x, 1080.0 - FRAG_PX.y);
  float paper = dawnPaper(p, dawn);
  vec3 col = paper > 0.5 ? S18_PAPER : S18_INK;
  float fleck = hash12(floor(p));
  if (fleck > 0.995) col = paper > 0.5 ? S18_CLAY : S18_PAPER;
  if (hash12(floor(p / vec2(7.0, 0.8))) > 0.998) col = paper > 0.5 ? S18_INK : S18_PAPER;
  vec2 cell = floor(p / 22.0), local = mod(p, 22.0);
  float star = step(0.945, hash12(cell + 18.0)) * step(length(local - vec2(11.0)), 0.7);
  if (star > 0.5 && paper < 0.5 && p.y < 840.0) col = hash12(cell) > 0.7 ? S18_CLAY : S18_PAPER;
  if (length(p - vec2(1640.0, 922.0)) < 82.0 && p.y < 922.0) col = S18_CLAY;
  if (p.y >= 922.0 && p.y < 983.0 && p.x > 1190.0) {
    float ray = step(mod(p.y - 922.0, 6.5), 1.0);
    float rayStart = 1170.0 + hash11(floor((p.y - 922.0) / 6.5)) * 650.0;
    if (ray > 0.5 && p.x > rayStart) col = p.y < 961.0 ? S18_CLAY : S18_PAPER;
  }
  if (glowOnly > 0.5) {
    float clay = float(distance(col, S18_CLAY) < 0.0001);
    fragColor = vec4(col * clay * (1.0-paper), 1.0);
  } else fragColor = vec4(col, 1.0);
}`;
