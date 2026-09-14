import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

// Editable relief reconstruction after Liang Sicheng's plate IX. Coordinates follow
// that drawing (x right, y down); depth, reverse face and missing fine detail are inferred.
// See docs/model-and-sources.md. No third-party mesh or photo texture is embedded.
type Point = readonly [number, number];
const V=(x:number,y:number,z=0)=>new THREE.Vector3(x,537-y,z);

export function ridgeFinialGeometry():THREE.BufferGeometry {
  const pieces:THREE.BufferGeometry[]=[];
  type Glaze='green'|'ochre'|'ivory'|'dark'|'clay';
  const pigments:Record<Glaze,THREE.Color>={green:new THREE.Color(0x57947f),ochre:new THREE.Color(0xc3953e),ivory:new THREE.Color(0xd7cdb2),dark:new THREE.Color(0x252d2a),clay:new THREE.Color(0xa99776)};
  function add(g:THREE.BufferGeometry,tone=1,pigment:Glaze='green') {
    const plain=g.index?g.toNonIndexed():g;
    if(plain!==g)g.dispose();
    plain.deleteAttribute('uv');
    const pos=plain.getAttribute('position'),colors=new Float32Array(pos.count*3);
    for(let i=0;i<pos.count;i++) {
      const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
      // Low-frequency weathering; real glaze loss has not been surveyed per fragment.
      const patina=.93+.035*Math.sin(x*.069+y*.042)+.025*Math.sin(y*.14-z*.03);
      const shade=tone*patina,color=pigments[pigment].clone();
      const wear=Math.max(0,Math.sin(x*.12+y*.061)*Math.cos(y*.09-z*.07)-.52)*.35;
      color.lerp(pigments.clay,wear).multiplyScalar(shade);
      colors.set([color.r,color.g,color.b],i*3);
    }
    plain.setAttribute('color',new THREE.BufferAttribute(colors,3));pieces.push(plain);
  }
  function relief(points:readonly Point[],radius:number,z:number,tone=1,pigment:Glaze='green') {
    const curve=new THREE.CatmullRomCurve3(points.map(([x,y])=>V(x,y,z)),false,'centripetal');
    add(new THREE.TubeGeometry(curve,Math.max(6,(points.length-1)*4),radius,radius<1.5?5:6,false),tone,pigment);
  }
  function ellipsoid(x:number,y:number,z:number,sx:number,sy:number,sz:number,tone=1,pigment:Glaze='green') {
    add(new THREE.SphereGeometry(1,16,10).scale(sx,sy,sz).translate(x,537-y,z),tone,pigment);
  }
  function slab(points:readonly Point[],depth:number,bevel=2,tone=1,pigment:Glaze='green') {
    const shape=new THREE.Shape();points.forEach(([x,y],i)=>i?shape.lineTo(x,537-y):shape.moveTo(x,537-y));shape.closePath();
    add(new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,curveSegments:16}).translate(0,0,-depth/2),tone,pigment);
  }
  function patch(points:readonly Point[],z:number,depth:number,pigment:Glaze='green') {
    const curve=new THREE.CatmullRomCurve3(points.map(([x,y])=>V(x,y)),true,'centripetal');
    const shape=new THREE.Shape(curve.getPoints(points.length*4).map(p=>new THREE.Vector2(p.x,p.y)));
    add(new THREE.ExtrudeGeometry(shape,{depth,steps:1,bevelEnabled:true,bevelSize:1.5,bevelThickness:1.6,bevelSegments:2}).translate(0,0,z-depth/2),1,pigment);
  }

  // Continuous body with an OPEN mouth on the left. The back rises almost vertically;
  // the top retains the truncated fan seen in plate IX instead of inventing a curled tip.
  const body=new THREE.Shape();body.moveTo(128,537-533);body.lineTo(439,537-533);
  body.bezierCurveTo(443,537-468,452,537-406,449,537-344);
  body.bezierCurveTo(448,537-267,442,537-205,421,537-156);
  body.bezierCurveTo(382,537-119,321,537-84,270,537-73);
  body.lineTo(268,537-93);body.lineTo(275,537-141);
  body.bezierCurveTo(254,537-141,223,537-139,203,537-145);
  body.bezierCurveTo(218,537-178,218,537-208,205,537-242);
  body.bezierCurveTo(190,537-286,174,537-316,151,537-333);
  body.bezierCurveTo(140,537-343,119,537-333,101,537-337);
  body.bezierCurveTo(83,537-338,80,537-350,89,537-361);
  body.bezierCurveTo(102,537-373,125,537-365,139,537-371);
  body.bezierCurveTo(152,537-391,165,537-374,181,537-383);
  body.bezierCurveTo(228,537-394,234,537-429,203,537-465);
  body.bezierCurveTo(184,537-484,157,537-493,140,537-488);
  body.bezierCurveTo(134,537-497,134,537-508,142,537-514);
  body.lineTo(128,537-533);body.closePath();
  add(new THREE.ExtrudeGeometry(body,{depth:76,steps:1,bevelEnabled:true,bevelSize:3,bevelThickness:4,bevelSegments:3,curveSegments:12}).translate(0,0,-38));
  // Low plinth, visible on both sides of the ridge, with a rounded coping edge.
  slab([[128,529],[440,529],[440,541],[123,541]],88,2,.88);

  for(const side of [-1,1]) {
    const z=side*42,raised=side*47;
    patch([[271,76],[310,87],[370,119],[419,156],[349,147],[278,141]],side*40,3,'clay');
    // Broad cheek folds beneath fine striations, rather than wire-like linework alone.
    patch([[201,331],[230,328],[257,353],[269,392],[255,430],[237,459],[223,460],[232,430],[235,402],[224,375],[204,359]],side*43,6);
    patch([[216,458],[244,447],[278,451],[286,469],[267,489],[241,490],[214,505],[183,517],[160,514],[178,497]],side*43,5);
    // Tile-block joints: fine darker lines stay subordinate to the shallow relief.
    for(const path of [
      [[216,435],[320,437],[438,440]], [[235,339],[352,340],[447,342]],
      [[286,208],[434,211]], [[275,141],[280,208]], [[321,214],[320,533]],
      [[353,213],[354,434]], [[212,474],[213,532]],
    ] satisfies Point[][])relief(path,.75,z,.48);

    // Ribbed dorsal fan. Curves sweep toward the outside; ribs lie shallow on the body.
    for(let i=0;i<17;i++) {
      const t=i/16,x=270+146*t,y=73+83*t;
      relief([[x,y+4],[x+2,105+70*t],[x+4,142+17*t]],1.15,side*42.5,.91,'clay');
    }
    for(let i=0;i<14;i++) {
      const t=i/13;
      // Long rays follow the ceramic panel fan: upright above, then diagonal and curled.
      relief([[350+77*t,209],[344+78*t,181],[330+89*t,151+7*t]],.95,side*42.5,.94);
      relief([[356+80*t,274],[377+61*t,242],[394+42*t,213]],.95,side*42.5,.94);
      relief([[363+78*t,342],[396+46*t,309],[416+25*t,277]],.95,side*42.5,.94);
      relief([[379+48*t,412+9*t],[398+35*t,410-12*t],[425+19*t,378+9*t],[446,346+38*t]],.95,side*42.5,.94);
    }
    relief([[275,144],[325,149],[365,159],[387,187],[390,250],[389,312],[397,361],[419,391],[431,390]],2.1,raised,1.02);
    relief([[279,149],[330,160],[355,192],[354,277],[360,343],[379,391],[406,419],[427,419],[433,410],[429,403],[424,407]],2.4,raised);
    // Repeated round bosses on the narrow band beside the dorsal fin.
    for(const [x,y] of [[328,163],[367,240],[365,285],[369,332],[376,375]]) {
      ellipsoid(x,y,side*45,7,4.5,2.1,.86);
      relief([[x-5,y],[x-3,y-4],[x+3,y-4],[x+6,y],[x+3,y+3]],1.1,side*47,1.08);
    }

    // The large dragon head: projecting muzzle, eye sockets, eyelid, brow and nostril.
    ellipsoid(115,350,side*40,29,13,13,.94);
    ellipsoid(105,343,side*48,11,6,6,1.01);
    ellipsoid(97,350,side*53,4.5,3,2,.7,'dark');
    ellipsoid(159,353,side*44,21,17,9,.71);
    ellipsoid(160,352,side*52,15,14,8,1.05,'ivory');
    ellipsoid(159,352,side*60,5,11,1.8,.65,'dark');
    relief([[140,350],[145,337],[160,334],[174,339],[180,351]],3.1,side*57,1.08,'ochre');
    relief([[134,337],[151,327],[170,330],[193,317],[207,300]],3.1,raised);
    relief([[139,327],[162,318],[178,302],[190,275],[199,262]],2.6,raised);
    relief([[92,363],[116,363],[136,369],[148,383]],2.8,side*48,1.08);
    // Inner and outer mouth rims wrap around the open void, rather than a painted hole.
    relief([[154,375],[184,380],[212,394],[224,417],[219,440],[202,463],[175,482],[145,490]],5.1,side*46,1.04,'ochre');
    relief([[153,386],[183,390],[205,403],[213,419],[207,441],[190,459],[165,472],[144,475]],2.2,side*46,.92,'ivory');
    relief([[144,508],[167,505],[190,489],[210,465],[228,442],[237,414],[230,387],[211,365],[194,356]],3.0,raised);
    // Two restrained fangs in the jaw, with a hooked lower lip.
    slab([[149,376],[164,384],[156,399]],70,1.5,1.06,'ivory');
    slab([[171,476],[182,456],[193,469]],70,1.5,1.02,'ivory');
    relief([[143,487],[133,484],[125,489],[129,500],[148,505],[166,497]],3.5,side*46,1.04,'ivory');

    // Cheek curls and whisker/wing striations, copied as low relief from the drawing.
    for(const path of [
      [[205,331],[225,326],[246,339],[255,369],[252,402],[241,435]],
      [[222,339],[211,341],[210,332],[220,327]],
      [[254,366],[275,365],[287,383],[284,412],[272,442],[265,471],[276,478],[293,471]],
      [[277,370],[277,382],[270,385],[267,376],[277,370]],
      [[231,452],[253,447],[274,453],[281,464],[273,478],[243,485],[219,493]],
      [[205,499],[219,514],[236,515],[250,506],[241,498],[234,503]],
    ] satisfies Point[][])relief(path,2.35,raised);
    for(let i=0;i<7;i++)relief([[172+i*2,328-i*2],[190+i*2,328-i*3],[205+i*2,314-i*4]],1.2,side*48,.94);

    // Closely spaced shallow cheek/wing ribs visible in the current close photographs.
    for(let i=0;i<17;i++) {
      const t=i/16;
      relief([[218+12*t,337+7*t],[244+8*t,367+12*t],[246+10*t,408+6*t],[227+13*t,450]],.7,side*48,.85);
      relief([[188+8*t,500],[217+10*t,484+5*t],[250+12*t,478-5*t],[271,463+t*8]],.7,side*48,.85);
    }

    // Small side dragon, a feature explicitly mentioned in Liang's survey.
    const dragon=new THREE.CatmullRomCurve3([[236,158],[253,164],[282,176],[293,190],[317,212],[330,237],[327,262],[305,280],[289,282],[272,270]].map(([x,y])=>V(x,y,side*46)),false,'centripetal');
    const radiusAt=(t:number)=>2+10*Math.sin(Math.PI*t*.9)**.65;
    const positions:number[]=[],indices:number[]=[],rings=72,sides=10;
    for(let i=0;i<=rings;i++){
      const t=i/rings,p=dragon.getPoint(t),tangent=dragon.getTangent(t),n=new THREE.Vector3(-tangent.y,tangent.x,0),r=radiusAt(t);
      for(let j=0;j<sides;j++){
        const a=j/sides*Math.PI*2,q=p.clone().addScaledVector(n,Math.cos(a)*r);q.z+=Math.sin(a)*r*.7;
        positions.push(q.x,q.y,q.z);
      }
      if(i<rings)for(let j=0;j<sides;j++) {const a=i*sides+j,b=i*sides+(j+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,d,a,d,c);}
    }
    for(let j=1;j<sides-1;j++)indices.push(0,j+1,j,rings*sides,rings*sides+j,rings*sides+j+1);
    const flesh=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));flesh.setIndex(indices);flesh.computeVertexNormals();add(flesh,1,'ochre');
    // Overlapping low scales follow the curving body, including its bend and belly.
    for(let i=4;i<49;i++){
      const t=i/52,p=dragon.getPoint(t),tangent=dragon.getTangent(t),normal=new THREE.Vector3(-tangent.y,tangent.x,0),r=radiusAt(t);
      for(let j=-1;j<=1;j++){
        const a=(j+(i%2)*.24)*.53,q=p.clone().addScaledVector(normal,Math.sin(a)*r),front=side*(46+Math.cos(a)*r*.72);
        const x=q.x,y=537-q.y,dx=tangent.x*2,dy=-tangent.y*2,nx=normal.x*2,ny=-normal.y*2;
        relief([[x-nx-dx,y-ny-dy],[x-dx*1.3,y-dy*1.3],[x+nx-dx,y+ny-dy]],.72,front,.74,'ochre');
      }
      if(i%3===0){
        const q=p.clone().addScaledVector(normal,r);
        ellipsoid(q.x,537-q.y,side*48,2.0,2.7,2,1,'ochre');
      }
    }
    ellipsoid(269,262,side*50,15,9,6,1.03,'ochre');
    ellipsoid(269,254,side*57,3,2.5,1.7,.57,'dark');
    relief([[272,255],[280,249],[277,243],[271,248],[260,247],[252,250]],2.0,side*55,1.05,'ivory');
    relief([[257,257],[247,254],[240,246],[240,238]],2.1,side*50,1,'ochre');
    relief([[263,271],[251,281],[239,270],[226,260]],2.4,side*50,1,'ochre');
    relief([[297,278],[304,296],[321,305],[333,321]],2.6,side*50,1,'ochre');
    relief([[291,191],[281,211],[261,207],[253,196]],2.3,side*50,1,'ochre');
    relief([[253,166],[240,180],[228,176],[227,191]],2.3,side*50,1,'ochre');
    ellipsoid(287,202,side*49,6,10,4,1,'ochre');
    ellipsoid(306,291,side*49,6,10,4,1,'ochre');
    relief([[275,269],[267,273],[255,268],[250,263]],2.2,side*57,.81,'ochre');
    for(let i=0;i<8;i++)relief([[279+i*1.2,258+i*2],[292+i*.5,257+i*2],[288+i*.5,264+i*2]],1.1,side*52,1,'ochre');
    for(const [x,y,dx,dy] of [[226,260,-1,-1],[333,321,-1,1],[253,196,-1,-1],[227,191,-1,1]])
      for(let k=0;k<3;k++)relief([[x,y],[x+dx*(5+k*2),y+dy*(3+k*2)],[x+dx*(6+k*2),y+dy*(9+k*2)]],1.1,side*50,1,'ochre');
    // Small scales track only the side dragon, leaving the main tail's shallow fan plain.
    for(let i=0;i<11;i++) {
      const t=i/10,x=292+34*Math.sin(t*Math.PI*.78),y=193+75*t;
      relief([[x-2,y-2],[x+3,y],[x+2,y+4]],.9,side*56,.88,'ochre');
    }
  }
  const merged=mergeGeometries(pieces,false);
  pieces.forEach(g=>g.dispose());
  if(!merged)throw new Error('无法生成鸱吻几何');
  merged.computeBoundingBox();
  const bounds=merged.boundingBox!,center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
  merged.translate(-center.x,-center.y,-center.z).scale(1/size.x,1/size.y,1/size.z);
  merged.computeBoundingBox();
  // Keep the smooth bevel/rounded relief normals produced above; no flat recomputation.
  return merged;
}
