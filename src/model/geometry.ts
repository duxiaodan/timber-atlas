import douFittings from './dou-fittings.json';
import {douProfileGeometry} from './dou-profile';
import {getDouProfile} from './dou-installation';
import {roofBoardGeometry} from './roof-boards';
import * as THREE from 'three';
import {cornerVaseGeometry,vaseYouHeadGeometry} from './corner-vase';
import {roofBeastGeometry} from './roof-beasts';
import {roofRafterGeometry} from './roof-members';
import {solidFrontPlaqueGeometry} from './front-plaque-solid';
import {frontPlaqueGeometry,legacyFlatFrontPlaqueGeometry,plaqueMountGeometry} from './front-plaque';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { ShapeKind, Vec3 } from './types';
import { firePearlGeometry, statueGeometry } from './sculpture';
import jointGeometry from './joint-geometry.json';
import bracketJoints from './bracket-joints.json';
import { ridgeFinialGeometry } from './finial';
import { seatedAngGeometry } from './ang-geometry';
import {HEADFANG_SPLICE} from './headfang-splices';
import { LOW_CEILING } from './low-ceiling-levels';
import wallJoints from './wall-joints.json';
import roofJoints from './roof-joints.json';
import rafterBoardCuts from './rafter-board-cuts.json';

const cache = new Map<string,THREE.BufferGeometry>();
/** Register an individually identified, normalized Blender export after loading. */
export function registerSculptureGeometry(id:string,g:THREE.BufferGeometry):`sculpture:${string}` {
  const key=`sculpture:${id}` as const;
  g.computeBoundingBox();g.computeBoundingSphere();cache.set(key,g);return key;
}
export function geometryKey(kind:ShapeKind,size:Vec3=[1,1,1]):string {
  if(kind.startsWith('douProfile:'))return `${kind}:${size.join(':')}`;
  if(kind.startsWith('stairNotch:'))return `${kind}:${size.join(':')}`;
  if(kind.startsWith('vaseYou:'))return `${kind}:${size.join(':')}`;
  if(kind.startsWith('roofRafter:'))return `${kind}:${size.map(v=>v.toFixed(6)).join(':')}`;
  if(kind.startsWith('plaqueMount:'))return `${kind}:${size.join(':')}`;
  if(kind.startsWith('ceilingArm:')||kind.startsWith('gongBearing:')||kind.startsWith('humpArm:')||kind.startsWith('humpWing:')||kind.startsWith('cornerFang:')||kind.startsWith('seatedAng:')||kind.startsWith('cornerFootDou:')||kind.startsWith('bearingVase:'))return `${kind}:${size.map(v=>v.toFixed(6)).join(':')}`;
  if(kind==='dou'||kind.startsWith('openDou:'))return `${kind}:${size[0].toFixed(5)}:${size[2].toFixed(5)}`;
  if(kind==='column'||kind.startsWith('rootDou:')||kind.startsWith('rootDouMud:'))return `${kind}:${size.map(v=>v.toFixed(5)).join(':')}`;
  if(kind==='ceilingRail'||kind==='ceilingSpan'||kind==='sofang'||kind==='sofangSeated'||kind==='fangSpan'||kind==='splicedFangSpan'||kind==='rearShort')return `${kind}:${size[0].toFixed(5)}`;
  if(kind==='slopeDou'||kind==='slopeFootDou')return `${kind}:${size.map(v=>v.toFixed(5)).join(':')}`;
  if(kind==='ang'||kind==='gong'||kind==='gongSolid'||kind==='gongSolidEndSeats'||kind==='gongUpper'||kind==='gongEndSeats'||kind==='gongUpperEndSeats'||kind==='fangNode'||kind==='fangNodeSeated'||kind.startsWith('rootArm:')||kind.startsWith('bracketHead:'))return `${kind}:${size[0].toFixed(5)}`;
  if(kind==='latticeTop'||kind==='latticeBottom')return `${kind}:${size[0].toFixed(5)}`;
  return kind;
}
function combine(geos:THREE.BufferGeometry[]):THREE.BufferGeometry {
  const normalised=geos.map(g=>g.index?g.toNonIndexed():g);
  const merged=mergeGeometries(normalised,false);
  if(!merged)throw new Error('无法生成构件几何');
  geos.forEach(g=>g.dispose());normalised.forEach(g=>g.dispose());
  return merged;
}
function block(x:number,y:number,z:number,px=0,py=0,pz=0) {return new THREE.BoxGeometry(x,y,z).translate(px,py,pz);}
function profileShape(points:number[][],depth=1) {
  const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,steps:1,curveSegments:10}).translate(0,0,-depth/2);
}
function curvedTile(cover:boolean) {
  const shape=new THREE.Shape();const segments=12;
  const outer:(number[])[]=[];const inner:(number[])[]=[];
  for(let i=0;i<=segments;i++) {
    const x=-.5+i/segments,y=cover?Math.sqrt(Math.max(0,1-4*x*x))*.65:(4*x*x-.5)*.35;
    outer.push([x,y]);inner.unshift([x,y-.12]);
  }
  [...outer,...inner].forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
  return new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,steps:1}).translate(0,0,-.5);
}

