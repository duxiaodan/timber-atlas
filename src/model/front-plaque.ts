// SPDX-License-Identifier: CC-BY-SA-4.0
// Photo adaptation attribution: public/assets/front-plaque/ATTRIBUTION.md
import * as THREE from 'three';
import {TessellateModifier} from 'three/addons/modifiers/TessellateModifier.js';
import {PLAQUE_SIZE,plaqueFrameDepth,plaqueBackAt} from './front-plaque-profile';
import type {Vec3} from './types';
import {mergeVertices,mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Coordinates traced on the unmodified Commons 1280 × 1707 photograph.
// Only the front uses photographic UVs. The panel is recessed inside a solid
// frame; the unobserved rear receives a plain timber patch, never mirrored text.
export const FRONT_PLAQUE_OUTLINE:number[][]=[
 [268,688],[277,675],[296,663],[308,647],[337,637],[361,634],[394,645],
 [426,661],[448,679],[467,673],[483,682],[510,679],[535,663],[558,661],
 [578,642],[607,638],[624,635],[644,644],[665,645],[683,662],[706,667],
 [723,678],[744,676],[766,685],[789,675],[815,657],[843,638],[874,631],
 [904,639],[928,644],[955,659],[975,670],[990,689],[993,703],[986,715],
 [964,724],[943,728],[897,730],[886,750],[883,772],[871,785],[880,815],
 [883,840],[897,855],[896,875],[913,899],[923,933],[922,960],[931,979],
 [928,1009],[918,1035],[902,1050],[899,1083],[884,1098],[883,1137],
 [869,1157],[887,1182],[888,1203],[912,1234],[920,1260],[939,1300],
 [947,1325],[940,1364],[929,1393],[915,1410],[893,1417],[872,1407],
 [855,1385],[847,1349],[846,1315],[844,1277],[823,1277],[811,1269],
 [797,1264],[784,1272],[770,1268],[750,1275],[717,1277],[699,1289],
 [673,1292],[655,1304],[626,1308],[604,1303],[588,1293],[566,1294],
 [545,1284],[522,1279],[501,1268],[481,1270],[467,1261],[451,1266],
 [437,1276],[422,1274],[413,1284],[417,1323],[414,1366],[403,1395],
 [382,1415],[364,1414],[347,1398],[338,1374],[330,1347],[333,1314],
 [348,1274],[358,1244],[366,1222],[383,1209],[383,1192],[400,1175],
 [394,1156],[404,1134],[400,1097],[384,1082],[372,1061],[370,1035],
 [359,1015],[356,988],[361,966],[364,932],[372,910],[372,887],
 [386,860],[392,841],[395,809],[410,790],[405,775],[416,753],
 [402,731],[375,729],[339,728],[308,726],[287,718],[273,707],
];
const xy=(x:number,y:number)=>new THREE.Vector2((x-630.5)/727,(1024-y)/787);
function path(points:number[][]){const s=new THREE.Shape();points.forEach(([x,y],i)=>{const p=xy(x,y);if(i)s.lineTo(p.x,p.y);else s.moveTo(p.x,p.y);});s.closePath();return s;}
export function legacyFlatFrontPlaqueGeometry():THREE.BufferGeometry {
 const panel=[[457,735],[805,735],[805,1207],[449,1207]];
 const frame=path(FRONT_PLAQUE_OUTLINE);frame.holes.push(new THREE.Path(path(panel).getPoints()));
 const frameGeometry=new THREE.ExtrudeGeometry(frame,{depth:1,bevelEnabled:false,steps:1}).translate(0,0,-.5);
 const panelGeometry=new THREE.ExtrudeGeometry(path(panel),{depth:.65,bevelEnabled:false,steps:1}).translate(0,0,-.5);
 for(const g of [frameGeometry,panelGeometry]){
  const p=g.getAttribute('position'),n=g.getAttribute('normal'),uv=g.getAttribute('uv');
  for(let i=0;i<p.count;i++){
   if(n.getZ(i)>.5)uv.setXY(i,(p.getX(i)*727+630.5)/1280,1-(1024-p.getY(i)*787)/1707);
   else uv.setXY(i,.81+p.getX(i)*.015,.15+p.getY(i)*.045);
  }
 }
 const result=mergeGeometries([frameGeometry,panelGeometry],false)!;
 frameGeometry.dispose();panelGeometry.dispose();return result;
}
export const FRONT_PLAQUE_PHOTO='/assets/front-plaque/photo.jpg';

/** Curved frame and pendant ribbons with photographic UVs kept on the front. */
export function frontPlaqueGeometry():THREE.BufferGeometry {
 const panel=[[457,735],[805,735],[805,1207],[449,1207]];
 const frame=path(FRONT_PLAQUE_OUTLINE);frame.holes.push(new THREE.Path(path(panel).getPoints().reverse()));
 const blank=new THREE.ExtrudeGeometry(frame,{depth:1,bevelEnabled:false,steps:1}).translate(0,0,-.5).scale(1,1,.04);
 // Refine before deformation, including the side walls, to follow the curl.
 const refined=new TessellateModifier(.022,13).modify(blank);blank.dispose();
 const p=refined.getAttribute('position'),normal=refined.getAttribute('normal'),uv=refined.getAttribute('uv');
 const timberUV=(x:number,y:number)=>[.23+(y+.5)*.55,.135+(x+.5)*.028];
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),t=p.getZ(i)/.04+.5,depth=plaqueFrameDepth(x,y);
  const front=normal.getZ(i)>.9;
  const tex=front?[(x*727+630.5)/1280,1-(1024-y*787)/1707]:timberUV(x,y);
  uv.setXY(i,tex[0],tex[1]);p.setZ(i,(depth.back+t*(depth.front-depth.back))/PLAQUE_SIZE[2]);
 }
 refined.deleteAttribute('normal');const rounded=mergeVertices(refined,1e-5);rounded.computeVertexNormals();refined.dispose();
 const board=new THREE.ExtrudeGeometry(path(panel),{depth:.047/PLAQUE_SIZE[2],bevelEnabled:false,steps:1}).translate(0,0,-.075/PLAQUE_SIZE[2]);
 const bp=board.getAttribute('position'),bn=board.getAttribute('normal'),bu=board.getAttribute('uv');
 for(let i=0;i<bp.count;i++){const x=bp.getX(i),y=bp.getY(i),tex=bn.getZ(i)>.9?[(x*727+630.5)/1280,1-(1024-y*787)/1707]:timberUV(x,y);bu.setXY(i,tex[0],tex[1]);}
 const pieces=[rounded.toNonIndexed(),board];rounded.dispose();
 // Rear cross battens are explicitly conjectural. Their front surfaces join
 // the back panel; the original calligraphy is never mirrored onto them.
 for(const y of [-.17,.28]){
  const g=new THREE.BoxGeometry(.52,.035,.047/PLAQUE_SIZE[2]).translate(-.004,y,-.0965/PLAQUE_SIZE[2]).toNonIndexed();
  const p=g.getAttribute('position'),uv=g.getAttribute('uv');for(let i=0;i<p.count;i++){const t=timberUV(p.getX(i),p.getY(i));uv.setXY(i,t[0],t[1]);}pieces.push(g);
 }
 const result=mergeGeometries(pieces,false)!;pieces.forEach(p=>p.dispose());return result;
}

