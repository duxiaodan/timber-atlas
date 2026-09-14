import {DoubleSide,Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {geometry} from './geometry';
import {roofBoardPlacement} from './roof-boards';
import type {Input} from './catalog';
import type {Part,Vec3} from './types';

// Straight rectangular boundaries tied to the existing radial frame endpoints.
export const LOW_CEILING_X=[-16.023,-13.587,-7.56,-2.52,2.52,7.56,13.587,16.023];
export const LOW_CEILING_Z=[-7.833,-5.397,0,5.397,7.833];
const evidence={sources:['liang1937'],basis:'梁调查第三节平闇与外檐、内槽柱头剖详：峻脚从平棊枋向柱头枋下收，上施遮椽板。',inferred:'矩形边界沿现有径向枋端点；椽距约300mm并避让柱头刻口、80至100mm椽高、端部承口及角部拼板为规则化推定，未作逐件实测。'};

/** Separate rafters with horizontal bearing seats, and individual sloping cover boards. */
export function buildCeilingCoves(parts:Part[],add:(p:Input)=>Part,y:number){
 const material=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster(),meshes=new Map<string,Mesh>();
 const heads=parts.filter(p=>/^第3层柱头枋/.test(p.kind)&&!p.id.startsWith('ceiling-arm-'));
 const rims=parts.filter(p=>p.id.startsWith('ceiling-rim-')||p.kind==='低平闇径向平棊枋');
 function surface(p:Part,x:number,z:number){
  let m=meshes.get(p.id);if(!m){m=new Mesh(geometry(p.shape,p.size),material);m.position.set(...p.position);m.rotation.set(...p.rotation);m.scale.set(...p.size);m.updateMatrixWorld();meshes.set(p.id,m);}
  ray.set(new Vector3(x,20,z),new Vector3(0,-1,0));return ray.intersectObject(m)[0]?.point.y;
 }
 for(const [ring,hx,hz,lx,lz] of [['outer',16.023,7.833,17.01,8.82],['inner',13.587,5.397,12.6,4.41]] as const){
  for(const axis of [0,2] as const)for(const sign of [-1,1]){
   const cross=axis===0?2:0,upper=axis===0?hx:hz,lower=axis===0?lx:lz,span=axis===0?hz:hx,lowerSpan=axis===0?lz:lx;
   const direction=sign*Math.sign(lower-upper),half=Math.min(span,lowerSpan)-.16,count=Math.ceil(2*half/.3),pitch=2*half/count;
   const rafters:Part[]=[],stations:number[]=[];
   const lowerY=7.62+.1575;
   function seated(pool:Part[],point:Vec3,dir:number,upperEnd:boolean,height:number){
    const candidates=pool.filter(p=>Math.hypot(p.position[0]-point[0],p.position[2]-point[2])<p.size[0]/2+.3),ids=new Set<string>();
    for(const run of [.012,.025])for(const transverse of [-.03,0,.03]){
     const v=[...point];v[axis]+=dir*(upperEnd?run:-run);v[cross]+=transverse;
     const hits=candidates.filter(p=>{const h=surface(p,v[0],v[2]);return h!==undefined&&Math.abs(h-height)<2e-6;});
     if(!hits.length)return [];hits.forEach(p=>ids.add(p.id));
    }
    return [...ids];
   }
   for(let n=0;n<=count;n++){
    const u=-half+n*pitch,a:Vec3=[0,y+.08,0],b:Vec3=[0,lowerY,0];
    a[axis]=sign*upper+direction*.002;a[cross]=u;b[axis]=sign*lower-direction*.065;b[cross]=u;
    // Keep opposite sides balanced, omitting positions occupied by headfang relief/cutouts.
    let usable=true;
    for(const mirror of [-1,1])for(const crossMirror of [-1,1]){
     const ma=[...a] as Vec3,mb=[...b] as Vec3;ma[axis]*=mirror;mb[axis]*=mirror;ma[cross]*=crossMirror;mb[cross]*=crossMirror;
     if(parts.some(q=>q.kind==='柱头枋下散斗'&&Math.abs(q.position[axis]-mb[axis])<.17&&Math.abs(q.position[cross]-mb[cross])<.197&&q.position[1]-q.size[1]/2<lowerY+.08&&q.position[1]+q.size[1]/2>lowerY))usable=false;
     if(!seated(rims,ma,direction*mirror,true,y+.08).length||!seated(heads,mb,direction*mirror,false,lowerY).length)usable=false;
    }
    if(!usable)continue;
    const upperIds=seated(rims,a,direction,true,y+.08),lowerIds=seated(heads,b,direction,false,lowerY);
    const length=Math.abs(b[axis]-a[axis]),rise=a[1]-b[1],height=rise+.1;
    // The upper 78mm and lower 40mm are level seats. No beam corner pokes through either support.
    const profile=[[-.5,.5],[-.5+.078/length,.5],[.5-.04/length,-.5+.08/height],[.5,-.5+.08/height],[.5,-.5],[.5-.04/length,-.5],[-.5+.078/length,-.5+rise/height],[-.5,-.5+rise/height]];
    const p=add({id:`jun-cove-${ring}-${axis}-${sign}-${n}`,name:'峻脚椽',kind:'峻脚椽',assembly:'ceiling',layer:'boards',shape:`junCove:${JSON.stringify(profile)}`,material:'wood',position:[(a[0]+b[0])/2,(a[1]+.1+b[1])/2,(a[2]+b[2])/2],size:[length,height,.1],rotation:[0,axis===0?(direction>0?0:Math.PI):(direction>0?-Math.PI/2:Math.PI/2),0],stage:28,requires:[...upperIds,...lowerIds],role:'沿低平闇内外边界下收至相应柱头枋；两端留水平承口，按实际承面逐根定位。',evidence});rafters.push(p);stations.push(u);
   }
   // Each board bridges two neighbouring rafters. End boards meet the diagonal corner seam.
   for(let n=0;n<rafters.length-1;n++){
    const lo=stations[n],hi=stations[n+1],sections:Vec3[][]=[];
    const run=Math.abs(lower-upper);
    const end=run-.15,endTop=y+.22+(7.62+.1575+.12-y-.22)*(end-.08)/(run-.105-.08);
    for(const [distance,top] of [[0,y+.22],[.08,y+.22],[end,endTop]]){
     const t=distance/run,extent=span+(lowerSpan-span)*t,coord=upper+Math.sign(lower-upper)*distance;
     const u0=n===0?-extent:lo,u1=n===rafters.length-2?extent:hi;
     sections.push([u0+.001,u1-.001].map(u=>{const p:Vec3=[0,top,0];p[axis]=sign*coord;p[cross]=u;return p;}));
    }
    const edge=new Vector3(...sections[0][1]).sub(new Vector3(...sections[0][0])),across=new Vector3(...sections[1][0]).sub(new Vector3(...sections[0][0]));
    if(edge.cross(across).y<0)sections.forEach(row=>row.reverse());
    const placement=roofBoardPlacement(sections,.04);
    add({id:`ceiling-cove-cover-${ring}-${axis}-${sign}-${n}`,name:'峻脚遮椽板',kind:'峻脚遮椽板',assembly:'ceiling',layer:'boards',...placement,shape:placement.shape.replace('roofBoard:','coveBoard:') as `coveBoard:${string}`,material:'wood',stage:29,requires:[rafters[n].id,rafters[n+1].id],role:'分块覆于峻脚椽上，随斜带在转角收缝；板幅、拼缝及隐面做法为推定。',evidence});
   }
  }
 }
 material.dispose();
}
