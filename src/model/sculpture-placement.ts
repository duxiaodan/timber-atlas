import {geometry} from './geometry';
import type {Part,Vec3} from './types';

export interface SculptureMetadata { version:string; scalePolicy?:string; sourceBounds:{extent:number[];center:number[]}; }

/** One mounting transform shared by the hall preview and numerical fit exports. */
export function sculpturePlacement(part:Part,meta:SculptureMetadata,offset:Vec3=[0,0,0]){
 const baseline=geometry(part.shape,part.size),bottom=part.position[1]+baseline.boundingBox!.min.y*part.size[1];
 const scale=meta.scalePolicy==='source-meters'?1:part.size[1]/meta.sourceBounds.extent[1];
 const size=meta.sourceBounds.extent.map((n:number)=>n*scale) as Vec3;
 const position:Vec3=[part.position[0]+offset[0],bottom+size[1]/2+offset[1],part.position[2]+offset[2]];
 return {id:part.id,version:meta.version,size,position,rotation:part.rotation,bottom:bottom+offset[1],scale};
}
