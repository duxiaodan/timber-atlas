import {Vector3} from 'three';
import type {Vec3} from './types';

/** Offset straight roof segments by the round stock radius, intersect their
 * centre lines at pitch changes, and cut both members on one angle bisector.
 * The original bearing lines remain fixed; a joint does not lift a whole span.
 */
export function seatedRafterChain(points:Vec3[],radius:number){
 const raw=points.map(p=>new Vector3(...p));
 const axes=raw.slice(1).map((p,i)=>p.clone().sub(raw[i]).normalize());
 const slopes=axes.map(a=>a.y/Math.hypot(a.x,a.z));
 const lifts=slopes.map(s=>radius*Math.sqrt(1+s*s));
 const nodes=raw.map((p,i)=>{
  if(i===0)return p.clone().add(new Vector3(0,lifts[0],0));
  if(i===raw.length-1)return p.clone().add(new Vector3(0,lifts.at(-1)!,0));
  const delta=slopes[i-1]-slopes[i];
  const shift=Math.abs(delta)<1e-10?0:(lifts[i]-lifts[i-1])/delta;
  const horizontal=axes[i].clone().setY(0).normalize();
  return p.clone().addScaledVector(horizontal,shift).add(new Vector3(0,lifts[i-1]+slopes[i-1]*shift,0));
 });
 const normals=nodes.map((_,i)=>i===0?axes[0].clone().setY(0).normalize():i===nodes.length-1?axes.at(-1)!.clone().setY(0).normalize():axes[i-1].clone().add(axes[i]).normalize());
 return {nodes,normals};
}
