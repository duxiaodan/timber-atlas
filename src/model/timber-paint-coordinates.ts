import {geometry} from './geometry';
import {Float32BufferAttribute,Triangle,Vector3,type BufferGeometry} from 'three';
import {getDouProfile} from './dou-installation';
import type {Part} from './types';
const cache=new WeakMap<BufferGeometry,Map<string,Float32BufferAttribute>>();
/** Undo the authored seat slope in decoration coordinates only. */
export function timberPaintPosition(p:Part,g:BufferGeometry){
 const shape=p.paintSourceShape??p.shape,position=g.getAttribute('position');
 if(!shape.startsWith('douProfile:'))return position;
 const profile=getDouProfile(shape.slice(11)),slope=profile.slope;
 if(!slope&&profile.earTop===undefined)return position;
 const key=shape+':'+p.size.join(','),entries=cache.get(g)??new Map<string,Float32BufferAttribute>();cache.set(g,entries);
 const existing=entries.get(key);if(existing)return existing;
 const data=new Float32Array(position.count*3);
 for(let i=0;i<position.count;i++){
  const x=position.getX(i),z=position.getZ(i);let y=position.getY(i);
  if(slope){const q=(x*p.size[0]*slope[0]+z*p.size[2]*slope[1])/p.size[1];
   if(profile.slopeMode==='whole')y-=q;
   else if(y<.08)y=y<=-.48+q?y-q:(y-q*.08/.56)/(1-q/.56);
  }
  // Ear height is an independent authored seat level, not a universal bbox top.
  if(y>.08&&profile.earTop!==undefined)y=.08+(y-.08)*.36/(profile.earTop-.08);
  data.set([x,y,z],i*3);
 }
 const result=new Float32BufferAttribute(data,3);entries.set(key,result);return result;
}

/** Broad exterior faces are identified on the original surface, including tapered
 * beam heads. Normals/bbox tests alone fragment their triangulated side faces. */
export function timberPaintExterior(p:Part,g:BufferGeometry){
 const original=geometry(p.paintSourceShape??p.shape,p.size),vertices=g.getAttribute('position'),idx=g.index,axis=p.size[2]>p.size[0]?0:2;
 const source=original.getAttribute('position'),sourceIndex=original.index,faces:Triangle[]=[];
 const a=new Vector3(),b=new Vector3(),c=new Vector3(),normal=new Vector3();
 for(let i=0;i<(sourceIndex?.count??source.count);i+=3){
  a.fromBufferAttribute(source,sourceIndex?.getX(i)??i);b.fromBufferAttribute(source,sourceIndex?.getX(i+1)??i+1);c.fromBufferAttribute(source,sourceIndex?.getX(i+2)??i+2);
  const triangle=new Triangle(a.clone(),b.clone(),c.clone());triangle.getNormal(normal);
  if(Math.abs(normal.getComponent(axis))>.65)faces.push(triangle);
 }
 const values=new Float32Array(vertices.count),center=new Vector3(),closest=new Vector3();
 for(let i=0;i<(idx?.count??vertices.count);i+=3){
  const ids=[idx?.getX(i)??i,idx?.getX(i+1)??i+1,idx?.getX(i+2)??i+2];
  a.fromBufferAttribute(vertices,ids[0]);b.fromBufferAttribute(vertices,ids[1]);c.fromBufferAttribute(vertices,ids[2]);
  center.copy(a).add(b).add(c).multiplyScalar(1/3);new Triangle(a,b,c).getNormal(normal);
  if(Math.abs(normal.getComponent(axis))<=.65)continue;
  if(original===g||faces.some(t=>t.closestPointToPoint(center,closest).distanceToSquared(center)<1e-10))for(const id of ids)values[id]=1;
 }
 return new Float32BufferAttribute(values,1);
}
