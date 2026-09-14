import {BufferGeometry,Float32BufferAttribute} from 'three';
import type {Vec3} from './types';

/** A single round timber with a mitred tail and a rapidly dressed square eaves head.
 * The 150mm stock follows Liang; head length/width and mitre clearance are inferred.
 * Local +X is always the eaves end. No extra flying-rafter object is introduced.
 */
export function roofRafterGeometry(size:Vec3,eaves:boolean,tailY:number,tailZ:number,headY=tailY):BufferGeometry {
 const points:number[]=[],indices:number[]=[],sides=16;
 const taper=Math.min(.28/size[0],.32),rings=eaves?[-.5,.5-taper,.5-.04/size[0],.5]:[-.5,.5];
 // Sample the hip ellipse from its principal axis on the shared cut plane.
 // Independent cylinder phases otherwise leave alternating polygon teeth
 // even when the two circular sections and their centres agree exactly.
 const phase=Math.abs(tailZ)>1e-10?Math.atan2(tailZ/size[2],tailY/size[1]):0;
 const step=2*Math.PI/sides,tailPhase=phase-Math.round(phase/step)*step;
 for(let ring=0;ring<rings.length;ring++)for(let i=0;i<sides;i++){
  const a=2*Math.PI*i/sides+(ring===0?tailPhase:0),y=Math.cos(a)*.5,z=Math.sin(a)*.5;
  const square=eaves&&ring>=2,scale=square?.31/Math.max(Math.abs(y),Math.abs(z)):1;
  points.push(rings[ring]+(ring===0?tailY*y+tailZ*z:ring===rings.length-1?headY*y*scale:0),y*scale,z*scale);
 }
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<sides;i++){
  const a=r*sides+i,b=r*sides+(i+1)%sides,c=b+sides,d=a+sides;
  indices.push(a,b,d,b,c,d);
 }
 for(let i=1;i<sides-1;i++){indices.push(0,i+1,i);const start=(rings.length-1)*sides;indices.push(start,start+i,start+i+1);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return g;
}
