import {MeshBVH} from 'three-mesh-bvh';
import {Box3,Matrix4,Vector3,Quaternion,Euler} from 'three';
import type {Catalog} from '../../src/model/types';
import {geometry} from '../../src/model/geometry';
export function auditStudyContacts(c:Catalog,ids=c.assemblies.filter(a=>a.layer==='brackets'||/^(?:end-)?frame-|^beam-bracket-/.test(a.id)).map(a=>a.id)) {
const parts=new Map(c.parts.map(p=>[p.id,p]));
const cache=new Map();
// Shared long timbers recur in many studies. Geometry stays fixed during this
// audit, so reuse each ordered pair's exact result without changing tolerances.
const contacts=new Map<string,boolean>();
function entry(id:string){if(cache.has(id))return cache.get(id);const p=parts.get(id)!;const g=geometry(p.shape,p.size).clone().applyMatrix4(new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size)));g.computeBoundingBox();const e={p,g,bvh:new MeshBVH(g),box:g.boundingBox!};cache.set(id,e);return e;}
const result=[];
for(const id of ids){
 const a=c.assemblies.find(a=>a.id===id)!,entries=[...new Set([...a.partIds,...a.contextPartIds??[]])].map(entry),edges=new Map<string,string[]>(entries.map(e=>[e.p.id,[]]));
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j];if(!a.box.clone().expandByScalar(.012).intersectsBox(b.box))continue;
  const key=`${a.p.id}\0${b.p.id}`;let touching=contacts.get(key);
  if(touching===undefined){const hit=a.bvh.closestPointToGeometry(b.g,new Matrix4(),{}, {},.0001,.012);touching=!!hit&&hit.distance<=.012;contacts.set(key,touching);}
  if(touching){edges.get(a.p.id)!.push(b.p.id);edges.get(b.p.id)!.push(a.p.id);}
 }
 const anchored=new Set<string>(),queue=entries.filter(e=>e.p.kind==='柱础').map(e=>e.p.id);
 while(queue.length){const id=queue.pop()!;if(anchored.has(id))continue;anchored.add(id);queue.push(...edges.get(id)!);}
 result.push({assembly:id,parts:entries.length,unanchoredContext:entries.filter(e=>!a.partIds.includes(e.p.id)&&!anchored.has(e.p.id)).map(e=>({id:e.p.id,contacts:edges.get(e.p.id)})),isolated:a.partIds.filter(id=>!anchored.has(id)).map(id=>({id,name:parts.get(id)!.name,contacts:edges.get(id)}))});
}
for(const e of cache.values())e.g.dispose();
return result;
}
