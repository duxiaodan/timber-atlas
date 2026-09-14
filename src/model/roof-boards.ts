import {Box3,BufferGeometry,Float32BufferAttribute,Vector3} from 'three';
import type {ShapeKind,Vec3} from './types';

/** Separate solid boards; adjacent rows share every edge vertex, including staggered joints. */
export function roofBoardPlacement(sections:Vec3[][],thickness=.04,eaves=false):{shape:ShapeKind;position:Vec3;size:Vec3}{
 const box=new Box3().setFromPoints(sections.flat().map(p=>new Vector3(...p)));box.min.y-=thickness;
 const center=box.getCenter(new Vector3()),size=box.getSize(new Vector3());
 const rows=sections.map(row=>row.map(p=>new Vector3(...p).sub(center).divide(size).toArray()));
 return {shape:`roofBoard:${JSON.stringify({thickness:thickness/size.y,rows,eaves})}`,position:center.toArray() as Vec3,size:size.toArray() as Vec3};
}
export function roofBoardGeometry(encoded:string,assembled=false):BufferGeometry{
 const data=JSON.parse(encoded) as {thickness:number;rows:Vec3[][];eaves:boolean},vertices:number[]=[];
 const rows=data.rows.map(row=>row.map(p=>new Vector3(...p)));
 const down=(p:Vector3)=>p.clone().add(new Vector3(0,-data.thickness,0));
 const triangle=(a:Vector3,b:Vector3,c:Vector3)=>{if(b.clone().sub(a).cross(c.clone().sub(a)).lengthSq()>1e-20)vertices.push(...a.toArray(),...b.toArray(),...c.toArray());};
 const quad=(a:Vector3,b:Vector3,c:Vector3,d:Vector3)=>{triangle(a,b,c);triangle(a,c,d);};
 for(let i=0;i<rows.length-1;i++){
  const a=rows[i],b=rows[i+1],polygon=[...a,...b.slice().reverse()],center=polygon.reduce((c,p)=>c.add(p),new Vector3()).divideScalar(polygon.length);
  // A fan explicitly retains collinear seam vertices. A two-triangle quad or
  // ear-clipped polygon can omit them and leave raster cracks at the next row's T joints.
  for(let k=0;k<polygon.length;k++){const p=polygon[k],q=polygon[(k+1)%polygon.length];triangle(center,p,q);triangle(down(center),down(q),down(p));}
  if(!assembled){quad(a[0],b[0],down(b[0]),down(a[0]));quad(b.at(-1)!,a.at(-1)!,down(a.at(-1)!),down(b.at(-1)!));}
 }
 const first=rows[0],last=rows.at(-1)!;
 if(!assembled)for(let i=0;i<first.length-1;i++)quad(first[i+1],first[i],down(first[i]),down(first[i+1]));
 if(!assembled||data.eaves)for(let i=0;i<last.length-1;i++)quad(last[i],last[i+1],down(last[i+1]),down(last[i]));
 const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));g.computeVertexNormals();return g;
}