function gongGeometry(size:Vec3,bottom:boolean,offsetMetres=0,endSeats=false,notch=true,sole?:[number,number]){
  const offset=offsetMetres/size[0],half=.1075/size[0];
      const s=new THREE.Shape();s.moveTo(-.5,.42);
      s.lineTo(-.39,.5);s.lineTo(-.34,.5);s.lineTo(-.34,.24);s.lineTo(-.22,.24);s.lineTo(-.22,.5);
      if(!bottom&&notch){s.lineTo(offset-half,.5);s.lineTo(offset-half,-.02);s.lineTo(offset+half,-.02);s.lineTo(offset+half,.5);}
      s.lineTo(.22,.5);s.lineTo(.22,.24);s.lineTo(.34,.24);s.lineTo(.34,.5);s.lineTo(.39,.5);s.lineTo(.5,.42);
      s.lineTo(.48,.15);s.bezierCurveTo(.44,-.14,.37,-.27,.28,-.30);s.lineTo(.18,-.30);s.lineTo(.14,-.5);if(bottom&&notch){s.lineTo(offset+half,-.5);s.lineTo(offset+half,-.01);s.lineTo(offset-half,-.01);s.lineTo(offset-half,-.5);}s.lineTo(-.14,-.5);s.lineTo(-.18,-.30);s.lineTo(-.28,-.30);s.bezierCurveTo(-.37,-.27,-.44,-.14,-.48,.15);s.closePath();
  if(sole){
    const lo=(sole[0]-sole[1]/2)/size[0],hi=(sole[0]+sole[1]/2)/size[0],points=s.getPoints(30),out:number[][]=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],ts=[0,1];
      for(const x of [lo,hi])if((a.x-x)*(b.x-x)<0)ts.push((x-a.x)/(b.x-a.x));
      if((a.y+.30)*(b.y+.30)<0)ts.push((-.30-a.y)/(b.y-a.y));ts.sort((a,b)=>a-b);
      for(let k=0;k<ts.length-1;k++){
        const middle=a.x+(b.x-a.x)*(ts[k]+ts[k+1])/2,trim=middle>=lo&&middle<=hi;
        for(const t of [ts[k],ts[k+1]]){const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;out.push([x,trim?Math.max(y,-.30):y]);}
      }
    }
    return profileShape(out);
  }
  if(endSeats){
    const limit=.5-(.13+.145)/size[0],seat=(.23-.19*.48)/.315;
    // Trim the top outline while leaving the carved underside and central crossing slot.
    const points=s.getPoints(30),out:number[][]=[];
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      const ts=[0,1];for(const x of [-limit,limit])if((a.x-x)*(b.x-x)<0)ts.push((x-a.x)/(b.x-a.x));
      if((a.y-seat)*(b.y-seat)<0)ts.push((seat-a.y)/(b.y-a.y));
      ts.sort((a,b)=>a-b);
      for(let k=0;k<ts.length-1;k++){
        const t0=ts[k],t1=ts[k+1],trim=Math.abs(a.x+(b.x-a.x)*(t0+t1)/2)>=limit;
        for(const t of [t0,t1]){const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;out.push([x,trim?Math.min(y,seat):y]);}
      }
    }
    return profileShape(out);
  }
  return new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false,steps:1,curveSegments:10}).translate(0,0,-.5);
}

