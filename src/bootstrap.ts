import {bootActivity,bootError,bootFailed,bootLanguage,bootPaint,bootProgress} from './boot-progress';
import {initializeLocale,setLanguage,type Language} from './i18n/locale';
import assets from 'virtual:loading-assets';
import {receiveAsset,registerModelData} from './loading-data';

const retry=document.querySelector<HTMLButtonElement>('#boot-retry')!;
retry.addEventListener('click',()=>{retry.disabled=true;retry.textContent=document.querySelector('#boot')?.getAttribute('lang')==='en'?'Reloading…':'正在重新加载…';location.reload();});
let localeChange:Promise<void>=Promise.resolve();
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-boot-language]'))button.addEventListener('click',()=>{
 const next=button.dataset.bootLanguage as Language;
 localeChange=localeChange.then(async()=>{await setLanguage(next);bootLanguage(next);}).catch(bootError);
});
try{
 bootActivity('interface');await initializeLocale();
 const model=assets.filter(a=>a.model),total=model.reduce((n,a)=>n+a.bytes,0);
 let loaded=0;
 bootProgress('receive',0,total);
 for(const asset of model){
  const bytes=await receiveAsset(asset,n=>bootProgress('receive',loaded+n,total));loaded+=asset.bytes;
  // Parsing has no measurable internal percentage. Keep its activity explicit.
  if(loaded===total)await bootPaint();
  bootActivity('parse');await bootPaint();
  registerModelData(asset.key,JSON.parse(new TextDecoder().decode(bytes)));
 }
 bootActivity('viewer');await bootPaint();
 await import('./main');
 await localeChange;
 if(!bootFailed()){
  bootProgress('ready',1,1);await bootPaint();
  document.querySelector<HTMLElement>('#app')!.inert=false;
  document.querySelector('#boot')!.remove();
 }
}catch(error){bootError(error);}
