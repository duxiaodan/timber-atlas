import * as THREE from 'three';
import {sectionGeometry} from './geometry';

export interface SectionInputBatch {
  geometry:THREE.BufferGeometry;
  matrices:Float32Array;
  parts:{id:string;shape?:string}[];
}
export interface SectionInput {planes:THREE.Plane[];batches:SectionInputBatch[];}
export interface SectionSurface {positions:Float32Array;edges:Float32Array;ids:string[];}
export interface SectionResult {surfaces:SectionSurface[];milliseconds:number;openChains:number;}
export interface SectionComputer {compute(input:SectionInput):Promise<SectionResult>;dispose():void;}

/** The same physical intersection is used by synchronous tests and the worker. */
export function computeSection(input:SectionInput):SectionResult {
  const start=performance.now(),matrix=new THREE.Matrix4();let openChains=0;
  const surfaces=input.planes.map(plane=>{
    const positions:number[]=[],edges:number[]=[],ids:string[]=[];
    for(const batch of input.batches){
      const geometry=batch.geometry;if(!geometry.boundingBox)geometry.computeBoundingBox();
      for(let i=0;i<batch.parts.length;i++){
        matrix.fromArray(batch.matrices,i*16);
        if(!geometry.boundingBox!.clone().applyMatrix4(matrix).intersectsPlane(plane))continue;
        const part=batch.parts[i],solid=/^(bracketJoint|wallJoint|roofJoint):/.test(part.shape??'');
        const result=sectionGeometry(geometry,plane,5e-5,matrix,solid);openChains+=result.openChains;
        // Avoid argument-count limits on detailed sculpture cross sections.
        for(const value of result.positions)positions.push(value);
        for(const value of result.edges)edges.push(value);
        for(let j=0;j<result.positions.length;j+=9)ids.push(part.id);
      }
    }
    return {positions:new Float32Array(positions),edges:new Float32Array(edges),ids};
  });
  return {surfaces,milliseconds:performance.now()-start,openChains};
}

export interface PackedSectionInput {
  planes:number[][];
  geometries:{id:string;positions:Float32Array;indices:Uint32Array|null}[];
  batches:{geometryId:string;matrices:Float32Array;parts:{id:string;shape?:string}[]}[];
}
