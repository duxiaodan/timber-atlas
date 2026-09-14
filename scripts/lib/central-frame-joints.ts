import {createHash} from 'node:crypto';
import {Box3,BoxGeometry,BufferGeometry,BufferGeometryLoader,Euler,Matrix4,Quaternion,Vector3} from 'three';
import {Brush,Evaluator,SUBTRACTION} from 'three-bvh-csg';
import {geometry} from '../../src/model/geometry';
import type {Catalog,Part} from '../../src/model/types';

/** Source-based member topology; hidden open seats and laps remain inferred. */
export function buildCentralFrameJoints(catalog:Catalog,assignments:Record<string,string>,meshes:Record<string,unknown>,supports:Record<string,string[]>,components:(g:BufferGeometry)=>number){
 const evaluator=new Evaluator();evaluator.useGroups=false;evaluator.attributes=['position','normal'];
 const parts=new Map(catalog.parts.map(p=>[p.id,p])),live=new Map<string,Brush>();
 const get=(id:string)=>{const p=parts.get(id);if(!p)throw new Error(`Missing central-frame timber ${id}`);return p;};
 const matrix=(p:Part)=>new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));
 const brush=(g:BufferGeometry)=>{const b=new Brush(g);b.updateMatrixWorld();return b;};
 const world=(p:Part)=>{let b=live.get(p.id);if(!b){b=brush((assignments[p.id]?new BufferGeometryLoader().parse(meshes[assignments[p.id]] as any):geometry(p.shape,p.size).clone()).applyMatrix4(matrix(p)));live.set(p.id,b);}return b;};
 const box=(x:number,z:number,w:number,d:number,y:number,sign:number)=>brush(new BoxGeometry(w,30,d).translate(x,y+sign*15,z));
 const cut=(p:Part,cutter:Brush,label:string)=>{
  const previous=world(p),next=evaluator.evaluate(previous,cutter,SUBTRACTION);cutter.geometry.dispose();
  if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Central-frame cut splits ${p.id}: ${label}`);
  next.updateMatrixWorld();previous.geometry.dispose();live.set(p.id,next);
 };
 const copy=(p:Part)=>brush(world(p).geometry.clone());
 const pair=(lower:Part,upper:Part,y:number,x:number,z:number,w:number,d:number)=>{
  cut(lower,box(x,z,w,d,y,1),`upper-open ${upper.id}`);
  cut(upper,box(x,z,w,d,y,-1),`lower-open ${lower.id}`);
  supports[upper.id]=[...new Set([...supports[upper.id]??[],lower.id])];
 };
 for(const ix of [2,3,4,5]){
  const flat=get(`flat-beam-${ix}`),grass=get(`grass-four-${ix}`),x=flat.position[0],fy=flat.position[1],top=fy+.24;
  for(const sign of [-1,1]){
   const brace=get(`brace-low-${ix}-${sign}`),dou=get(`flat-dou-${ix}-${sign}`),ling=get(`upper-ling-${ix}-${sign}`);
   cut(brace,copy(grass),'grass beam foot');cut(brace,copy(dou),'dou clearance');
   cut(flat,copy(brace),'brace head');
   pair(flat,ling,fy-.045,x,sign*2.205,flat.size[2]+.002,ling.size[2]+.002);
   const seat=get(`upper-seat-${ix}-${sign}`);
   cut(flat,box(x,sign*2.205,flat.size[2]+.002,seat.size[2]+.002,seat.position[1]-seat.size[1]/2,1),'replacement shoulders');
  }
  const forks=[get(`fork-${ix}--1`),get(`fork-${ix}-1`)],ridge=get(`ridge-ling-${ix}`);
  for(const [i,fork] of forks.entries()){
   const sign=i===0?-1:1,axis=new Vector3(1,0,0).applyEuler(new Euler(...fork.rotation)),slope=Math.abs(axis.y/axis.z),vertical=fork.size[1]/Math.abs(axis.z);
   const inner=1.85-vertical/2/slope-.002,outer=1.98+fork.size[1]*Math.abs(axis.y)/2+.002;
   pair(flat,fork,top-.06,x,sign*(inner+outer)/2,fork.size[2]+.002,outer-inner);
   cut(fork,box(x,0,1,8,top-.06,-1),'horizontal foot');
  }
  const a=new Box3().setFromObject(world(forks[0])),b=new Box3().setFromObject(world(forks[1])),lo=Math.max(a.min.z,b.min.z),hi=Math.min(a.max.z,b.max.z);
  pair(forks[0],forks[1],ridge.position[1]-.0525,x,(lo+hi)/2,.254,hi-lo+.004);
  // Third timber closes the upper band of the fork intersection. Preserve
  // whole gongs and downward-open mouths for the straight practice route.
  for(const fork of forks)pair(fork,ridge,ridge.position[1]+.0525,x,0,.254,ridge.size[2]+.002);
  for(const fork of forks)cut(fork,box(x,0,1,8,ridge.position[1]+.1575,1),'top stock dressing');
 }
 // Dress each actual purlin locally where a raised replacement enters it.
 // Keep the purlin complete across the bay and reuse it in every study.
 for(const p of catalog.parts.filter(p=>p.id.startsWith('purlin-'))){
  for(const id of p.requires.filter(id=>/^(middle-seat|upper-seat|ridge-support)-[2-5](?:-|$)/.test(id))){
   const seat=get(id),plane=seat.position[1]+seat.size[1]/2;
   cut(p,box(seat.position[0],seat.position[2],seat.size[0],seat.size[2],plane,-1),`seat ${id}`);
  }
 }
 for(const [id,b] of live){
  const p=get(id),g=b.geometry.applyMatrix4(matrix(p).invert()),data=g.toJSON();
  for(const attr of Object.values(data.data.attributes) as {array:number[]}[])attr.array=attr.array.map(v=>Math.round(v*1e6)/1e6);
  const key=createHash('sha256').update(JSON.stringify(data.data)).digest('hex').slice(0,16);assignments[id]=key;meshes[key]=data;g.dispose();
 }
}
