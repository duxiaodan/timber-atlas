import {buildOrdinaryPressureSupportJoints} from './lib/ordinary-pressure-support-joints';
import {buildHeadfangSpliceJoints} from './lib/headfang-splice-joints';
import {buildPressureSpliceJoints} from './lib/pressure-splice-joints';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Box3,BoxGeometry,BufferGeometry,BufferGeometryLoader,Float32BufferAttribute,Matrix4,Quaternion,Euler,Vector3} from 'three';
import {Brush,Evaluator,SUBTRACTION,INTERSECTION,ADDITION} from 'three-bvh-csg';
import {createCatalog} from '../src/model/catalog';
import {geometry} from '../src/model/geometry';
import type {Part} from '../src/model/types';
import {buildHipPurlinJoints} from './lib/hip-purlin-joints';
import {buildCentralFrameJoints} from './lib/central-frame-joints';
import {buildEndFrameJoints} from './lib/end-frame-joints';

// Bounded recipes: opposing lap faces at documented transverse-gong/ang crossings.
// Cao 2005 pp.99–100 motivate the connection family; these cuts remain project inferences.
const catalog=createCatalog(false),evaluator=new Evaluator();evaluator.useGroups=false;evaluator.attributes=['position','normal'];
// End-profile adjustment is applied after loading the carved core at runtime.
// Bake the unchanged joint-bearing core so the head is not lowered twice.
for(const p of catalog.parts)if(p.shape.startsWith('vaseYou:'))p.shape=p.shape.slice(8) as Part['shape'];
const assignments:Record<string,string>={},meshes:Record<string,unknown>={},supports:Record<string,string[]>={};
function matrix(p:Part){return new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));}
function brush(g:BufferGeometry){
  if(!Array.from(g.getAttribute('position').array).every(Number.isFinite))throw new Error('Non-finite joint geometry; refusing to bake');
  const b=new Brush(g);b.updateMatrixWorld();return b;
}
function components(g:BufferGeometry,discardSheets=false){
  const points=g.getAttribute('position'),ids=new Map<string,number>(),vertices:number[]=[],parent:number[]=[];
  for(let i=0;i<points.count;i++){const key=[points.getX(i),points.getY(i),points.getZ(i)].map(v=>Math.round(v*1e5)).join(':');let id=ids.get(key);if(id===undefined){id=ids.size;ids.set(key,id);parent.push(id);}vertices.push(id);}
  const root=(i:number):number=>parent[i]===i?i:parent[i]=root(parent[i]);
  const count=g.index?.count??points.count,triangles:number[][]=[];
  for(let i=0;i<count;i+=3){const indices=[0,1,2].map(k=>g.index?g.index.getX(i+k):i+k),tri=indices.map(k=>vertices[k]);triangles.push(indices);for(let k=1;k<3;k++)parent[root(tri[k])]=root(tri[0]);}
  const groups=new Map<number,number[][]>();for(const tri of triangles){const id=root(vertices[tri[0]]),group=groups.get(id)??[];group.push(tri);groups.set(id,group);}
  if(groups.size<2)return groups.size;
  // Reject disconnected wood. Coplanar cuts can also emit isolated, double-sided
  // sheets with no timber volume; discard only residue below 10um thickness.
  const a=new Vector3(),b=new Vector3(),c=new Vector3();
  const solid=[...groups.values()].filter(group=>{
    if(!discardSheets)return group.some(tri=>{
      a.fromBufferAttribute(points,tri[0]);b.fromBufferAttribute(points,tri[1]);c.fromBufferAttribute(points,tri[2]);
      const edge=Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a));return b.sub(a).cross(c.sub(a)).length()>edge*1e-5;
    });
    let origin:Vector3|undefined,normal:Vector3|undefined,largest=0;
    for(const tri of group){
      a.fromBufferAttribute(points,tri[0]);b.fromBufferAttribute(points,tri[1]);c.fromBufferAttribute(points,tri[2]);
      const edge=Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a)),n=b.sub(a).cross(c.sub(a)),area=n.length();
      if(area>edge*1e-5&&area>largest){largest=area;origin=a.clone();normal=n.normalize();}
    }
    return !!normal&&group.some(tri=>tri.some(i=>Math.abs(a.fromBufferAttribute(points,i).sub(origin!).dot(normal!))>1e-5));
  });
  if(solid.length!==groups.size){
    const map=new Map<number,number>(),used:number[]=[],index=solid.flat(2).map(id=>{let n=map.get(id);if(n===undefined){n=used.length;map.set(id,n);used.push(id);}return n;});
    for(const [name,attribute] of Object.entries(g.attributes)){const values=used.flatMap(id=>Array.from({length:attribute.itemSize},(_,k)=>attribute.array[id*attribute.itemSize+k]));g.setAttribute(name,new Float32BufferAttribute(values,attribute.itemSize));}
    g.setIndex(index);g.computeBoundingBox();
  }
  return solid.length;
}
// Complete the outer-end pressure/hip cuts before the independent inner grass
// junction. Cutting the inner end first left a spurious outer side triangle
// after subsequent coplanar CSG operations on the northeast grass beam.
const jobs=[['outer','outer-bracket-3-4'],...catalog.assemblies.filter(a=>a.variant==='outer').map(a=>['outerBack',a.id]),['innerSide','inner-bracket-6-2'],['inner','inner-bracket-3-3'],...catalog.assemblies.filter(a=>a.variant==='inner'||a.variant==='innerSide').map(a=>['innerBack',a.id]),...catalog.assemblies.filter(a=>a.variant==='cornerInner').map(a=>['cornerRoot',a.id]),...catalog.assemblies.filter(a=>a.variant==='interOuter'||a.variant==='interInner').map(a=>[a.variant==='interOuter'?'interComplete':'innerInterComplete',a.id]),...catalog.parts.filter(p=>p.kind==='明乳栿连第二跳华栱').map(p=>['radialStraight',p.id]),...catalog.assemblies.filter(a=>a.variant==='cornerInner').flatMap(a=>[['cornerMilk',a.id],['cornerThird',a.id],['cornerFourth',a.id],['cornerFifth',a.id],['cornerSixth',a.id],['cornerSixthWing',a.id],['cornerSeventh',a.id]]),...catalog.assemblies.filter(a=>a.variant==='cornerOuter').flatMap(a=>[['outerCornerRoot',a.id],['outerCornerMilk',a.id],['outerCross',a.id],['cornerFaces',a.id],['cornerPressure',a.id],['cornerRoof',a.id],['cornerLowCeiling',a.id]]),...catalog.assemblies.filter(a=>a.variant==='cornerInner').flatMap(a=>[['cornerGrass',a.id],['cornerSeventhTail',a.id],['cornerJiao',a.id],['cornerJiaoSeat',a.id]]),...catalog.parts.filter(p=>p.kind==='首跳后尾承乳栿斗').map(p=>['rearRootSeat',p.id])];
for(const [variant,prototype] of jobs){
  const rearRootSeat=variant==='rearRootSeat',seventh=variant==='cornerSeventh',seventhTail=variant==='cornerSeventhTail',jiao=variant==='cornerJiao',jiaoSeat=variant==='cornerJiaoSeat',fifth=variant==='cornerFifth',sixth=variant==='cornerSixth',sixthWing=variant==='cornerSixthWing',grass=variant==='cornerGrass',fourth=variant==='cornerFourth',third=variant==='cornerThird',low=variant==='cornerLowCeiling',back=variant==='outerBack'||variant==='innerBack',press=variant==='cornerPressure',faces=variant==='cornerFaces',roof=variant==='cornerRoof',outerCross=variant==='outerCross'||back,radial=variant==='radialStraight',inter=variant==='interComplete'||variant==='innerInterComplete',outerRoot=variant==='outerCornerRoot',outerMilk=variant==='outerCornerMilk',cornerRoot=variant==='cornerRoot'||outerRoot,cornerMilk=variant==='cornerMilk'||outerMilk,threeWay=seventh||seventhTail||jiao||grass||fifth||sixth||fourth||third||cornerRoot||cornerMilk||press,single=rearRootSeat||jiaoSeat||sixthWing||low||radial||inter||threeWay||outerCross||roof||faces,family=catalog.assemblies.filter(a=>a.variant===variant);
  const instanceIds=(id:string)=>single?[id]:family.map(instance=>instance.id+id.slice(prototype.length));
  const cornerAssembly=catalog.assemblies.find(a=>a.id===prototype);
  const crossGroups=variant==='innerBack'?[['03',`back-arm-column-${prototype.split('-').slice(-2).join('-')}`]]:back?[['03',`back-arm-column-${prototype.split('-').slice(-2).join('-')}`],['10',`back-arm-column-${prototype.split('-').slice(-2).join('-')}`,'17']]:[['03','corner-fang-z-2'],['17','37','50'],['19','39','51'],['10','30','50'],['13','33','51'],['corner-upper-ling-x','corner-upper-ling-z','53'],['25','45']];
  const crossId=(suffix:string)=>suffix.startsWith('back-arm-')?suffix:`${prototype}-${suffix}`;
  const cornerSuffix=prototype.split('-').slice(-2).join('-'),cornerRootPart=catalog.parts.find(p=>p.id===`${prototype}-00`);
  const roofIds=[`${prototype}-25`,`${prototype}-45`,`${prototype}-55`,`${prototype}-corner-pressure-z`,`grass-milk-${cornerSuffix}`,`hip-main-${Math.sign(cornerRootPart?.position[0]??0)}-${Math.sign(cornerRootPart?.position[2]??0)}`];
  const [innerX,innerZ]=cornerSuffix.split('-').map(Number),grassIds=[`grass-milk-${innerX===1?0:7}-${innerZ}`,`grass-milk-${innerX}-${innerZ===1?0:4}`,`grass-milk-${innerX===1?0:7}-${innerZ===1?0:4}`];
  const parts=catalog.parts.filter(p=>rearRootSeat?(p.id===prototype||p.requires.includes(prototype)||catalog.parts.find(p=>p.id===prototype)!.requires.includes(p.id)):seventh?[`${prototype}-seventh-a`,`${prototype}-seventh-b`,`${prototype}-seventh-d`].includes(p.id):seventhTail?[grassIds[2],`${prototype}-seventh-d`].includes(p.id):jiao?grassIds.map(id=>id.replace("grass-","jiao-")).includes(p.id):jiaoSeat?[`${prototype}-seventh-d`,...grassIds.map(id=>id.replace("grass-","jiao-"))].includes(p.id):grass?grassIds.includes(p.id):sixthWing?[`${prototype}-sixth-wing`,`${prototype}-sixth-sixfen`].includes(p.id):(fifth||sixth)?[`${prototype}-0${fifth?5:6}`,`${prototype}-corner-fang-z-${fifth?4:5}`,`${prototype}-${fifth?'fifth-wing':'sixth-sixfen'}`].includes(p.id):fourth?(cornerAssembly!.partIds.includes(p.id)&&p.id.startsWith('ceiling-arm-')):third?[`${prototype}-03`,`${prototype}-corner-fang-z-2`,`back-arm-column-${cornerSuffix}`].includes(p.id):low?[`${prototype}-50`,`ceiling-radial-milk-${cornerSuffix}`].includes(p.id):press?[`${prototype}-55`,`${prototype}-corner-pressure-z`,`grass-milk-${cornerSuffix}`].includes(p.id):faces?p.assembly===prototype:roof?roofIds.includes(p.id):outerCross?crossGroups.flat().some(s=>p.id===crossId(s)):outerRoot?(['06','26','46'].some(s=>p.id===`${prototype}-${s}`)):outerMilk?(['08','28'].some(s=>p.id===`${prototype}-${s}`)||(cornerAssembly!.partIds.includes(p.id)&&p.kind==='角乳栿连角华栱')):cornerMilk?(cornerAssembly!.partIds.includes(p.id)&&p.kind.includes('乳栿连')):cornerRoot?(p.assembly===prototype&&(p.kind==='泥道栱'||p.id.endsWith('-root-b')||(p.kind==='内角斜华栱'&&p.requires.includes(`${prototype}-00`)))):radial?(p.id===prototype||(p.kind==='第1层柱头枋节点'&&['outer','inner','innerSide'].includes(catalog.assemblies.find(a=>a.id===p.assembly)?.variant??''))):inter?(p.assembly===prototype||[1,2,3,4,5].some(l=>p.id===prototype.replace('-inter-','-headfang-')+`-${l}`)):p.assembly===prototype);
  const live=new Map(parts.map(p=>[p.id,brush((assignments[p.id]?new BufferGeometryLoader().parse(meshes[assignments[p.id]] as any):geometry(p.shape,p.size).clone()).applyMatrix4(matrix(p)))])),changed=new Set<string>();
  const yawOf=(p:Part)=>{const a=new Vector3(1,0,0).applyEuler(new Euler(...p.rotation));return Math.atan2(-a.z,a.x);};
  const rootRank=(p:Part)=>seventh?['a','b','d'].findIndex(axis=>p.id===`${prototype}-seventh-${axis}`):seventhTail?(p.id===grassIds[2]?0:1):jiao?grassIds.findIndex(id=>p.id===id.replace('grass-','jiao-')):grass?(p.kind==='草角乳栿'?2:Math.abs(Math.cos(yawOf(p)))>.9?0:1):(fifth||sixth)?(p.id===`${prototype}-0${fifth?5:6}`?0:p.id===`${prototype}-corner-fang-z-${fifth?4:5}`?1:2):fourth?(p.kind.startsWith('内角第四')?2:Math.abs(Math.cos(yawOf(p)))>.9?0:1):third?(p.id===`${prototype}-03`?0:p.id===`${prototype}-corner-fang-z-2`?1:2):press?(p.kind==='草角乳栿'?0:p.id===`${prototype}-55`?1:2):outerRoot?['06','26','46'].findIndex(s=>p.id===`${prototype}-${s}`):outerMilk?(p.id===`${prototype}-08`?0:p.id===`${prototype}-28`?1:2):cornerMilk?(p.kind.startsWith('角')?2:Math.abs(Math.cos(yawOf(p)))>.9?0:1):p.kind==='泥道栱'?0:p.id.endsWith('-root-b')?1:2;
  const pairs:[Part,Part][]=[];
  for(const p of parts)for(const q of parts){
    const gongAng=(['瓜子栱','慢栱','第3层柱头枋节点','第4层柱头枋节点'].includes(p.kind)&&q.kind.includes('下昂'));
    const shua=p.kind==='令栱'&&q.kind==='批竹耍头';
    const sideFang=(variant==='innerSide'||variant==='inner')&&p.kind.includes('柱头枋节点')&&(['第3跳华栱（偷心）','山面六分头','山面批竹头','山面第六层翼形头'].includes(q.kind));
    const sideWing=(variant==='innerSide'&&p.kind==='山面第六层小翼形栱'&&q.kind==='山面第六层翼形头')||(sixthWing&&p.id===`${prototype}-sixth-wing`&&q.id===`${prototype}-sixth-sixfen`);
    const sideCeiling=variant==='innerSide'&&p.kind==='山面横向平棊枋段'&&q.kind==='山面纵向平棊枋段';
    const milkFang=radial&&p.kind==='第1层柱头枋节点'&&q.id===prototype;
    const interFang=inter&&p.kind.includes('层柱头枋')&&['补间第一跳华栱','补间第二跳华栱','批竹耍头','补间第1跳华栱','补间第2跳华栱','补间第3跳华栱'].includes(q.kind);
    const interWing=inter&&p.kind==='翼形栱'&&q.kind==='补间第二跳华栱';
    const interShua=inter&&['补间令栱','后尾令栱'].includes(p.kind)&&['批竹耍头','补间第1跳华栱'].includes(q.kind);
    const blind=variant==='innerInterComplete'&&p.kind.includes('层柱头枋')&&q.kind==='后尾丁头短栱';
    const headSeat=variant==='innerInterComplete'&&p.kind==='交互斗'&&q.kind.includes('跳华栱')&&q.requires.includes(p.id);
    const bevel=faces&&/^第[234]层柱头枋节点$/.test(p.kind)&&q.kind.includes('下昂')&&q.kind.includes(p.kind.startsWith('第4')?'第二':'第一');
    const mitre=faces&&[['04','corner-fang-z-3'],['05','corner-fang-z-4']].some(([a,b])=>p.id===`${prototype}-${a}`&&q.id===`${prototype}-${b}`);
    if(rearRootSeat?(p.id===prototype&&q.id!==prototype):jiaoSeat?(p.id===`${prototype}-seventh-d`&&q.id.startsWith('jiao-')):low?(p.kind==='低平闇径向平棊枋'&&q.kind==='第一层角下昂'):faces?(bevel||mitre||shua):((roof&&p.kind!=='大角梁'&&q.kind==='大角梁')||(outerCross&&crossGroups.some(group=>{const a=group.findIndex(s=>p.id===crossId(s)),b=group.findIndex(s=>q.id===crossId(s));return a>=0&&b>a;}))||(threeWay&&rootRank(p)<rootRank(q))||gongAng||shua||sideFang||sideWing||sideCeiling||milkFang||interFang||interWing||interShua||blind||headSeat))pairs.push([p,q]);
  }
  for(const [p,q] of pairs){
    const lower=live.get(p.id)!,upper=live.get(q.id)!;
    lower.geometry.computeBoundingBox();upper.geometry.computeBoundingBox();
    const overlap=lower.geometry.boundingBox!.clone().intersect(upper.geometry.boundingBox!);
    const size=overlap.getSize(new Vector3()),center=overlap.getCenter(new Vector3());
    if(overlap.isEmpty()||Math.min(...size.toArray())<.005)continue;
    const solid=evaluator.evaluate(lower,upper,INTERSECTION),hasVolume=solid.geometry.getAttribute('position').count>0;solid.geometry.dispose();
    if(!hasVolume)continue;
    if(rearRootSeat&&p.requires.includes(q.id)){
      const cutter=brush(new BoxGeometry(p.size[0],20,p.size[2]).rotateY(yawOf(p)).translate(p.position[0],p.position[1]-.48*p.size[1]+10,p.position[2]));
      const next=evaluator.evaluate(upper,cutter,SUBTRACTION);cutter.geometry.dispose();
      if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Rear first-jump sole splits ${q.id}`);
      next.updateMatrixWorld();live.set(q.id,next);changed.add(q.id);upper.geometry.dispose();continue;
    }
    if(jiaoSeat||rearRootSeat){
      const cutter=brush(new BoxGeometry(p.size[0],20,p.size[2]).rotateY(yawOf(p)).translate(p.position[0],p.position[1]+p.size[1]*(rearRootSeat?.08:.5)-10,p.position[2]));
      const next=evaluator.evaluate(upper,cutter,SUBTRACTION);cutter.geometry.dispose();
      if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Seventh tail seat splits ${q.id}`);
      next.updateMatrixWorld();live.set(q.id,next);changed.add(q.id);upper.geometry.dispose();supports[q.id]=[...new Set([...supports[q.id]??[],p.id])];continue;
    }
    if(low){
      // Keep the full ceiling timber, including its future transverse lap.
      // The first diagonal ang receives a local underside seat above it.
      const cutter=brush(new BoxGeometry(p.size[0],20,p.size[2]).rotateY(yawOf(p)).translate(p.position[0],p.position[1]+p.size[1]/2-10,p.position[2]));
      const next=evaluator.evaluate(upper,cutter,SUBTRACTION);cutter.geometry.dispose();
      if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Low ceiling seat splits ${q.id}`);
      next.updateMatrixWorld();live.set(q.id,next);changed.add(q.id);upper.geometry.dispose();
      supports[q.id]=[...new Set([...supports[q.id]??[],p.id])];continue;
    }
    if(faces&&/^第[234]层柱头枋节点$/.test(p.kind)){
      if(q.kind.includes('下昂')){
        const next=evaluator.evaluate(lower,upper,SUBTRACTION);
        if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Corner bevel splits ${p.id} at ${q.id}`);
        next.updateMatrixWorld();live.set(p.id,next);changed.add(p.id);lower.geometry.dispose();supports[q.id]=[...new Set([...supports[q.id]??[],p.id])];continue;
      }
      const root=cornerRootPart!,normal=new Vector3(Math.sign(root.position[0]),0,-Math.sign(root.position[2])).normalize(),yaw=Math.atan2(-normal.z,normal.x);
      for(const [part,b,sign] of [[p,lower,1],[q,upper,-1]] as const){
        const cutter=brush(new BoxGeometry(20,20,30).rotateY(yaw).translate(root.position[0]+normal.x*sign*(10-.0001),root.position[1],root.position[2]+normal.z*sign*(10-.0001)));
        const next=evaluator.evaluate(b,cutter,SUBTRACTION);cutter.geometry.dispose();
        if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Corner mitre splits ${part.id}`);
        next.updateMatrixWorld();live.set(part.id,next);changed.add(part.id);b.geometry.dispose();
      }
      supports[q.id]=[...new Set([...supports[q.id]??[],p.id])];continue;
    }
    if(p.kind==='交互斗'){
      const cutter=brush(new BoxGeometry(p.size[0],20,p.size[2]).translate(p.position[0],p.position[1]+.08*p.size[1]-10,p.position[2]));
      const next=evaluator.evaluate(upper,cutter,SUBTRACTION);
      if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Head seat would split ${q.id}`);
      next.updateMatrixWorld();live.set(q.id,next);changed.add(q.id);upper.geometry.dispose();cutter.geometry.dispose();continue;
    }
    if(q.kind==='后尾丁头短栱'){
      // Only the short tenon reaches inside the fang. Preserve a blind back wall;
      // this joint opens toward the rear insertion direction, with no through cut.
      const tenon=brush(new BoxGeometry(.072/q.size[0],.32+.002/q.size[1],.48+.002/q.size[2]).translate(.5-.035/q.size[0],0,0).applyMatrix4(matrix(q)));
      const next=evaluator.evaluate(lower,tenon,SUBTRACTION);
      if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Blind mortise would split ${p.id}`);
      next.updateMatrixWorld();live.set(p.id,next);changed.add(p.id);lower.geometry.dispose();tenon.geometry.dispose();continue;
    }
    if(roof&&(p.kind==='替木'||p.kind==='压槽枋节点')){
      const cutter=brush(new BoxGeometry(p.size[0],20,p.size[2]).rotateY(yawOf(p)).translate(p.position[0],p.position[1]+(p.kind==='替木'?p.size[1]/2:p.id.endsWith('-55')?-.0525:.0525)-10,p.position[2]));
      const combined=p.kind==='压槽枋节点'?evaluator.evaluate(cutter,lower,ADDITION):undefined;
      const next=evaluator.evaluate(upper,combined??cutter,SUBTRACTION);combined?.geometry.dispose();
      if(!next.geometry.getAttribute('position').count||components(next.geometry)!==1)throw new Error(`Roof bearing would split ${q.id} at ${p.id}`);
      next.updateMatrixWorld();live.set(q.id,next);changed.add(q.id);upper.geometry.dispose();cutter.geometry.dispose();
      supports[q.id]=[...new Set([...supports[q.id]??[],p.id])];continue;
    }
    const crossGroup=outerCross?crossGroups.find(g=>g.some(s=>p.id===crossId(s))&&g.some(s=>q.id===crossId(s))):undefined;
    const crossAng=crossGroup?.length===3?parts.find(r=>r.id===crossId(crossGroup[2])):undefined;
    const axisPart=crossAng??q,axis=new Vector3(1,0,0).applyEuler(new Euler(...axisPart.rotation)),horizontal=axis.x**2+axis.z**2;
    const sx=roof||crossAng||axisPart.kind.includes('下昂')?axis.x*axis.y/horizontal:0,sz=roof||crossAng||axisPart.kind.includes('下昂')?axis.z*axis.y/horizontal:0;
    const interfaceY=seventhTail?parts.find(p=>p.id===grassIds[2])!.position[1]+.14:roof?q.position[1]+(center.x-q.position[0])*sx+(center.z-q.position[2])*sz:crossAng?crossAng.position[1]+(center.x-crossAng.position[0])*sx+(center.z-crossAng.position[2])*sz+(p.id===crossId(crossGroup![0])?-.0525:.0525):press?parts.find(p=>p.id===`${prototype}-55`)!.position[1]+(rootRank(p)===0?-.0525:.0525):threeWay?p.position[1]+(rootRank(p)===0?-1:1)*(jiao?.035:grass?.07:cornerMilk?.06:.0525):q.kind.includes('下昂')?q.position[1]+(center.x-q.position[0])*sx+(center.z-q.position[2])*sz:center.y;
    function openCutter(sign:number,target:Part){
      if(threeWay||outerCross||roof){
        const prism=(part:Part)=>brush(new BoxGeometry(part.size[0],20,part.size[2]).rotateY(yawOf(part)).translate(part.position[0],interfaceY+sign*10,part.position[2]));
        const a=prism(p),b=prism(q),intersection=evaluator.evaluate(a,b,INTERSECTION);a.geometry.dispose();b.geometry.dispose();
        // Cut a full-width carpenter's notch in each timber. Leaving the diagonal
        // outline of the opposing footprint produces detached chips at the curved belly.
        const yaw=yawOf(target),inverse=new Matrix4().makeRotationY(-yaw),verts=intersection.geometry.getAttribute('position');
        let lo=Infinity,hi=-Infinity;
        for(let i=0;i<verts.count;i++){const v=new Vector3(verts.getX(i)-target.position[0],0,verts.getZ(i)-target.position[2]).applyMatrix4(inverse);lo=Math.min(lo,v.x);hi=Math.max(hi,v.x);}
        intersection.geometry.dispose();
        // An end-open notch must pass through the stock end. Coincident CSG
        // faces otherwise leave a wafer at floating-point precision.
        if((press||roof)&&target.kind==='草角乳栿'){
          if(Math.abs(lo+target.size[0]/2)<.002)lo=-target.size[0]/2-.002;
          if(Math.abs(hi-target.size[0]/2)<.002)hi=target.size[0]/2+.002;
        }
        const g=new BoxGeometry(hi-lo,20,target.size[2]+.002).translate((lo+hi)/2,0,0).rotateY(yaw).translate(target.position[0],interfaceY+sign*10,target.position[2]);
        if(crossAng||roof){const v=g.getAttribute('position');for(let i=0;i<v.count;i++)v.setY(i,v.getY(i)+(v.getX(i)-center.x)*sx+(v.getZ(i)-center.z)*sz);g.computeVertexNormals();}
        const cut=brush(g);
        if(roof&&sign<0){
          const cap=brush(new BoxGeometry(100,20,100).translate(center.x,p.position[1]+p.size[1]/2-10,center.z)),clipped=evaluator.evaluate(cut,cap,INTERSECTION);
          cap.geometry.dispose();cut.geometry.dispose();clipped.updateMatrixWorld();return clipped;
        }
        return cut;
      }
      const g=new BoxGeometry(size.x,20,size.z).translate(center.x,interfaceY+sign*10,center.z),position=g.getAttribute('position');
      for(let i=0;i<position.count;i++)position.setY(i,position.getY(i)+(position.getX(i)-center.x)*sx+(position.getZ(i)-center.z)*sz);
      g.computeVertexNormals();return brush(g);
    }
    // Both mouths remain open along the insertion axis. Subtracting only the final
    // solid intersection left a lower sliver wrapping around the opposing timber.
    const above=openCutter(1,p),below=openCutter(-1,q);
    const nextLower=evaluator.evaluate(lower,above,SUBTRACTION),nextUpper=evaluator.evaluate(upper,below,SUBTRACTION);
    for(const [part,next] of [[p,nextLower],[q,nextUpper]] as const){
      if(!next.geometry.getAttribute('position').count||components(next.geometry,variant==='outer'||variant==='outerBack')!==1)throw new Error(`Joint would split or erase ${part.id} at ${p.id}/${q.id}`);
      next.updateMatrixWorld();live.set(part.id,next);changed.add(part.id);
    }
    for(const item of [above,below,lower,upper])item.geometry.dispose();
    const copiedQ=instanceIds(q.id),copiedP=instanceIds(p.id);
    copiedQ.forEach((id,i)=>supports[id]=[...new Set([...supports[id]??[],copiedP[i]])]);
  }
  for(const p of parts){
    const b=live.get(p.id)!;
    if(changed.has(p.id)){
      const g=b.geometry.applyMatrix4(matrix(p).invert()),positions=g.getAttribute('position');
      // Identical local meshes reuse one instanced batch across column positions.
      const triangles=[];for(let i=0;i<(g.index?.count??positions.count);i+=3){const tri=[];for(let j=0;j<3;j++){const k=g.index?g.index.getX(i+j):i+j;tri.push([positions.getX(k),positions.getY(k),positions.getZ(k)].map(v=>Math.round(v*1e5)).join(','));}tri.sort();triangles.push(tri.join(';'));}triangles.sort();
      // This complete intercolumn recipe is invariant in its local axes; span
      // length varies by bay, and blind mouths also retain their opening side.
      // Reuse equivalent surfaces across rotations
      // instead of storing different CSG triangulations of the same surfaces.
      const blindPartner=variant==='innerInterComplete'&&parts.find(q=>q.kind==='后尾丁头短栱'&&Math.abs(q.position[1]-p.position[1])<.01);
      const blindSide=blindPartner?Math.sign(new Vector3(...blindPartner.position).applyMatrix4(matrix(p).invert()).z):0;
      const identity=back?`${variant}:${p.kind}:${p.size.map(v=>v.toFixed(5)).join(':')}`:inter?`${variant}:${p.kind}:${p.size.map(v=>v.toFixed(5)).join(':')}:${blindSide}`:triangles.join('|');
      const key=createHash('sha256').update(identity).digest('hex').slice(0,16);
      for(const id of instanceIds(p.id))assignments[id]=key;
      if(!meshes[key]){
        const data=g.toJSON();
        for(const attribute of Object.values(data.data.attributes) as {array:number[]}[])attribute.array=attribute.array.map(v=>Math.round(v*1e6)/1e6);
        meshes[key]=data;
      }
    }
    b.geometry.dispose();
  }
}
buildHipPurlinJoints(catalog,assignments,meshes,supports,components);
buildCentralFrameJoints(catalog,assignments,meshes,supports,components);
buildEndFrameJoints(catalog,assignments,meshes,supports,components);
buildOrdinaryPressureSupportJoints(catalog,assignments,meshes,components);
buildPressureSpliceJoints(catalog,assignments,meshes,components);
buildHeadfangSpliceJoints(catalog,assignments,meshes,components);
// Intermediate machining meshes can become unreferenced after a later joint pass.
const used=new Set(Object.values(assignments));for(const key of Object.keys(meshes))if(!used.has(key))delete meshes[key];
writeFileSync('src/model/bracket-joints.json',JSON.stringify({assignments,meshes,supports})+'\n');
console.log(`Baked ${Object.keys(assignments).length} members into ${Object.keys(meshes).length} local meshes.`);