function fangProfile(length:number,seated=false){
      const edges=[[0,-.5],[.30,-.5],[.37,-.32],[.44,-.12],[.5,-.02]],at=(x:number)=>{const i=edges.findIndex(p=>p[0]>=x);if(i<=0)return -.5;const a=edges[i-1],b=edges[i];return a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]);};
      const center=.5315/length,start=(.5315-.145)/length,end=Math.min(.5,(.5315+.145)/length);
      const plane=at(seated?end:Math.min(.5,center)),xs=[...new Set([...edges.map(p=>p[0]),start,Math.min(.5,center),end])].filter(x=>x>=0&&x<=.5).sort((a,b)=>a-b),side:number[][]=[];
      for(const x of xs){const y=at(x);if(x===start)side.push([x,y]);side.push([x,x>=start&&x<=end?Math.max(y,plane):y]);if(x===end)side.push([x,y]);}
  return [[-.5,.5],[.5,.5],...side.slice().reverse(),...side.slice(1).map(([x,y])=>[-x,y])];
}
function rootDouGeometry(size:Vec3,tenonWidth:number,diagonal=0,mudStraight=false){
  // A blind underside mortise receives the column tenon. The upper channel floor
  // meets the first gong at +252 mm; the bearing sole rests on the column shoulder.
  const bottom=-.14/size[1],floor=(.252-.14)/size[1],holeTop=(.122-.14)/size[1];
  const ring=(x:number,z:number,y:number)=>[[-x,y,-z],[x,y,-z],[x,y,z],[-x,y,z]];
  const outer=ring((mudStraight?.70:.43)/Math.SQRT2,.43/Math.SQRT2,bottom),top=ring(.70/Math.SQRT2,.70/Math.SQRT2,floor);
  const hx=(tenonWidth+.004)/size[0]/2,hz=(tenonWidth+.004)/size[2]/2;
  const inner=ring(hx,hz,bottom),ceiling=ring(hx,hz,holeTop),vertices:number[]=[];
  const quad=(a:number[],b:number[],c:number[],d:number[])=>vertices.push(...a,...b,...c,...a,...c,...d);
  for(let i=0;i<4;i++){const j=(i+1)%4;quad(outer[i],top[i],top[j],outer[j]);quad(outer[i],outer[j],inner[j],inner[i]);quad(inner[i],inner[j],ceiling[j],ceiling[i]);}
  quad(top[3],top[2],top[1],top[0]);quad(ceiling[0],ceiling[1],ceiling[2],ceiling[3]);
  const bowl=new THREE.BufferGeometry();bowl.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]+.5,(vertices[i+1]-bottom)/(floor-bottom));
  bowl.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));bowl.computeVertexNormals();
  const earX=(1-.215/size[0])/2,earZ=(1-.215/size[2])/2,ears=[];
  for(const x of [-1,1])for(const z of [-1,1]){
    const cx=x*(.5-earX/2),cz=z*(.5-earZ/2);
    if(!diagonal){ears.push(block(earX,.44-floor,earZ,cx,(floor+.44)/2,cz));continue;}
    const rectangle=[[cx-earX/2,cz-earZ/2],[cx+earX/2,cz-earZ/2],[cx+earX/2,cz+earZ/2],[cx-earX/2,cz+earZ/2]];
    // Keep the ear material on both sides of the diagonal 215 mm open channel.
    for(const side of [-1,1]){
      const signed=(p:number[])=>side*(p[0]*size[0]-diagonal*p[1]*size[2])/Math.SQRT2-.1075,out:number[][]=[];
      for(let i=0;i<rectangle.length;i++){
        const a=rectangle[i],b=rectangle[(i+1)%rectangle.length],da=signed(a),db=signed(b);
        if(da>=0)out.push(a);
        if((da>=0)!==(db>=0)){const t=da/(da-db);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}
      }
      if(out.length>=3){const shape=new THREE.Shape();out.forEach(([px,pz],i)=>i?shape.lineTo(px,pz):shape.moveTo(px,pz));shape.closePath();ears.push(new THREE.ExtrudeGeometry(shape,{depth:.44-floor,bevelEnabled:false,steps:1}).rotateX(Math.PI/2).translate(0,.44,0));}
    }
  }
  return combine([bowl,...ears]);
}

