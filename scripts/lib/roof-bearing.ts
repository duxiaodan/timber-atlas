import {BufferGeometry,DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
/** Finite, downward-facing seat area on the lower timber's actual top surface. */
export function roofBearingArea(upper:BufferGeometry,lower:BufferGeometry):number{
 const material=new MeshBasicMaterial({side:DoubleSide}),mesh=new Mesh(lower,material),ray=new Raycaster(),v=upper.getAttribute('position');mesh.updateMatrixWorld();let area=0;
 for(let i=0;i<(upper.index?.count??v.count);i+=3){
  const [a,b,c]=[0,1,2].map(k=>new Vector3().fromBufferAttribute(v,upper.index?upper.index.getX(i+k):i+k)),n=b.clone().sub(a).cross(c.clone().sub(a));
  if(n.y>=-.05*n.length())continue;
  const center=a.add(b).add(c).multiplyScalar(1/3);ray.set(new Vector3(center.x,30,center.z),new Vector3(0,-1,0));
  const hit=ray.intersectObject(mesh)[0];if(hit&&Math.abs(hit.point.y-center.y)<1e-5)area+=n.length()/2;
 }
 material.dispose();return area;
}
