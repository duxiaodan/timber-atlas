import {createHash} from 'node:crypto';
import {BoxGeometry,BufferGeometry,BufferGeometryLoader,Euler,Matrix4,Quaternion,Vector3} from 'three';
import {Brush,Evaluator,SUBTRACTION} from 'three-bvh-csg';
import {geometry} from '../../src/model/geometry';
import {PRESSURE_SPLICE_OVERLAP} from '../../src/model/catalog';
import type {Catalog,Part} from '../../src/model/types';

/** Inferred paired bearing tongues on the existing continuous pressure spans. */
export function buildPressureSpliceJoints(catalog:Catalog,assignments:Record<string,string>,meshes:Record<string,unknown>,components:(g:BufferGeometry)=>number){
 const evaluator=new Evaluator();evaluator.useGroups=false;evaluator.attributes=['position','normal'];
 const by=new Map(catalog.parts.map(p=>[p.id,p])),live=new Map<string,Brush>();
 const matrix=(p:Part)=>new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));
 const world=(p:Part)=>{let b=live.get(p.id);if(!b){const g=assignments[p.id]?new BufferGeometryLoader().parse(meshes[assignments[p.id]] as any):geometry(p.shape,p.size).clone();b=new Brush(g.applyMatrix4(matrix(p)));b.updateMatrixWorld();live.set(p.id,b);}return b;};
 const cut=(p:Part,k:Brush)=>{const old=world(p),next=evaluator.evaluate(old,k,SUBTRACTION);k.geometry.dispose();
  if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Pressure splice splits ${p.id}`);
  old.geometry.dispose();next.updateMatrixWorld();live.set(p.id,next);
 };
 for(const span of catalog.parts.filter(p=>p.id.startsWith('pressure-fang-'))){
  const rotation=new Quaternion().setFromEuler(new Euler(...span.rotation)),t=new Vector3(1,0,0).applyQuaternion(rotation),n=new Vector3(0,0,1).applyQuaternion(rotation);
  const box=(x:number,y:number,z:number,l:number,h:number,d:number)=>{const g=new BoxGeometry(l,h,d).applyQuaternion(rotation),at=new Vector3(...span.position).addScaledVector(t,x).addScaledVector(n,z).add(new Vector3(0,y,0));g.translate(at.x,at.y,at.z);const b=new Brush(g);b.updateMatrixWorld();return b;};
  for(const id of span.requires){
   const cap=by.get(id)!;if(cap.kind!=='压槽枋节点')throw new Error(`Unexpected pressure support ${id}`);
   const side=Math.sign(new Vector3(...cap.position).sub(new Vector3(...span.position)).dot(t)),centre=side*(span.size[0]/2-PRESSURE_SPLICE_OVERLAP/2),length=PRESSURE_SPLICE_OVERLAP+.004;
   // A downward-open upper tongue seats on the cap's retained lower half.
   // Its two lateral shoulders fit a pocket with 2mm clearance on each side.
   cut(cap,box(centre,5,0,length,10,.144));
   cut(span,box(centre,-5,0,length,10,1));
   for(const sign of [-1,1])cut(span,box(centre,0,sign*(.07+5),length,10,10));
  }
 }
 for(const [id,b] of live){const p=by.get(id)!,g=b.geometry.applyMatrix4(matrix(p).invert()),data=g.toJSON();
  for(const a of Object.values(data.data.attributes) as {array:number[]}[])a.array=a.array.map(v=>Math.round(v*1e6)/1e6);
  const key=createHash('sha256').update(JSON.stringify(data.data)).digest('hex').slice(0,16);assignments[id]=key;meshes[key]=data;g.dispose();
 }
}