export function plaqueMountGeometry(size:Vec3,x:number,y:number,beamFront:number):THREE.BufferGeometry{
 const end=plaqueBackAt(x,y),center=(beamFront+end)/2,vertices:number[]=[];
 const point=(u:number,v:number,front:boolean)=>[u,v,((front?plaqueBackAt(x+u*size[0],y+v*size[1]):beamFront)-center)/size[2]];
 const quad=(a:number[],b:number[],c:number[],d:number[])=>vertices.push(...a,...b,...c,...a,...c,...d);
 // Subdivide the mating face and its perimeter to fit the curved rear surface.
 for(let i=0;i<8;i++){
  const v=-.5+i/8,w=v+1/8;
  quad(point(-.5,v,true),point(.5,v,true),point(.5,w,true),point(-.5,w,true));
  quad(point(.5,v,false),point(-.5,v,false),point(-.5,w,false),point(.5,w,false));
  quad(point(-.5,v,false),point(-.5,v,true),point(-.5,w,true),point(-.5,w,false));
  quad(point(.5,v,true),point(.5,v,false),point(.5,w,false),point(.5,w,true));
 }
 quad(point(-.5,.5,true),point(.5,.5,true),point(.5,.5,false),point(-.5,.5,false));
 quad(point(-.5,-.5,false),point(.5,-.5,false),point(.5,-.5,true),point(-.5,-.5,true));
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));const uv=[];for(let i=0;i<vertices.length;i+=3)uv.push(vertices[i]+.5,vertices[i+1]+.5);g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();return g;
}
