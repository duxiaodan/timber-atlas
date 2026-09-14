import {BufferGeometry,Float32BufferAttribute,Vector3} from 'three';
import type {Vec3} from './types';

// Photo-guided reconstruction. Hidden dimensions remain inferred; preserve the
// existing hip underside and the you-ang's inner crossing/long tail.
export const CORNER_VASE={width:.20,seatDrop:.22,cornerSlope:21/47/Math.SQRT2};

/** One closed eight-sided timber, including the stepped foot and upper seat. */
export function cornerVaseGeometry(size:Vec3,slope:number){
 // Height, radius: low plinth, short waist, paired collars, pear-shaped body,
 // long tapered neck and a small sloping bearing head. No hollow flower vase.
 const profile=[[-.5,.43],[-.465,.43],[-.42,.32],[-.36,.24],[-.31,.24],[-.29,.39],[-.255,.39],[-.235,.32],[-.21,.32],[-.19,.43],[-.155,.43],[-.12,.35],[-.07,.40],[.02,.43],[.13,.39],[.26,.29],[.36,.235],[.435,.23],[.45,.29],[.5,.29]];
 const rings=profile.map(([y,r])=>Array.from({length:8},(_,i)=>{const a=Math.PI/8+i*Math.PI/4,x=r*Math.cos(a),z=r*Math.sin(a);return new Vector3(x,y+Math.max(0,(y-.435)/.065)*slope*x*size[0]/size[1],z);}));
 const points:number[]=[];
 const tri=(a:Vector3,b:Vector3,c:Vector3)=>points.push(...a.toArray(),...b.toArray(),...c.toArray());
 for(let j=0;j<rings.length-1;j++)for(let i=0;i<8;i++){const k=(i+1)%8,a=rings[j][i],b=rings[j+1][i],c=rings[j+1][k],d=rings[j][k];tri(a,b,c);tri(a,c,d);}
 for(let i=0;i<8;i++){const k=(i+1)%8;tri(new Vector3(0,-.5,0),rings[0][i],rings[0][k]);tri(new Vector3(0,.5,0),rings.at(-1)![k],rings.at(-1)![i]);}
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));g.computeVertexNormals();return g;
}

/** Reshape only the exposed you-ang head, keeping every inner joint unchanged.
 * Split the source triangles at the transition boundaries before deforming so
 * long, sparse baked triangles cannot drag the inner joint or tail downward. */
export function vaseYouHeadGeometry(source:BufferGeometry,size:Vec3){
 const {cornerSlope:slope,seatDrop:drop}=CORNER_VASE,theta=Math.atan(slope),co=Math.cos(theta),si=Math.sin(theta),run=size[0]*co;
 const src=source.index?source.toNonIndexed():source.clone(),v=src.getAttribute('position');
 const flat=(i:number)=>{const x=v.getX(i)*size[0],y=v.getY(i)*size[1];return new Vector3(x*co-y*si+run/2,x*si+y*co+run*slope/2,v.getZ(i)*size[2]);};
 const clip=(poly:Vector3[],at:number,less:boolean)=>{const out:Vector3[]=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],ina=less?a.x<=at:a.x>=at,inb=less?b.x<=at:b.x>=at;if(ina)out.push(a);if(ina!==inb)out.push(a.clone().lerp(b,(at-a.x)/(b.x-a.x)));}return out;};
 const points:number[]=[];
 const put=(p:Vector3)=>{const weight=Math.max(0,Math.min(1,(.85-p.x)/.30)),dx=p.x-run/2,dy=p.y-run*slope/2-drop*weight;points.push((dx*co+dy*si)/size[0],(-dx*si+dy*co)/size[1],p.z/size[2]);};
 for(let i=0;i<v.count;i+=3){let polys=[[flat(i),flat(i+1),flat(i+2)]];for(const at of [.55,.85])polys=polys.flatMap(poly=>{if(poly.every(p=>p.x<=at)||poly.every(p=>p.x>=at))return [poly];return [clip(poly,at,true),clip(poly,at,false)];});for(const poly of polys)for(let k=1;k<poly.length-1;k++){put(poly[0]);put(poly[k]);put(poly[k+1]);}}
 src.dispose();const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(points,3));g.computeVertexNormals();return g;
}
