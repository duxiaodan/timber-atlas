export type Language='zh-CN'|'en';
export const LANGUAGE_KEY='sunmao-language';
let language:Language='zh-CN';
let languageRequest=0;
let translations:typeof import('./english')|null=null;
let loading:Promise<typeof import('./english')>|null=null;
const texts=new WeakMap<Text,{source:string;rendered:string}>();
const attributes=new WeakMap<Element,Map<string,{source:string;rendered:string}>>();
const translatableAttributes=['title','aria-label','placeholder','content'];
let observer:MutationObserver|null=null;

export function currentLanguage(){return language;}
export function translate(source:string){return language==='en'&&translations?translations.english(source):source;}
export function englishText(source:string){return translations?.english(source)??source;}
export function romanization(source:string){return translations?.terminology[source]?.pinyin??'';}
function preserved(element:Element|null){return !!element?.closest('[data-i18n-preserve],script,style,noscript');}
function translateText(node:Text){
 if(preserved(node.parentElement))return;
 const current=node.data,previous=texts.get(node);
 const source=previous&&current===previous.rendered?previous.source:current;
 const rendered=translate(source);
 if(source!==rendered||previous)texts.set(node,{source,rendered});
 if(current!==rendered)node.data=rendered;
}
function translateElement(element:Element){
 if(preserved(element))return;
 for(const name of translatableAttributes){
  if(!element.hasAttribute(name))continue;
  const current=element.getAttribute(name)!,map=attributes.get(element)??new Map();
  const previous=map.get(name),source=previous&&current===previous.rendered?previous.source:current,rendered=translate(source);
  if(source!==rendered||previous){map.set(name,{source,rendered});attributes.set(element,map);}
  if(current!==rendered)element.setAttribute(name,rendered);
 }
}
/** Preserve original DOM nodes, controls, focus, dialogs and the shared WebGL canvas. */
export function localize(root:Node=document.documentElement){
 if(root.nodeType===Node.TEXT_NODE){translateText(root as Text);return;}
 if(root instanceof Element){translateElement(root);}
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
 while(walker.nextNode()){
  const node=walker.currentNode;
  if(node instanceof Text)translateText(node);else translateElement(node as Element);
 }
 if(root instanceof Element||root instanceof Document){
  for(const el of root.querySelectorAll<HTMLElement>('[data-native-term]')){
   el.hidden=language!=='en';
   const source=el.dataset.nativeTerm!,value=`${source} · ${romanization(source)}`;
   if(el.textContent!==value)el.textContent=value;
  }
 }
}
export async function setLanguage(next:Language){
 const request=++languageRequest;
 if(next==='en')translations=await (loading??=import('./english').catch(error=>{loading=null;throw error;}));
 if(request!==languageRequest)return;
 language=next;document.documentElement.lang=next;
 try{localStorage.setItem(LANGUAGE_KEY,next);}catch{}
 localize();
 for(const button of document.querySelectorAll<HTMLButtonElement>('[data-language]'))button.setAttribute('aria-pressed',String(button.dataset.language===language));
 document.dispatchEvent(new CustomEvent('languagechange',{detail:next}));
}
export async function initializeLocale(){
 let preference:string|null=null;try{preference=localStorage.getItem(LANGUAGE_KEY);}catch{}
 if(preference==='en')await setLanguage('en');
 // Observe only display mutations; no model/state updates and no network translation.
 observer=new MutationObserver(records=>{
  const roots=new Set<Node>();
  for(const record of records){
   if(record.type==='childList')for(const node of record.addedNodes)roots.add(node);
   else roots.add(record.target);
  }
  for(const node of roots)if(node.isConnected)localize(node);
 });
 observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:translatableAttributes});
}
