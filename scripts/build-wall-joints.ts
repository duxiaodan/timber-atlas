import {readFileSync,writeFileSync} from 'node:fs';
import {Box3,Euler,Matrix4,Quaternion,Vector3,BufferGeometry,Float32BufferAttribute} from 'three';
import {Brush,Evaluator,SUBTRACTION} from 'three-bvh-csg';
import {createCatalog} from '../src/model/catalog';
import {geometry} from '../src/model/geometry';
import type {Part} from '../src/model/types';

const c=createCatalog(false),evaluator=new Evaluator();evaluator.useGroups=false;evaluator.attributes=['position','normal'];
const world=(p:Part)=>new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));
const brush=(g:BufferGeometry)=>{const b=new Brush(g);b.updateMatrixWorld();return b;};
const perimeterOnly=process.argv.includes('--perimeter-only');
const result:Record<string,unknown>=perimeterOnly?JSON.parse(readFileSync('src/model/wall-joints.json','utf8')):{};
function save(p:Part,g:BufferGeometry){
 g.applyMatrix4(world(p).invert());g.computeVertexNormals();
 const position=g.getAttribute('position');
 if(position.count===0)throw new Error(`Empty enclosure mesh: ${p.id}`);
 g.setAttribute('uv',new Float32BufferAttribute(Array.from({length:position.count*2},(_,i)=>i%2?position.getY(i>>1)+.5:position.getX(i>>1)+.5),2));
 const json=g.toJSON();
 for(const attribute of Object.values(json.data!.attributes))attribute.array=attribute.array.map((v:number)=>Math.round(v*1e6)/1e6);
 result[p.id]=json;console.log(`${p.id}: ${position.count} vertices`);g.dispose();
}
const back=c.parts.find(p=>p.id==='wall-back')!;
for(const id of ['wall-back','wall-side--1','wall-side-1']){
 const p=c.parts.find(p=>p.id===id)!,matrix=world(p);
 let current=brush(geometry(p.shape,p.size).clone().applyMatrix4(matrix));
 const bounds=new Box3().setFromObject(current);
 for(const column of c.parts.filter(p=>p.kind==='柱')){
  // Expand the column radially by 2mm, retaining its entasis and intact wood.
  const size:[number,number,number]=[column.size[0]+.004,column.size[1],column.size[2]+.004];
  const cutter=brush(geometry(column.shape,column.size).clone().applyMatrix4(world({...column,size})));
  if(bounds.intersectsBox(new Box3().setFromObject(cutter))){const next=evaluator.evaluate(current,cutter,SUBTRACTION);current.geometry.dispose();current=next;}
  cutter.geometry.dispose();
 }
 if(id!=='wall-back'){
  const cutter=brush(geometry(back.shape,back.size).clone().applyMatrix4(world(back)));
  const next=evaluator.evaluate(current,cutter,SUBTRACTION);current.geometry.dispose();cutter.geometry.dispose();current=next;
 }
 save(p,current.geometry);
}
// Use the resolved wood meshes (including bracket joints), while each new
// infill starts from its uncut local box. No cuts are made into the wood.
const timber=(perimeterOnly?[]:createCatalog().parts).filter(p=>['wood','redwood'].includes(p.material)&&p.position[1]>5&&p.position[1]<9).map(p=>{
 const b=brush(geometry(p.shape,p.size).clone().applyMatrix4(world(p)));
 return {b,bounds:new Box3().setFromObject(b)};
});
for(const p of c.parts.filter(p=>!perimeterOnly&&p.kind==='外檐栱眼壁')){
 let current=brush(geometry('box',p.size).clone().applyMatrix4(world(p)));
 const bounds=new Box3().setFromObject(current);
 for(const q of timber)if(bounds.intersectsBox(q.bounds)){
  const next=evaluator.evaluate(current,q.b,SUBTRACTION);current.geometry.dispose();current=next;
 }
 save(p,current.geometry);
}
for(const q of timber)q.b.geometry.dispose();
writeFileSync('src/model/wall-joints.json',JSON.stringify(result)+'\n');
