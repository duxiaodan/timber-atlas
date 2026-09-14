import ui from '../../docs/i18n/ui.json';
import names from '../../docs/i18n/names.json';
import prose from '../../docs/i18n/model-text.json';
import terms from '../../docs/i18n/terms.json';
import templates from '../../docs/i18n/patterns.json';

export const terminology:Record<string,{en:string;pinyin:string}>=terms;
const dictionary:Record<string,string>={...Object.fromEntries(Object.entries(terms).map(([zh,value])=>[zh,value.en])),...ui,...names,...prose};
const han=/[\u3400-\u9fff]/;
const cache=new Map<string,string>();
const escape=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const patterns=templates.map(({zh,en})=>({en,pattern:new RegExp('^'+zh.split(/(\{\d+\})/).map(s=>/^\{\d+\}$/.test(s)?'(.+?)':escape(s)).join('')+'$')}));

/** Translate reviewed sentences and name templates, without changing domain data. */
export function english(source:string,depth=0):string{
 if(!han.test(source)||depth>12)return source;
 if(cache.has(source))return cache.get(source)!;
 const trimmed=source.trim();
 if(trimmed!==source){const result=source.replace(trimmed,english(trimmed,depth+1));cache.set(source,result);return result;}
 const exact=dictionary[source];if(exact!==undefined){cache.set(source,exact);return exact;}
 for(const {pattern,en} of patterns){
  const match=pattern.exec(source);if(!match)continue;
  const values=match.slice(1).map(value=>english(value,depth+1));
  if(values.some(value=>han.test(value)))continue;
  const result=en.replace(/\{(\d+)\}/g,(_,index)=>values[Number(index)]);cache.set(source,result);return result;
 }
 // These boundaries join already reviewed complete labels/sentences in the UI.
 for(const boundary of [' · ','。','；']){
  if(!source.includes(boundary))continue;
  const chunks=source.split(boundary);
  const values=chunks.map((value,index)=>english(value+(boundary==='。'&&index<chunks.length-1?'。':''),depth+1));
  if(values.some(value=>han.test(value)))continue;
  const result=values.filter(Boolean).join(boundary===' · '?boundary:' ');cache.set(source,result);return result;
 }
 if(source.endsWith(' ↗'))return english(source.slice(0,-2),depth+1)+' ↗';
 return source;
}
