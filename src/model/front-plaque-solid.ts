// SPDX-License-Identifier: CC-BY-SA-4.0
// Independently modeled relief on the photo-traced silhouette. See the asset
// attribution and font OFL license in public/assets/front-plaque/.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {legacyFlatFrontPlaqueGeometry,FRONT_PLAQUE_OUTLINE} from './front-plaque';
import glyphs from './plaque-glyphs.json';

export function solidFrontPlaqueGeometry():THREE.BufferGeometry {
 const pieces:THREE.BufferGeometry[]=[];
 function add(g:THREE.BufferGeometry,color:number,grain=false){
  const plain=g.index?g.toNonIndexed():g,p=plain.getAttribute('position'),base=new THREE.Color(color),colors=[];
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   const wav=Math.sin(x*219+Math.sin(y*7)*1.4)+.35*Math.sin(x*719+y*.5);
   const shade=grain?.89+.07*wav:1;
   const c=base.clone().multiplyScalar(shade);colors.push(c.r,c.g,c.b);
  }
  plain.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  if(!plain.hasAttribute('uv'))plain.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(p.count*2),2));
  pieces.push(plain);if(plain!==g)g.dispose();
 }
 const body=legacyFlatFrontPlaqueGeometry(),p=body.getAttribute('position'),n=body.getAttribute('normal'),colors=[];
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),y=p.getY(i),front=n.getZ(i)>.5,panel=Math.abs(x)<.246&&y>-.234&&y<.366;
  const c=new THREE.Color(panel||!front?0x826344:0x98714b);
  const weather=Math.sin(x*167+Math.sin(y*23)*2)*Math.sin(y*151-x*39);
  if(front&&!panel&&weather>.28)c.lerp(new THREE.Color(0x425b48),.48);
  c.multiplyScalar(.86+.10*Math.sin(x*295+Math.sin(y*5)*2)+.07*Math.sin(y*133+x*51));colors.push(c.r,c.g,c.b);
 }
 body.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));pieces.push(body);
 function tube(points:THREE.Vector3[],radius:number,color:number,straight=false){
  const path=straight?new THREE.CurvePath<THREE.Vector3>():new THREE.CatmullRomCurve3(points);
  if(path instanceof THREE.CurvePath)for(let i=1;i<points.length;i++)path.add(new THREE.LineCurve3(points[i-1],points[i]));
  const segments=Math.max(12,points.length*3),g=new THREE.TubeGeometry(path,segments,radius,6,false),p=g.getAttribute('position');
  // Match relief depth to the plaque's anisotropic metre scale. Every bead
  // intersects the frame face, so it does not float above its backing.
  for(let i=0;i<p.count;i++){const center=path.getPointAt(Math.floor(i/7)/segments);p.setZ(i,.525+(p.getZ(i)-center.z)*18);}
  g.computeVertexNormals();add(g,color);
 }
 function curve(points:number[][],radius=.0022,color=0xa48a67,z=.525){tube(points.map(([x,y])=>new THREE.Vector3(x,y,z)),radius,color,points===rim);}
 // Raised fillet around the panel edges.
 const rim=[[-.254,.369],[.244,.369],[.244,-.236],[-.254,-.236],[-.254,.369]];
 curve(rim,.004,0x655139);
 // Continuous scrolled stems down the side bands and beneath the panel.
 for(const side of [-1,1]){
  curve([[side*.38,-.43],[side*.39,-.37],[side*.33,-.27],[side*.29,-.17],[side*.29,.0],[side*.29,.2],[side*.29,.32],[side*.38,.44]],.0035,0x9b805d,.62);
  curve([[side*.365,-.425],[side*.355,-.37],[side*.315,-.30],[side*.265,-.253],[side*.18,-.28],[side*.09,-.30],[0,-.326]],.003,0xa68b68,.62);
 }
 // Cloud-head curls with a secondary scalloped turn.
 const boundary=FRONT_PLAQUE_OUTLINE.map(([x,y])=>[(x-630.5)/727,(1024-y)/787]);
 function onFrame(x:number,y:number){
  let inside=false;
  for(let i=0,j=boundary.length-1;i<boundary.length;j=i++){const a=boundary[i],b=boundary[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
  return inside&&!(x>-.253&&x<.248&&y>-.238&&y<.37);
 }
 function cloud(x:number,y:number,r:number,flip:number,angle=0){
  if(!onFrame(x,y))return;
  while(r>.009&&!Array.from({length:12},(_,i)=>i*Math.PI/6).every(a=>onFrame(x+Math.cos(a)*r*1.14,y+Math.sin(a)*r*.87)))r*=.85;
  if(r<=.009)return;
  const points:THREE.Vector3[]=[];
  for(let j=0;j<=32;j++){
   const t=j/32,a=angle+flip*t*Math.PI*3.25,rr=r*(1-.88*t);
   points.push(new THREE.Vector3(x+Math.cos(a)*rr,y+Math.sin(a)*rr*.74,.525));
  }
  tube(points,r*.082,0xad916b);
  // A second, scalloped curl gives each motif a cloud head rather than leaves.
  const edge=[];for(let j=0;j<=28;j++){const a=j/28*Math.PI*1.68+angle,rr=r*(.78+.14*Math.cos(a*5));edge.push(new THREE.Vector3(x+Math.cos(a)*rr,y+Math.sin(a)*rr*.65,.525));}
  tube(edge,r*.045,0x806b50);
 }
 for(const side of [-1,1]){
  for(let i=0;i<9;i++){const y=-.21+i*.062,x=side*(.284+.037*Math.sin((i+1)/10*Math.PI));cloud(x,y,.026+(i%3)*.002,side,i*.8);cloud(x-side*.016,y+.029,.014,-side,i*.7);}
  cloud(side*.365,.418,.043,side,.5);cloud(side*.419,.419,.033,-side,1.1);
  cloud(side*.374,-.393,.025,side,1.3);cloud(side*.36,-.437,.019,-side,2.2);
  for(let i=0;i<5;i++){const x=side*(.045+i*.045);cloud(x,.414+.016*Math.cos(i),.025,-side,.4+i);cloud(x,-.283-.025*(1-i/5),.02,side,.8);}
 }
 cloud(0,.433,.036,1,.8);cloud(0,-.32,.024,-1,.6);
 // Seven back boards and two transverse battens show physical assembly depth.
 for(let i=0;i<7;i++)add(new THREE.BoxGeometry(.0705,.591,.035).translate(-.215+i*.071,.06,-.51),0x725639,true);
 for(const y of [-.18,.28])add(new THREE.BoxGeometry(.51,.035,.10).translate(-.005,y,-.55),0x6e5239,true);
 // Raised outline meshes, not text painted into a photograph. The font is a
 // declared approximation; the arrangement follows the observed two columns.
 for(const [col,text] of ['容禪寺','佛光真'].entries())for(const [row,char] of [...text].entries()){
  const path=new THREE.ShapePath();
  for(const cmd of glyphs[char as keyof typeof glyphs]){
   const a=cmd.slice(1) as number[];
   switch(cmd[0]){case 'M':path.moveTo(a[0],a[1]);break;case 'L':path.lineTo(a[0],a[1]);break;case 'Q':path.quadraticCurveTo(a[0],a[1],a[2],a[3]);break;case 'C':path.bezierCurveTo(a[0],a[1],a[2],a[3],a[4],a[5]);break;case 'Z':path.currentPath?.closePath();break;}
  }
  const g=new THREE.ExtrudeGeometry(path.toShapes(),{depth:5,bevelEnabled:true,bevelThickness:2,bevelSize:1.8,bevelSegments:2,steps:1,curveSegments:5});g.computeBoundingBox();
  const bounds=g.boundingBox!,center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  g.translate(-center.x,-center.y,-bounds.min.z).scale(.205/size.x,.180/size.y,.045/size.z).translate(col?.119:-.128,.253-row*.196,.151);
  add(g,0xae9269,true);
 }
 const merged=mergeGeometries(pieces,false)!;pieces.forEach(g=>g.dispose());
 // Keep both comparison variants at the same 140 mm overall depth.
 merged.computeBoundingBox();const b=merged.boundingBox!;merged.translate(0,0,-(b.min.z+b.max.z)/2).scale(1,1,1/(b.max.z-b.min.z));
 merged.computeVertexNormals();return merged;
}
