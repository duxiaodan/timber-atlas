import {BufferGeometry,Float32BufferAttribute} from 'three';
import type {Vec3} from './types';

export interface DouChannel { angle:number; width:number; offset?:number }
export interface DouProfile {
  channels:DouChannel[];
  /** Normalized ear top; raised seats retain the original physical ear height. */
  earTop?:number;
  /** Rise per metre in the part's own X/Z frame. */
  slope?:[number,number];
  slopeMode?:'whole'|'foot';
}
type Point=[number,number];
const EPS=1e-10;
function clip(poly:Point[],nx:number,nz:number,d:number):Point[]{
  const out:Point[]=[];
  for(let i=0;i<poly.length;i++){
    const a=poly[i],b=poly[(i+1)%poly.length],da=a[0]*nx+a[1]*nz-d,db=b[0]*nx+b[1]*nz-d;
    if(da>=-EPS)out.push(a);
    if((da>EPS&&db< -EPS)||(da< -EPS&&db>EPS)){const t=da/(da-db);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
  }
  return out.filter((p,i)=>Math.hypot(p[0]-out[(i+1)%out.length][0],p[1]-out[(i+1)%out.length][1])>EPS);
}
const key=(p:Point)=>p.map(v=>v.toFixed(9)).join(',');
/** A single closed wooden solid. Channel walls share edges with the bowl;
 * no overlapping ear boxes or internal coplanar caps are introduced. */
export function douProfileGeometry(size:Vec3,profile:DouProfile):BufferGeometry{
  let cells:Point[][]=[[[-.5,-.5],[.5,-.5],[.5,.5],[-.5,.5]]];
  const channels=profile.channels.map(c=>({nx:Math.sin(c.angle)*size[0],nz:Math.cos(c.angle)*size[2],half:c.width/2,offset:c.offset??0}));
  for(const c of channels)for(const d of [c.offset-c.half,c.offset+c.half]){
    cells=cells.flatMap(p=>[clip(p,c.nx,c.nz,d),clip(p,-c.nx,-c.nz,-d)]).filter(p=>p.length>=3);
  }
  const heights=cells.map(p=>{const x=p.reduce((s,q)=>s+q[0],0)/p.length,z=p.reduce((s,q)=>s+q[1],0)/p.length;return channels.some(c=>Math.abs(x*c.nx+z*c.nz-c.offset)<c.half+EPS)?.08:(profile.earTop??.44);});
  const edges=new Map<string,{a:Point;b:Point;heights:number[]}>(),vertices:number[]=[];
  const point=(p:Point,y:number,scale=1):Vec3=>{
    const x=p[0]*scale,z=p[1]*scale,slope=profile.slope??[0,0];
    const weight=profile.slopeMode==='whole'?1:Math.max(0,Math.min(1,(.08-y)/.56));
    return [x,y+(x*size[0]*slope[0]+z*size[2]*slope[1])/size[1]*weight,z];
  };
  const triangle=(a:Vec3,b:Vec3,c:Vec3)=>vertices.push(...a,...b,...c);
  const quad=(a:Vec3,b:Vec3,c:Vec3,d:Vec3)=>{triangle(a,c,b);triangle(a,d,c);};
  cells.forEach((poly,i)=>{
    const h=heights[i];
    for(let j=1;j<poly.length-1;j++)triangle(point(poly[0],h),point(poly[j+1],h),point(poly[j],h));
    for(let j=0;j<poly.length;j++){
      const a=poly[j],b=poly[(j+1)%poly.length],ak=key(a),bk=key(b),k=[ak,bk].sort().join('/');
      const e=edges.get(k);if(e)e.heights.push(h);else edges.set(k,{a,b,heights:[h]});
    }
  });
  // The straight band (dou-ping), taper (dou-qi), and sole have independent
  // levels. Their proportions remain reconstruction parameters, not survey data.
  const levels:[number,number][]=[[.08,1],[-.10,1],[-.40,.43/.70],[-.48,.43/.70]];
  for(const {a,b,heights:hs} of edges.values()){
    if(hs.length===2){if(Math.abs(hs[0]-hs[1])<EPS)continue;
      if(hs[0]>hs[1])quad(point(a,hs[0]),point(a,hs[1]),point(b,hs[1]),point(b,hs[0]));
      else quad(point(b,hs[1]),point(b,hs[0]),point(a,hs[0]),point(a,hs[1]));
    }else{
      if(hs[0]>.08)quad(point(a,hs[0]),point(a,.08),point(b,.08),point(b,hs[0]));
      for(let j=0;j<levels.length-1;j++){const [y,s]=levels[j],[ny,ns]=levels[j+1];quad(point(a,y,s),point(a,ny,ns),point(b,ny,ns),point(b,y,s));}
      triangle([0,-.48,0],point(a,-.48,.43/.70),point(b,-.48,.43/.70));
    }
  }
  const g=new BufferGeometry();g.setAttribute('position',new Float32BufferAttribute(vertices,3));
  const uv:number[]=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]+.5,vertices[i+2]+.5);
  g.setAttribute('uv',new Float32BufferAttribute(uv,2));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
