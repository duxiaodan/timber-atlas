export type WorkProgress=(done:number,total:number)=>void;
export function drainWork<T>(work:Generator<number|null,T>):T {
 for(;;){const next=work.next();if(next.done)return next.value;}
}
/** Time is only a scheduling budget; counts come exclusively from completed work.
 * A double animation frame gives foreground progress a paint before more work.
 * Hidden tabs use task scheduling and never wait for a suspended animation frame.
 */
export function yieldForPaint():Promise<void>{
 if(typeof document!=='undefined'&&document.visibilityState==='visible')return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
 return new Promise(resolve=>setTimeout(resolve,0));
}
/** Yield a task at the browser’s scheduling priority; do not wait two frames per batch. */
export function yieldToMain():Promise<void>{
 const scheduler=(globalThis as typeof globalThis&{scheduler?:{yield:()=>Promise<void>}}).scheduler;
 return scheduler?.yield?scheduler.yield():new Promise(resolve=>setTimeout(resolve,0));
}
export async function runWork<T>(work:Generator<number|null,T>,total:number,progress:WorkProgress=()=>{},yieldWork=yieldToMain):Promise<T>{
 progress(0,total);let since=performance.now();
 for(;;){
  const next=work.next();if(next.done){progress(total,total);return next.value;}
  if(next.value!==null)progress(next.value,total);
  if(performance.now()-since>=12){await yieldWork();since=performance.now();}
 }
}
