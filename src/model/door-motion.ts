import {Matrix4,Vector3} from 'three';
import type {Catalog,Part} from './types';

export interface DoorLeaf {id:string;parts:Part[];pivot:Vector3;angle:number;}
/** Inferred demonstration axes at the outside/rear edge of each existing leaf.
 * The 90° inward swing stays on the free side of the jamb. */
export function doorLeaves(catalog:Catalog):DoorLeaf[]{
 const groups=new Map<string,{sign:number;parts:Part[]}>();
 for(const p of catalog.parts){
  const match=/^door-(?:rail-)?(\d+)-(-?1)-(\d+)$/.exec(p.id);if(!match)continue;
  const id=`${match[1]}:${match[2]}`,group=groups.get(id)??{sign:Number(match[2]),parts:[]};group.parts.push(p);groups.set(id,group);
 }
 return [...groups].map(([id,{sign,parts}])=>({id,parts,
  pivot:new Vector3(sign<0?Math.min(...parts.map(p=>p.position[0]-p.size[0]/2)):Math.max(...parts.map(p=>p.position[0]+p.size[0]/2)),0,Math.min(...parts.map(p=>p.position[2]-p.size[2]/2))),
  angle:-sign*Math.PI/2,
 }));
}
export function doorTransform(leaf:DoorLeaf,amount:number):Matrix4{
 const {x,y,z}=leaf.pivot;
 return new Matrix4().makeTranslation(x,y,z).multiply(new Matrix4().makeRotationY(leaf.angle*amount)).multiply(new Matrix4().makeTranslation(-x,-y,-z));
}
