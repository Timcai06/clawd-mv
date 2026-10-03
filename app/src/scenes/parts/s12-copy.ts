import { clamp, hash } from '../../engine/util';
import { css } from '../../theme';
import { Voice, heatColor } from '../../kit/lyric-moves';
import { letterTimes } from '../../kit/pathtext';
import { fillRun, glyphPath, varRun, type Axes, type VarRun } from '../../kit/vartype';
import type { Word } from '../../engine/lyrics';
import { copies, SHEET } from './s12-world';
export const TEX_W = 512, TEX_H = Math.round(TEX_W * SHEET.h / SHEET.w);
export function xeroxSettings(generation: number) {
  const n = Math.max(0, generation);
  return { density: 0.04*n, blur: 0.6*n, scale: 1+0.012*n, rotation: 0.006*n,
    grain: 600+n*6000, dropout: n*600, drift: n*17, bands: n*50 };
}
export function copyWords(v: Voice, k: number) {
  const line = v.line('Run it again, run it again, again'), events = copies(v);
  return line.words.filter(w => w.start < (events[k+1]?.start ?? Infinity))
    .map(word => ({ word, j: events.reduce((a,e,i) => word.start >= e.start ? i : a, 0) }));
}
type PrintedWord = {
  word: Word; j: number; x: number; y: number; sx: number; size: number;
  endAxes: Axes; times: ReturnType<typeof letterTimes>;
};
type Outline = { run: VarRun; paths: Path2D[] };
class Printer {
  readonly words: PrintedWord[] = [];
  readonly old = new Map<number, HTMLCanvasElement>();
  private outlines = new Map<string, Outline>();
  constructor(readonly v: Voice) {
    const line = v.line('Run it again, run it again, again'), events = copies(v);
    const cap = 0.26*TEX_W/SHEET.w, size = 100*cap/varRun('H',100,{wdth:75,wght:800}).capH;
    const rows = [line.words.slice(0,3),line.words.slice(3,6),line.words.slice(6)];
    for (const [row, words] of rows.entries()) {
      const widths = words.map(w => varRun(w.w,size,v.form(w,w.end).axes).width);
      const total = widths.reduce((a,b) => a+b,0)+2*size*0.24;
      const sx = Math.min(1,(TEX_W-48)/total);
      let x = 24;
      words.forEach((word,i) => {
        this.words.push({ word, j: events.reduce((a,e,i) => word.start >= e.start ? i : a,0),
          x, y: 190+row*130, sx, size, endAxes: v.form(word,word.end).axes, times: letterTimes(word) });
        x += sx*(widths[i]!+size*0.24);
      });
    }
  }
  outline(item: PrintedWord, axes: Axes): Outline {
    const key = item.word.gi+'|'+axes.wdth+'|'+axes.wght;
    let hit = this.outlines.get(key);
    if (!hit) {
      if (this.outlines.size >= 1024) this.outlines.clear();
      const run = varRun(item.word.w,item.size,axes);
      hit = { run, paths: run.glyphs.map(g => glyphPath(run,g)) };
      this.outlines.set(key,hit);
    }
    return hit;
  }
  paint(c: CanvasRenderingContext2D, item: PrintedWord, k: number, t: number, old: boolean) {
    const settings = xeroxSettings(k-item.j);
    const { run, paths } = this.outline(item,old ? item.endAxes : this.v.form(item.word,t).axes);
    c.save();
    c.translate(item.x,item.y); c.rotate(settings.rotation); c.scale(settings.scale*item.sx,settings.scale);
    c.filter = settings.blur ? 'blur('+settings.blur+'px)' : 'none';
    run.glyphs.forEach((g,i) => {
      if (!old && t < item.times[i]!.t0) return;
      c.fillStyle = old ? css('ink',clamp(0.95-0.04*(k-item.j),0.4,1)) : heatColor('ink','paper',t-item.times[i]!.t0);
      c.save(); c.translate(g.x,0); c.fill(paths[i]!); c.restore();
    });
    c.filter = 'none'; c.globalCompositeOperation = 'destination-out';
    const dots = Math.round(settings.density*run.width*0.26*TEX_W/SHEET.w/4);
    for (let i=0;i<dots;i++) c.fillRect(hash(k,item.j,i)*run.width,
      -hash(k,item.j,i+20000)*0.26*TEX_W/SHEET.w,1+hash(k,item.j,i+10000)*2,1);
    c.restore();
  }
  previous(k: number) {
    let canvas = this.old.get(k);
    if (!canvas) {
      canvas = document.createElement('canvas'); canvas.width = TEX_W; canvas.height = TEX_H;
      const c = canvas.getContext('2d')!;
      // Earlier events are fully sung before event k. Their generation-specific toner is immutable.
      for (const item of this.words) if (item.j < k) this.paint(c,item,k,Infinity,true);
      this.old.set(k,canvas);
    }
    return canvas;
  }
}
const printers = new WeakMap<Voice,Printer>();
export function drawCopy(c: CanvasRenderingContext2D, v: Voice, k: number, t: number) {
  let printer = printers.get(v);
  if (!printer) { printer = new Printer(v); printers.set(v,printer); }
  c.clearRect(0,0,TEX_W,TEX_H); c.fillStyle = css('paper'); c.fillRect(0,0,TEX_W,TEX_H);
  c.drawImage(printer.previous(k),0,0);
  for (const item of printer.words) if (item.j === k) printer.paint(c,item,k,t,false);
  if (t >= copies(v)[0]!.start+0.25) {
    const settings = xeroxSettings(k+1), run = varRun('why',65,{wdth:100,wght:800});
    c.save(); c.translate(32,TEX_H-80); c.rotate(settings.rotation); c.scale(settings.scale,settings.scale);
    c.filter = 'blur('+settings.blur+'px)'; c.fillStyle = css('ink'); fillRun(c,run,0,0); c.restore();
  }
}
