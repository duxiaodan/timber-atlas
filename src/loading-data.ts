export interface LoadingAsset {key:string;url:string;bytes:number;model:boolean;}
const data=new Map<string,unknown>();
export function loadedModelData(key:string):unknown {
 if(!data.has(key))throw Error(`Model data not ready: ${key}`);
 return data.get(key);
}
export function registerModelData(key:string,value:unknown){data.set(key,value);}

/** Fetch streams expose decoded bytes, regardless of Content-Encoding/Length.
 * Reserve one output buffer; never prefetch a module and then import its payload.
 * The completion callback is sent only after EOF and an exact size check.
 */
export async function receiveAsset(asset:LoadingAsset,onProgress:(loaded:number)=>void):Promise<ArrayBuffer>{
 if(!Number.isSafeInteger(asset.bytes)||asset.bytes<=0)throw Error('Invalid asset size');
 const response=await fetch(asset.url);
 if(!response.ok||!response.body)throw Error(`Asset request failed (${response.status}): ${asset.key}`);
 const reader=response.body.getReader(),buffer=new Uint8Array(asset.bytes);
 let loaded=0;
 try{
  for(;;){
   const {done,value}=await reader.read();if(done)break;
   if(loaded+value.length>asset.bytes)throw Error(`Asset size mismatch: ${asset.key}`);
   buffer.set(value,loaded);loaded+=value.length;
   if(loaded<asset.bytes)onProgress(loaded);
  }
  if(loaded!==asset.bytes)throw Error(`Incomplete asset: ${asset.key} (${loaded}/${asset.bytes})`);
  onProgress(loaded);return buffer.buffer;
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
}