export function geometry(kind:ShapeKind,size:Vec3=[1,1,1]):THREE.BufferGeometry {
  const key=geometryKey(kind,size),existing=cache.get(key);if(existing)return existing;
  let g:THREE.BufferGeometry;
  if(kind.startsWith('douJoint:')){const mesh=(douFittings.meshes as Record<string,{positions:number[];indices:number[]}>)[kind.slice(9)];if(!mesh)throw new Error(`Missing dou fitting ${kind}`);g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(mesh.positions,3));g.setIndex(mesh.indices);g=g.toNonIndexed();}
  else if(kind.startsWith('douProfile:'))g=douProfileGeometry(size,getDouProfile(kind.slice(11)));
  else if(kind.startsWith('roofJoint:'))g=new THREE.BufferGeometryLoader().parse((rafterBoardCuts.meshes as Record<string,any>)[kind.slice(10)]??(roofJoints.meshes as Record<string,any>)[kind.slice(10)]);
  else if(kind.startsWith('roofRafter:')){const [,e,y,z,h]=kind.split(':').map(Number);g=roofRafterGeometry(size,!!e,y,z,h);}
  else if(kind.startsWith('junCove:'))g=profileShape(JSON.parse(kind.slice(8)));
  else if(kind.startsWith('coveBoard:'))g=roofBoardGeometry(kind.slice(10));
  else if(kind.startsWith('roofBoard:'))g=roofBoardGeometry(kind.slice(10));
  else if(kind.startsWith('stairNotch:')){
    const [,depth,height]=kind.split(':').map(Number),x=.5-depth/size[2],y=.5-height/size[1];
    // A single closed side profile, extruded across the stair width. Rear upper rebate
    // receives the platform cap without a duplicate tread or side surface.
    g=profileShape([[-.5,-.5],[.5,-.5],[.5,y],[x,y],[x,.5],[-.5,.5]]).rotateY(Math.PI/2);
  }
  else switch(kind) {
    case 'eaveDragon':g=roofBeastGeometry(true);break;
    case 'ridgeStopBeast':g=roofBeastGeometry(false);break;
    case 'frontPlaque': g=frontPlaqueGeometry();break;
    case 'frontPlaqueFlat': g=legacyFlatFrontPlaqueGeometry();break;
    case 'frontPlaqueSolid': g=solidFrontPlaqueGeometry();break;
    case 'ceilingRail':case 'ceilingSpan': {
      const e=.1075/size[0];
      g=kind==='ceilingRail'?profileShape([[-.5,0],[-.5+e,0],[-.5+e,.5],[-e,.5],[-e,0],[e,0],[e,.5],[.5-e,.5],[.5-e,0],[.5,0],[.5,-.5],[-.5,-.5]]):profileShape([[-.5,.5],[.5,.5],[.5,0],[.5-e,0],[.5-e,-.5],[-.5+e,-.5],[-.5+e,0],[-.5,0]]);
      break;
    }
    case 'lapTop':g=combine([block(1,.5,1,0,-.25,0),block(.24,.5,1,-.38,.25,0),block(.24,.5,1,.38,.25,0)]);break;
    case 'grassBeam':g=profileShape([[-.5,-.125],[-.475,-.125],[-.475,-.5],[.5,-.5],[.5,.5],[-.5,.5]]);break;
    case 'wallInfill': {
      const s=new THREE.Shape();s.moveTo(-.5,-.5);s.lineTo(.5,-.5);s.lineTo(.5,-.15);
      s.bezierCurveTo(.39,-.15,.38,.25,.33,.5);s.lineTo(-.33,.5);s.bezierCurveTo(-.38,.25,-.39,-.15,-.5,-.15);s.closePath();
      g=new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false,curveSegments:12}).translate(0,0,-.5);break;
    }
    case 'mudWedge':g=profileShape([[-.5,-.5],[.5,-.5],[.46,.4],[-.3,.5]],1);break;
    case 'earMud':g=profileShape([[-.5,-.5],[.5,-.5],[-.5,.5]]).rotateY(-Math.PI/2);break;
    case 'fangNode':g=profileShape(fangProfile(size[0]));break;
    case 'fangNodeSeated':g=profileShape(fangProfile(size[0],true));break;
    case 'fangSpan': case 'splicedFangSpan': {
      // Relieved ends clear the adjacent dou ears during a lateral insertion.
      // The longitudinal node/span splice remains an unresolved inferred split.
      const extension=kind==='splicedFangSpan'?HEADFANG_SPLICE.overlap:0;
      const edge=.5-(extension+.025)/size[0],shoulder=.5-(extension+.10)/size[0];
      g=profileShape([[-.5,.22],[-edge,.22],[-shoulder,-.5],[shoulder,-.5],[edge,.22],[.5,.22],[.5,.5],[-.5,.5]]);break;
    }
    case 'sofang':case 'sofangSeated':{
      const edge=.5-.1075/size[0],top:number[][]=[[.5,.5]];
      if(kind==='sofangSeated')for(const d of [.546,size[0]-.546]){
        const a=.5-(d-.145)/size[0],b=.5-(d+.145)/size[0],seat=(.23-.19*.48)/.315;
        top.push([a,.5],[a,seat],[b,seat],[b,.5]);
      }
      top.push([-.5,.5]);
      g=profileShape([[-.5,-.02],[-edge,-.02],[-edge,-.5],[edge,-.5],[edge,-.02],[.5,-.02],...top]);break;
    }
    case 'latticeTop':case 'latticeBottom': {
      const length=size[0],points=[[-.5,.5]];
      for(let c=.15;c<length;c+=.3){const a=Math.max(-.5,(c-.05)/length-.5),b=Math.min(.5,(c+.05)/length-.5);points.push([a,.5],[a,0],[b,0],[b,.5]);}
      points.push([.5,.5],[.5,-.5],[-.5,-.5]);
      g=profileShape(kind==='latticeBottom'?points.map(([x,y])=>[x,-y]):points);break;
    }
    case 'column': {
      const shaft=new THREE.LatheGeometry([new THREE.Vector2(0,-.5),new THREE.Vector2(.47,-.5),new THREE.Vector2(.49,-.47),new THREE.Vector2(.49,.30),new THREE.Vector2(.47,.43),new THREE.Vector2(.43,.5),new THREE.Vector2(0,.5)],16);
      g=combine([shaft,block(.25,.12/size[1],.25,0,.5+.06/size[1],0)]);break;
    }
    case 'stone':g=combine([new THREE.CylinderGeometry(.46,.5,.65,16).translate(0,-.12,0),new THREE.CylinderGeometry(.4,.46,.3,16).translate(0,.35,0)]);break;
    case 'slopeDou':case 'slopeFootDou': {
      g=geometry('dou',size).clone();const vertices=g.getAttribute('position');
      for(let i=0;i<vertices.count;i++){
        const y=vertices.getY(i),weight=kind==='slopeDou'?1:Math.max(0,Math.min(1,(.08-y)/.56));
        vertices.setY(i,y-vertices.getX(i)*size[0]/size[1]*21/47*weight);
      }
      g.computeVertexNormals();break;
    }
    case 'dou': {
      // Four ears around intersecting open channels, plus tapered bowl. Open mouth is actual geometry.
      const bowl=new THREE.CylinderGeometry(.70,.43,.56,4).rotateY(Math.PI/4).translate(0,-.20,0);
      const gapX=Math.min(.84,.215/size[0]),gapZ=Math.min(.84,.215/size[2]);
      const earX=(1-gapX)/2,earZ=(1-gapZ)/2;
      const ears=[];for(const x of [-1,1])for(const z of [-1,1])ears.push(block(earX,.38,earZ,x*(.5-earX/2),.25,z*(.5-earZ/2)));
      g=combine([bowl,...ears]);break;
    }
    case 'jointHump':case 'jointFlat':case 'jointBraceA':case 'jointBraceB': {
      const data=jointGeometry[kind];g=data?new THREE.BufferGeometryLoader().parse(data):geometry(kind==='jointHump'?'hump':'box').clone();break;
    }
    case 'gongSolid':case 'gongSolidEndSeats':g=gongGeometry(size,false,0,kind==='gongSolidEndSeats',false);break;
    case 'gong':case 'gongUpper':case 'gongEndSeats':case 'gongUpperEndSeats':g=gongGeometry(size,kind==='gongUpper'||kind==='gongUpperEndSeats',0,kind.endsWith('EndSeats'));break;
    case 'bracketHead:sixfen':case 'bracketHead:pizhu':case 'bracketHead:wing': {
      // Head and axial timber are one connected member. The positive X end projects inward.
      // Outline controls are diagram-based inferences; the bearing behind the tip stays flat.
      const inset=.12/size[0],s=new THREE.Shape();s.moveTo(-.5,-.5);s.lineTo(.5-inset,-.5);
      if(kind==='bracketHead:wing')s.bezierCurveTo(.5-inset/2,-.45,.5,-.12,.5,.35);
      else s.lineTo(.5,kind==='bracketHead:sixfen'?-.1:.15);
      s.lineTo(.5,kind==='bracketHead:sixfen'?.3:.5);s.lineTo(.5-inset,.5);s.lineTo(-.5,.5);s.closePath();
      g=new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false,curveSegments:10}).translate(0,0,-.5);break;
    }
    case 'ang': {
      const head=Math.min(.2,.25/size[0]),tail=Math.min(.04,.04/size[0]);
      g=profileShape([[-.5,-.1],[-.5+head,-.5],[.5-tail,-.5],[.5,-.3],[.5,.5],[-.5+head,.5],[-.5+head*.5,.2]]);break;
    }
    case 'rearShort': {
      const shoulder=.5-.07/size[0];
      const body=profileShape([[-.5,.42],[-.4,.440635],[shoulder,.440635],[shoulder,-.5],[-.16,-.5],[-.3,-.25],[-.44,0]]);
      g=combine([body,block(.07/size[0],.32,.48,.5-.035/size[0],0,0)]);break;
    }
    case 'innerThrough': {
      const x=(run:number)=>(run+.2955)/1.943;
      g=profileShape([[-.5,.15],[x(-1.147),-.333],[x(-.105),-.333],[x(.15),-.5],[x(.38),-.30],[.5,.25],[.5,.440635],[x(.401),.440635],[x(.35),.5],[x(.105),.5],[x(-.105),.333],[-.5,.333]]);break;
    }
    case 'interShua':g=profileShape([[-.5,.15],[-.45,-.5],[.45,-.5],[.5,.15],[.5,.5],[-.5,.5]]);break;
    case 'beam':g=profileShape([[-.5,-.11],[-.47,-.11],[-.44,-.27],[-.35,-.44],[-.12,-.5],[.12,-.5],[.35,-.44],[.44,-.27],[.47,-.11],[.5,-.11],[.5,.11],[.45,.11],[.43,.5],[-.43,.5],[-.45,.11],[-.5,.11]]);break;
    case 'fourBeam': {
      // Full moon-beam body with narrower, flat bearing heads in the fourth-jump dou.
      // Head section/shoulder lengths are inferred from the current physical seats.
      g=profileShape([[-.5,-.11],[-.45,-.11],[-.44,-.27],[-.35,-.44],[-.12,-.5],[.12,-.5],[.35,-.44],[.44,-.27],[.45,-.11],[.5,-.11],[.5,.11],[.45,.11],[.43,.5],[-.43,.5],[-.45,.11],[-.5,.11]]);
      const positions=g.getAttribute('position');
      for(let i=0;i<positions.count;i++)positions.setZ(i,positions.getZ(i)*(Math.abs(positions.getX(i))>=.45-1e-6?.5:1));
      g.computeVertexNormals();break;
    }
    case 'linkedBeam':case 'linkedBeamBlank': {
      // One continuous wood member: bracket heads at both ends and a moon-beam belly.
      const s=new THREE.Shape();s.moveTo(-.5,.30);s.lineTo(-.485,.36);s.lineTo(-.465,.36);s.lineTo(-.465,.13);s.lineTo(-.44,.13);s.lineTo(-.44,.36);s.lineTo(-.36,.36);
      // Straight-beam column joints are carved at their actual world positions by
      // the paired-joint generator. Keep a continuous blank under those cuts.
      if(kind==='linkedBeam'){s.lineTo(-.36,0);s.lineTo(-.325,0);}
      s.lineTo(-.325,.5);s.lineTo(.325,.5);
      if(kind==='linkedBeam'){s.lineTo(.325,0);s.lineTo(.36,0);}
      s.lineTo(.36,.36);s.lineTo(.44,.36);s.lineTo(.44,.13);s.lineTo(.465,.13);s.lineTo(.465,.36);s.lineTo(.485,.36);s.lineTo(.5,.30);
      // Bearing flats at both bracket heads meet the first-jump dou channel floor.
      const seat=(.4095+.24+.19*.08-.85)/.441;
      s.bezierCurveTo(.485,-.05,.46,-.19,.42,seat);s.lineTo(.35,seat);s.bezierCurveTo(.24,-.46,.10,-.50,0,-.50);s.bezierCurveTo(-.10,-.50,-.24,-.46,-.35,seat);s.lineTo(-.42,seat);s.bezierCurveTo(-.46,-.19,-.485,-.05,-.5,.30);s.closePath();
      g=new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false,steps:1,curveSegments:12}).translate(0,0,-.5);break;
    }
    case 'rafter':g=new THREE.CylinderGeometry(.5,.5,1,12).rotateZ(Math.PI/2);break;
    case 'tile':g=curvedTile(false);break;
    case 'coverTile':g=curvedTile(true);break;
    case 'ridge':g=combine([block(1,.64,1,0,-.12,0),new THREE.CylinderGeometry(.5,.5,1,10,1,false,0,Math.PI).rotateZ(Math.PI/2).translate(0,.2,0)]);break;
    case 'door': {
      const pieces=[block(.92,.80,.5,0,-.025,0),block(.065,1,1,-.46,0,0),block(.065,1,1,.46,0,0)];
      for(const y of [-.45,0,.45])pieces.push(block(.95,.065,1,0,y,0));
      for(const x of [-.29,-.1,.1,.29])pieces.push(block(.018,.78,.1,x,0,.29));g=combine(pieces);break;
    }
    case 'statue':case 'buddha':g=statueGeometry('seated');break;
    case 'amitabha':g=statueGeometry('amitabha');break;
    case 'maitreya':g=statueGeometry('maitreya');break;
    case 'manjusri':g=statueGeometry('lion');break;
    case 'samantabhadra':g=statueGeometry('elephant');break;
    case 'attendant':g=statueGeometry('attendant');break;
    case 'guardian':g=statueGeometry('guardian');break;
    case 'donor':g=statueGeometry('donor');break;
    case 'finial':g=ridgeFinialGeometry();break;
    case 'vase':g=new THREE.LatheGeometry([new THREE.Vector2(.28,-.5),new THREE.Vector2(.4,-.36),new THREE.Vector2(.23,-.22),new THREE.Vector2(.46,0),new THREE.Vector2(.39,.22),new THREE.Vector2(.18,.32),new THREE.Vector2(.32,.46),new THREE.Vector2(.34,.5)],16);break;
    case 'flame':g=firePearlGeometry();break;
    case 'hump':g=profileShape([[-.5,-.5],[.5,-.5],[.48,-.15],[.3,.1],[.2,.43],[.1,.5],[-.1,.5],[-.2,.43],[-.3,.1],[-.48,-.15]]);break;
    case 'wallWindow':{
      const outline=new THREE.Shape();outline.moveTo(-.5,-.5);outline.lineTo(.5,-.5);outline.lineTo(.5,.5);outline.lineTo(-.5,.5);outline.closePath();
      const window=new THREE.Path();window.moveTo(.14,.08);window.lineTo(.14,.33);window.lineTo(.39,.33);window.lineTo(.39,.08);window.closePath();outline.holes.push(window);
      g=new THREE.ExtrudeGeometry(outline,{depth:1,bevelEnabled:false}).translate(0,0,-.5);break;
    }
    default:
      if(kind.startsWith('plaqueMount:')){const [,x,y,z]=kind.split(':').map(Number);g=plaqueMountGeometry(size,x,y,z);break;}if(kind.startsWith('openDou:')){
      const [,widthX,widthZ]=kind.split(':').map(Number),gapX=widthX/size[0],gapZ=widthZ/size[2],earX=(1-gapX)/2,earZ=(1-gapZ)/2;
      const bowl=new THREE.CylinderGeometry(.70,.43,.56,4).rotateY(Math.PI/4).translate(0,-.20,0),ears=[];
      for(const x of [-1,1])for(const z of [-1,1])ears.push(block(earX,.38,earZ,x*(.5-earX/2),.25,z*(.5-earZ/2)));
      g=combine([bowl,...ears]);break;
    }else if(kind.startsWith('gongBearing:')){
      const [,offset,width]=kind.split(':').map(Number);g=gongGeometry(size,false,0,false,true,[offset,width]);break;
    }else if(kind.startsWith('ceilingArm:')){
      // Continuous F3 timber: preserve both low-ceiling bearing notches and
      // their radial head seats, then continue through the column to the head.
      const [,start,head,rear]=kind.split(':').map(Number),mid=(start+head)/2,length=head-start,s=new THREE.Shape();
      const put=(x:number,y:number)=>new THREE.Vector2((x-mid)/length,y),line=(x:number,y:number)=>{const p=put(x,y);s.lineTo(p.x,p.y);};
      const first=put(start,-.02);s.moveTo(first.x,first.y);
      for(const [x,y] of [[start+.1075,-.02],[start+.1075,-.5],[rear-.1075,-.5],[rear-.1075,-.02],[rear+.1075,-.02],[rear+.1075,-.5],[head-.55,-.5]])line(x,y);
      const a=put(head-.24,-.47),b=put(head-.04,-.22),end=put(head,.30);s.bezierCurveTo(a.x,a.y,b.x,b.y,end.x,end.y);line(head-.12,.5);
      for(const center of [rear-.546,start+.546].sort((a,b)=>b-a)){
        line(center+.145,.5);line(center+.145,(.23-.19*.48)/.315);line(center-.145,(.23-.19*.48)/.315);line(center-.145,.5);
      }
      line(start,.5);s.closePath();g=new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false,curveSegments:12}).translate(0,0,-.5);break;
    }else if(kind.startsWith('humpWing:')){
      const [,tail,head]=kind.split(':').map(Number),start=tail-.275,mid=(start+head)/2,length=head-start;
      const {humpCenter:cy,humpHeight:height}=LOW_CEILING,put=(x:number,y:number)=>new THREE.Vector2((x-mid)/length,(y-cy)/height),s=new THREE.Shape();
      const line=(x:number,y:number)=>{const p=put(x,y);s.lineTo(p.x,p.y);};
      const first=put(start,LOW_CEILING.humpFoot);s.moveTo(first.x,first.y);line(tail+.275,LOW_CEILING.humpFoot);line(tail+.275,1.134);line(head-.12,1.134);
      const c1=put(head-.06,1.14975),c2=put(head,1.2537),end=put(head,1.40175);s.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,end.x,end.y);
      line(head-.12,1.449);line(tail+.055,LOW_CEILING.humpTop);line(tail-.055,LOW_CEILING.humpTop);
      for(const [x,y] of [[tail-.11,.43],[tail-.165,.1],[tail-.264,-.15]])line(x,cy+y*height);
      s.closePath();g=new THREE.ExtrudeGeometry(s,{depth:1,bevelEnabled:false,curveSegments:12}).translate(0,0,-.5);break;
    }else if(kind.startsWith('humpArm:')){
      const [,tail,head]=kind.split(':').map(Number),start=tail-.275,mid=(start+head)/2,length=head-start;
      const {humpCenter:cy,humpHeight:height}=LOW_CEILING;
      const bottom=(1.133-cy)/height,top=(1.448-cy)/height;
      const points=[[start,-.5],[tail+.275,-.5],[tail+.275,bottom],[head,bottom],[head,top],[tail+.055,.5],[tail-.055,.5],[tail-.11,.43],[tail-.165,.1],[tail-.264,-.15]];
      if(head>1.4){
        // Preserve the third gong's curled head and upper end notch. The long
        // shaft continues back to the hump; a flat bearing remains over jump 2.
        const h=new THREE.Shape(),put=(x:number,y:number)=>new THREE.Vector2((x-mid)/length,(y-cy)/height);
        const move=(x:number,y:number)=>{const v=put(x,y);h.moveTo(v.x,v.y);},line=(x:number,y:number)=>{const v=put(x,y);h.lineTo(v.x,v.y);};
        move(start,1.0705);line(tail+.275,1.0705);line(tail+.275,1.133);line(1.085,1.133);line(1.11,1.197);line(1.217,1.197);
        const c1=put(1.3565,1.20645),c2=put(1.465,1.2474),end=put(1.527,1.33875);h.bezierCurveTo(c1.x,c1.y,c2.x,c2.y,end.x,end.y);
        line(head,1.4238);line(1.3875,1.449);line(1.31,1.449);line(1.31,1.3671);line(1.124,1.3671);line(1.124,1.449);
        for(const [x,y] of points.slice(5))line(x,cy+y*height);h.closePath();
        const outline=h.getPoints(30),out:number[][]=[],limit=(head-.275-mid)/length,plane=(1.4303-cy)/height;
        for(let i=0;i<outline.length;i++){
          const a=outline[i],b=outline[(i+1)%outline.length],ts=[0,1];
          if((a.x-limit)*(b.x-limit)<0)ts.push((limit-a.x)/(b.x-a.x));if((a.y-plane)*(b.y-plane)<0)ts.push((plane-a.y)/(b.y-a.y));ts.sort((a,b)=>a-b);
          for(let k=0;k<ts.length-1;k++){const trim=a.x+(b.x-a.x)*(ts[k]+ts[k+1])/2>=limit;for(const t of [ts[k],ts[k+1]]){const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;out.push([x,trim?Math.min(y,plane):y]);}}
        }
        g=profileShape(out);
      }else g=profileShape(points.map(([x,y])=>[(x-mid)/length,y]));break;
    }else if(kind.startsWith('cornerFang:')){
      const [,length,intercept,half]=kind.split(':').map(Number);let points=fangProfile(length);
      const clip=(distance:(p:number[])=>number)=>{const out:number[][]=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],da=distance(a),db=distance(b);if(da<=0)out.push(a);if((da<=0)!==(db<=0)){const t=da/(da-db);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}points=out;};
      if(half)clip(p=>p[0]);clip(p=>p[1]*size[1]+p[0]*length*21/47-intercept);
      g=profileShape(points.map(([x,y])=>[half?x*2+.5:x,y]));break;
    }else if(kind.startsWith('cornerFootDou:')){
      const [,sx,sz]=kind.split(':').map(Number);g=geometry('dou',size).clone();const v=g.getAttribute('position');
      for(let i=0;i<v.count;i++){const y=v.getY(i),weight=Math.max(0,Math.min(1,(.08-y)/.56));v.setY(i,y+(v.getX(i)*size[0]*sx+v.getZ(i)*size[2]*sz)/size[1]*weight);}g.computeVertexNormals();break;
    }else if(kind.startsWith('bearingVase:')){
      g=cornerVaseGeometry(size,Number(kind.split(':')[1]));break;
    }else if(kind.startsWith('vaseYou:')){
      g=vaseYouHeadGeometry(geometry(kind.slice(8) as ShapeKind,size),size);break;
    }else if(kind.startsWith('seatedAng:')){
      const [,slope,tail,platform]=kind.split(':').map(Number);g=seatedAngGeometry(size,slope,tail,!!platform);break;
    }else if(kind.startsWith('cornerGong:')){
      const [,baseText,reachText]=kind.split(':'),base=Number(baseText),reach=Number(reachText),extra=reach+.13-base/2,center=extra/2;
      g=gongGeometry([base,.315,.21],false,0,true,false);const positions=g.getAttribute('position');
      // Preserve the ordinary-facing reach and carved tips. The
      // continuous middle body grows toward the adjoining facade.
      for(let i=0;i<positions.count;i++){
        let x=positions.getX(i)*base;
        // The long man-gong keeps a full-depth belly through its intermediate dou
        // bearings; the ordinary short-gong curl would undercut those seats.
        if(base>2&&positions.getY(i)<0){const w=Math.max(0,Math.min(1,(.38*base-Math.abs(x))/(.10*base)));positions.setY(i,positions.getY(i)*(1-w)-.5*w);}
        if(x>0)x+=extra*Math.min(1,x/(.14*base));positions.setX(i,(x-center)/size[0]);
      }
      g.computeVertexNormals();break;
    }if(kind.startsWith('wallJoint:')){g=new THREE.BufferGeometryLoader().parse((wallJoints as Record<string,any>)[kind.slice(10)]);break;}if(kind.startsWith('bracketJoint:')){g=new THREE.BufferGeometryLoader().parse((bracketJoints.meshes as Record<string,any>)[kind.slice(13)]);break;}if(kind.startsWith('rootDouMud:')){g=rootDouGeometry(size,Number(kind.split(':')[1]),0,true);break;}if(kind.startsWith('rootDou:')){g=rootDouGeometry(size,Number(kind.split(':')[1]),Number(kind.split(':')[3]??0));break;}g=kind.startsWith('rootArm:')?gongGeometry(size,true,Number(kind.slice(8))):block(1,1,1);
  }
  if(!g.getAttribute('normal'))g.computeVertexNormals();g.computeBoundingBox();cache.set(key,g);return g;
}

export function disposeGeometries(){for(const g of cache.values())g.dispose();cache.clear();}
