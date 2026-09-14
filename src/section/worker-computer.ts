import * as THREE from 'three';
import type {PackedSectionInput,SectionComputer,SectionInput,SectionResult} from './computation';

/** One worker per viewer; immutable source meshes are uploaded only once. */
export class WorkerSectionComputer implements SectionComputer {
  private worker:Worker|null=null;
  private uploaded=new Set<string>();
  private reject:((reason:Error)=>void)|null=null;
  compute(input:SectionInput):Promise<SectionResult>{
    return new Promise((resolve,reject)=>{
      this.worker??=new Worker(new URL('./section.worker.ts',import.meta.url),{type:'module'});
      const worker=this.worker;this.reject=reject;
      worker.onmessage=event=>{this.reject=null;if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.result);};
      worker.onerror=event=>{event.preventDefault();this.reject=null;reject(new Error(event.message||'Section worker failed'));};
      const matrix=new THREE.Matrix4(),geometries:PackedSectionInput['geometries']=[],transfers:ArrayBuffer[]=[];
      const batches:PackedSectionInput['batches']=[];
      for(const batch of input.batches){
        const geometry=batch.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
        // Do not copy detailed meshes which miss every active plane.
        let intersects=false;
        for(let i=0;i<batch.parts.length&&!intersects;i++){
          matrix.fromArray(batch.matrices,i*16);const box=geometry.boundingBox!.clone().applyMatrix4(matrix);
          intersects=input.planes.some(p=>box.intersectsPlane(p));
        }
        if(!intersects)continue;
        if(!this.uploaded.has(geometry.uuid)){
          const position=geometry.getAttribute('position'),positions=new Float32Array(position.count*3);
          for(let i=0;i<position.count;i++){positions[i*3]=position.getX(i);positions[i*3+1]=position.getY(i);positions[i*3+2]=position.getZ(i);}
          const indices=geometry.index?Uint32Array.from(geometry.index.array):null;
          geometries.push({id:geometry.uuid,positions,indices});transfers.push(positions.buffer);if(indices)transfers.push(indices.buffer);
          this.uploaded.add(geometry.uuid);
        }
        // Keep the input snapshot intact for equality checks and a worker-error fallback.
        const matrices=batch.matrices.slice();transfers.push(matrices.buffer);
        batches.push({geometryId:geometry.uuid,matrices,parts:batch.parts});
      }
      worker.postMessage({planes:input.planes.map(p=>[...p.normal.toArray(),p.constant]),geometries,batches} satisfies PackedSectionInput,transfers);
    });
  }
  dispose(){this.worker?.terminate();this.worker=null;this.uploaded.clear();this.reject?.(new Error('Section worker disposed'));this.reject=null;}
}
