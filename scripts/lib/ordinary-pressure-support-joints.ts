import {createHash} from 'node:crypto';
import {BoxGeometry,BufferGeometry,BufferGeometryLoader,Euler,Matrix4,Quaternion,Vector3} from 'three';
import {Brush,Evaluator,SUBTRACTION} from 'three-bvh-csg';
import {geometry} from '../../src/model/geometry';
import type {Catalog,Part} from '../../src/model/types';

/** Ordinary pressure nodes sit on the grass beam; corner three-way joints have a separate recipe. */
export function buildOrdinaryPressureSupportJoints(catalog:Catalog,assignments:Record<string,string>,meshes:Record<string,unknown>,components:(g:BufferGeometry)=>number){
 const evaluator=new Evaluator();evaluator.useGroups=false;evaluator.attributes=['position','normal'];
 const by=new Map(catalog.parts.map(p=>[p.id,p]));
 const matrix=(p:Part)=>new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));
 for(const a of catalog.assemblies.filter(a=>a.variant==='outer')){
  const cap=by.get(`${a.id}-26`)!,grass=by.get(a.id.replace('outer-bracket-','grass-milk-'))!,rotation=new Quaternion().setFromEuler(new Euler(...grass.rotation));
  for(const p of [grass,cap]){
   const g=assignments[p.id]?new BufferGeometryLoader().parse(meshes[assignments[p.id]] as any):geometry(p.shape,p.size).clone();
   const body=new Brush(g.applyMatrix4(matrix(p)));body.updateMatrixWorld();
   const centre=new Vector3(...cap.position);centre.y+=p===grass?5:-5;
   const cutterGeometry=new BoxGeometry(p===grass?cap.size[2]+.004:10,10,grass.size[2]+.004).applyQuaternion(rotation);cutterGeometry.translate(...centre.toArray());
   const cutter=new Brush(cutterGeometry);cutter.updateMatrixWorld();const result=evaluator.evaluate(body,cutter,SUBTRACTION);
   if(!result.geometry.getAttribute('position').count||components(result.geometry)!==1)throw new Error(`Ordinary pressure support splits ${p.id}`);
   body.geometry.dispose();cutter.geometry.dispose();
   const data=result.geometry.applyMatrix4(matrix(p).invert()).toJSON();
   for(const attr of Object.values(data.data.attributes) as {array:number[]}[])attr.array=attr.array.map(v=>Math.round(v*1e6)/1e6);
   const key=createHash('sha256').update(JSON.stringify(data.data)).digest('hex').slice(0,16);assignments[p.id]=key;meshes[key]=data;result.geometry.dispose();
  }
 }
}
