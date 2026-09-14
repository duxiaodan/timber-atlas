import * as THREE from 'three';
import {computeSection,type PackedSectionInput} from './computation';

const geometries=new Map<string,THREE.BufferGeometry>();
self.onmessage=(event:MessageEvent<PackedSectionInput>)=>{
  try {
    const input=event.data;
    for(const entry of input.geometries){
      const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(entry.positions,3));
      if(entry.indices)geometry.setIndex(new THREE.BufferAttribute(entry.indices,1));
      geometry.computeBoundingBox();geometries.set(entry.id,geometry);
    }
    const result=computeSection({planes:input.planes.map(p=>new THREE.Plane(new THREE.Vector3(...p.slice(0,3)),p[3])),batches:input.batches.map(b=>{
      const geometry=geometries.get(b.geometryId);if(!geometry)throw Error('Missing section geometry');
      return {geometry,matrices:b.matrices,parts:b.parts};
    })});
    self.postMessage({result},{transfer:result.surfaces.flatMap(s=>[s.positions.buffer,s.edges.buffer])});
  } catch(error){self.postMessage({error:String(error)});}
};
