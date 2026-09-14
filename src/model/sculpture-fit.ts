import {drainWork,runWork,type WorkProgress} from '../work-batches';
import {BufferGeometry,Float32BufferAttribute,Matrix4,Quaternion,Euler,Vector3} from 'three';
import {registerSculptureGeometry} from './geometry';
import type {Catalog,Part,Vec3} from './types';

export interface SculpturePose {id:string;version:string;position:Vec3;rotation:Vec3;size:Vec3;bottom:number;scale:number;}
export interface InstalledSculpture {partId:string;version:string;placement:SculpturePose;}
export interface RoofSculptureFit {records:Array<InstalledSculpture & {sourceBounds:{extent:Vec3;center:Vec3};meshes:Array<{id:string;positions:number[];indices:number[]}>}>;}

function matrix(p:Pick<Part,'position'|'rotation'|'size'>){return new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));}
/** Install receiving tile ends only at their validated sculpture poses. */
export function applyRoofSculptureFit(catalog:Catalog,study:RoofSculptureFit,candidates:InstalledSculpture[]){return drainWork(fitWork(catalog,study,candidates));}
export function applyRoofSculptureFitAsync(catalog:Catalog,study:RoofSculptureFit,candidates:InstalledSculpture[],progress:WorkProgress){return runWork(fitWork(catalog,study,candidates),study.records.reduce((n,r)=>n+r.meshes.length,0),progress);}
function* fitWork(catalog:Catalog,study:RoofSculptureFit,candidates:InstalledSculpture[]):Generator<number|null,string[]> {
 const changed:string[]=[];
 for(const record of study.records){
  const candidate=candidates.find(p=>p.partId===record.partId);
  if(!candidate||candidate.version!==record.version||JSON.stringify(candidate.placement)!==JSON.stringify(record.placement))throw Error('Receiving geometry requires matching asset version and mounting pose');
  const restore=new Matrix4().makeScale(...record.sourceBounds.extent as [number,number,number]);restore.setPosition(...record.sourceBounds.center as [number,number,number]);
  const sourceToWorld=matrix(record.placement).multiply(restore.invert());
  for(const patch of record.meshes){
   const part=catalog.parts.find(p=>p.id===patch.id);if(!part||!/^ridge-(hip|cover)-/.test(part.id))throw Error('Unexpected receiving piece');
   const transform=matrix(part).invert().multiply(sourceToWorld),positions:number[]=[];
   for(let i=0;i<patch.positions.length;i+=3)positions.push(...new Vector3(...patch.positions.slice(i,i+3)).applyMatrix4(transform).toArray());
   const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(positions,3));g.setIndex(patch.indices);
   // Keep the imported ceramic roof pieces' hard edges at the receiving cut.
   const flat=g.toNonIndexed();g.dispose();flat.computeVertexNormals();
   part.shape=registerSculptureGeometry(`fit-study-${part.id}`,flat);changed.push(part.id);yield changed.length;
  }
 }
 return changed;
}
