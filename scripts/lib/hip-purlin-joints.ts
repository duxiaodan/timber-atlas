import {createHash} from 'node:crypto';
import {BoxGeometry,BufferGeometry,BufferGeometryLoader,Euler,ExtrudeGeometry,Matrix4,Quaternion,Shape,Vector3} from 'three';
import {Brush,Evaluator,INTERSECTION,SUBTRACTION} from 'three-bvh-csg';
import {geometry} from '../../src/model/geometry';
import {roofY} from '../../src/model/catalog';
import type {Catalog,Part} from '../../src/model/types';

/** Inferred open saddles on the actual shared purlins, not display copies. */
export function buildHipPurlinJoints(catalog:Catalog,assignments:Record<string,string>,meshes:Record<string,unknown>,supports:Record<string,string[]>,components:(g:BufferGeometry)=>number){
 const evaluator=new Evaluator();evaluator.useGroups=false;evaluator.attributes=['position','normal'];
 const matrix=(p:Part)=>new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));
 const brush=(g:BufferGeometry)=>{const b=new Brush(g);b.updateMatrixWorld();return b;};
 const world=(p:Part)=>brush((assignments[p.id]?new BufferGeometryLoader().parse(meshes[assignments[p.id]] as any):geometry(p.shape,p.size).clone()).applyMatrix4(matrix(p)));
 const axis=(p:Part)=>new Vector3(1,0,0).applyEuler(new Euler(...p.rotation));
 const prism=(p:Part,y:number,sign:number)=>{
  const direction=axis(p),horizontal=Math.hypot(direction.x,direction.z);
  // Horizontal projection includes the sloping end cap, so a saddle mouth
  // remains open vertically throughout the entire actual timber footprint.
  const length=p.size[0]*horizontal+p.size[1]*Math.abs(direction.y);
  return brush(new BoxGeometry(length,30,p.size[2]).rotateY(Math.atan2(-direction.z,direction.x)).translate(p.position[0],y+sign*15,p.position[2]));
 };
 const cut=(b:Brush,cutter:Brush,id:string)=>{
  const next=evaluator.evaluate(b,cutter,SUBTRACTION);cutter.geometry.dispose();
  if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Purlin saddle splits ${id}`);
  next.updateMatrixWorld();b.geometry.dispose();return next;
 };
 const store=(p:Part,b:Brush)=>{
  const g=b.geometry.applyMatrix4(matrix(p).invert()),data=g.toJSON();
  for(const attr of Object.values(data.data.attributes) as {array:number[]}[])attr.array=attr.array.map(v=>Math.round(v*1e6)/1e6);
  const key=createHash('sha256').update(JSON.stringify(data.data)).digest('hex').slice(0,16);assignments[p.id]=key;meshes[key]=data;g.dispose();
 };
 for(const hip of catalog.parts.filter(p=>p.id.startsWith('hip-main-'))){
  let timber=world(hip);
  const purlins=hip.requires.map(id=>catalog.parts.find(p=>p.id===id)!).filter(p=>p&&p.id.startsWith('purlin-'));
  const levels=[...new Set(purlins.map(p=>p.position[1]))];
  for(const y of levels){
   const pair=purlins.filter(p=>p.position[1]===y).sort((a,b)=>Math.abs(axis(b).x)-Math.abs(axis(a).x));
   if(pair.length!==2)throw new Error(`Expected two corner purlins at ${hip.id}/${y}`);
   const [p,q]=pair;let lower=world(p),upper=world(q);
   // X timber keeps the lower half of the end crossing; Z keeps the upper.
   // Each remains one complete purlin. The retained end halves bear directly.
   lower=cut(lower,prism(q,y,1),p.id);upper=cut(upper,prism(p,y,-1),q.id);
   supports[q.id]=[...new Set([...supports[q.id]??[],p.id])];
   for(const [part,body] of [[p,lower],[q,upper]] as const){
    const interfaceY=y+part.size[1]/2-.04;
    // A 40mm top dressing gives a finite bearing patch on the round purlin.
    // The matching hip saddle opens downwards along its insertion direction.
    let dressed=cut(body,prism(hip,interfaceY,1),part.id);
    if(part.kind==='下平槫'){
      const sx=Math.sign(hip.position[0]),sz=Math.sign(hip.position[2]),seat=catalog.parts.find(p=>p.id===`lower-seat-milk-${sx<0?0:7}-${sz<0?0:4}`)!;
      dressed=cut(dressed,prism(seat,seat.position[1]+seat.size[1]/2,-1),part.id);
    }
    const cutter=prism(part,interfaceY,-1),intersection=evaluator.evaluate(timber,cutter,INTERSECTION);
    const intersects=intersection.geometry.getAttribute('position').count>0;intersection.geometry.dispose();
    if(intersects)timber=cut(timber,cutter,hip.id);else cutter.geometry.dispose();
    store(part,dressed);
   }
  }
  // Dress the upper arrises to the two real adjacent roof planes. At the
  // middle node an undressed rectangle projects through the boarding.
  // These are top bevels on the same timber, not detached cover pieces.
  for(const g of hipRoofCutters(hip))timber=cut(timber,brush(g),hip.id);
  store(hip,timber);
 }
}

/** Upper dressing planes shared with open rafter-seat cutters. */
export function hipRoofCutters(hip:Part):BufferGeometry[]{
 const result:BufferGeometry[]=[];
 for(const component of ['x','z'] as const){
   const sign=Math.sign(hip.position[component==='x'?0:2]),shape=new Shape(),top=roofY(4.41)+.13,pitch=(roofY(4.41)-roofY(2.205))/2.205;
   // One extruded profile avoids coincident partition faces at the change of
   // roof pitch. All coordinates are the actual two-plane roof envelope.
   shape.moveTo(2,top+pitch*(2-4.41));shape.lineTo(4.41,top);shape.lineTo(13,top-.375*(13-4.41));shape.lineTo(13,30);shape.lineTo(2,30);shape.closePath();
   const g=new ExtrudeGeometry(shape,{depth:60,steps:1,bevelEnabled:false}).translate(0,0,-30);
   g.rotateY(component==='x'?(sign>0?0:Math.PI):(sign>0?-Math.PI/2:Math.PI/2));if(component==='x')g.translate(sign*8.19,0,0);
   result.push(g);
  }
 return result;
}
