// Loads the production single-stroke fonts in Bun (a minimal SVG DOM adapter), so tests that need
// engine/stroke can run on their own.
import {loadStrokeFonts} from '../../src/engine/stroke';
// A minimal SVG DOM adapter loads the production stroke-font outlines in Bun.
const decode=(s:string)=>s.replace(/&#x([0-9a-f]+);/gi,(_,v)=>String.fromCodePoint(parseInt(v,16))).replace(/&#(\d+);/g,(_,v)=>String.fromCodePoint(+v)).replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const attrs=(tag:string)=>{const a=new Map<string,string>();for(const m of tag.matchAll(/([\w-]+)="([^"]*)"/g))a.set(m[1]!,decode(m[2]!));return {getAttribute:(k:string)=>a.get(k)??null};};
const saved={fetch:globalThis.fetch,DOMParser:globalThis.DOMParser};
try{globalThis.DOMParser=class{parseFromString(s:string){return {querySelector:(name:string)=>attrs(s.match(new RegExp('<'+name+'\\b[^>]*>'))![0]),querySelectorAll:()=>Array.from(s.matchAll(/<glyph\b[^>]*>/g),m=>attrs(m[0]))};}} as any;
  globalThis.fetch=(async(url:string)=>new Response(await Bun.file(new URL('../../public/'+url,import.meta.url)).arrayBuffer())) as any;await loadStrokeFonts();
}finally{Object.assign(globalThis,saved);}
