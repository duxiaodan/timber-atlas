import {yieldForPaint} from './work-batches';
import type {Language} from './i18n/locale';
const copy={
 start:['正在启动程序…','Starting the application…'],
 interface:['正在准备界面…','Preparing the interface…'],
 receive:['正在接收模型数据','Receiving model data'],
 parse:['正在解析模型数据…','Processing model data…'],
 viewer:['正在准备三维显示…','Preparing the 3D viewer…'],
 catalog:['正在整理构件','Organizing parts'],
 index:['正在整理研习目录…','Preparing the study index…'],
 ridgeReceive:['正在接收屋脊细节','Receiving ridge details'],
 ridgeParse:['正在解析屋脊细节（第 {n} 项，共 3 项）…','Processing ridge details (item {n} of 3)…'],
 ridgePlace:['正在安放屋脊细节（第 {n} 项，共 3 项）…','Placing ridge details (item {n} of 3)…'],
 fitParse:['正在解析屋脊连接数据…','Processing ridge connection data…'],
 fit:['正在整理屋脊连接','Preparing ridge connections'],
 groups:['正在准备场景分组…','Preparing scene groups…'],
 scene:['正在建立场景','Building the scene'],
 frame:['正在准备建筑视图…','Preparing the building view…'],
 ready:['建筑与构件已就绪','Building and parts are ready'],
 error:['加载未完成。请重试，并检查网络连接。若三维视图仍无法启动，请检查浏览器的图形加速设置。','Loading could not finish. Please retry and check your connection. If the 3D view still cannot start, check your browser’s graphics acceleration settings.'],
} as const;
export type BootTask=keyof typeof copy;
let language:Language='zh-CN';
try{if(localStorage.getItem('sunmao-language')==='en')language='en';}catch{}
let stage=0,task:BootTask='start',item=0,done:number|undefined,total:number|undefined,errorDetail='',failed=false;
let lastAnnouncement='',lastRender='';
const names=[['载入模型数据','Load model data'],['整理构件','Organize parts'],['建立场景','Build scene'],['准备建筑视图','Prepare building view']];
export const bootPaint=yieldForPaint;
function render(){
 const root=document.querySelector<HTMLElement>('#boot');if(!root)return;
 const en=language==='en',i=en?1:0;
 root.lang=language;
 const label=copy[failed?'error':task][i].replace('{n}',String(item));
 const step=en?`Step ${stage+1} of 4 · ${names[stage][i]}`:`第 ${stage+1} / 4 步 · ${names[stage][i]}`;
 const percent=done===undefined||total===undefined?undefined:Math.floor(done/total*100);
 const renderKey=`${language}:${stage}:${task}:${item}:${percent}:${total}:${failed}:${errorDetail}`;
 if(renderKey===lastRender)return;lastRender=renderKey;
 root.dataset.stage=String(stage+1);root.dataset.task=task;root.dataset.state=failed?'error':percent===undefined?'active':'counted';
 document.querySelector('#boot-status')!.textContent=label;
 document.querySelector('#boot-count')!.textContent=step;
 const detail=percent===undefined?'':task==='catalog'?(en?`${done} of ${total} organization tasks complete`:`已完成 ${done} / ${total} 项整理任务`):task==='scene'?(en?`${done} of ${total} scene groups built`:`已建立 ${done} / ${total} 组场景对象`):'';
 document.querySelector('#boot-value')!.textContent=failed?'':percent===undefined?(en?'In progress':'处理中'):`${percent}%`;
 document.querySelector('#boot-detail')!.textContent=detail;
 document.querySelector('#boot-completed')!.textContent=en?`${task==='ready'?4:stage} of 4 steps complete`:`已完成 ${task==='ready'?4:stage} / 4 步`;
 const progress=document.querySelector<HTMLProgressElement>('#boot-progress')!;
 progress.hidden=failed;progress.max=100;
 progress.setAttribute('aria-label',en?'Current task progress':'当前任务进度');
 if(percent===undefined)progress.removeAttribute('value');else progress.value=percent;
 const retry=document.querySelector<HTMLButtonElement>('#boot-retry')!;retry.hidden=!failed;retry.textContent=en?'Reload':'重新加载';
 const details=document.querySelector<HTMLDetailsElement>('#boot-error')!;details.hidden=!failed;
 details.querySelector('summary')!.textContent=en?'Error details':'错误详情';details.querySelector('pre')!.textContent=errorDetail;
 for(const button of root.querySelectorAll<HTMLButtonElement>('[data-boot-language]'))button.setAttribute('aria-pressed',String(button.dataset.bootLanguage===language));
 const announcement=`${language}:${stage}:${task}:${failed}:${percent===undefined?'active':Math.floor(percent/10)}`;
 if(announcement!==lastAnnouncement){document.querySelector('#boot-live')!.textContent=`${step}. ${label} ${percent===undefined?'':percent+'%'}`;lastAnnouncement=announcement;}
}
export function bootLanguage(next:Language){language=next;render();}
export function bootActivity(next:BootTask,n=0){task=next;item=n;done=total=undefined;render();}
export function bootProgress(next:BootTask,completed:number,count:number){
 if(!Number.isFinite(count)||count<=0||completed<0||completed>count)throw Error('Invalid startup count');
 task=next;done=completed;total=count;render();
}
export async function bootStep(next:number,nextTask:BootTask){stage=next;bootActivity(nextTask);await bootPaint();}
export function bootError(error:unknown){failed=true;errorDetail=error instanceof Error?error.message:String(error);render();}
export function bootFailed(){return failed;}
render();
