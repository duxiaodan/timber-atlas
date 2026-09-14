import {writeFileSync} from 'node:fs';
import {Matrix4,Vector3,Quaternion,Euler,BufferGeometryLoader} from 'three';
import {Brush,Evaluator,SUBTRACTION} from 'three-bvh-csg';
import {createCatalog} from '../src/model/catalog';
import {geometry} from '../src/model/geometry';
import type {Part} from '../src/model/types';
const parts=new Map(createCatalog().parts.map(p=>[p.id,p]));
const evaluator=new Evaluator();evaluator.useGroups=false;evaluator.attributes=['position','normal'];
function matrix(p:Part){return new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));}
const recipes=[{name:'jointBraceA',id:'brace-low-3--1',base:'box',cuts:['grass-four-3','flat-dou-3--1']},{name:'jointBraceB',id:'brace-low-3-1',base:'box',cuts:['grass-four-3','flat-dou-3-1']},{name:'jointHump',id:'main-hump-3',base:'hump',cuts:['cross-dou-3']},{name:'jointFlat',id:'flat-beam-3',base:'box',cuts:['brace-low-3--1','brace-low-3-1']}] as const;
const result:Record<string,unknown>={};
for(const recipe of recipes){
 const target=parts.get(recipe.id)!,world=matrix(target);
 let brush=new Brush(geometry(recipe.base,target.size).clone().applyMatrix4(world));brush.updateMatrixWorld();
 for(const id of recipe.cuts){
  const p=parts.get(id)!,cutter=new Brush((result[p.shape]?new BufferGeometryLoader().parse(result[p.shape] as any):p.shape==='dou'?geometry('box').clone().scale(1,.92,1).translate(0,-.02,0):geometry(p.shape,p.size).clone()).applyMatrix4(matrix(p)));cutter.updateMatrixWorld();
  const next=evaluator.evaluate(brush,cutter,SUBTRACTION);brush.geometry.dispose();cutter.geometry.dispose();brush=next;
 }
 brush.geometry.applyMatrix4(world.clone().invert());brush.geometry.computeVertexNormals();brush.geometry.computeBoundingBox();
 result[recipe.name]=brush.geometry.toJSON();brush.geometry.dispose();
}
writeFileSync('src/model/joint-geometry.json',JSON.stringify(result)+'\n');
console.log('Baked four shared joint meshes for all four central frames.');
