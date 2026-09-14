import {Box3,Mesh,MeshBasicMaterial,DoubleSide,Raycaster,Vector3,Matrix3} from 'three';
import type {Part} from '../../src/model/types';
import {geometry} from '../../src/model/geometry';
export function sampleOverlaps(parts:Part[],movingId?:string) {
const mat=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster();
const entries=parts.map(p=>{const m=new Mesh(geometry(p.shape,p.size),mat);m.position.set(...p.position);m.rotation.set(...p.rotation);m.scale.set(...p.size);m.updateMatrixWorld();return {p,m,box:new Box3().setFromObject(m)};});
const directions=[[.371,.529,.763],[-.673,.417,.611],[.239,-.817,.523]].map(v=>new Vector3(...v).normalize());
function alongRay(point:Vector3,m:Mesh,direction:Vector3){
 ray.set(point,direction);
 const normalMatrix=new Matrix3().getNormalMatrix(m.matrixWorld);let distance:number|undefined;let signs=new Set<number>();
 for(const hit of ray.intersectObject(m)){
  const dot=hit.face!.normal.clone().applyMatrix3(normalMatrix).dot(ray.ray.direction);if(Math.abs(dot)<1e-8)continue;
  if(distance!==undefined&&hit.distance-distance>1e-5){
   const crossing=[...signs].reduce((a,b)=>a+b,0);if(crossing)return crossing>0;
   signs=new Set();distance=undefined;
  }
  distance??=hit.distance;signs.add(Math.sign(dot));
 }
 // The first non-cancelling oriented boundary identifies the starting side.
 // Later duplicated coplanar exits cannot turn an earlier entry into "inside".
 // Opposite faces at a touching bowl/ear interface still cancel within 10um.
 return [...signs].reduce((a,b)=>a+b,0)>0;
}
function inside(point:Vector3,m:Mesh){
 // A ray can land on a CSG seam after world/local Float32 round-tripping.
 // Resolve disagreement with an independent third direction; no geometric
 // clearance or minimum penetration threshold is relaxed.
 const a=alongRay(point,m,directions[0]),b=alongRay(point,m,directions[1]);
 return a===b?a:alongRay(point,m,directions[2]);
}
const overlaps=[];
for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
 if(movingId&&entries[i].p.id!==movingId&&entries[j].p.id!==movingId)continue;
 const a=entries[i],b=entries[j],box=a.box.clone().intersect(b.box),size=box.getSize(new Vector3());
 if(box.isEmpty()||Math.min(...size.toArray())<.01)continue;
 let hits=0;for(let x=.15;x<1;x+=.23)for(let y=.15;y<1;y+=.23)for(let z=.15;z<1;z+=.23){const pt=box.min.clone().add(new Vector3(size.x*x,size.y*y,size.z*z));if(inside(pt,a.m)&&inside(pt,b.m))hits++;}
 if(hits)overlaps.push({a:a.p.id,b:b.p.id,hits,box:size.toArray().map(n=>+n.toFixed(4))});
}
mat.dispose();return overlaps;
}
