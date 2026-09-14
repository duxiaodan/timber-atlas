import {DoubleSide,Euler,Matrix4,Quaternion,Ray,Vector3} from 'three';
import {MeshBVH} from 'three-mesh-bvh';
import {geometry} from '../../src/model/geometry';
import type {Catalog,Part} from '../../src/model/types';

export interface BearingEdge {support:string;carried:string;point:[number,number,number]}

/** Diagnostic for downward bearing only. A missing edge needs review of real joinery;
 * it does not prove collapse, and an edge does not prove moment/load capacity. */
export function directedBearings(parts:Part[],tolerance=.001):BearingEdge[]{
 const entries=parts.map(p=>{
  const g=geometry(p.shape,p.size).clone().applyMatrix4(new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size)));
  g.computeBoundingBox();return {p,g,box:g.boundingBox!,tree:new MeshBVH(g),samples:new Map<string,{y:number;ny:number}[]>()};
 });
 const ray=new Ray(new Vector3(),new Vector3(0,-1,0)),edges:BearingEdge[]=[];
 const samples=(e:typeof entries[number],x:number,z:number)=>{
  const key=`${x.toFixed(6)}/${z.toFixed(6)}`;let hit=e.samples.get(key);
  if(!hit){ray.origin.set(x,e.box.max.y+1,z);hit=e.tree.raycast(ray,DoubleSide).map(h=>({y:h.point.y,ny:h.face?.normal.y??0}));e.samples.set(key,hit);}return hit;
 };
 const match=(lower:typeof entries[number],upper:typeof entries[number],x:number,z:number)=>{
  const lo=samples(lower,x,z).filter(h=>h.ny>.15),hi=samples(upper,x,z).filter(h=>h.ny<-.15);
  for(const a of lo)for(const b of hi)if(Math.abs(a.y-b.y)<=tolerance)return (a.y+b.y)/2;
  return undefined;
 };
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  const a=entries[i],b=entries[j];if(!a.box.clone().expandByScalar(tolerance).intersectsBox(b.box))continue;
  const x0=Math.max(a.box.min.x,b.box.min.x),x1=Math.min(a.box.max.x,b.box.max.x),z0=Math.max(a.box.min.z,b.box.min.z),z1=Math.min(a.box.max.z,b.box.max.z);
  const margin=.003;if(x1-x0<2*margin||z1-z0<2*margin)continue;
  for(const [lower,upper] of [[a,b],[b,a]]){
   let point:BearingEdge['point']|undefined;
   for(let ix=0;ix<9&&!point;ix++)for(let iz=0;iz<9&&!point;iz++){
    const x=x0+margin+(x1-x0-2*margin)*ix/8,z=z0+margin+(z1-z0-2*margin)*iz/8,y=match(lower,upper,x,z);if(y===undefined)continue;
    let patch=true;for(const dx of [-margin,0,margin])for(const dz of [-margin,0,margin])if(match(lower,upper,x+dx,z+dz)===undefined)patch=false;
    if(patch)point=[x,y,z];
   }
   if(point)edges.push({support:lower.p.id,carried:upper.p.id,point});
  }
 }
 for(const e of entries)e.g.dispose();return edges;
}


export function auditDirectedStudies(catalog:Catalog,selectedIds?:string[]){
 const selected=new Set(selectedIds),assemblies=catalog.assemblies.filter(a=>(a.layer==='brackets'||/^(?:end-)?frame-|^beam-bracket-/.test(a.id))&&(!selected.size||selected.has(a.id)));
 if(!assemblies.length)throw new Error('No matching studies');
 const ids=new Set(assemblies.flatMap(a=>[...a.partIds,...a.contextPartIds??[]]));
 const parts=catalog.parts.filter(p=>ids.has(p.id)&&['wood','redwood','stone'].includes(p.material)),by=new Map(parts.map(p=>[p.id,p]));
 const edges=directedBearings(parts),down=new Map(parts.map(p=>[p.id,edges.filter(e=>e.carried===p.id).map(e=>e.support)]));
 const studies=assemblies.map(a=>{
  const scope=new Set([...a.partIds,...a.contextPartIds??[]].filter(id=>by.has(id))),anchored=new Set(parts.filter(p=>scope.has(p.id)&&p.kind==='柱础').map(p=>p.id));
  let changed=true;while(changed){changed=false;for(const e of edges)if(scope.has(e.carried)&&anchored.has(e.support)&&!anchored.has(e.carried)){anchored.add(e.carried);changed=true;}}
  return {assembly:a.id,wood:parts.filter(p=>scope.has(p.id)&&p.material!=='stone').length,review:[...scope].filter(id=>!anchored.has(id)).map(id=>({id,kind:by.get(id)!.kind,supports:down.get(id)!.filter(id=>scope.has(id))}))};
 });
 const missing=parts.filter(p=>p.material!=='stone'&&!down.get(p.id)!.length),byKind:Record<string,number>={};for(const p of missing)byKind[p.kind]=(byKind[p.kind]??0)+1;
 return {method:'1mm vertical tolerance; opposing surface normals; 6x6mm sampled patch; downward bearing only, not strength or exhaustive joinery proof',members:parts.length,edges,studies,summary:{studies:studies.length,members:parts.length,edges:edges.length,scopesNeedingReview:studies.filter(a=>a.review.length).length,missingDownwardSurface:missing.length,byKind}};
}
