import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {receiveAsset,type LoadingAsset} from '../src/loading-data';
import {runWork} from '../src/work-batches';

const asset:LoadingAsset={key:'fixture.json',url:'https://example.invalid/fixture.json',bytes:120000,model:true};
test('decoded byte accounting ignores gzip Content-Length and requires EOF',async()=>{
 const original=globalThis.fetch,data=new Uint8Array(asset.bytes).fill(65),compressed=gzipSync(data),counts:number[]=[];
 globalThis.fetch=async()=>new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')),{headers:{'Content-Encoding':'gzip','Content-Length':String(compressed.length)}});
 try{assert.deepEqual(new Uint8Array(await receiveAsset(asset,n=>counts.push(n))),data);assert.ok(counts.length>2);assert.equal(counts.at(-1),asset.bytes);assert.ok(counts.every((n,i)=>i===0||n>counts[i-1]));}
 finally{globalThis.fetch=original;}
});
test('truncated, oversized and interrupted streams never report completion; retry starts fresh',async()=>{
 const original=globalThis.fetch;
 try{
  for(const mode of ['truncated','oversized','interrupted','http']){
   const counts:number[]=[];let reads=0;
   globalThis.fetch=async()=>mode==='http'?new Response(null,{status:503}):new Response(new ReadableStream({pull(controller){if(reads++===0){controller.enqueue(new Uint8Array(mode==='oversized'?asset.bytes+1:40000));return;}if(mode==='interrupted')controller.error(Error('connection lost'));else controller.close();}}));
   await assert.rejects(receiveAsset(asset,n=>counts.push(n)));assert.ok(!counts.includes(asset.bytes),mode);
  }
  const counts:number[]=[];
  globalThis.fetch=async()=>new Response(new Uint8Array(asset.bytes));
  assert.equal((await receiveAsset(asset,n=>counts.push(n))).byteLength,asset.bytes);
  assert.deepEqual(counts,[asset.bytes]); // A cached body can complete in one read, with no synthetic delay.
 }finally{globalThis.fetch=original;}
});
test('completed task counts preserve order; cheap cached work needs no scheduling delay',async()=>{
 const events:number[]=[],counts:number[]=[],total=4;let yields=0;
 const result=await runWork((function*(){for(let i=1;i<=total;i++){events.push(i);yield i;}return 'ready';})(),total,n=>counts.push(n),async()=>{yields++;});
 assert.equal(result,'ready');assert.deepEqual(events,[1,2,3,4]);assert.equal(counts[0],0);assert.equal(counts.at(-1),4);assert.equal(yields,0);
});
