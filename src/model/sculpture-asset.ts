import {drainWork,runWork} from '../work-batches';
import {BufferAttribute,BufferGeometry,Matrix4,Mesh,MeshStandardMaterial,Object3D} from 'three';
import {registerSculptureGeometry} from './geometry';

const materialsByShape=new Map<string,MeshStandardMaterial[]>();
export const sculptureMaterials=(shape:string)=>materialsByShape.get(shape);

/** Recombine exporter material primitives without duplicating their shared vertex buffers. */
export function sculptureFromScene(scene:Object3D){return drainWork(sculptureWork(scene));}
function* sculptureWork(scene:Object3D):Generator<number|null,{geometry:BufferGeometry;materials:MeshStandardMaterial[]}>{
  scene.updateMatrixWorld(true);
  const meshes:Mesh<BufferGeometry,MeshStandardMaterial>[]=[];
  scene.traverse(o=>{if((o as Mesh).isMesh)meshes.push(o as Mesh<BufferGeometry,MeshStandardMaterial>);});
  if(!meshes.length)throw Error('Empty sculpture asset');
  const first=meshes[0].geometry,geometry=new BufferGeometry(),identity=new Matrix4();
  for(const name of ['position','normal','color']){
    const attribute=first.getAttribute(name);if(!attribute)throw Error(`Missing ${name}`);
    geometry.setAttribute(name,attribute);
  }
  const indices:number[]=[],materials:MeshStandardMaterial[]=[];
  for(const mesh of meshes){
    if(!mesh.matrixWorld.equals(identity))throw Error('Sculpture export requires baked object transforms');
    if(Array.isArray(mesh.material)||!mesh.material.isMeshStandardMaterial)throw Error('Unexpected sculpture material');
    const g=mesh.geometry;
    for(const name of ['position','normal','color']){
      const a=g.getAttribute(name),b=first.getAttribute(name);
      if(!a||a.array.buffer!==b.array.buffer||a.array.byteOffset!==b.array.byteOffset||a.array.length!==b.array.length)
        throw Error('Sculpture primitives must share exported vertex accessors');
    }
    if(!g.index)throw Error('Sculpture export requires indices');
    const start=indices.length;for(let i=0;i<g.index.array.length;i++){indices.push(g.index.array[i]);if(i%65536===65535)yield null;}
    geometry.addGroup(start,indices.length-start,materials.length);materials.push(mesh.material);
  }
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices),1));
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {geometry,materials};
}

export function registerSculptureAsset(id:string,scene:Object3D){
  const asset=sculptureFromScene(scene),shape=registerSculptureGeometry(id,asset.geometry);
  materialsByShape.set(shape,asset.materials);return shape;
}

export async function registerSculptureAssetAsync(id:string,scene:Object3D){
 const asset=await runWork(sculptureWork(scene),1),shape=registerSculptureGeometry(id,asset.geometry);
 materialsByShape.set(shape,asset.materials);return shape;
}
