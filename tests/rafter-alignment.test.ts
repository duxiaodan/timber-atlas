import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Vector3} from 'three';
import {createCatalog} from '../src/model/catalog';
import {geometry} from '../src/model/geometry';

test('the 714/715 pitch change has matching mitred end surfaces',()=>{
 const c=createCatalog(true,false);
 const ring=(id:string,head:boolean)=>{const p=c.parts.find(p=>p.id===id)!;const v=geometry(p.shape,p.size).getAttribute('position');return Array.from({length:16},(_,i)=>new Vector3().fromBufferAttribute(v,(head?v.count-16:0)+i).multiply(new Vector3(...p.size)).applyEuler(new Euler(...p.rotation)).add(new Vector3(...p.position)));};
 const a=ring('rafter-714',true),b=ring('rafter-715',false);
 const distance=Math.max(...a.map(p=>Math.min(...b.map(q=>p.distanceTo(q)))));
 assert.ok(distance<.0021,`pitch-change end rim mismatch ${(distance*1000).toFixed(3)} mm`);
});

test('neighbouring rafter rows meet at corresponding stations on all four straight hips',()=>{
 const c=createCatalog(true,false);
 const ends=c.parts.filter(p=>p.id.startsWith('rafter-')).map(p=>({p,axis:new Vector3(1,0,0).applyEuler(new Euler(...p.rotation)),end:new Vector3(...p.position).addScaledVector(new Vector3(1,0,0).applyEuler(new Euler(...p.rotation)),-p.size[0]/2)}));
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const hip=ends.filter(e=>e.end.x*sx>0&&e.end.z*sz>0&&Math.abs(Math.abs(e.end.x)-Math.abs(e.end.z)-8.19)<.003&&Math.abs(e.end.z)>2.3);
  const front=hip.filter(e=>Math.abs(e.axis.x)<1e-5),side=hip.filter(e=>Math.abs(e.axis.z)<1e-5);
  assert.ok(front.length>20&&side.length>20);
  for(const a of front){const distance=Math.min(...side.map(b=>a.end.distanceTo(b.end)));assert.ok(distance<.003,`${a.p.id}: opposite hip endpoint is ${(distance*1000).toFixed(3)} mm away`);}
 }
});

test('all hip end rims, including the curved upper transition, share a two millimetre seam',()=>{
 const c=createCatalog(true,false);
 const ends=c.parts.filter(p=>p.shape.startsWith('roofRafter:')&&Math.abs(Number(p.shape.split(':')[3]))>1e-8).map(p=>{
  const axis=new Vector3(1,0,0).applyEuler(new Euler(...p.rotation));
  const v=geometry(p.shape,p.size).getAttribute('position');
  const rim=Array.from({length:16},(_,i)=>new Vector3().fromBufferAttribute(v,i).multiply(new Vector3(...p.size)).applyEuler(new Euler(...p.rotation)).add(new Vector3(...p.position)));
  return {p,axis,rim,center:rim.reduce((a,b)=>a.add(b),new Vector3()).multiplyScalar(1/16)};
 });
 const main=ends.filter(e=>Math.abs(e.axis.x)<1e-5),side=ends.filter(e=>Math.abs(e.axis.z)<1e-5);
 assert.equal(main.length,116);assert.equal(side.length,116);
 const paired=new Set<string>();
 for(const a of main){
  const b=side.reduce((best,b)=>b.center.distanceTo(a.center)<best.center.distanceTo(a.center)?b:best);
  assert.ok(!paired.has(b.p.id),`${b.p.id}: duplicate opposite row`);paired.add(b.p.id);
  const distances=a.rim.map(p=>Math.min(...b.rim.map(q=>p.distanceTo(q))));
  assert.ok(distances.every(d=>d>.0019&&d<.0021),`${a.p.id}/${b.p.id}: rim ${(Math.max(...distances)*1000).toFixed(3)} mm`);
 }
});

test('every adjacent pitch segment preserves a matching end rim',()=>{
 const ends=createCatalog(true,false).parts.filter(p=>p.id.startsWith('rafter-')).map(p=>{
  const axis=new Vector3(1,0,0).applyEuler(new Euler(...p.rotation)),v=geometry(p.shape,p.size).getAttribute('position');
  const ring=(head:boolean)=>Array.from({length:16},(_,i)=>new Vector3().fromBufferAttribute(v,(head?v.count-16:0)+i).multiply(new Vector3(...p.size)).applyEuler(new Euler(...p.rotation)).add(new Vector3(...p.position)));
  return {p,axis,tail:ring(false),head:ring(true),a:new Vector3(...p.position).addScaledVector(axis,-p.size[0]/2),b:new Vector3(...p.position).addScaledVector(axis,p.size[0]/2)};
 });
 let joints=0;
 for(const a of ends){
  const b=ends.find(b=>a!==b&&a.axis.dot(b.axis)>.95&&a.b.distanceTo(b.a)<.15);if(!b)continue;
  joints++;
  const distance=Math.max(...a.head.map(p=>Math.min(...b.tail.map(q=>p.distanceTo(q)))));
  assert.ok(distance<.0021,`${a.p.id}/${b.p.id}: rim ${(distance*1000).toFixed(3)} mm`);
 }
 assert.equal(joints,482);
});
