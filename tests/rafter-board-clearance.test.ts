import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Box3,DoubleSide,Euler,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {createCatalog,roofPoint} from '../src/model/catalog';
import {geometry} from '../src/model/geometry';

const catalog=createCatalog(),raw=createCatalog(true,false);
const affected=['598','602','606','610','614','618','718','722','726','730','734','738'].map(n=>`rafter-${n}`);
// Sample triangle edges through the span as well as the end rings: on the curved
// upper end slope the original cylinder's worst penetration is between its ends.
function samples(p:typeof catalog.parts[number]){
 const g=geometry(p.shape,p.size),v=g.getAttribute('position'),out:Vector3[]=[];
 const point=(i:number)=>new Vector3().fromBufferAttribute(v,i).multiply(new Vector3(...p.size)).applyEuler(new Euler(...p.rotation)).add(new Vector3(...p.position));
 for(let i=0;i<(g.index?.count??v.count);i+=3){const vs=[0,1,2].map(k=>point(g.index?g.index.getX(i+k):i+k));out.push(vs[0].clone().add(vs[1]).add(vs[2]).multiplyScalar(1/3));
  for(let j=0;j<3;j++){const a=vs[j],b=vs[(j+1)%3],steps=Math.ceil(a.distanceTo(b)/.04);for(let k=0;k<=steps;k++)out.push(a.clone().lerp(b,k/steps));}
 }return out;
}
test('upper end rafters stay below the actual 40 mm boards across their full span',()=>{
 const mat=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster();
 const boards=catalog.parts.filter(p=>p.assembly==='roof-boards').map(p=>{const m=new Mesh(geometry(p.shape,p.size),mat);m.position.set(...p.position);m.rotation.set(...p.rotation);m.scale.set(...p.size);m.updateMatrixWorld();return {p,m,box:new Box3().setFromObject(m)};});
 const failures:string[]=[];
 for(const id of affected){const p=catalog.parts.find(p=>p.id===id)!;assert.ok(p,id);
  const points=samples(p),worst=points.reduce((a,b)=>a.y-roofPoint(a.x,a.z)[1]>b.y-roofPoint(b.x,b.z)[1]?a:b);
  ray.set(new Vector3(worst.x,20,worst.z),new Vector3(0,-1,0));
  const hits=boards.filter(b=>worst.x>=b.box.min.x&&worst.x<=b.box.max.x&&worst.z>=b.box.min.z&&worst.z<=b.box.max.z).flatMap(b=>ray.intersectObject(b.m).map(h=>({id:b.p.id,y:h.point.y})));
  assert.ok(hits.length,id+' has no board');const top=Math.max(...hits.map(h=>h.y)),bottom=Math.min(...hits.map(h=>h.y));assert.ok(Math.abs(top-bottom-.04)<.00001);
  if(worst.y-bottom>.0001)failures.push(`${id}: ${(1000*(worst.y-top)).toFixed(3)} mm above top; ${(1000*(worst.y-bottom)).toFixed(3)} mm into board`);
 }
 assert.deepEqual(failures,[]);mat.dispose();
});
test('neighbouring pitch changes, hips and eaves retain their accepted source geometry',()=>{
 const original=new Map(raw.parts.map(p=>[p.id,p]));
 for(const p of catalog.parts){const q=original.get(p.id)!;if(!p.id.startsWith('rafter-'))continue;
  assert.deepEqual(p.position,q.position,p.id);assert.deepEqual(p.rotation,q.rotation,p.id);assert.deepEqual(p.size,q.size,p.id);
  if(affected.includes(p.id))continue;
  // Existing underside hip seats are independently baked and remain unchanged.
  if(!q.shape.startsWith('roofRafter:')||p.shape.startsWith('roofJoint:'))continue;
  assert.equal(p.shape,q.shape,p.id);
 }
 for(const p of catalog.parts.filter(p=>p.shape.startsWith('roofRafter:'))){
  const max=Math.max(...samples(p).map(q=>q.y-roofPoint(q.x,q.z)[1]-.19));assert.ok(max<.0001,`${p.id} crosses a neighbouring roof surface by ${max*1000} mm`);
 }
});
test('dressed rafters remain solid with continuous stock and unchanged lower bearing surface',()=>{
 const mat=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster();
 const mesh=(p:typeof catalog.parts[number])=>{const m=new Mesh(geometry(p.shape,p.size),mat);m.position.set(...p.position);m.rotation.set(...p.rotation);m.scale.set(...p.size);m.updateMatrixWorld();return m;};
 for(const id of affected){const p=catalog.parts.find(p=>p.id===id)!,q=raw.parts.find(p=>p.id===id)!,m=mesh(p),original=mesh(q),axis=new Vector3(1,0,0).applyEuler(new Euler(...p.rotation));
  const thickness:number[]=[];
  for(let i=2;i<=38;i++){const center=new Vector3(...p.position).addScaledVector(axis,(i/40-.5)*p.size[0]);ray.set(new Vector3(center.x,20,center.z),new Vector3(0,-1,0));
   const unique=(m:Mesh)=>ray.intersectObject(m).map(h=>h.point.y).filter((y,i,ys)=>i===0||Math.abs(y-ys[i-1])>1e-5),ys=unique(m),old=unique(original);
   assert.equal(ys.length,2,`${id}: open or disconnected section ${i}`);assert.equal(old.length,2);assert.ok(Math.abs(ys[1]-old[1])<.00001,`${id}: lower stock shifted`);
   thickness.push(ys[0]-ys[1]);
  }
  assert.ok(Math.min(...thickness)>.08,`${id}: less than 80 mm residual vertical stock`);
 }
 mat.dispose();
});
