import {createHash} from 'node:crypto';
import {writeFileSync,mkdirSync} from 'node:fs';
import {Box3,BufferGeometry,Float32BufferAttribute,Matrix4,Quaternion,Euler,Vector3} from 'three';
import {Brush,Evaluator,SUBTRACTION,INTERSECTION} from 'three-bvh-csg';
import {createCatalog} from '../src/model/catalog';
import {geometry} from '../src/model/geometry';
import {roofBearingArea} from './lib/roof-bearing';
import {hipRoofCutters} from './lib/hip-purlin-joints';
import type {Part} from '../src/model/types';

// Open underside seats use the actual previously carved hip surfaces. They do
// not alter the purlin network or add concealed blocks beneath the rafters.
const catalog=createCatalog(true,false),evaluator=new Evaluator();
evaluator.useGroups=false;evaluator.attributes=['position','normal'];
const matrix=(p:Part)=>new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));
const brush=(p:Part)=>{const b=new Brush(geometry(p.shape,p.size).clone().applyMatrix4(matrix(p)));b.updateMatrixWorld();return b;};
function openBoxSeat(p:Part){
 const g=geometry('box').clone(),v=g.getAttribute('position'),m=matrix(p);
 for(let i=0;i<v.count;i++){const down=v.getY(i)<0,point=new Vector3().fromBufferAttribute(v,i).applyMatrix4(m);if(down)point.y=-10;v.setXYZ(i,point.x,point.y,point.z);}g.computeVertexNormals();
 const cutter=new Brush(g);cutter.updateMatrixWorld();return cutter;
}
function components(g:BufferGeometry){
 // CSG can emit collapsed triangles along coincident edges. Remove only faces
 // below 1 micrometre altitude; do not discard detached solid components.
 const pos=g.getAttribute('position'),kept:number[]=[];
 for(let i=0;i<(g.index?.count??pos.count);i+=3){
  const ids=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k),[a,b,c]=ids.map(i=>new Vector3().fromBufferAttribute(pos,i));
  const edge=Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a));
  if(b.sub(a).cross(c.sub(a)).length()>edge*1e-6)kept.push(...ids);
 }
 const remap=new Map<number,number>(),usedIds:number[]=[],index=kept.map(i=>{let n=remap.get(i);if(n===undefined){n=usedIds.length;remap.set(i,n);usedIds.push(i);}return n;});
 for(const [name,a] of Object.entries(g.attributes))g.setAttribute(name,new Float32BufferAttribute(usedIds.flatMap(i=>Array.from({length:a.itemSize},(_,k)=>a.array[i*a.itemSize+k])),a.itemSize));
 g.setIndex(index);
 const v=g.getAttribute('position'),map=new Map<string,number>(),vertices:number[]=[],parent:number[]=[];
 for(let i=0;i<v.count;i++){
  const key=[v.getX(i),v.getY(i),v.getZ(i)].map(n=>Math.round(n*1e5)).join(':');
  let n=map.get(key);if(n===undefined){n=map.size;map.set(key,n);parent.push(n);}vertices.push(n);
 }
 const root=(n:number):number=>parent[n]===n?n:parent[n]=root(parent[n]);
 const used=new Set<number>();
 for(let i=0;i<(g.index?.count??v.count);i+=3){const ids=[0,1,2].map(k=>vertices[g.index?g.index.getX(i+k):i+k]);for(const n of ids)used.add(n);for(const n of ids.slice(1))parent[root(n)]=root(ids[0]);}
 const groups=new Map<number,number[]>();
 for(let i=0;i<g.index!.count;i+=3){const ids=[0,1,2].map(k=>g.index!.getX(i+k)),key=root(vertices[ids[0]]);groups.set(key,[...groups.get(key)??[],...ids]);}
 // Keep every solid component. Isolated coplanar CSG sheets have no wood
 // volume; only those whose thickness is below 10 micrometres are removed.
 const solids=[...groups.values()].filter(ids=>{
  let origin=new Vector3(),normal=new Vector3(),largest=0;
  for(let i=0;i<ids.length;i+=3){const [a,b,c]=ids.slice(i,i+3).map(n=>new Vector3().fromBufferAttribute(v,n)),n=b.sub(a).cross(c.sub(a));if(n.length()>largest){largest=n.length();origin=a;normal=n.normalize();}}
  return ids.some(i=>Math.abs(new Vector3().fromBufferAttribute(v,i).sub(origin).dot(normal))>1e-5);
 });
 if(solids.length!==groups.size)g.setIndex(solids.flat());
 return solids.length;
}
const assignments:Record<string,string>={},meshes:Record<string,unknown>={},supports:Record<string,string[]>={},audit:unknown[]=[],clearances:Record<string,string[]>={};
const store=(p:Part,b:Brush)=>{
 const data=b.geometry.clone().applyMatrix4(matrix(p).invert()).toJSON();
 for(const a of Object.values(data.data.attributes) as {array:number[]}[])a.array=a.array.map(v=>Math.round(v*1e7)/1e7);
 delete data.uuid;
 const key=createHash('sha256').update(JSON.stringify(data.data)).digest('hex').slice(0,16);assignments[p.id]=key;meshes[key]=data;
 audit.push({id:p.id,supports:supports[p.id],clearances:clearances[p.id]??[],vertices:data.data.attributes.position.array.length/3});
};
const hips=catalog.parts.filter(p=>p.id.startsWith('hip-')).map(p=>{
 let seat=openBoxSeat(p);
 if(p.id.startsWith('hip-main-'))for(const g of hipRoofCutters(p)){
  const cutter=new Brush(g);cutter.updateMatrixWorld();const next=evaluator.evaluate(seat,cutter,SUBTRACTION);next.updateMatrixWorld();seat.geometry.dispose();cutter.geometry.dispose();seat=next;
 }
 return {p,b:brush(p),seat};
});
for(const entry of hips.filter(e=>e.p.id.startsWith('hip-child-'))){
 const main=hips.find(e=>e.p.id===entry.p.id.replace('child','main'))!;
 // At this outer interval the main hip's upper face is the original straight
 // face. Extend its cutter downward: a seat must open below the child timber,
 // including the sloping end cap, without leaving a detached underside chip.
 const cutter=main.seat;
 const next=evaluator.evaluate(entry.b,cutter,SUBTRACTION);next.updateMatrixWorld();
 if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Disconnected child hip ${entry.p.id}`);
 entry.b.geometry.dispose();entry.b=next;supports[entry.p.id]=[main.p.id];store(entry.p,next);
}
for(const p of catalog.parts.filter(p=>p.id.startsWith('rafter-'))){
 let b=brush(p);const box=new Box3().setFromBufferAttribute(b.geometry.getAttribute('position'));let changed=false;
 for(const {p:q,b:hip,seat:cutter} of hips){
  if(!box.intersectsBox(new Box3().setFromBufferAttribute(hip.geometry.getAttribute('position'))))continue;
  const intersection=evaluator.evaluate(b,hip,INTERSECTION),count=intersection.geometry.getAttribute('position').count;intersection.geometry.dispose();
  if(!count)continue;
  const next=evaluator.evaluate(b,cutter,SUBTRACTION);next.updateMatrixWorld();
  const remaining=next.geometry.getAttribute('position');
  if(!remaining.count||!Array.from(remaining.array).every(Number.isFinite)||components(next.geometry)!==1)throw new Error(`Roof seat removes or disconnects ${p.id} on ${q.id}`);
  b.geometry.dispose();b=next;changed=true;supports[p.id]=[...supports[p.id]??[],q.id];
 }
 if(changed){
  clearances[p.id]=(supports[p.id]??[]).filter(id=>roofBearingArea(b.geometry,hips.find(h=>h.p.id===id)!.b.geometry)<1e-5);
  if(!clearances[p.id].length)delete clearances[p.id];
  store(p,b);
 }
 b.geometry.dispose();
}
for(const {b,seat} of hips){b.geometry.dispose();seat.geometry.dispose();}
writeFileSync('src/model/roof-joints.json',JSON.stringify({assignments,meshes,supports,clearances})+'\n');
mkdirSync('artifacts/roof-corner-rafters',{recursive:true});writeFileSync('artifacts/roof-corner-rafters/seat-bake.json',JSON.stringify(audit,null,2));
console.log(`Carved roof seats for ${audit.length} independent timbers; every result remains connected.`);
