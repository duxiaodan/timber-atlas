import {createHash} from 'node:crypto';
import {Box3,BoxGeometry,BufferGeometry,BufferGeometryLoader,Euler,Matrix4,Quaternion,Vector3} from 'three';
import {Brush,Evaluator,INTERSECTION,SUBTRACTION} from 'three-bvh-csg';
import {geometry} from '../../src/model/geometry';
import type {Catalog,Part} from '../../src/model/types';

/** Full end-bay timbers with explicitly inferred open seats and locating steps. */
export function buildEndFrameJoints(catalog:Catalog,assignments:Record<string,string>,meshes:Record<string,unknown>,supports:Record<string,string[]>,components:(g:BufferGeometry)=>number){
 const evaluator=new Evaluator();evaluator.useGroups=false;evaluator.attributes=['position','normal'];
 const parts=new Map(catalog.parts.map(p=>[p.id,p])),live=new Map<string,Brush>();
 const get=(id:string)=>{const p=parts.get(id);if(!p)throw new Error(`Missing end-frame member ${id}`);return p;};
 const matrix=(p:Part)=>new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));
 const brush=(g:BufferGeometry)=>{const b=new Brush(g);b.updateMatrixWorld();return b;};
 const world=(p:Part)=>{let b=live.get(p.id);if(!b){b=brush((assignments[p.id]?new BufferGeometryLoader().parse(meshes[assignments[p.id]] as any):geometry(p.shape,p.size).clone()).applyMatrix4(matrix(p)));live.set(p.id,b);}return b;};
 const box=(x:number,z:number,w:number,d:number,y:number,sign:number)=>brush(new BoxGeometry(w,30,d).translate(x,y+sign*15,z));
 const axis=(p:Part)=>new Vector3(1,0,0).applyEuler(new Euler(...p.rotation));
 const slope=(p:Part)=>{const v=axis(p),h=v.x*v.x+v.z*v.z;return {x:v.x*v.y/h,z:v.z*v.y/h,h:Math.sqrt(h)};};
 const tilt=(b:Brush,p:Part)=>{const s=slope(p),v=b.geometry.getAttribute('position');for(let i=0;i<v.count;i++)v.setY(i,v.getY(i)+(v.getX(i)-p.position[0])*s.x+(v.getZ(i)-p.position[2])*s.z);b.geometry.computeVertexNormals();return b;};
 const copy=(p:Part)=>brush(world(p).geometry.clone());
 const cut=(p:Part,cutter:Brush,label:string)=>{
  const previous=world(p),next=evaluator.evaluate(previous,cutter,SUBTRACTION);cutter.geometry.dispose();
  if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`End-frame cut splits ${p.id}: ${label}`);
  next.updateMatrixWorld();previous.geometry.dispose();live.set(p.id,next);
 };
 const require=(p:Part,q:Part)=>supports[p.id]=[...new Set([...supports[p.id]??[],q.id])];
 for(const sign of [-1,1]){
  const frame=sign<0?2:5,grass=get(`grass-four-${frame}`),tai=get(`taiping-${sign}`);
  for(const j of [0,1,2]){
   const ding=get(`ding-${sign}-${j}`),z=ding.position[2],s=slope(ding),rawTop=ding.position[1]+ding.size[1]/(2*s.h),pad=get(`taiping-pad-${sign}-${j}`);
   const stack=ding.requires.map(get).find(p=>p.id.startsWith('ding-seat-'))!;
   // Each end retains a finite seat on its original support.
   cut(ding,box(stack.position[0],z,stack.size[0],stack.size[2],stack.position[1]+stack.size[1]/2,-1),'outer stack seat');
   cut(ding,copy(grass),'inner grass seat');
   if(j!==1){
    const dun=get(`dun-${frame}-${j===0?-1:1}`),v=axis(ding),length=ding.size[0]*s.h+ding.size[1]*Math.abs(v.y)+.004;
    const opening=brush(new BoxGeometry(length,30,ding.size[2]+.002).rotateY(Math.atan2(-v.z,v.x)).translate(ding.position[0],rawTop-15,z));
    cut(dun,tilt(opening,ding),'outward-open ding shoulder');require(dun,ding);
   }
   // Leave a 20mm uphill-facing shoulder at the downhill end of the pad.
   // The matching pad underside prevents sliding along the inclined ding.
   const centre=Math.abs(pad.position[0]),lo=centre-pad.size[0]/2-.002,hi=centre+.15;
   cut(ding,tilt(box(sign*(lo+hi)/2,z,hi-lo,ding.size[2]+.002,rawTop-.02,1),ding),'pad locating step');
   cut(pad,copy(ding),'inclined bottom and locating shoulder');
   const seat=get(`end-upper-seat-${sign}-${j}`),plane=seat.position[1]-seat.size[1]/2;
   for(const branch of [-1,1]){
    const p=get(`end-upper-brace-${sign}-${j}-${branch}`);
    const cap=tilt(box(ding.position[0],z,20,2,rawTop+.002,-1),ding),foot=evaluator.evaluate(world(p),cap,INTERSECTION);
    foot.geometry.computeBoundingBox();const bounds=foot.geometry.boundingBox!;
    const mouth=tilt(box((bounds.min.x+bounds.max.x)/2,z,bounds.max.x-bounds.min.x+.004,p.size[2]+.004,rawTop-.02,1),ding);
    cut(ding,mouth,'brace locating foot pocket');
    cut(p,tilt(box(ding.position[0],z,20,2,rawTop-.02,-1),ding),'inclined lower seat');
    cap.geometry.dispose();foot.geometry.dispose();
    cut(p,box(p.position[0],z,4,1,plane,1),'horizontal upper shoulder');
    cut(p,brush(new BoxGeometry(30,40,2).translate(sign*(Math.abs(seat.position[0])-branch*15+branch*.001),15,z)),'separate paired heads');
   }
   for(const p of catalog.parts.filter(p=>p.id.startsWith('purlin-')&&p.requires.includes(ding.id)))cut(ding,copy(p),'real middle-purlin cradle');
  }
  // At each upper hip corner, the two actual purlins meet in an open half-lap.
  // The lower hip baker already handles levels 4.41m and below.
  for(const zsign of [-1,1]){
   const z=zsign*2.205,x=sign*10.395;
   const pair=catalog.parts.filter(p=>p.id.startsWith('purlin-')&&Math.abs(p.position[1]-(get(`end-upper-seat-${sign}-${zsign<0?0:2}`).position[1]+.195))<.001&&new Box3().setFromObject(world(p)).expandByScalar(.001).containsPoint(new Vector3(x,p.position[1],z)));
   const lower=pair.find(p=>Math.abs(axis(p).x)>.9),upper=pair.find(p=>Math.abs(axis(p).z)>.9);
   if(!lower||!upper)throw new Error(`Missing upper corner purlins ${sign}/${zsign}`);
   cut(lower,box(x,z,.302,upper.size[0]+.002,lower.position[1],1),'upper corner lower half');
   cut(upper,box(lower.position[0],z,lower.size[0]+.002,.302,upper.position[1],-1),'upper corner upper half');require(upper,lower);
  }
  const forks=[get(`end-fork-${sign}--1`),get(`end-fork-${sign}-1`)],seat=get(`end-ridge-seat-${sign}`),top=seat.position[1]-seat.size[1]/2,foot=tai.position[1]+tai.size[1]/2-.05;
  for(const [i,p] of forks.entries()){
   const direction=i===0?-1:1,v=axis(p),s=Math.abs(v.y/v.z),h=p.size[1]/Math.abs(v.z),inner=.86-h/(2*s)-.002,outer=.99+p.size[1]*Math.abs(v.y)/2+.002;
   cut(tai,box(tai.position[0],direction*(inner+outer)/2,p.size[2]+.002,outer-inner,foot,1),'fork foot mouth');
   cut(p,box(p.position[0],0,1,4,foot,-1),'horizontal foot');
  }
  const a=new Box3().setFromObject(world(forks[0])),b=new Box3().setFromObject(world(forks[1])),lo=Math.max(a.min.z,b.min.z),hi=Math.min(a.max.z,b.max.z),middle=top-.22;
  cut(forks[0],box(tai.position[0],(lo+hi)/2,.244,hi-lo+.004,middle,1),'lower fork crossing');
  cut(forks[1],box(tai.position[0],(lo+hi)/2,.244,hi-lo+.004,middle,-1),'upper fork crossing');require(forks[1],forks[0]);
  for(const p of forks)cut(p,box(p.position[0],0,1,4,top,1),'ridge seat platform');
 }
 for(const p of catalog.parts.filter(p=>p.id.startsWith('purlin-')))for(const id of p.requires.filter(id=>/^(end-upper-seat-|end-ridge-seat-|taiping-)/.test(id))){
  const seat=get(id),width=seat.id.startsWith('taiping-')?seat.size[2]:seat.size[0],depth=seat.id.startsWith('taiping-')?seat.size[0]:seat.size[2];
  cut(p,box(seat.position[0],seat.position[2],width,depth,seat.position[1]+seat.size[1]/2,-1),`flat seat ${id}`);
 }
 for(const [id,b] of live){
  const p=get(id),g=b.geometry.applyMatrix4(matrix(p).invert()),data=g.toJSON();
  for(const attr of Object.values(data.data.attributes) as {array:number[]}[])attr.array=attr.array.map(v=>Math.round(v*1e6)/1e6);
  const key=createHash('sha256').update(JSON.stringify(data.data)).digest('hex').slice(0,16);assignments[id]=key;meshes[key]=data;g.dispose();
 }
}
