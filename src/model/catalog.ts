import {drainWork,runWork,type WorkProgress} from '../work-batches';
import {installDouProfiles,installDouFittings,installSharedDouSeats} from './dou-installation';
import {LOW_CEILING_X,LOW_CEILING_Z,buildCeilingCoves} from './ceiling-coves';
import legacyCeilingScope from './legacy-ceiling-scope.json';
import {roofBoardPlacement} from './roof-boards';
import {CORNER_VASE} from './corner-vase';
import {EAVE_DRAGON_FRAME} from './eave-dragon-frame';
import {PLAQUE_SIZE,PLAQUE_POSITION,PLAQUE_TILT,plaqueBackAt} from './front-plaque-profile';
import { DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { Assembly, Catalog, Evidence, Layer, Part, Vec3 } from './types';
import { sources } from './sources';
import bracketJoints from './bracket-joints.json';
import legacyBackArmScopes from './legacy-back-arm-scopes.json';
import legacyLowCeilingScopes from './legacy-low-ceiling-scopes.json';
import legacyCornerScopes from './legacy-corner-scopes.json';
import { buildBracket, type BracketStyle } from './brackets';
import { geometry } from './geometry';
import {HEADFANG_SPLICE} from './headfang-splices';
import { LOW_CEILING } from './low-ceiling-levels';
import {resolveCeilingRimOverlaps} from './ceiling-rim-overlaps';
import {buildEarMud} from './ear-mud';
import {buildOuterInfill} from './outer-infill';
import wallJoints from './wall-joints.json';
import roofJoints from './roof-joints.json';
import rafterBoardCuts from './rafter-board-cuts.json';
import {HIP_RIDGE,hipRidgeSpan} from './roof-ridges';
import {seatedRafterChain} from './rafter-joints';

// Metres. Regularised design grid, rather than a claim of a point-cloud replica.
export const GRID_X = [-17.01, -12.6, -7.56, -2.52, 2.52, 7.56, 12.6, 17.01];
export const GRID_Z = [-8.82, -4.41, 0, 4.41, 8.82];
export const FLOOR = 0.9;
export const COLUMN_HEIGHT = 4.9875;
export const COLUMN_TOP = FLOOR + COLUMN_HEIGHT;
export const PRESSURE_SPLICE_OVERLAP=.12;
const MAIN_BEAM_LEVEL=2.0537;
const INNER_CEILING_LEVEL=MAIN_BEAM_LEVEL+1.31;
// Shared high-ceiling boundaries, located at the third-jump bearing axes.
// Offsets and joints are inferred without member-specific survey measurements.
const HIGH_CEILING_X=[GRID_X[1]+1.428,...GRID_X.slice(2,6),GRID_X[6]-1.428];
const HIGH_CEILING_Z=[GRID_Z[1]+1.428,0,GRID_Z[3]-1.428];
export const ROOF = { halfWidth: 20.748, halfDepth: 12.558, ridgeHalf: 8.56, ridge: FLOOR + 12.2955, eave: FLOOR + 6.783 };
// Keep measured column/jump axes on the hip ends; only the approximate ridge termination transitions.
export function hipX(run:number):number {
  const base=ROOF.halfWidth-ROOF.halfDepth,transition=2.205;
  return base+run+(run<transition?(ROOF.ridgeHalf-base)*(1-run/transition)**2:0);
}
export function hipRun(x:number):number {
  const base=ROOF.halfWidth-ROOF.halfDepth,transition=2.205;
  if(x<=ROOF.ridgeHalf)return 0;
  if(x>=base+transition)return x-base;
  const a=(ROOF.ridgeHalf-base)/transition**2,b=1-2*(ROOF.ridgeHalf-base)/transition;
  return (-b+Math.sqrt(b*b+4*a*(x-ROOF.ridgeHalf)))/(2*a);
}
const profile = [[0,12.2955],[2.205,10.989537],[4.41,9.8385],[6.615,9.011625],[8.82,8.18475],[10.794,7.4445],[12.558,6.783]];
export function roofY(run: number): number {
  const t = Math.max(0,Math.min(ROOF.halfDepth,run));
  for(let i=1;i<profile.length;i++) if(t<=profile[i][0]) {
    const [x0,y0]=profile[i-1], [x1,y1]=profile[i];
    return FLOOR + y0+(y1-y0)*(t-x0)/(x1-x0);
  }
  return ROOF.eave;
}
export function roofPoint(x: number,z: number): Vec3 {
  return [x,roofY(Math.max(Math.abs(z),hipRun(Math.abs(x)))),z];
}

const basis: Record<string,Evidence> = {
  grid:{sources:['dpm2007','zhang2022'],basis:'七间四进深，外槽22柱、内槽14柱；采用研究者归纳的规则柱网。',inferred:'各柱现状侧脚、生起、倾斜与修补差异未逐件测绘；圆柱直径及隐藏柱头榫为规则化推定。'},
  bracket:{sources:['liang1937','dpm2007','cao2005'],basis:'按内外槽、柱头、补间、转角分别表达斗、华栱、泥道栱、慢栱、昂与枋的构造层级。',inferred:'单件轮廓、槽口和部分尺寸按材份规则化；隐藏榫卯为教学推定，不等同每个实物节点的精确测绘。'},
  roof:{sources:['zhang2022','liang1937'],basis:'单檐庑殿顶、槫距与举折依据研究剖面；檐部不另加飞椽。',inferred:'坡面插值、角部细曲线、板瓦搭接与条数按规则排布；不是逐瓦现状扫描。'},
  frame:{sources:['liang1937','dpm2007','cao2005'],basis:'内外槽、四椽栿、乳栿、平梁、敦㮇、叉手及槫构成的梁架。',inferred:'梁截面、细部榫卯和修补构件采用规则化表达，局部构造的实物细节尚缺充分资料。'},
  enclosure:{sources:['liang1937','isprs2021'],basis:'现状外观及空间布置参考调查与公开图像。',inferred:'墙、门窗、台基和塑像采用概括形体；壁画、塑像雕刻和表面损伤未精细复刻。'},
};

export type Input = Omit<Part,'rotation'|'explode'|'insertion'|'requires'|'evidence'|'joint'> & Partial<Pick<Part,'rotation'|'explode'|'insertion'|'requires'|'evidence'|'joint'>>;

export const CATALOG_TASKS=13;
export function createCatalog(useBakedJoints=true,useRoofJoints=true,useDouFittings=useBakedJoints):Catalog {
  return drainWork(catalogWork(useBakedJoints,useRoofJoints,useDouFittings));
}
export function createCatalogAsync(progress:WorkProgress){return runWork(catalogWork(),CATALOG_TASKS,progress);}
function* catalogWork(useBakedJoints=true,useRoofJoints=true,useDouFittings=useBakedJoints):Generator<number|null,Catalog> {
  const parts:Part[]=[]; const assemblies:Assembly[]=[]; const amap=new Map<string,Assembly>();
  function group(id:string,name:string,layer:Layer,description:string) {
    const a={id,name,layer,description,partIds:[] as string[]}; assemblies.push(a);amap.set(id,a);return id;
  }
  function add(p:Input):Part {
    const defaultEvidence=p.layer==='columns'?basis.grid : p.layer==='brackets'?basis.bracket : ['tiles','rafters','boards'].includes(p.layer)?basis.roof:p.layer==='frame'?basis.frame:basis.enclosure;
    const part:Part={rotation:[0,0,0],explode:[p.position[0]*0.12,0.5+p.stage*0.30,p.position[2]*0.15],insertion:[0,1,0],requires:[],evidence:defaultEvidence,joint:'按连接对象与插入方向复位；隐藏连接细节为推定。',...p};
    part.requires=[...new Set(part.requires)];
    parts.push(part);amap.get(part.assembly)!.partIds.push(part.id);return part;
  }
  function member(id:string,name:string,assembly:string,layer:Layer,a:Vec3,b:Vec3,width:number,depth:number,stage:number,requires:string[]=[],shape:Part['shape']='beam',role='连接相邻承重点，传递与分配荷载。') {
    const av=new Vector3(...a),bv=new Vector3(...b),delta=bv.clone().sub(av),mid=av.clone().add(bv).multiplyScalar(.5);
    const along=delta.clone().normalize(),across=along.clone().cross(new Vector3(0,1,0));
    if(across.lengthSq()<1e-10)across.set(0,0,1);else across.normalize();
    const e=new Euler().setFromRotationMatrix(new Matrix4().makeBasis(along,across.clone().cross(along).normalize(),across));
    return add({id,name,kind:name,assembly,layer,shape,material:'wood',position:mid.toArray() as Vec3,size:[delta.length(),width,depth],rotation:[e.x,e.y,e.z],stage,requires,role});
  }
  const base=group('platform','台基与踏道','base','整体台基、踏道和每根柱下的柱础。');
  add({id:'platform-main',name:'大殿台基',kind:'台基',assembly:base,layer:'base',shape:'box',material:'stone',position:[0,.38,0],size:[39,.76,22.5],stage:0,role:'抬高殿内地面，承接柱础并组织建筑基座。'});
  add({id:'platform-cap',name:'台明压面',kind:'台明',assembly:base,layer:'base',shape:'box',material:'stone',position:[0,.8,0],size:[39.2,.2,22.7],stage:1,requires:['platform-main'],role:'台基顶部的平整承托面。'});
  // Adjacent depth slices meet at their risers; overlapping boxes create coplanar side faces.
  // Preserve the five saved IDs and the front edge. The last slice fits under the cap overhang.
  const stairDepth=(13.45-11.25)/5;
  for(let i=0;i<5;i++){
    yield null;
    const height=FLOOR*(i+1)/5;
    add({id:`step-${i}`,name:`西面踏道第${i+1}级`,kind:'踏道',assembly:base,layer:'base',shape:i===4?'stairNotch:0.1:0.2':'box',material:'stone',position:[0,height/2,13.45-stairDepth*(i+.5)],size:[9,height,stairDepth],stage:1,requires:['platform-main'],role:'连接殿前地面与台明。'});
  }
  const columns=group('column-grid','内外槽柱网','columns','外槽22根柱与内槽14根柱，形成金厢斗底槽式空间。');
  const outer:{x:number;z:number;id:string;ix:number;iz:number;corner:boolean}[]=[];
  const inner:typeof outer=[];
  for(let ix=0;ix<GRID_X.length;ix++) for(let iz=0;iz<GRID_Z.length;iz++) {
    yield null;
    const isOuter=ix===0||ix===7||iz===0||iz===4;
    const isInner=((iz===1||iz===3)&&ix>=1&&ix<=6)||((ix===1||ix===6)&&iz===2);
    if(!isOuter&&!isInner)continue;
    const x=GRID_X[ix],z=GRID_Z[iz],id=`column-${ix}-${iz}`;
    const corner=isOuter?(ix===0||ix===7)&&(iz===0||iz===4):(ix===1||ix===6)&&(iz===1||iz===3);
    const label=`${isOuter?'外槽':'内槽'}${corner?'角柱':'柱'} ${ix+1}—${'ABCDE'[iz]}`;
    add({id:`stone-${ix}-${iz}`,name:`${label}柱础`,kind:'柱础',assembly:base,layer:'base',shape:'stone',material:'stone',position:[x,FLOOR+.08,z],size:[1.04,.3,1.04],stage:2,requires:['platform-cap'],role:'将木柱的荷载传至台基，并隔离地面潮气。'});
    add({id,name:label,kind:'柱',assembly:columns,layer:'columns',shape:'column',material:'redwood',position:[x,FLOOR+.23+(COLUMN_HEIGHT-.23)/2,z],size:[isOuter?.54:.57,COLUMN_HEIGHT-.23,isOuter?.54:.57],stage:3,requires:[`stone-${ix}-${iz}`],joint:'柱脚承于柱础，柱顶以榫与栌斗/阑额节点定位。柱头榫尺寸为推定。',role:isOuter?'外槽柱，承接外檐铺作及檐部梁架。':'内槽柱，围出殿内核心空间，承接内槽铺作和梁架。'});
    (isOuter?outer:inner).push({x,z,id,ix,iz,corner});
  }
  const ties=group('architraves','阑额与柱间联系','columns','连接柱列，形成稳定的内外槽框架。');
  function perimeterTies(list:typeof outer,prefix:string) {
    let n=0;
    for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) {
      const a=list[i],b=list[j];
      const sameRow=a.iz===b.iz&&Math.abs(a.ix-b.ix)===1;
      const sameCol=a.ix===b.ix&&Math.abs(a.iz-b.iz)===1;
      if(!sameRow&&!sameCol)continue;
      member(`${prefix}-tie-${n++}`,'柱间阑额',ties,'columns',[a.x,COLUMN_TOP-.30,a.z],[b.x,COLUMN_TOP-.30,b.z],.42,.28,4,[a.id,b.id],'beam','柱头之间的横向联系构件，承接补间铺作。');
    }
  }
  perimeterTies(outer,'outer');perimeterTies(inner,'inner');

  function bracket(id:string,label:string,x:number,z:number,angle:number,style:BracketStyle,support:string) {
    const result=buildBracket({add,group,member,columnTop:COLUMN_TOP,innerCeilingLevel:INNER_CEILING_LEVEL,innerCeilingHalfDepth:HIGH_CEILING_Z[2],sideCeilingRun:GRID_X[6]-GRID_X[5]},id,label,x,z,angle,style,support);
    const context=new Set<string>();
    function includeSupport(pid:string){
      const p=parts.find(p=>p.id===pid);if(!p||context.has(pid)||p.id.startsWith('platform'))return;
      context.add(pid);if(p.kind!=='柱础')p.requires.forEach(includeSupport);
    }
    includeSupport(support);
    amap.get(id)!.contextPartIds=[...context];
    amap.get(id)!.variant=style;
    const innerStyle=['inner','innerSide','interInner','cornerInner'].includes(style);
    amap.get(id)!.location=Math.abs(z)>(innerStyle?4:8)?(z>0?'西侧':'东侧')+(style.startsWith('corner')?(x>0?'南角':'北角'):'柱列'):(x>0?'南山面':'北山面');
    return result;
  }
  yield 1; // Organization task 1 complete.
  function outwardAngle(x:number,z:number,inside=false):number {
    let a=Math.abs(z)>(inside?4:8)?(z>0?0:Math.PI):(x>0?Math.PI/2:-Math.PI/2);
    if(inside)a+=Math.PI;return a;
  }
  const bracketsByColumn=new Map<string,string>();
  const bracketNodes=new Map<string,ReturnType<typeof bracket>>();
  for(const c of outer) {
    yield null;
    const id=`outer-bracket-${c.ix}-${c.iz}`;
    const r=bracket(id,`外檐${c.corner?'转角':'柱头'}斗拱 ${c.ix+1}—${'ABCDE'[c.iz]}`,c.x,c.z,outwardAngle(c.x,c.z),c.corner?'cornerOuter':'outer',c.id);
    bracketsByColumn.set(c.id,r.last);
    bracketNodes.set(c.id,r);
  }
  for(const c of inner) {
    yield null;
    const side=c.iz===2;
    const r=bracket(`inner-bracket-${c.ix}-${c.iz}`,`内槽${c.corner?'转角':side?'山面中柱':'柱头'}斗拱 ${c.ix+1}—${'ABCDE'[c.iz]}`,c.x,c.z,outwardAngle(c.x,c.z,true),c.corner?'cornerInner':side?'innerSide':'inner',c.id);
    bracketsByColumn.set(c.id,r.last);
    bracketNodes.set(c.id,r);
  }
  const splicedHeadfangIds=new Set<string>();
  function* interBrackets(list:typeof outer,inside:boolean) {
    let count=0;
    for(let i=0;i<list.length;i++) for(let j=i+1;j<list.length;j++) {yield null;
      const a=list[i],b=list[j];if(!((a.iz===b.iz&&Math.abs(a.ix-b.ix)===1)||(a.ix===b.ix&&Math.abs(a.iz-b.iz)===1)))continue;
      const x=(a.x+b.x)/2,z=(a.z+b.z)/2;
      const prefix=inside?'inner':'outer';
      const aid=bracketNodes.get(a.id)!.assembly,bid=bracketNodes.get(b.id)!.assembly;
      let lowerA=parts.find(p=>p.assembly===aid&&p.kind==='泥道栱')!.id,lowerB=parts.find(p=>p.assembly===bid&&p.kind==='泥道栱')!.id;
      const delta=new Vector3(b.x-a.x,0,b.z-a.z).normalize().multiplyScalar(.36);
      for(let l=1;l<=(inside?5:4);l++){
        const splice=!a.corner&&!b.corner;
        delta.normalize().multiplyScalar((l%2?2.247:1.323)/2-(splice?HEADFANG_SPLICE.overlap:0));
        const head=member(`${prefix}-headfang-${count}-${l}`,`第${l}层柱头枋`,ties,'columns',[a.x+delta.x,COLUMN_TOP+.4095+l*.441,a.z+delta.z],[b.x-delta.x,COLUMN_TOP+.4095+l*.441,b.z-delta.z],.315,.21,5+l,[bracketNodes.get(a.id)!.columnFangs[l-1],bracketNodes.get(b.id)!.columnFangs[l-1]],splice?'splicedFangSpan':'fangSpan','沿柱列穿接铺作；枋上的隐栱造型属于同一木件。端部退让邻柱散斗斗耳，纵向分段接头仍待节点复核。');
        if(splice){splicedHeadfangIds.add(head.id);head.role='整根跨段保留隐栱曲腹与原端部退斗耳，两端各延300mm上搭舌落入柱头节点；端舌高88.2mm、宽140mm，侧隙2mm。拼缝位置和榫型为教学推定，未逐件测绘。';}
        if(!splice&&((!inside&&l<=3)||(inside&&l>=3))){const angle=outwardAngle(x,z,inside);head.insertion=[Math.sin(angle),0,Math.cos(angle)];}
        lowerA=head.id;lowerB=head.id;
      }
      delta.normalize().multiplyScalar(.36-PRESSURE_SPLICE_OVERLAP);
      if(!inside)member(`pressure-fang-${count}`,'压槽枋',ties,'columns',[a.x+delta.x,COLUMN_TOP+2.9295,a.z+delta.z],[b.x-delta.x,COLUMN_TOP+2.9295,b.z-delta.z],.315,.21,15,[bracketNodes.get(a.id)!.pressureCap!,bracketNodes.get(b.id)!.pressureCap!],'box','跨段双端各以120mm上搭端舌落入柱头压槽枋节点，140mm舌宽配两侧2mm余隙；上下承面与侧肩定位，具体纵接位置和尺寸为教学推定。第四层枋以上留昂身斜穿的间隔。');
      const inter=bracket(`${prefix}-inter-${count}`,`${inside?'内槽':'外檐'}补间斗拱 ${count+1}`,x,z,outwardAngle(x,z,inside),inside?'interInner':'interOuter',`${prefix}-headfang-${count}-${inside?3:1}`);
      amap.get(inter.assembly)!.intercolumnBay={columnIds:[a.id,b.id],bracketIds:[aid,bid],connectionIds:[`${prefix}-tie-${count}`,...Array.from({length:inside?5:4},(_,i)=>`${prefix}-headfang-${count}-${i+1}`)]};
      amap.get(inter.assembly)!.legacyPartIds=amap.get(inter.assembly)!.partIds.filter(id=>/-(\d\d)$/.test(id));
      inter.throughMembers.forEach((id,i)=>{const next=parts.find(p=>p.id===`${prefix}-headfang-${count}-${i+(inside?4:2)}`);if(next)next.requires.push(id);});
      count++;
    }
  }
  yield* interBrackets(outer,false);yield* interBrackets(inner,true);

  // The four central frames carry the ridge; the two ends have separate dingfu/taiping beams.
  const bearingNodes: {id:string;position:Vec3;purlinDress?:number}[]=[];
  const ceilingBearings: {id:string;position:Vec3}[]=[];
  const mainFrameIds=[2,3,4,5];
  const frameGroups=new Map<number,string>();
  for(const ix of mainFrameIds) {
    yield null;
    const x=GRID_X[ix];const g=group(`frame-${ix}`,`第${ix+1}缝中央梁架`,'frame','明栿、平闇承托与上方草架分层；脊部由成对大叉手承接。');frameGroups.set(ix,g);amap.get(g)!.variant='centralFrame';amap.get(g)!.location=`第${ix+1}缝`;
    const front=bracketNodes.get(`column-${ix}-3`)!,back=bracketNodes.get(`column-${ix}-1`)!;
    const my=COLUMN_TOP+MAIN_BEAM_LEVEL;
    const main=member(`four-beam-${ix}`,'四椽明栿',g,'frame',[x,my,-2.54],[x,my,2.54],.60,.42,10,[front.innerTop,back.innerTop],'fourBeam','内槽四椽月梁，两端承于对应内槽四跳铺作。').id;
    const hump=add({id:`main-hump-${ix}`,name:'明栿中驼峰',kind:'驼峰',assembly:g,layer:'frame',shape:'jointHump',material:'wood',position:[x,my+.57,0],size:[.62,.56,.58],stage:11,requires:[main],role:'在明栿上承接平闇中部十字斗栱；高度按统一高平闇承托面协调，尺寸为推定。'}).id;
    const d=add({id:`cross-dou-${ix}`,name:'梁上十字斗栱 · 大斗',kind:'大斗',assembly:g,layer:'frame',shape:'dou',material:'wood',position:[x,my+.93,0],size:[.46,.24,.46],stage:12,requires:[hump],role:'梁上小斗栱的基座；不计入平闇以下72攒。'}).id;
    const cross=[],crossHeads=[];
    const crossY=my+.93+.24*.08+.21/2;
    const headHeight=(COLUMN_TOP+INNER_CEILING_LEVEL-.16/2-(crossY+.21/2))/.56;
    for(const direction of [0,1]){
    yield null;
      const gong=add({id:`cross-gong-${ix}-${direction}`,name:'梁上十字斗栱 · 栱',kind:'十字栱',assembly:g,layer:'frame',shape:direction===0?'gong':'gongUpper',material:'wood',position:[x,crossY,0],rotation:[0,direction*Math.PI/2,0],size:[1.18,.21,.15],stage:13,requires:[d],role:'两臂正交相搭，端部通过小斗承接平棊枋。'}).id;cross.push(gong);
      for(const sign of [-1,1])crossHeads.push(add({id:`cross-head-${ix}-${direction}-${sign}`,name:'梁上十字斗栱 · 栱头散斗',kind:'栱头散斗',assembly:g,layer:'frame',shape:'dou',material:'wood',position:[x+(direction===0?sign*.46:0),crossY+.21/2+headHeight*.48,direction===1?sign*.46:0],size:[.29,headHeight,.29],stage:13.5,requires:[gong],role:'十字栱端小斗将平棊枋传来的荷载送入短栱。',evidence:{sources:['liang1937'],basis:'第十二图与内槽柱头铺作图显示驼峰、交互斗、正交栱、端部小斗和平棊枋的承托层次。',inferred:'散斗宽度和高度由现有平棊标高与槽座闭合推定，未取得该小斗逐件实测。'}}).id);
    }
    const ceilingSupport=member(`ceiling-support-${ix}`,'平棊枋',g,'frame',[x,COLUMN_TOP+INNER_CEILING_LEVEL,HIGH_CEILING_Z[0]],[x,COLUMN_TOP+INNER_CEILING_LEVEL,HIGH_CEILING_Z[2]],.16,.21,14,crossHeads.filter(id=>id.includes(`-${ix}-1-`)),'ceilingRail','中部由梁上十字栱的端斗承托；前后端与横向边枋、中线与跨缝枋以推定半搭接相联，形成高平闇木框。浅色横枋显示这些连接，远端支承可省略。').id;
    for(const z of HIGH_CEILING_Z)ceilingBearings.push({id:ceilingSupport,position:[x,COLUMN_TOP+INNER_CEILING_LEVEL+.08,z]});
    const gy=roofY(4.41)-.72;
    const grass=member(`grass-four-${ix}`,'四椽草栿',g,'frame',[x,gy,-4.65],[x,gy,4.65],.6,.47,16,[front.last,back.last],'box','平闇上方的草架主梁，承平梁、槫与托脚。').id;
    for(const sign of [-1,1]){
    yield null;
      const seat=member(`middle-seat-${ix}-${sign}`,'中平槫下短木',g,'frame',[x-.45,gy+.375,sign*4.41],[x+.45,gy+.375,sign*4.41],.15,.32,21,[grass],'box','草四椽栿上承槫短木；与槫底30mm推定削平座配合，截面与暗口未逐件测绘。').id;
      bearingNodes.push({id:seat,position:[x,roofY(4.41)-.27,sign*4.41],purlinDress:.03});
    }
    const flatY=roofY(2.205)-.54;const blocks=[];
    for(const sign of [-1,1]){
    yield null;
      const h=flatY-.352-(gy+.3);
      const dun=add({id:`dun-${ix}-${sign}`,name:'敦㮇',kind:'敦㮇',assembly:g,layer:'frame',shape:'box',material:'wood',position:[x,gy+.3+h/2,sign*2.205],size:[.54,h,.68],stage:17,requires:[grass],role:'粗短木墩，支承平梁端部的斗。'}).id;
      blocks.push(add({id:`flat-dou-${ix}-${sign}`,name:'平梁下斗',kind:'斗',assembly:g,layer:'frame',shape:'openDou:0.424:0.214',material:'wood',position:[x,flatY-.256,sign*2.205],size:[.55,.20,.55],stage:18,requires:[dun],role:'斗口承平梁与横向令栱交会；口宽配合当前木件，具体暗口为推定。'}).id);
      const brace=member(`brace-low-${ix}-${sign}`,'托脚',g,'frame',[x,gy+.32,sign*3.86],[x,flatY-.21,sign*2.29],.21,.21,18,[grass,`flat-dou-${ix}-${sign}`],'box','托脚下端接草四椽栿，上端承近平梁端部；端部减料与斜向安装路线为教学推定。');
      brace.insertion=[0,1/Math.sqrt(5),sign*2/Math.sqrt(5)];
      brace.joint='从檐侧向内斜下方推入，使脚部座面落于草四椽栿，头部进入平梁下方；斜向路线避开已就位斗身。';
    }
    const flat=member(`flat-beam-${ix}`,'平梁',g,'frame',[x,flatY,-2.45],[x,flatY,2.45],.48,.42,19,[...blocks,`brace-low-${ix}--1`,`brace-low-${ix}-1`],'box','两端在斗内与横向令栱相交，成对大叉手由平梁承起脊部。').id;
    for(const sign of [-1,1]){
    yield null;
      const ling=member(`upper-ling-${ix}-${sign}`,'平梁端令栱',g,'frame',[x-.6615,flatY-.0375,sign*2.205],[x+.6615,flatY-.0375,sign*2.205],.315,.21,19.2,[flat],'gongSolid','平梁两端大斗内的横向令栱，与梁首相交，经替木承上平槫；构件身份依梁第六图，截面和交口为推定。').id;
      const seat=member(`upper-seat-${ix}-${sign}`,'上平槫替木',g,'frame',[x-.56,flatY+.195,sign*2.205],[x+.56,flatY+.195,sign*2.205],.15,.32,19.4,[ling],'box','由平梁端令栱承托，上承真实上平槫；30mm槫底削平座为推定暗口。').id;
      bearingNodes.push({id:seat,position:[x,roofY(2.205)-.27,sign*2.205],purlinDress:.03});
    }
    const forks=[];
    const ridgeLingY=roofY(0)-.6075,forkSlope=(ridgeLingY-flatY-.24)/1.85;
    for(const sign of [-1,1])forks.push(member(`fork-${ix}-${sign}`,'大叉手',g,'frame',[x,flatY+.24-.13*forkSlope,sign*1.98],[x,ridgeLingY+.14*forkSlope,-sign*.14],.25,.25,20,[flat,...(sign>0?[`fork-${ix}--1`]:[])],'box','两下脚接入平梁，顶端两叉手与横向令栱交会，经替木承脊槫；叉手截面、脚口和顶交口为推定。').id);
    const ridgeLing=member(`ridge-ling-${ix}`,'脊部令栱',g,'frame',[x-.6615,ridgeLingY,0],[x+.6615,ridgeLingY,0],.315,.21,20.5,forks,'gongSolid','两叉手顶相交处的横向令栱，上承替木与脊槫；层次依梁第六图，具体暗口为推定。').id;
    const ridgeSupport=member(`ridge-support-${ix}`,'脊槫替木',g,'frame',[x-.56,roofY(0)-.36,0],[x+.56,roofY(0)-.36,0],.18,.35,21,[ridgeLing],'box').id;
    bearingNodes.push({id:ridgeSupport,position:[x,roofY(0)-.27,0],purlinDress:.03});
    const crossStudy=group(`beam-bracket-${ix}`,'梁上十字斗栱 '+(ix+1)+'缝','frame','四椽明栿上的驼峰、大斗与正交小栱，承接平棊枋。');
    amap.get(crossStudy)!.partIds=[hump,d,...cross,...crossHeads,ceilingSupport];
    amap.get(crossStudy)!.contextPartIds=[main];
  }
  yield 2; // Organization task 2 complete.
  // Radial connections: 18 straight inner/outer links plus four diagonal corner links.
  const radial=group('radial-beams','内外槽明乳栿与草乳栿','frame','普通柱线与四角分别连接内外槽，明梁与草梁保持独立层级。');
  const mergedMembers=new Map<string,string>([...bracketNodes.values()].flatMap(node=>Object.entries(node.partAliases)));
  const radialPairs:{a:typeof outer[number];b:typeof outer[number];corner:boolean}[]=[];
  for(const a of outer){
    yield null;
    let b:typeof inner[number]|undefined;
    if(a.corner)b=inner.find(c=>c.corner&&Math.sign(c.x)===Math.sign(a.x)&&Math.sign(c.z)===Math.sign(a.z));
    else if(a.iz===0||a.iz===4)b=inner.find(c=>c.ix===a.ix&&c.iz===(a.iz===0?1:3));
    else b=inner.find(c=>c.iz===a.iz&&c.ix===(a.ix===0?1:6));
    if(b)radialPairs.push({a,b,corner:a.corner});
  }
  const legacyHumpIds=new Set<string>();
  for(const {a,b,corner} of radialPairs){
    yield null;
    const nodesA=bracketNodes.get(a.id)!,nodesB=bracketNodes.get(b.id)!;
    const my=COLUMN_TOP+.85;
    const id=`milk-${a.ix}-${a.iz}`;
    const oldEnds=[nodesA,nodesB].flatMap((node,index)=>{
      const matches=parts.filter(p=>p.assembly===node.assembly&&(corner?p.kind===(index===0?'斜向角华栱':'内角斜华栱'):p.kind===(index===0?'第二跳华栱':'第2跳华栱（偷心）')));
      return matches.sort((a,b)=>b.position[1]-a.position[1]).slice(0,1);
    });
    const direction=new Vector3(a.x-b.x,0,a.z-b.z).normalize();
    const head=corner?1.5:1.117;
    const milk=member(id,corner?'角乳栿连角华栱':'明乳栿连第二跳华栱',radial,'frame',[a.x+direction.x*head,my,a.z+direction.z*head],[b.x-direction.x*head,my,b.z-direction.z*head],.441,.21,7,oldEnds.flatMap(p=>p.requires),corner?'linkedBeam':'linkedBeamBlank','第二跳华栱与明乳栿连做为一根长木件，跨内外槽并出栱头；多个局部视图引用同一实体。').id;
    for(const p of oldEnds)mergedMembers.set(p.id,milk);
    // Leave the space above this crossing open while lowering the continuous milk beam.
    // The next column-fang level follows the beam; this is installation precedence.
    for(const node of [nodesA,nodesB])parts.find(p=>p.id===node.columnFangs[1])!.requires.push(milk);
    for(const node of [nodesA,nodesB])amap.get(node.assembly)!.partIds.push(milk);
    parts.find(p=>p.id===milk)!.joint='两端华栱与中部乳栿为一体，按承接节点整体落位；月梁曲线、端部榫口尺寸依据历史图式规则化推定。';
    const gy=COLUMN_TOP+2.982;
    const grass=member(`grass-${id}`,corner?'草角乳栿':'草乳栿',radial,'frame',[a.x+direction.x*(corner?0:.105),gy,a.z+direction.z*(corner?0:.105)],[b.x,gy,b.z],.42,.37,15,[...nodesA.angTails,nodesB.last],'box','内端落第五层柱头枋，外端受昂尾承托；与压槽枋减料交搭，420mm截面按原图约束推定。').id;
    if(!corner&&nodesA.pressureCap){
      const cap=parts.find(p=>p.id===nodesA.pressureCap)!;cap.requires=[grass];
      cap.role='压槽枋节点由草乳栿外端下舌直接承托，再承接两侧纵向跨段；上下搭口为受力相容的教学推定，未取得原物暗榫实测。';
      cap.joint='先安装受两根昂尾承托的草乳栿，再将底部开放的压槽枋节点向下落到梁端舌上。';
      parts.find(p=>p.id===grass)!.joint='外端下舌延至压槽枋外面齐平，托住压槽枋节点；端舌长、反向搭口及2mm侧隙均为推定。两处昂尾及内柱承面先就位。';
    }
    if(corner){const p=parts.find(p=>p.id===grass)!;p.evidence={...p.evidence,inferred:p.evidence.inferred+' 角端保留完整矩形腹面，并与两轴压槽枋分配三个105mm木带；独立端部退让由节点加工确定，具体槽形未实测。'};}
    const innerPoint=new Vector3(b.x,gy+.315,b.z),outerPoint=innerPoint.clone().addScaledVector(direction,corner?3.45:2.44);innerPoint.addScaledVector(direction,-.21);
    const pad=member(`jiao-${id}`,'连续缴背',radial,'frame',innerPoint.toArray() as Vec3,outerPoint.toArray() as Vec3,.21,.48,16,[grass],'box','沿草乳栿背连续加厚，从内柱附近伸至下平槫稍外；210mm高及出头量按原图拓扑推定。').id;
    const padTop=gy+.42;
    const fourBottom=roofY(4.41)-1.02;
    const dunId=`inner-pad-column-${b.ix}-${b.iz}`;
    const priorDun=parts.find(p=>p.id===dunId);
    const dun=priorDun?priorDun.id:add({id:dunId,name:'内端方木敦㮇',kind:'方木敦㮇',assembly:radial,layer:'frame',shape:'box',material:'wood',position:[b.x,(padTop+fourBottom)/2,b.z],size:[.63,fourBottom-padTop,.63],stage:17,requires:[pad],role:'缴背内端的宽厚方木承托草架；高度由研究屋面与草栿截面闭合求得，属规则化推定。'}).id;
    if(priorDun)priorDun.requires.push(pad);
    bearingNodes.push({id:dun,position:[b.x,fourBottom,b.z]});
    for(const sign of [-1,1])if(b.ix>=2&&b.ix<=5&&b.iz===(sign<0?1:3)){
      const four=parts.find(p=>p.id===`grass-four-${b.ix}`)!;
      four.requires=four.requires.filter(dep=>dep!==nodesB.last);four.requires.push(dun);
    }
    const sideDistance=hipX(6.615)-Math.abs(b.x);
    const point=new Vector3(b.x,0,b.z).addScaledVector(direction,corner?3.118341:(a.iz===0||a.iz===4?2.205:sideDistance));
    const lowerBottom=roofPoint(point.x,point.z)[1]-.3;
    const timberHeight=lowerBottom-.12-padTop;
    if(timberHeight>0){
      const block=add({id:`lower-pad-${id}`,name:'下平槫下方木',kind:'方垫木',assembly:radial,layer:'frame',shape:'box',material:'wood',position:[point.x,padTop+timberHeight/2,point.z],size:[.63,timberHeight,.63],stage:18,requires:[pad],role:'在连续缴背上承下平槫替木；具体高度依据本坡目标标高推定。'}).id;
      const seat=add({id:`lower-seat-${id}`,name:'下平槫替木',kind:'替木',assembly:radial,layer:'frame',shape:'box',material:'wood',position:[point.x,lowerBottom-.06,point.z],size:[.9,.12,.34],rotation:[0,Math.atan2(-direction.x,direction.z),0],stage:19,requires:[block],role:'平置方木上的承槫短木，承托本位置下平槫。'}).id;
      bearingNodes.push({id:seat,position:[point.x,lowerBottom,point.z]});
    }
    const soffangId=`ceiling-sofang-${id}`,ceilingBases:string[]=[],ceilingHumps:string[]=[],ceilingLings:string[]=[];
    const gongLevel=COLUMN_TOP+LOW_CEILING.ling,upperDouHeight=LOW_CEILING.headHeight;
    const humpCenter=LOW_CEILING.humpCenter,humpHeight=LOW_CEILING.humpHeight;
    const ceilingRun=.987*(corner?Math.SQRT2:1);
    for(const [end,column] of [[0,a],[1,b]] as const){
    yield null;
      const shift=(end===0?-1:1)*ceilingRun;
      const c={...column,x:column.x+direction.x*shift,z:column.z+direction.z*shift};
      // A corner has several radial beams. Their offset supports are distinct timbers.
      const suffix=legacyHumpIds.has(`half-hump-${c.id}`)?`-${id}`:'';
      const oldHumpId=`half-hump-${c.id}${suffix}`;legacyHumpIds.add(oldHumpId);
      const fullBack=(!corner&&(end===0||!column.corner))||(corner&&end===1),humpId=fullBack?`back-arm-${column.id}`:oldHumpId;ceilingHumps.push(humpId);
      if(fullBack)mergedMembers.set(oldHumpId,humpId);
      add({id:humpId,name:'明乳栿上半驼峰',kind:'半驼峰',assembly:radial,layer:'frame',shape:'hump',material:'wood',position:[c.x,COLUMN_TOP+humpCenter,c.z],rotation:[0,Math.atan2(-direction.z,direction.x),0],size:[.55,humpHeight,.60],stage:11,requires:[milk],role:'乳栿端部半驼峰，承接外槽平闇下的小斗栱与连枋；高度按乳栿背和上斗底闭合推定。'});
      if(fullBack){
        const p=parts.find(p=>p.id===humpId)!,tail=-ceilingRun,head=corner?.88*Math.SQRT2+.25:end===0?1.117:1.558,start=tail-.275,mid=(start+head)/2,axis=direction.clone().multiplyScalar(end===0?1:-1);
        p.kind=end===0?'第三层径向材连半驼峰':'第三跳华栱连半驼峰';p.name=p.kind;p.position=[column.x+axis.x*mid,COLUMN_TOP+humpCenter,column.z+axis.z*mid];
        p.rotation=[0,Math.atan2(-axis.z,axis.x),0];p.size=[head-start,humpHeight,.21];p.shape=corner?`humpWing:${tail}:${head}`:`humpArm:${tail}:${head}`;
        p.role='第三层整材穿过柱头，外端与第二跳横栱交会并承第一下昂，后尾杀成半驼峰承低平闇。';
        if(end===1){
          const former=parts.find(p=>p.assembly===nodesB.assembly&&p.kind===(corner?'内角翼形头':'第3跳华栱（偷心）'))!;
          mergedMembers.set(former.id,p.id);p.requires.push(...former.requires);
          p.role='第三跳华栱穿过内柱枋层，后尾连续杀成半驼峰，分别承朝内上层与外槽低平闇。';
        }
        p.evidence={sources:['liang1937','dpm2007','cao2005'],basis:'梁417/450及普通内外柱后尾条文与417详图明确第三层一材及前后功能。',inferred:'按既有头轴与后尾承面恢复连身；210mm材宽、峰形过渡、纵向分件及三向暗口均为建模推定，非原物暗缝测量。'};
        if(corner){p.kind='内角第三材层翼形连半驼峰';p.name=p.kind;p.role='沿角线贯穿柱头的第三材层，前端在第二跳轴出翼形头，后端半驼峰承低平闇。';p.evidence={sources:['liang1937','cao2005','dpm2007'],basis:'梁图518第三层翼形头、第二跳叠斗及后尾低平闇连身；曹图4-76至4-80多向节点方法。',inferred:'前后同轴材合为一木，翼形轮廓、210mm材宽、第二层枋的三向槽及两端斗高为推定；上层节点采用规则化表达，未取得逐件暗缝实测。'};}

      }
      const douId=`ceiling-base-${c.id}${suffix}`,baseHeight=LOW_CEILING.baseHeight,baseCenter=LOW_CEILING.humpTop+.48*baseHeight;
      if(!parts.some(p=>p.id===douId))add({id:douId,name:'平闇下交互斗',kind:'交互斗',assembly:radial,layer:'frame',shape:'dou',material:'wood',position:[c.x,COLUMN_TOP+baseCenter,c.z],rotation:[0,Math.atan2(-direction.z,direction.x),0],size:[.40,baseHeight,.40],stage:12,requires:[humpId],role:'半驼峰上的交互斗，承同层令栱与素枋；截面为图示承托链约束下的推定。'});
      ceilingBases.push(douId);
      const tangent=new Vector3(-direction.z,0,direction.x);
      const ling=member(`ceiling-ling-${id}-${end}`,'平闇下令栱',radial,'frame',[c.x-tangent.x*.56,gongLevel,c.z-tangent.z*.56],[c.x+tangent.x*.56,gongLevel,c.z+tangent.z*.56],.315,.21,13,[douId],'gongEndSeats','与沿乳栿的素枋同层正交交接，栱头承平棊枋下斗。').id;
      ceilingLings.push(ling);
      for(const sign of [-1,1]){
    yield null;
        const x=c.x+tangent.x*.43*sign,z=c.z+tangent.z*.43*sign;
        const seat=add({id:`ceiling-head-${id}-${end}-${sign}`,name:'平棊枋下栱头斗',kind:'栱头斗',assembly:radial,layer:'frame',shape:'dou',material:'wood',position:[x,COLUMN_TOP+LOW_CEILING.headCenter,z],rotation:[0,Math.atan2(-direction.z,direction.x),0],size:[.34,upperDouHeight,.34],stage:14,requires:[ling,soffangId],role:'栱头斗承平棊枋；按F3层上令栱实承面落斗，再由斗槽底确定平棊下皮，具体斗高为推定。'}).id;
        ceilingBearings.push({id:seat,position:[x,COLUMN_TOP+LOW_CEILING.frameBottom,z]});
      }
    }
    const sofang=member(soffangId,'隐栱形素枋',radial,'frame',[a.x-direction.x*ceilingRun,gongLevel,a.z-direction.z*ceilingRun],[b.x+direction.x*ceilingRun,gongLevel,b.z+direction.z*ceilingRun],.315,.21,13,[...ceilingBases,...ceilingLings],'sofangSeated','沿乳栿连两端小斗栱，与令栱同层正交交搭；端部开放半搭接在两端令栱之后装入。');
    sofang.evidence={sources:['liang1937','cao2005','dpm2007'],basis:'梁图417/450与后尾第四层隐栱头上斗条文。',inferred:'素枋沿F3层连接，两端向跨中546mm处修整190mm斗的平承面；端部与令栱槽底互补，具体轮廓和暗口为推定。'};
    if(b.corner){
      const axis=direction.clone().negate(),start=-Math.hypot(a.x-b.x,a.z-b.z)+ceilingRun,rear=-ceilingRun;
      const head=corner?1.28*Math.SQRT2+.25:2.247/2,mid=(start+head)/2;
      const full=add({...sofang,id:`ceiling-arm-${id}`,name:corner?'内角第四材层华栱连素枋':'内角第三层柱头枋连素枋',kind:corner?'内角第四材层华栱连素枋':'第3层柱头枋连素枋',shape:`ceilingArm:${start}:${head}:${rear}`,position:[b.x+axis.x*mid,gongLevel,b.z+axis.z*mid],rotation:[0,Math.atan2(-axis.z,axis.x),0],size:[head-start,.315,.21],requires:[...sofang.requires],role:'第四材层沿低侧素枋延续至内柱，并向槽内出头；前后观察引用同一根木料。',evidence:{sources:['liang1937','cao2005','dpm2007'],basis:'梁图518第四层华栱与后尾素枋同层联系，图323约束正交及角向柱列。',inferred:'同轴前后合为一木，枋端与令栱承口、柱头三向减料及第三跳轴位为推定；高层节点为规则化表达，未取得原物暗缝测量。'}});
      mergedMembers.set(sofang.id,full.id);
      const local=corner?parts.find(p=>p.id===`${nodesB.assembly}-13`):Math.abs(axis.x)>.9?parts.find(p=>p.id===`${nodesB.assembly}-04`):undefined;
      if(local){mergedMembers.set(local.id,full.id);full.requires.push(...local.requires);}
      amap.get(nodesB.assembly)!.partIds.push(full.id);
    }
    const radialFrameIds:string[]=[];
    {
      const heads:string[]=[];
      for(const [end,column] of [[0,a],[1,b]] as const){
    yield null;
        const shift=(end===0?-1:1)*(ceilingRun+.546),x=column.x+direction.x*shift,z=column.z+direction.z*shift;
        const seat=add({id:`ceiling-radial-head-${id}-${end}`,name:'素枋隐栱头上斗',kind:'栱头斗',assembly:radial,layer:'frame',shape:'dou',material:'wood',position:[x,COLUMN_TOP+LOW_CEILING.headCenter,z],rotation:[0,Math.atan2(-direction.z,direction.x),0],size:[.29,LOW_CEILING.headHeight,.29],stage:14,requires:[soffangId],role:'素枋朝跨中隐栱头上的小斗，承沿明乳栿方向延续的平棊枋。',evidence:{sources:['liang1937','cao2005','dpm2007'],basis:'梁外檐后尾第四层条文及图417/450分别绘出素枋上斗和径向平棊枋，图332显示跨柱连续木框。',inferred:'从令栱轴朝跨中546mm、斗高190mm、隐栱头承面修整及枋端半搭接为规则化推定，尚无逐件实测。'}});
        heads.push(seat.id);
      }
      const rail=member(`ceiling-radial-${id}`,'低平闇径向平棊枋',radial,'frame',[a.x-direction.x*ceilingRun,COLUMN_TOP+LOW_CEILING.frameCenter,a.z-direction.z*ceilingRun],[b.x+direction.x*ceilingRun,COLUMN_TOP+LOW_CEILING.frameCenter,b.z+direction.z*ceilingRun],.16,.21,15,heads,'ceilingSpan','由素枋两端隐栱头上的小斗承接，联结内外槽低平棊边界；两端向上半搭接接入沿柱列边框，具体节点为推定。');
      rail.evidence={sources:['liang1937','cao2005','dpm2007'],basis:'梁图417/450及第十一图的明乳栿方向平棊枋。',inferred:'160×210mm截面、两端支点与接头尺度按同一承面协调，边界长枋采用独立构件表达；这些尺寸与接头为推定。'};
      if(corner){
        const ang=parts.find(p=>p.id===`${nodesA.assembly}-50`)!;
        ang.evidence={...ang.evidence,inferred:ang.evidence.inferred+' 后尾下缘与低平棊径向枋相交处局部开水平承口，最大减深约97mm，保持昂身连续；具体暗口未实测。'};
        for(const p of parts.filter(p=>p.id===soffangId||p.id===rail.id||heads.includes(p.id)||ceilingBases.includes(p.id)||ceilingLings.includes(p.id)||(ceilingHumps.includes(p.id)&&!p.id.startsWith('back-arm-'))||p.id.startsWith(`ceiling-head-${id}-`)))p.evidence={sources:['liang1937','cao2005','dpm2007'],basis:'梁图518支持角乳栿后尾令栱、素枋、跨中侧小斗与径向平棊；图323给出三向梁关系。',inferred:'模型中的低平闇承座按推定置于边界等距交点，径距987√2mm；斜向木框斗口随木件旋转，与第三层枋同层。枋宽高、隐栱头546mm偏距及与昂的减料均为推定，环向边框的完整实物承托形制缺少直接图证。'};
      }
      radialFrameIds.push(...heads,rail.id);
      for(const ang of nodesA.angTails)parts.find(p=>p.id===ang)!.requires.push(soffangId,rail.id);
    }
    for(const node of [nodesA,nodesB]){
    yield null;
      const local=amap.get(node.assembly)!;
      const ids=[grass,soffangId,...radialFrameIds,...ceilingHumps,...ceilingBases,...parts.filter(p=>p.id.startsWith(`ceiling-ling-${id}-`)||p.id.startsWith(`ceiling-head-${id}-`)).map(p=>p.id)];
      local.contextPartIds=[...new Set([...local.contextPartIds??[],...ids])];
    }

  }
  yield 3; // Organization task 3 complete.
  // Inferred physical ownership at the inner-corner F1 level. Keep three long
  // beams; assign the overlapping local X segment to its collinear milk beam.
  // This is an explicit hypothesis, not a surveyed hidden seam.
  const cornerMaterial=new MeshBasicMaterial({side:DoubleSide}),cornerRay=new Raycaster();
  function cornerSurface(p:Part,x:number,z:number,top:boolean){
    const mesh=new Mesh(geometry(p.shape,p.size),cornerMaterial);mesh.position.set(...p.position);mesh.rotation.set(...p.rotation);mesh.scale.set(...p.size);mesh.updateMatrixWorld();
    cornerRay.set(new Vector3(x,top?30:-5,z),new Vector3(0,top?-1:1,0));
    const hit=cornerRay.intersectObject(mesh)[0];if(!hit)throw new Error(`Missing corner seat ${p.id}`);return hit.point.y;
  }
  function fitCornerSeat(seat:Part,below:Part,above:Part){
    const [x,,z]=seat.position,low=cornerSurface(below,x,z,true),high=cornerSurface(above,x,z,false);
    const h=(high-low)/.56;if(h<=0)throw new Error(`Closed corner seat ${seat.id}`);
    seat.size[1]=h;seat.position[1]=low+.48*h;
  }
  for(const c of [...outer,...inner].filter(c=>!c.corner)){
    yield null;
    const assembly=amap.get(bracketNodes.get(c.id)!.assembly)!;
    const first=parts.find(p=>p.assembly===assembly.id&&p.shape.startsWith('rootArm:'))!;
    const milk=parts.find(p=>assembly.partIds.includes(p.id)&&p.kind==='明乳栿连第二跳华栱')!;
    const axis=new Vector3(1,0,0).applyEuler(new Euler(...first.rotation)),point=new Vector3(c.x,0,c.z).addScaledVector(axis,-.546);
    const low=Math.min(...[-.18,-.12,-.06,0,.06,.12,.18].map(run=>cornerSurface(first,point.x+axis.x*run,point.z+axis.z*run,true)));
    const high=Math.max(...[-.18,0,.18].map(run=>cornerSurface(milk,point.x+axis.x*run,point.z+axis.z*run,false))),height=(high-low)/.56;
    if(height<=0)throw new Error(`Invalid rear first-jump bearing ${assembly.id}`);
    const seat=add({id:`${assembly.id}-rear-root-seat`,name:assembly.name+' · 首跳后尾承乳栿斗',kind:'首跳后尾承乳栿斗',assembly:assembly.id,layer:'brackets',shape:'dou',material:'wood',position:[point.x,low+.48*height,point.z],rotation:[...first.rotation],size:[.36,height,.36],stage:6.7,requires:[first.id],role:'第一层径向华栱后尾的独立承斗，托同一整根明乳栿；与朝主跳方向的斗分别加工和安装。',evidence:{sources:['liang1937'],basis:'梁图417外柱后尾与图450/491内柱后尾：第一跳华栱上斗承第二跳明乳栿。',inferred:'后尾承点距柱心546mm、360mm斗宽及斗高按现有上下承面协调；乳栿腹面局部削平为推定，尚无该暗节点实测。'}});
    milk.requires.push(seat.id);
  }
  for(const c of inner.filter(c=>!c.corner)){
    yield null;
    const id=`inner-bracket-${c.ix}-${c.iz}`,body=parts.find(p=>p.id===`back-arm-${c.id}`)!;
    const milk=parts.find(p=>body.requires.includes(p.id)&&p.kind==='明乳栿连第二跳华栱')!;
    fitCornerSeat(parts.find(p=>p.id===`${id}-10`)!,milk,body);
    const seat=parts.find(p=>p.id===`${id}-12`)!,above=parts.find(p=>p.id===`${id}-${c.iz===2?'sixfen-head':'13'}`)!;
    if(c.iz!==2){
      const axis=new Vector3(1,0,0).applyEuler(new Euler(...above.rotation)),offset=new Vector3(...seat.position).sub(new Vector3(...above.position)).dot(axis);
      above.shape=`gongBearing:${offset}:${seat.size[0]+.004}`;above.insertion=[0,1,0];
      above.evidence={...above.evidence,inferred:above.evidence.inferred+' 第四跳栱腹在下斗承口处局部削至原曲腹的较高底线；口宽与深度为推定，用有限承面核验，未取得原物暗口测量。'};
    }
    fitCornerSeat(seat,body,above);
  }
  for(const c of inner.filter(c=>c.corner)){
    yield null;
    const a=amap.get(`inner-bracket-${c.ix}-${c.iz}`)!,node=parts.find(p=>p.id===`${a.id}-02`)!;
    const beamX=parts.find(p=>p.id===`milk-${c.ix===1?0:7}-${c.iz}`)!,beamZ=parts.find(p=>p.id===`milk-${c.ix}-${c.iz===1?0:4}`)!;
    const beamD=parts.find(p=>p.id===`milk-${c.ix===1?0:7}-${c.iz===1?0:4}`)!;
    mergedMembers.set(node.id,beamX.id);beamX.requires.push(...node.requires);
    beamX.role+=' 内角F1局部栱形段归入同轴梁体；该分件为建模推定。';
    for(const beam of [beamX,beamZ,beamD])beam.evidence={sources:['liang1937','cao2005','dpm2007'],basis:'梁平面支持两正交乳栿与角乳栿进入内角；曹研究提供多向互补节点推定。',inferred:'内角F1局部归同轴乳栿、三梁槽深及安装次序为项目推定；跨柱间长枋保留独立木件。'};
    beamD.shape='linkedBeamBlank';
    for(const span of parts.filter(p=>p.kind==='第1层柱头枋'&&p.requires.includes(node.id))){
    yield null;
      const axis=new Vector3(1,0,0).applyEuler(new Euler(...span.rotation));
      span.requires=span.requires.map(id=>id===node.id?(Math.abs(axis.x)>.9?beamX.id:beamZ.id):id);
    }
    const rootA=parts.find(p=>p.id===`${a.id}-01`)!,rootB=parts.find(p=>p.id===`${a.id}-root-b`)!;
    const seatedFang=parts.find(p=>p.id===`${a.id}-03`)!;seatedFang.shape='fangNodeSeated';
    seatedFang.evidence={...seatedFang.evidence,inferred:seatedFang.evidence.inferred+' 内角两正向F2枋的斗上承托采用局部平底推定，有限面积接触经几何核验，缺原物暗口测量。'};
    for(const sign of [-1,1]){
    yield null;
      const seat=parts.find(p=>p.id===`${a.id}-column-seat-1-${sign}`)!;
      fitCornerSeat(seat,rootA,beamX);
      const second=add({...seat,id:`${a.id}-column-seat-1-b-${sign}`,name:a.name+' · 第二正向第一层散斗',size:[...seat.size],position:[c.x,seat.position[1],c.z+sign*.5315],requires:[rootB.id]});
      fitCornerSeat(second,rootB,beamZ);beamZ.requires.push(second.id);
      const upper=parts.find(p=>p.id===`${a.id}-column-seat-2-${sign}`)!;
      fitCornerSeat(upper,beamX,parts.find(p=>p.id===`${a.id}-03`)!);
    }
    const body=parts.find(p=>p.id===`back-arm-${c.id}`)!,fangA=parts.find(p=>p.id===`${a.id}-03`)!;
    const fangB=add({...fangA,id:`${a.id}-corner-fang-z-2`,name:a.name+' · 第二正向F2枋节点',position:[c.x,fangA.position[1],c.z],rotation:[0,-Math.PI/2,0],size:[...fangA.size],requires:[]});
    for(const sign of [-1,1]){
    yield null;
      const old=parts.find(p=>p.id===`${a.id}-column-seat-2-${sign}`)!;
      const seat=add({...old,id:`${a.id}-column-seat-2-b-${sign}`,name:a.name+' · 第二正向F2枋下散斗',position:[c.x,old.position[1],c.z+sign*.5315],rotation:[0,0,0],size:[...old.size],requires:[beamZ.id]});
      fitCornerSeat(seat,beamZ,fangB);fangB.requires.push(seat.id);
    }
    for(const span of parts.filter(p=>p.kind==='第2层柱头枋'&&p.requires.includes(fangA.id))){
    yield null;
      const axis=new Vector3(1,0,0).applyEuler(new Euler(...span.rotation));if(Math.abs(axis.z)>.9)span.requires=span.requires.map(id=>id===fangA.id?fangB.id:id);
    }
    const next=parts.find(p=>p.id===mergedMembers.get(`${a.id}-13`))!;
    const fullA=parts.find(p=>p.id===`ceiling-arm-milk-${c.ix===1?0:7}-${c.iz}`)!,fullB=parts.find(p=>p.id===`ceiling-arm-milk-${c.ix}-${c.iz===1?0:4}`)!;
    for(const p of [fullA,fullB])p.requires.push(body.id);
    for(const sign of [-1,1]){
    yield null;
      const old=parts.find(p=>p.id===`${a.id}-column-seat-3-${sign}`)!;fitCornerSeat(old,fangA,fullA);
      const seat=add({...old,id:`${a.id}-column-seat-3-b-${sign}`,name:a.name+' · 第二正向第三层枋下散斗',position:[c.x,old.position[1],c.z+sign*.5315],rotation:[0,0,0],size:[...old.size],requires:[fangB.id]});
      fitCornerSeat(seat,fangB,fullB);fullB.requires.push(seat.id);
    }
    for(const span of parts.filter(p=>p.kind==='第3层柱头枋'&&p.requires.includes(`${a.id}-04`))){
    yield null;
      const axis=new Vector3(1,0,0).applyEuler(new Euler(...span.rotation));if(Math.abs(axis.z)>.9)span.requires=span.requires.map(id=>id===`${a.id}-04`?fullB.id:id);
    }
    const lower=parts.find(p=>p.id===`${a.id}-10`)!,upper=parts.find(p=>p.id===`${a.id}-12`)!;
    lower.rotation=[...body.rotation];upper.rotation=[...body.rotation];next.insertion=[0,1,0];
    fitCornerSeat(lower,beamD,body);fitCornerSeat(upper,body,next);
    const headSeat=parts.find(p=>p.id===`${a.id}-14`)!;headSeat.position=[c.x-Math.sign(c.x)*1.28,COLUMN_TOP+1.998,c.z-Math.sign(c.z)*1.28];headSeat.size=[.36,.225,.36];headSeat.rotation=[...body.rotation];
    const axis=new Vector3(-Math.sign(c.x),0,-Math.sign(c.z)).normalize(),jump=1.428*Math.SQRT2;
    const upperEvidence:Evidence={sources:['liang1937','cao2005','dpm2007'],basis:'梁图518第五层翼形、第六层六分头与横翼；曹97—98页提供三向柱头节点推定，102页图4-87为草乳栿三向交会。',inferred:'441mm层差、杆尾长度、第六材层横翼垂直于角向材、柱头105mm带及草梁140mm带均为推定，未获得逐件暗缝测量；第三跳1.28√2m、末跳1.428√2m及顶部交手为全局相容推定。'};
    let belowA=fullA,belowB=fullB,previousD=next,previousSeat=headSeat;
    for(const level of [4,5]){
    yield null;
      const layer=level+1,y=COLUMN_TOP+.4095+level*.441,axialId=`${a.id}-${layer===5?'fifth-wing':'sixth-sixfen'}`;
      const nodeA=parts.find(p=>p.id===`${a.id}-0${level+1}`)!;
      nodeA.shape=level===4?'fangNodeSeated':'fangNode';nodeA.evidence=upperEvidence;
      const nodeB=add({...nodeA,id:`${a.id}-corner-fang-z-${level}`,name:a.name+` · 第二正向第${level}层柱头枋`,position:[c.x,y,c.z],rotation:[0,-Math.PI/2,0],size:[...nodeA.size],requires:[]});
      for(const sign of [-1,1]){
    yield null;
        const seatA=parts.find(p=>p.id===`${a.id}-column-seat-${level}-${sign}`)!;fitCornerSeat(seatA,belowA,nodeA);
        const seatB=add({...seatA,id:`${a.id}-column-seat-${level}-b-${sign}`,name:a.name+` · 第二正向第${level}层枋下散斗`,position:[c.x,seatA.position[1],c.z+sign*.5315],rotation:[0,0,0],size:[...seatA.size],requires:[belowB.id],evidence:upperEvidence});
        fitCornerSeat(seatB,belowB,nodeB);nodeB.requires.push(seatB.id);
        if(level===4){
          // Keep the short-node seat inside its endpoint. The adjoining span
          // enters sideways; an overhanging ear otherwise closes that route.
          const along=2*(nodeA.size[0]/2-.5315-.002);
          seatA.rotation=[0,0,0];seatA.size=[along,seatA.size[1],.29];
          seatB.size=[.29,seatB.size[1],along];
          for(const seat of [seatA,seatB])seat.evidence={...upperEvidence,inferred:upperEvidence.inferred+' 第四层枋下散斗沿枋轴宽256mm，斗耳退入短枋端2mm以保留相邻长枋横向装入；此矩形斗宽和高度均未获实测。'};
        }
      }
      for(const p of [nodeA,nodeB])p.requires.push(previousD.id);
      for(const span of parts.filter(p=>p.kind===`第${level}层柱头枋`&&p.requires.includes(nodeA.id))){
    yield null;
        const along=new Vector3(1,0,0).applyEuler(new Euler(...span.rotation));if(Math.abs(along.z)>.9)span.requires=span.requires.map(id=>id===nodeA.id?nodeB.id:id);
        // Approach from the outer aisle: the new diagonal L5 rod occupies
        // the former approach through the inside of the column rectangle.
        if(level===4)span.insertion=span.insertion.map(v=>-v) as Vec3;
      }
      const tail=-.6615,head=jump+.25,mid=(tail+head)/2;
      const axial=add({id:axialId,name:a.name+` · 第${layer}材层${layer===5?'翼形':'六分'}连身`,kind:layer===5?'内角第五材层翼形连身':'内角第六材层六分连身',assembly:a.id,layer:'brackets',shape:layer===5?'bracketHead:wing':'bracketHead:sixfen',material:'wood',position:[c.x+axis.x*mid,y,c.z+axis.z*mid],rotation:[...body.rotation],size:[head-tail,.315,.21],stage:12+layer*.1,requires:[previousSeat.id],role:'沿角线延续至柱头的完整木件，跳头与杆身同体；同层与两正向柱头枋共同交接。',evidence:upperEvidence});
      if(layer===6){
        const wing=add({...axial,id:`${a.id}-sixth-wing`,name:a.name+' · 第六材层横翼栱',kind:'内角第六材层横翼栱',shape:'gongSolid',position:[c.x+axis.x*jump,y,c.z+axis.z*jump],rotation:[0,body.rotation[1]+Math.PI/2,0],size:[1.12,.315,.21],requires:[previousSeat.id],role:'在末跳轴与六分出头材交接的横翼；垂直于角向材的方向及独立一木的分件方式为推定。'});
        fitCornerSeat(previousSeat,previousD,wing);axial.requires.push(wing.id);
      }else fitCornerSeat(previousSeat,previousD,axial);
      const seat=add({...previousSeat,id:`${a.id}-${layer===5?'fifth-seat':'sixth-seat'}`,name:a.name+` · 第${layer}材层上交互斗`,position:[c.x+axis.x*jump,y+.315/2+.225*.48,c.z+axis.z*jump],rotation:[...body.rotation],size:[.36,.225,.36],requires:[axial.id],evidence:upperEvidence});
      if(layer===6)for(const [milk,under] of [[`milk-${c.ix===1?0:7}-${c.iz}`,nodeA],[`milk-${c.ix}-${c.iz===1?0:4}`,nodeB],[`milk-${c.ix===1?0:7}-${c.iz===1?0:4}`,axial]] as const){
    yield null;
        const grass=parts.find(p=>p.id===`grass-${milk}`)!;
        grass.requires=[...grass.requires.filter(id=>id!==nodeA.id),under.id,axial.id];
        grass.evidence={...upperEvidence,basis:'梁图518及草乳栿落内柱第五层枋的关系；曹102页图4-87的三向草乳栿推定交口。'};
      }
      belowA=nodeA;belowB=nodeB;previousD=axial;previousSeat=seat;
    }
    const seventhY=COLUMN_TOP+.4095+6*.441,q=new Vector3(c.x,0,c.z).addScaledVector(axis,jump),tail=-.48,head=jump+.25,mid=(tail+head)/2;
    const seventhEvidence:Evidence={sources:['liang1937','cao2005'],basis:'梁图518及内槽转角原文：角向出跳上施十字相交翼形栱，承两面相交平棊枋；草乳栿和缴背的三向节点参考曹101—102页。',inferred:'相邻两层角向材形成第三、第四跳，末跳为最外侧交会点；具体距离、角向材尾接、两正交材的分件和互补口均为推定，缺少逐件节点详图。'};
    const seventhA=add({id:`${a.id}-seventh-a`,name:a.name+' · 第七材层正向翼形栱',kind:'内角第七材层正向翼形栱',assembly:a.id,layer:'brackets',shape:'gongSolidEndSeats',material:'wood',position:[q.x,seventhY,q.z],rotation:[0,c.x<0?0:Math.PI,0],size:[1.323,.315,.21],stage:15.1,requires:[previousSeat.id],role:'穿过末跳交会点的完整正向横材，经端斗承接同向高平棊边枋。',evidence:seventhEvidence});
    const seventhB=add({...seventhA,id:`${a.id}-seventh-b`,name:a.name+' · 第七材层侧向翼形栱',kind:'内角第七材层侧向翼形栱',rotation:[0,c.z<0?-Math.PI/2:Math.PI/2,0],requires:[seventhA.id]});
    const grassD=parts.find(p=>p.id===`grass-milk-${c.ix===1?0:7}-${c.iz===1?0:4}`)!;
    const seventhD=add({...seventhA,id:`${a.id}-seventh-d`,name:a.name+' · 第七材层角向华栱连身',kind:'内角第七材层角向华栱连身',shape:'bracketHead:wing',position:[c.x+axis.x*mid,seventhY,c.z+axis.z*mid],rotation:[...body.rotation],size:[head-tail,.315,.21],requires:[seventhB.id,grassD.id],role:'从内柱草角乳栿端接处延伸至末跳交会的完整角向材；与两正交横材分别加工。'});
    previousSeat.rotation=[0,0,0];fitCornerSeat(previousSeat,previousD,seventhA);
    for(const id of [`jiao-milk-${c.ix===1?0:7}-${c.iz}`,`jiao-milk-${c.ix}-${c.iz===1?0:4}`,`jiao-milk-${c.ix===1?0:7}-${c.iz===1?0:4}`]){
    yield null;
      const jiao=parts.find(p=>p.id===id)!;jiao.requires.push(seventhD.id);jiao.evidence=seventhEvidence;amap.get(a.id)!.contextPartIds!.push(id);
    }
    const diagonalSeat=parts.find(p=>p.id===`${a.id}-08`)!;
    diagonalSeat.rotation=[0,Math.atan2(Math.sign(c.z),-Math.sign(c.x)),0];
  }
  yield 4; // Organization task 4 complete.
  for(const c of outer.filter(c=>c.corner)){
    yield null;
    const id=`outer-bracket-${c.ix}-${c.iz}`,milk=parts.find(p=>p.id===`milk-${c.ix}-${c.iz}`)!;
    const diagonalSeat=parts.find(p=>p.id===`${id}-47`)!;
    fitCornerSeat(diagonalSeat,parts.find(p=>p.id===`${id}-46`)!,milk);
    fitCornerSeat(parts.find(p=>p.id===`${id}-49`)!,milk,parts.find(p=>p.id===`${id}-10`)!);
    // Lower the full diagonal beam before the higher transverse arms close its route.
    for(const suffix of ['10','30','49'])parts.find(p=>p.id===`${id}-${suffix}`)!.requires.push(milk.id);
    for(const span of parts.filter(p=>p.kind==='第1层柱头枋'&&p.requires.includes(`${id}-02`))){
    yield null;
      const axis=new Vector3(1,0,0).applyEuler(new Euler(...span.rotation));
      span.requires=span.requires.map(dep=>dep===`${id}-02`?`${id}-${Math.abs(axis.x)>.9?'08':'28'}`:dep);
    }
    for(const level of [2,3,4])for(const span of parts.filter(p=>p.kind===`第${level}层柱头枋`&&p.requires.includes(`${id}-0${level+1}`))){
    yield null;
      const axis=new Vector3(1,0,0).applyEuler(new Euler(...span.rotation));
      if(Math.abs(axis.z)>.9)span.requires=span.requires.map(dep=>dep===`${id}-0${level+1}`?`${id}-corner-fang-z-${level}`:dep);
    }
    for(const span of parts.filter(p=>p.kind==='压槽枋'&&p.requires.includes(`${id}-55`))){
    yield null;
      const axis=new Vector3(1,0,0).applyEuler(new Euler(...span.rotation));
      if(Math.abs(axis.z)>.9)span.requires=span.requires.map(dep=>dep===`${id}-55`?`${id}-corner-pressure-z`:dep);
      amap.get(id)!.contextPartIds!.push(span.id);
    }
  }
  cornerMaterial.dispose();
  for(const c of inner.filter(c=>c.corner)){
    yield null;
    const base=parts.find(p=>p.id===`inner-pad-column-${c.ix}-${c.iz}`)!;
    let previous=base.id,top=base.position[1]+base.size[1]/2;
    const target=roofY(4.41)-.42,h=(target-top)/3;
    for(let k=0;k<3;k++){
    yield null;
      previous=add({id:`corner-stack-${c.ix}-${c.iz}-${k}`,name:'内角承槫叠方木（教学补全）',kind:'叠方木',assembly:radial,layer:'frame',shape:'box',material:'wood',position:[c.x,top+h/2,c.z],size:[.72,h,.66],rotation:[0,k%2*Math.PI/2,0],stage:18+k*.1,requires:[previous],role:'内角交叉缴背上的宽厚方木补全承托链；该节点尚无足够逐件图证，层数与截面明确为教学推定。',evidence:{...basis.frame,inferred:'四内角该层缺少可确认分件测绘。模型按方木承托家族作三层教学推定，尚无证据确认原物具有这三层方木。'}}).id;top+=h;
    }
    const seat=add({id:`corner-middle-seat-${c.ix}-${c.iz}`,name:'内角中平槫下短木',kind:'承槫短木',assembly:radial,layer:'frame',shape:'box',material:'wood',position:[c.x,top+.06,c.z],size:[.78,.12,.78],stage:19,requires:[previous],role:'补全方木上的承槫面，连续连接前后坡与山面中平槫；榫型和截面为推定。'}).id;
    bearingNodes.push({id:seat,position:[c.x,top+.12,c.z]});
  }
  for(const sign of [-1,1]){
    yield null;
    const g=group(`end-frame-${sign}`,`${sign<0?'北':'南'}山面丁栿与太平梁`,'frame','三道平面平行、竖向内高外低的丁栿，支承山面短架与太平梁。');amap.get(g)!.variant='endFrame';amap.get(g)!.location=sign<0?'北山面':'南山面';
    const dingIds:string[]=[],dingAtTai:number[]=[];
    for(const [j,z] of [-2.205,0,2.205].entries()){
    yield null;
      const innerY=roofY(4.41)-.16,outerY=roofY(4.41)-.56;
      const dingSlope=.4/5.04,dingCos=1/Math.sqrt(1+dingSlope**2),upperStock=.02/dingCos;
      const colX=sign*12.6;
      const supportFang=parts.filter(p=>p.kind==='第5层柱头枋'&&p.id.startsWith('inner-headfang')).find(p=>Math.abs(p.position[0]-colX)<.01&&Math.abs(p.position[2]-z)<=p.size[0]/2+.1)
        ??parts.find(p=>p.assembly===`inner-bracket-${sign<0?1:6}-2`&&p.kind==='第5层柱头枋节点')!;
      const base=supportFang.position[1]+supportFang.size[1]/2;
      const dy=outerY-.23-base;
      let previous=supportFang.id;
      const count=Math.ceil(dy/.28),height=dy/count;
      for(let k=0;k<count;k++)previous=add({id:`ding-seat-${sign}-${j}-${k}`,name:'丁栿下层叠枋木',kind:'叠枋木',assembly:g,layer:'frame',shape:'box',material:'wood',position:[colX,base+(k+.5)*height,z],size:[.66,height,.64],stage:18+k*.1,requires:[previous],role:'山面丁栿外端的宽枋木层叠承托；分层数、400mm内外高差与截面为原图约束下的推定。'}).id;
      const d=member(`ding-${sign}-${j}`,'丁栿',g,'frame',[sign*12.85,outerY-.25*dingSlope+upperStock,z],[sign*7.56,innerY+upperStock,z],.56,.43,19,[previous,`grass-four-${sign<0?2:5}`],'box','内端搁草四椽栿，外端在山面中槫下，由叠枋木承托；560mm毛料截面和250mm外端余长为配合真实座口的推定，未逐件实测。').id;dingIds.push(d);
      if(j!==1)parts.find(p=>p.id===`dun-${sign<0?2:5}-${j===0?-1:1}`)!.requires.push(d);
      const at=outerY+(innerY-outerY)*(12.6-ROOF.ridgeHalf)/(12.6-7.56)+.26/dingCos+2*upperStock;
      dingAtTai.push(at);
      bearingNodes.push({id:d,position:[colX,roofY(4.41)-.3,z]});
      const targetX=hipX(2.205),seatBottom=roofY(2.205)-.42,braces=[];
      for(const branch of [-1,1]){
    yield null;
        const footX=targetX+branch*.85,headX=targetX+branch*.12;
        const footY=outerY+(innerY-outerY)*(12.6-footX)/5.04+.26/Math.cos(Math.atan(.4/5.04));
        const cosine=Math.cos(Math.atan((seatBottom-footY)/.73));
        const foot=new Vector3(sign*footX,footY+.1*cosine,z),head=new Vector3(sign*headX,seatBottom-.1*cosine,z),axis=head.clone().sub(foot).normalize();
        foot.addScaledVector(axis,-.10);head.addScaledVector(axis,.10);
        braces.push(member(`end-upper-brace-${sign}-${j}-${branch}`,'山面上平槫托脚',g,'frame',foot.toArray() as Vec3,head.toArray() as Vec3,.20,.22,20,[d],'box','丁栿上的成对斜托脚承山面上平槫；家族与功能有图据，具体双支路、端部100mm加工余长及榫型为教学推定。').id);
      }
      const seat=add({id:`end-upper-seat-${sign}-${j}`,name:'山面上平槫下短木',kind:'承槫短木',assembly:g,layer:'frame',shape:'box',material:'wood',position:[sign*targetX,seatBottom+.075,z],size:[.62,.15,.46],stage:21,requires:braces,role:'托脚上承山面上平槫的水平短木，配30mm槫底削平座；尺寸和暗口为推定。'}).id;
      bearingNodes.push({id:seat,position:[sign*targetX,seatBottom+.15,z],purlinDress:.03});
    }
    const ty=roofY(2.205)-.53,taiPads=[];
    for(const [j,z] of [-2.205,0,2.205].entries()){
    yield null;
      const top=ty-.23,bottom=dingAtTai[j]-.055;
      taiPads.push(add({id:`taiping-pad-${sign}-${j}`,name:'太平梁下方木',kind:'方木',assembly:g,layer:'frame',shape:'box',material:'wood',position:[sign*ROOF.ridgeHalf,(top+bottom)/2,z],size:[.62,top-bottom,.62],stage:21,requires:[dingIds[j]],role:'直接在对应丁栿上承太平梁；具体方木高度按纵剖面与固定上平槫标高推定。'}).id);
    }
    const tai=member(`taiping-${sign}`,'太平梁',g,'frame',[sign*ROOF.ridgeHalf,ty+.015,-2.45],[sign*ROOF.ridgeHalf,ty+.015,2.45],.49,.44,22,taiPads,'box','与第三缝平梁平行，三丁经方木承托；梁首配30mm槫底座，截面与距第三缝约一米的位置为推定。').id;
    for(const z of [-2.205,2.205])bearingNodes.push({id:tai,position:[sign*ROOF.ridgeHalf,ty+.26,z],purlinDress:.03});
    const forks=[],forkTop=roofY(0)-.45,forkSlope=(forkTop-.12-ty-.26)/.86;
    for(const side of [-1,1])forks.push(member(`end-fork-${sign}-${side}`,'山面脊端斜撑',g,'frame',[sign*ROOF.ridgeHalf,ty+.26-.13*forkSlope,side*.99],[sign*ROOF.ridgeHalf,forkTop-.12+.10*forkSlope,-side*.10],.24,.24,23,[tai,...(side>0?[`end-fork-${sign}--1`]:[])],'box','太平梁上的成对脊端支承，双脚入梁、顶部互搭后承短木；数量、截面和节点为纵剖面约束下的教学推定，未逐件实测。').id);
    const seat=member(`end-ridge-seat-${sign}`,'脊端承槫短木',g,'frame',[sign*ROOF.ridgeHalf-.4,roofY(0)-.36,0],[sign*ROOF.ridgeHalf+.4,roofY(0)-.36,0],.18,.35,24,forks,'box').id;
    bearingNodes.push({id:seat,position:[sign*ROOF.ridgeHalf,roofY(0)-.27,0],purlinDress:.03});
  }
  yield 5; // Organization task 5 complete.
  for(const c of outer){
    yield null;
    const n=bracketNodes.get(c.id)!;
    for(const id of [...n.eaveSupports,...n.bullSupports]){
    yield null;
      const p=parts.find(p=>p.id===id)!;bearingNodes.push({id,position:[p.position[0],p.position[1]+p.size[1]/2,p.position[2]]});
    }
  }
  // Lookup bearing spans by actual position; no global "frame 0" dependency.
  const nearestBearings=(point:Vec3,n=2)=>bearingNodes.slice().sort((a,b)=>Math.hypot(a.position[0]-point[0],a.position[2]-point[2])+Math.abs(a.position[1]-point[1])*.3-(Math.hypot(b.position[0]-point[0],b.position[2]-point[2])+Math.abs(b.position[1]-point[1])*.3)).slice(0,n).map(p=>p.id);
  const purlins=group('purlins','槫与牛脊枋','frame','槫沿各坡等高线布置，牛脊枋位于外第二跳轴，正面进深坐标9.807m。');
  interface RoofSupport {id:string;side:number;run:number;from:number;to:number;}
  const roofSupports:RoofSupport[]=[];
  const slopePoint=(side:number,u:number,v:number):Vec3=>side<2?[u,roofY(v),v*(side===0?1:-1)]:[hipX(v)*(side===2?1:-1),roofY(v),u];
  const halfAt=(side:number,v:number)=>side<2?hipX(v):v;
  for(let side=0;side<4;side++)for(let r=0;r<6;r++){
    yield null;
    if(r===0&&side!==0)continue;
    const run=[0,2.205,4.41,6.615,9.807,10.794][r],half=halfAt(side,run);
    const axes=side<2?GRID_X:GRID_Z;
    const stations=[-half,...axes.filter(u=>u>-half+.2&&u<half-.2),half];
    for(let k=1;k<stations.length;k++){
    yield null;
      const a=slopePoint(side,stations[k-1],run),b=slopePoint(side,stations[k],run);a[1]-=.15;b[1]-=.15;
      const id=`purlin-${side}-${r}-${k}`,kind=r===0?'脊槫':r===4?'牛脊枋':r===5?'撩檐槫':`${['','上平槫','中平槫','下平槫'][r]}`;
      const bottom=a[1]-.15;
      const supports=bearingNodes.filter(p=>Math.abs(p.position[1]-bottom-(p.purlinDress??0))<.015&&
        (side<2?Math.abs(p.position[2]-a[2])<.18&&p.position[0]>=Math.min(a[0],b[0])-.35&&p.position[0]<=Math.max(a[0],b[0])+.35:
          Math.abs(p.position[0]-a[0])<.18&&p.position[2]>=Math.min(a[2],b[2])-.35&&p.position[2]<=Math.max(a[2],b[2])+.35));
      if(!supports.length)throw new Error(`槫未找到接触承点：${id}`);
      member(id,kind,purlins,'frame',a,b,.3,.3,21+r,[...new Set(supports.map(p=>p.id))],r===4?'box':'rafter','依据本跨实际接触的承槫面安装，允许承点之外的短悬挑；具体拼槫榫型为推定。');
      roofSupports.push({id,side,run,from:stations[k-1],to:stations[k]});
      if(r===0)roofSupports.push({id,side:1,run,from:stations[k-1],to:stations[k]});
    }
  }
  // The middle purlins close the outward installation aisle of the central braces.
  // Record this erection prerequisite separately from the bearing-node lookup above.
  for(const p of parts.filter(p=>/^purlin-[01]-2-/.test(p.id)))for(const seat of p.requires.filter(id=>/^middle-seat-[2-5]-/.test(id))){
    yield null;
    const [, ,ix]=seat.split('-');const side=seat.endsWith('--1')?-1:1;const brace=`brace-low-${ix}-${side}`;p.requires.push(brace);p.orderOnlyRequires=[...p.orderOnlyRequires??[],brace];
  }
  const eaveTies=group('eave-links','罗汉枋与檐部联结','frame','罗汉枋联系第二跳，最外替木与撩檐槫承接檐椽。');
  for(const sign of [-1,1])for(let ix=0;ix<7;ix++)member(`eave-link-${sign}-${ix}`,'罗汉枋',eaveTies,'frame',[GRID_X[ix],COLUMN_TOP+2.1501,sign*9.807],[GRID_X[ix+1],COLUMN_TOP+2.1501,sign*9.807],.21,.21,14,[...bracketNodes.get(`column-${ix}-${sign>0?4:0}`)!.luohanSupports,...bracketNodes.get(`column-${ix+1}-${sign>0?4:0}`)!.luohanSupports],'box');
  for(const sign of [-1,1])for(let iz=0;iz<4;iz++)member(`side-link-${sign}-${iz}`,'山面罗汉枋',eaveTies,'frame',[sign*17.997,COLUMN_TOP+2.1501,GRID_Z[iz]],[sign*17.997,COLUMN_TOP+2.1501,GRID_Z[iz+1]],.21,.21,14,[...bracketNodes.get(`column-${sign>0?7:0}-${iz}`)!.luohanSupports,...bracketNodes.get(`column-${sign>0?7:0}-${iz+1}`)!.luohanSupports],'box');
  for(const p of parts.filter(p=>/^eave-link-|^side-link-/.test(p.id))){
    yield null;
    // The complete shared corner timbers bring both adjacent-face angs into
    // the lesson. Lower the ties after these angs to keep their vertical route open.
    const match=p.id.match(/^(eave|side)-link-(-?1)-(\d+)$/)!,sign=Number(match[2]),i=Number(match[3]);
    const ids=match[1]==='eave'?[`column-${i}-${sign>0?4:0}`,`column-${i+1}-${sign>0?4:0}`]:[`column-${sign>0?7:0}-${i}`,`column-${sign>0?7:0}-${i+1}`];
    p.requires.push(...ids.flatMap(id=>bracketNodes.get(id)!.angTails));
  }
  for(const c of outer)for(const id of bracketNodes.get(c.id)!.bullSupports){
    yield null;
    const p=parts.find(p=>p.id===id)!;
    const links=parts.filter(p=>p.assembly===eaveTies).filter(link=>{
      const zLine=Math.abs(link.position[2]-p.position[2])<.02&&Math.abs(link.position[0]-p.position[0])<=link.size[0]/2+.02;
      const xLine=Math.abs(link.position[0]-p.position[0])<.02&&Math.abs(link.position[2]-p.position[2])<=link.size[0]/2+.02;
      return zLine||xLine;
    });if(links.length)p.requires=links.map(p=>p.id);
  }

  const rafters=group('roof-rafters','四坡椽架与角梁','rafters','每根椽独立可拆；檐椽跨牛脊枋、撩檐槫并继续出挑，四角分别设大角梁与子角梁。');
  yield 6; // Organization task 6 complete.
  const boards=group('roof-boards','屋面望板','boards','顺椽铺设的小幅木望板，按对应椽条与坡面逐块定位。');
  const roofGroups=[group('roof-west','西坡瓦作','tiles','西向正面屋坡，瓦件按坡面搭接，每件有独立身份。'),group('roof-east','东坡瓦作','tiles','东向背面屋坡。'),group('roof-south','南坡瓦作','tiles','庑殿顶南山面三角坡。'),group('roof-north','北坡瓦作','tiles','庑殿顶北山面三角坡。')];
  let rafterNumber=0,boardNumber=0,tileNumber=0;
  const segments=[0,2.205,4.41,6.615,12.558];
  const rafterPath=(side:number,u:number)=>{
    const minV=side<2?hipRun(Math.abs(u)):Math.abs(u);
    const spans=segments.slice(1).map((to,k)=>({from:Math.max(minV,segments[k]),to})).filter(p=>p.to-p.from>=.15);
    const runs=[spans[0].from,...spans.map(p=>p.to)];
    const path=seatedRafterChain(runs.map(v=>slopePoint(side,u,v)),.075);
    if(minV>0&&Math.abs(runs[0]-minV)<1e-7){
      // Use one centre at the hip, including its curved upper transition.
      // Both adjacent pitches participate; no independent per-slope lift.
      const dy=roofY(runs[1])-roofY(minV);
      const pitches=[dy/(runs[1]-minV),dy/(hipX(runs[1])-hipX(minV))];
      path.nodes[0].y=roofY(minV)+Math.max(...pitches.map(p=>.075*Math.sqrt(1+p*p)));
      for(let i=1;i<path.nodes.length-1;i++)path.normals[i]=path.nodes[i].clone().sub(path.nodes[i-1]).normalize().add(path.nodes[i+1].clone().sub(path.nodes[i]).normalize()).normalize();
    }
    return {...path,runs};
  };
  const rafterSpans:{id:string;side:number;u:number;from:number;to:number}[]=[];
  const boardSpans:{id:string;side:number;v:number;from:number;to:number}[]=[];
  const tileSpans:{id:string;side:number;u:number;v:number}[]=[];
  function slopeRotation(side:number,u:number,v:number):Vec3 {
    const a=slopePoint(side,u,v),b=slopePoint(side,u,Math.min(12.558,v+.01));
    const vz=new Vector3(...b).sub(new Vector3(...a)).normalize();
    const vx=side===0?new Vector3(1,0,0):side===1?new Vector3(-1,0,0):side===2?new Vector3(0,0,-1):new Vector3(0,0,1);
    const vy=vz.clone().cross(vx).normalize();const e=new Euler().setFromRotationMatrix(new Matrix4().makeBasis(vx,vy,vz));return [e.x,e.y,e.z];
  }
  const boardCuts=(side:number,v:number)=>{
    const half=halfAt(side,v),cuts=[0];
    for(let u=-half;u<half-.03;u+=2){const end=Math.min(half,u+1.999);if(end-u<.08)continue;
      cuts.push(u+2>=half-.03||half-(u+2)<.08?1:(Math.min(half,u+2)+half)/(2*half));
    }
    return cuts;
  };
  for(let side=0;side<4;side++){
    yield null;
    const maxU=side<2?ROOF.halfWidth:ROOF.halfDepth;
    for(let legacyU=-maxU+.15;legacyU<maxU-.08;legacyU+=.42){
    yield null;
      // Both slopes share the same hip stations. The former independent
      // width/depth rescaling accumulated a visible stagger along every hip.
      // Preserve the 99 main-slope / 60 end-slope columns and their identities.
      const endPitch=(ROOF.halfDepth-.35)/29.5;
      const column=Math.round((legacyU+maxU-.15)/.42);
      const mainIndex=column-49,hipIndex=Math.abs(mainIndex)-20;
      const u=side<2
        ?Math.sign(mainIndex)*(hipIndex>=0?hipX((hipIndex+.5)*endPitch):Math.abs(mainIndex)/20*hipX(endPitch/2))
        :(column-29.5)*endPitch;
      const legacyMinV=side<2?hipRun(Math.abs(legacyU)):Math.abs(legacyU);
      const minV=side<2?hipRun(Math.abs(u)):Math.abs(u);
      const path=rafterPath(side,u);
      for(let k=0;k<segments.length-1;k++){
    yield null;
        const nominalFrom=Math.max(minV,segments[k]),nominalTo=segments[k+1];if(nominalTo-nominalFrom<.15)continue;
        const legacyExists=nominalTo-Math.max(legacyMinV,segments[k])>=.15;
        const from=nominalFrom+.001,to=nominalTo-(nominalTo===12.558?0:.001);
        const node=path.runs.findIndex(v=>Math.abs(v-nominalFrom)<1e-7);
        const axis=path.nodes[node+1].clone().sub(path.nodes[node]).normalize();
        let tailNormal=path.normals[node];
        if(minV>0&&Math.abs(nominalFrom-minV)<1e-7){
          const otherSide=side<2?(u>0?2:3):(u>0?0:1);
          const otherU=side<2?Math.sign(side===0?1:-1)*minV:(side===2?1:-1)*hipX(minV);
          const other=rafterPath(otherSide,otherU);
          const otherAxis=other.nodes[1].clone().sub(other.nodes[0]).normalize();
          tailNormal=axis.clone().sub(otherAxis).normalize();
        }
        const headNormal=path.normals[node+1];
        const a=path.nodes[node].clone().addScaledVector(axis,.001/Math.abs(axis.dot(tailNormal))).toArray() as Vec3;
        const b=path.nodes[node+1].clone().addScaledVector(axis,nominalTo===ROOF.halfDepth?0:-.001/Math.abs(axis.dot(headNormal))).toArray() as Vec3;
        const supports=roofSupports.filter(p=>p.side===side&&p.run>=from-.02&&p.run<=to+.02&&u>=p.from-.03&&u<=p.to+.03).map(p=>p.id);
        if(!supports.length)supports.push(`hip-main-${Math.sign(a[0])}-${Math.sign(a[2])}`);
        const id=legacyExists?`rafter-${rafterNumber++}`:`rafter-corner-fill-${side}-${Math.round((legacyU+maxU-.15)/.42)}-${k}`;
        const r=member(id,nominalTo===12.558?'檐椽':'圆椽',rafters,'rafters',a,b,.15,.15,30,[...new Set(supports)],'rafter','沿坡向承于对应槫/枋，最外檐椽为连续出挑整件，不另加飞椽。');
        // Separate end planes: a hip tail and a pitch-change head have
        // different bisectors. Reusing the tail plane at both ends leaves steps.
        const inverse=new Quaternion().setFromEuler(new Euler(...r.rotation)).invert();
        const localTail=tailNormal.clone().applyQuaternion(inverse),localHead=headNormal.clone().applyQuaternion(inverse);
        const tailY=-localTail.y*r.size[1]/(localTail.x*r.size[0]),tailZ=-localTail.z*r.size[2]/(localTail.x*r.size[0]);
        const headY=-localHead.y*r.size[1]/(localHead.x*r.size[0]);
        if(minV>0&&Math.abs(nominalFrom-minV)<1e-7){
          const sx=Math.sign(a[0]),sz=Math.sign(a[2]);
          const hipId=`hip-main-${sx}-${sz}`;
          if(from>=4.11&&!r.requires.includes(hipId))r.requires.push(hipId);
        }
        r.shape=`roofRafter:${nominalTo===12.558?1:0}:${tailY}:${tailZ}:${headY}`;
        r.evidence={sources:['liang1937','zhang2022'],basis:'梁调查第三节记圆椽径约150mm、檐头急卷杀斫方、檐部单层；屋面标高沿用研究规则剖面。',inferred:'椽列平行排列并对称居中，最外椽轴退檐角350mm；角尾按两坡交线斜裁，端头93mm方、卷杀长不超过280mm均为推定。东大殿角椽逐根方向与暗接尚缺实测。'};
        r.insertion=[0,1,0];rafterSpans.push({id,side,u,from,to});
      }
    }
    for(let v=.13;v<ROOF.halfDepth-.05;v+=.29){
    yield null;
      const half=halfAt(side,v);
      for(let u=-half;u<half-.03;u+=2.0){
    yield null;
        const end=Math.min(half,u+1.999);if(end-u<.08)continue;
        // Partition the complete roof footprint. Shared row edges and hip samples
        // replace the former overlapping 380mm boxes on 290mm centres.
        const from=v<.14?0:v-.145,to=v+.29>=ROOF.halfDepth-.05?ROOF.halfDepth:v+.145;
        const last=u+2>=half-.03||half-(u+2)<.08;
        const fraction0=(u+half)/(2*half),fraction1=last?1:(Math.min(half,u+2)+half)/(2*half);
        const runs=[from,to,...profile.map(p=>p[0]).filter(t=>t>from&&t<to)];
        for(let t=from+.04;t<to;t+=.04)runs.push(t);
        runs.sort((a,b)=>a-b);
        const sections=runs.map((run,index)=>{
          const adjacent=index===0&&from>0?v-.29:index===runs.length-1&&to<ROOF.halfDepth?v+.29:null;
          const fractions=[fraction0,...(adjacent===null?[]:boardCuts(side,adjacent).filter(f=>f>fraction0+1e-9&&f<fraction1-1e-9)),fraction1];
          const h=halfAt(side,run),points=fractions.map(f=>{const p=slopePoint(side,(2*f-1)*h,run);p[1]+=.19;return p;});
          return side===0||side===3?points.reverse():points;
        });
        const board=roofBoardPlacement(sections,.04,to===ROOF.halfDepth);
        const candidates=rafterSpans.filter(r=>r.side===side&&r.from<=v+.15&&r.to>=v-.15);
        let deps=candidates.filter(r=>r.u>=u-.1&&r.u<=end+.1).map(r=>r.id);
        if(!deps.length)deps=candidates.sort((a,b)=>Math.abs(a.u-(u+end)/2)-Math.abs(b.u-(u+end)/2)).slice(0,2).map(r=>r.id);
        const id=`board-${boardNumber++}`;
        add({id,name:'望板',kind:'望板',assembly:boards,layer:'boards',...board,material:'wood',stage:31,requires:deps,role:'贴合所在坡面的椽条，形成连续木基层；板幅与拼缝为规则化推定。'});
        boardSpans.push({id,side,v,from:u,to:end});
      }
    }
    for(let v=.18,row=0;v<ROOF.halfDepth-.08;v+=.30,row++){
    yield null;
      const half=halfAt(side,v);
      const rowTiles:{id:string;u:number}[]=[];
      for(let u=Math.ceil((-half+.16)/.525)*.525,col=0;u<half-.1;u+=.525,col++){
    yield null;
        const p=slopePoint(side,u,v);p[1]+=.235;
        const under=boardSpans.filter(b=>b.side===side&&u>=b.from-.04&&u<=b.to+.04).sort((a,b)=>Math.abs(a.v-v)-Math.abs(b.v-v))[0];
        if(!under)continue;
        const id=`tile-${tileNumber++}`;
        add({id,name:`${['西坡','东坡','南坡','北坡'][side]} · 板瓦 ${row+1}行${col+1}列`,kind:'板瓦',assembly:roofGroups[side],layer:'tiles',shape:'tile',material:'tile',position:p,size:[.36,.13,.5],rotation:slopeRotation(side,u,v),stage:32+row*.001,requires:[under.id],role:'沿屋面搭接形成排水瓦沟。行距、搭接与现状数量未取得完整清点，按规则推定。',joint:'放在本坡对应木基层上，上下行搭接；之后用筒瓦覆盖侧缝。'});
        rowTiles.push({id,u});tileSpans.push({id,side,u,v});
      }
      for(let col=0;col<rowTiles.length-1;col++){
    yield null;
        const a=rowTiles[col],b=rowTiles[col+1],u=(a.u+b.u)/2,p=slopePoint(side,u,v);p[1]+=.275;
        add({id:`tile-${tileNumber++}`,name:`${['西坡','东坡','南坡','北坡'][side]} · 筒瓦 ${row+1}行${col+1}列`,kind:'筒瓦',assembly:roofGroups[side],layer:'tiles',shape:'coverTile',material:'tile',position:p,size:[.24,.18,.5],rotation:slopeRotation(side,u,v),stage:33+row*.001,requires:[a.id,b.id],role:'覆盖左右两片板瓦的接缝，引导雨水进入瓦沟。',joint:'依次安装本位置的两侧板瓦后，盖住接缝；筒瓦可单独移出。'});
      }
    }
  }
  yield 7; // Organization task 7 complete.
  for(const sx of [-1,1])for(const sz of [-1,1]){
    yield null;
    const ix=sx<0?0:7,iz=sz<0?0:4,nodes=bracketNodes.get(`column-${ix}-${iz}`)!;
    const id=`hip-main-${sx}-${sz}`;
    // One continuous lower hip crosses the middle purlin before its future
    // splice to the upper continuation. Do not terminate it at the lower seat.
    const innerRun=4.11,joinRun=4.41,b=roofPoint(sx*ROOF.halfWidth,sz*ROOF.halfDepth);b[1]-=.18;
    const slope=(b[1]-roofY(joinRun))/(ROOF.halfDepth-joinRun);
    const a:Vec3=[sx*hipX(innerRun),roofY(joinRun)+slope*(innerRun-joinRun),sz*innerRun];
    const hip=member(id,'大角梁',rafters,'rafters',a,b,.34,.34,28,[nodes.diagonalTop!,...nearestBearings(a,1)],'box','直角梁沿檐角斜线连续出挑，外部由本角铺作宝瓶承接；与草栿、上承枋的局部合口为项目推定。');
    hip.evidence={sources:['liang1937','qi2021'],basis:'老角梁经檐部、下平槫至中平槫后与续角梁接长；宝瓶作为角端承件。',inferred:'340mm矩形料、越过中平槫300mm的尾长、斜率、承口及顶棱随两坡削合均为建模推定。模型未完整表达上部续角梁及其合踏，尚不构成完整角梁主干；当前屋架未满足祁文全线同直假设。'};
    for(const run of [4.41,6.615,9.807,10.794]){
    yield null;
      const pair=roofSupports.filter(p=>(p.side===(sz>0?0:1)||p.side===(sx>0?2:3))&&p.run===run&&Math.abs((p.side<2?sx:sz)>0?p.to-halfAt(p.side,run):p.from+halfAt(p.side,run))<1e-6);
      hip.requires.push(...pair.map(p=>p.id));
    }
    const lowerSeat=parts.find(p=>p.id===`lower-seat-milk-${ix}-${iz}`)!;
    lowerSeat.rotation=[0,Math.atan2(-sx,-sz),0];
    lowerSeat.position[1]+=.015;lowerSeat.size[1]+=.03;
    lowerSeat.evidence={sources:['liang1937','qi2021'],basis:'方木与替木承实际下平槫，角梁再经槫上承口通过。',inferred:'900×340×150mm共享替木沿角线横向布置，两圆槫底部30mm平承口；方向、分件与暗口为推定，未取得2011节点图。'};
    for(const pid of hip.requires.filter(id=>id.startsWith('purlin-'))){
    yield null;
      const p=parts.find(p=>p.id===pid)!;p.evidence={...p.evidence,inferred:p.evidence.inferred+' 两向槫端以开放半搭接交会；角梁下局部修平40mm成承面，具体暗口均为建模推定。'};
    }
    const vase=parts.find(p=>p.id===nodes.diagonalTop)!,you=parts.find(p=>p.id===vase.requires[0])!;
    you.shape=`vaseYou:${you.shape}`;
    you.evidence={...you.evidence,inferred:you.evidence.inferred+' 外端承台下修220mm，至端头内850mm处恢复原交接体；局部轮廓为配合照片比例的推定。'};
    vase.size[0]=vase.size[2]=CORNER_VASE.width;
    const material=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster();
    const surface=(p:Part,up:boolean)=>{
      const mesh=new Mesh(geometry(p.shape,p.size),material);mesh.position.set(...p.position);mesh.rotation.set(...p.rotation);mesh.scale.set(...p.size);mesh.updateMatrixWorld();
      ray.set(new Vector3(vase.position[0],up?0:30,vase.position[2]),new Vector3(0,up?1:-1,0));return ray.intersectObject(mesh)[0]!.point.y;
    };
    const base=surface(you,false),top=surface(hip,true);material.dispose();
    if(top<=base)throw new Error(`Invalid corner vase bearing ${vase.id}`);
    vase.position[1]=(base+top)/2;vase.size[1]=top-base;vase.rotation=[0,Math.atan2(-sz,sx),0];
    vase.shape=`bearingVase:${(b[1]-a[1])/Math.hypot(b[0]-a[0],b[2]-a[2])}`;
    vase.evidence={sources:['liang1937','roof-vase-photo2024'],basis:'由昂雀台经独立宝瓶承实际角梁；2024年现场侧照可见瘦长瓶身、束腰及分层底座。',inferred:'宝瓶200mm名义宽、约503mm高，八棱剖面与分层比例参照照片；由昂外端承台局部下修220mm，隐藏接合与四角同形仍为推定。'};
    amap.get(nodes.assembly)!.contextPartIds!.push(hip.id);
    const a2=roofPoint(sx*hipX(10.0),sz*10),b2=[...b] as Vec3;a2[1]+=.02;b2[1]+=.20;
    const child=member(`hip-child-${sx}-${sz}`,'子角梁',rafters,'rafters',a2,b2,.14,.23,29,[id],'box','大角梁上较短的角部木件，配合檐角椽条承接转角屋面。');
    child.evidence={sources:['liang1937'],basis:'第三节记子角梁短小、相对大角梁微翘；保留单层檐椽。',inferred:'以230mm宽、140mm高直木毛料取代通用月梁形，下部按实际老角梁承面削合；长度、截面及角椽斜接均为推定，未取得实测。'};
  }
  amap.get(rafters)!.legacyPartIds=amap.get(rafters)!.partIds.filter(id=>!id.startsWith('rafter-corner-fill-'));
  const ridges=group('roof-ridges','正脊、垂脊、戗脊与脊饰','tiles','正脊与垂脊分层瓦件独立；保留现状中的后世鸱尾、中央火珠形态。');
  const nearestTile=(side:number,u:number,v:number)=>tileSpans.filter(t=>t.side===side).sort((a,b)=>Math.hypot(a.u-u,a.v-v)-Math.hypot(b.u-u,b.v-v))[0]?.id;
  for(let x=-ROOF.ridgeHalf,n=0;x<ROOF.ridgeHalf-.1;x+=.5,n++){
    yield null;
    const span=Math.min(.5,ROOF.ridgeHalf-x),center=x+span/2;
    let prior=nearestTile(0,center,.2)!;
    for(let layer=0;layer<19;layer++){
    yield null;
      const id=`ridge-main-${n}-${layer}`;
      add({id,name:`正脊叠瓦 ${n+1}段${layer+1}层`,kind:'正脊叠瓦',assembly:ridges,layer:'tiles',shape:'box',material:'tile',position:[center,roofY(0)+.3+layer*.034,0],size:[span-.002,.032,.48-layer*.004],stage:40+layer*.1,requires:[prior],role:'正脊叠瓦封闭两坡交线；19层来自历史调查，现状瓦件数量按规则生成。'});prior=id;
    }
    add({id:`ridge-cover-${n}`,name:'正脊盖筒瓦',kind:'脊筒瓦',assembly:ridges,layer:'tiles',shape:'coverTile',material:'tile',position:[center,roofY(0)+.3+18*.034+.016+.24*.12,0],size:[.4,.24,span],rotation:[0,Math.PI/2,0],stage:43,requires:[prior],role:'覆盖正脊顶部的连续接缝。'});
  }
  for(const sx of [-1,1])for(const sz of [-1,1])for(let t=.25,n=0;t<ROOF.halfDepth-.1;t+=.40,n++){
    yield null;
    const side=sz>0?0:1,{from,to,courses,lower}=hipRidgeSpan(n,ROOF.halfDepth);
    const a=roofPoint(sx*hipX(from),sz*from),b=roofPoint(sx*hipX(to),sz*to);
    const along=new Vector3(...b).sub(new Vector3(...a)).normalize(),across=along.clone().cross(new Vector3(0,1,0)).normalize(),normal=across.clone().cross(along).normalize();
    const rotation=new Euler().setFromRotationMatrix(new Matrix4().makeBasis(along,normal,across));
    const pos=new Vector3(...a).add(new Vector3(...b)).multiplyScalar(.5),length=new Vector3(...a).distanceTo(new Vector3(...b));
    const under=boardSpans.filter(q=>q.side===side).sort((a,b)=>Math.hypot((a.from+a.to)/2-pos.x,a.v-t)-Math.hypot((b.from+b.to)/2-pos.x,b.v-t))[0];
    // Keep the existing applied bed narrow; it does not replace missing timber.
    const bed=add({id:`ridge-bed-${sx}-${sz}-${n}`,name:'垂脊下铺垫',kind:'垂脊下铺垫',assembly:ridges,layer:'tiles',shape:'box',material:'mortar',position:[pos.x,pos.y+.22,pos.z],size:[length,.12,.72],rotation:[rotation.x,rotation.y,rotation.z],stage:39,requires:[under.id],role:'连接两坡收边与叠瓦底部的连续铺垫，封闭脊下接缝。',evidence:{sources:['liang1937'],basis:'调查记录垂脊九层叠瓦及当沟、线道等收边构造。',inferred:'铺垫宽720mm、厚120mm为接缝推定，保持附着层；未取得隐蔽层实测。'}});
    let prior=bed.id;
    for(let layer=0;layer<courses;layer++){
    yield null;
      const id=`ridge-hip-${sx}-${sz}-${n}-${layer}`,offset=.22+(.06+.016+layer*.032)/normal.y;
      add({id,name:`${lower?'戗脊':'垂脊'}叠瓦 ${n+1}段${layer+1}层`,kind:lower?'戗脊叠瓦':'垂脊叠瓦',assembly:ridges,layer:'tiles',shape:'box',material:'tile',position:[pos.x,pos.y+offset,pos.z],size:[length,.032,.68-layer*.012],rotation:[rotation.x,rotation.y,rotation.z],stage:40+layer*.1,requires:[prior],role:lower?'降阶后的戗脊延伸至檐角，采用三层叠瓦；层数及降阶位置为图像比例推定。':'沿两坡交线顺坡铺叠，九层垂脊在兽头处结束，外接较低戗脊。'});prior=id;
    }
    // Liang explicitly records covering tiles over both main and hip ridges.
    const cover=add({id:`ridge-hip-cover-${sx}-${sz}-${n}`,name:lower?'戗脊盖筒瓦':'垂脊盖筒瓦',kind:'脊筒瓦',assembly:ridges,layer:'tiles',shape:'coverTile',material:'tile',position:[pos.x,pos.y+.22+(.06+courses*.032+.18*.12)/normal.y,pos.z],size:[.42,.18,length+.025],stage:43,requires:[prior],role:'筒瓦分别覆盖上段垂脊和降阶后的戗脊；分段、搭接及下段高度为推定。'});
    // Leave the terminal beast a separate seated footprint; its body does not
    // occupy the final cover tile's arched shell. Keep the rear tile end fixed.
    if(!lower&&Math.abs(to-HIP_RIDGE.stepRun)<1e-6){cover.size[2]-=.44;cover.position=new Vector3(...cover.position).addScaledVector(along,-.22).toArray() as Vec3;}
    const coverRotation=new Euler().setFromRotationMatrix(new Matrix4().makeBasis(across.clone().negate(),normal,along));cover.rotation=[coverRotation.x,coverRotation.y,coverRotation.z];
  }
  yield 8; // Organization task 8 complete.
  for(const sx of [-1,1])for(const sz of [-1,1]){
    yield null;
    const top=parts.find(p=>p.id===`ridge-hip-${sx}-${sz}-21-8`)!,axis=new Vector3(1,0,0).applyEuler(new Euler(...top.rotation)),normal=new Vector3(0,1,0).applyEuler(new Euler(...top.rotation));
    const pos=new Vector3(...top.position).addScaledVector(axis,top.size[0]/2-.15).addScaledVector(normal,.016+.38*.5);
    add({id:`ridge-step-beast-${sx}-${sz}`,name:'垂脊端兽头',kind:'垂脊端兽头',assembly:ridges,layer:'tiles',shape:'ridgeStopBeast',material:'glaze',position:pos.toArray() as Vec3,size:[.55,.38,.26],rotation:[...top.rotation],insertion:normal.toArray() as Vec3,stage:43,requires:[top.id],role:'短吻、上扬背部与颊部卷纹的陶质端兽，坐于九层垂脊下端，外接较低戗脊。',evidence:{sources:['liang1937','roof-terminal-photo2023'],basis:'梁调查第三节记垂脊下端施兽头；2023年现场照片“戗脊与走兽”可辨端兽轮廓、短吻及颊纹。',inferred:'550×380×260mm尺度、厚度、背面纹饰及底部固定方式为推定；浅黄赭参考色未复刻损伤，四处采用相同的推定形体。'}});
    const child=parts.find(p=>p.id===`hip-child-${sx}-${sz}`)!,direction=new Vector3(1,0,0).applyEuler(new Euler(...child.rotation)),up=new Vector3(0,1,0).applyEuler(new Euler(...child.rotation));
    const tip=new Vector3(...child.position).addScaledVector(direction,child.size[0]/2),center=tip.addScaledVector(direction,.20).addScaledVector(up,-.08);
    const frame=EAVE_DRAGON_FRAME;center.add(new Vector3(...frame.center).multiply(new Vector3(...frame.scale)).applyEuler(new Euler(...child.rotation)));
    add({id:`ridge-eave-dragon-${sx}-${sz}`,name:'檐角龙首套饰',kind:'檐角龙首套饰',assembly:ridges,layer:'tiles',shape:'eaveDragon',material:'glaze',position:center.toArray() as Vec3,size:frame.extent.map((v,i)=>v*frame.scale[i]) as Vec3,rotation:[...child.rotation],insertion:direction.toArray() as Vec3,stage:44,requires:[child.id],role:'绿釉黄边龙首包护檐角木端，向内开口；作为独立陶质饰件观察和拆装。',evidence:{sources:['roof-eave-photo2017'],basis:'2017年署名现场照片可见檐角龙首、绿色釉面及黄色勾边。',inferred:'984×850×429mm外包尺寸、套口留隙和不可见背面为推定；四角采用相同形体的镜像，具体年代与固定方式未核实。'}});
  }
  for(const sign of [-1,1])add({id:`ridge-finial-${sign}`,name:'后世正脊鸱吻（调查称鸱尾）',kind:'鸱吻',assembly:ridges,layer:'tiles',shape:'finial',material:'glaze',position:[sign*(ROOF.ridgeHalf-1.02),roofY(0)+1.735,0],size:[2.44,3.07,.82],rotation:[0,sign<0?Math.PI:0,0],stage:45,requires:[`ridge-main-${sign<0?0:Math.floor(ROOF.ridgeHalf*4)-1}-18`],role:'张口衔接正脊的琉璃脊饰。保留现存后世构件的残尖、鳍纹、吻头与侧面小龙，配对朝向正脊内侧。',joint:'按整个脊饰对象定位于正脊端部；陶件接缝与拉结痕以表面细节表达，内部锚固未测绘。',evidence:{sources:['liang1937','finial-photo2026','finial-publisher'],basis:'梁思成调查第九图及残高约3.07米；现存近照核对青绿主体、黄色吻缘与小龙、白眼及浅浮雕。',inferred:'宽度按调查图比例约2.44米；0.82米外包厚度、浮雕深度、背面镜像和局部缺釉为建模推定。保留已残尾尖，具体改装年代未定；陶件未拆为实物清点清单。'}});
  add({id:'ridge-pearl',name:'正脊中央火珠（宝刹）',kind:'火珠',assembly:ridges,layer:'tiles',shape:'flame',material:'glaze',position:[0,roofY(0)+1.98,0],size:[1.45,2.66,.65],stage:45,requires:[`ridge-main-${Math.floor(ROOF.ridgeHalf*2)}-18`],role:'后世琉璃脊饰，由双吞脊兽、人物方龛、覆钵、台盘、莲座和梨形宝瓶组成。',joint:'作为脊饰整体定位，内部锚固和陶件分缝尚未取得测绘。',evidence:{sources:['liang1937','finial-photo2026'],basis:'原调查火珠连座高2.66米；依现存正面近照独立塑造宝瓶、莲座、方龛与双兽头及釉色。',inferred:'宽厚、背面、浮雕深度与釉面损伤分布为照片比例推定；并非实物扫描。'}});
  const oldRidgeIds=amap.get(ridges)!.partIds.filter(id=>!id.startsWith('ridge-step-beast-')&&!id.startsWith('ridge-eave-dragon-'));
  amap.get(ridges)!.legacyPartSets=[oldRidgeIds];
  amap.get(ridges)!.legacyPartIds=oldRidgeIds.filter(id=>!id.startsWith('ridge-hip-cover-'));
  const ceiling=group('ceiling','内外槽平闇','boards','内外槽水平天花的格木、覆板与边部峻脚椽；板幅和拼缝为推定。');
  const highRails=['inner-bracket-1-2-ceiling-transverse',...mainFrameIds.map(ix=>`ceiling-support-${ix}`),'inner-bracket-6-2-ceiling-transverse'];
  const highRuns:string[][]=[];
  for(let row=0;row<3;row++){
    yield null;
    highRuns[row]=[];
    for(let span=0;span<HIGH_CEILING_X.length-1;span++){
    yield null;
      const deps=[highRails[span],highRails[span+1]];
      if(row===1){
        if(span>0)deps.push(`cross-head-${mainFrameIds[span-1]}-0-1`);
        if(span<4)deps.push(`cross-head-${mainFrameIds[span]}-0--1`);
      }
      let id:string;
      if(row===1&&(span===0||span===4)){
        id=`inner-bracket-${span===0?1:6}-2-ceiling-axial`;
        const shared=parts.find(p=>p.id===id)!;shared.requires.push(...deps);
      }else id=member(`ceiling-high-${row}-${span}`,row===1?'跨梁缝中线平棊枋':'内槽高边界平棊枋',ceiling,'boards',[HIGH_CEILING_X[span],COLUMN_TOP+INNER_CEILING_LEVEL,HIGH_CEILING_Z[row]],[HIGH_CEILING_X[span+1],COLUMN_TOP+INNER_CEILING_LEVEL,HIGH_CEILING_Z[row]],.16,.21,27,deps,'ceilingSpan','沿实际支点延伸的高平闇木框；支点处分件和端部半搭接为推定，整殿与局部共用实体。').id;
      highRuns[row].push(id);
    }
  }
  // The corner seats carry the same two long boundary members as the hall.
  for(const c of inner.filter(c=>c.corner)){
    yield null;
    const id=`inner-bracket-${c.ix}-${c.iz}`,a=amap.get(id)!,row=c.iz===1?0:2,span=c.ix===1?0:4;
    const rails=[parts.find(p=>p.id===highRuns[row][span])!,parts.find(p=>p.id===highRails[c.ix===1?0:5])!];
    for(const [i,rail] of rails.entries()){
    yield null;
      const arm=parts.find(p=>p.id===`${id}-seventh-${i?'b':'a'}`)!,direction=new Vector3(1,0,0).applyEuler(new Euler(...arm.rotation)),point=new Vector3(...arm.position).addScaledVector(direction,.5315);
      const seat=add({...arm,id:`${id}-high-seat-${i?'b':'a'}`,name:a.name+` · ${i?'侧向':'正向'}高平棊枋下斗`,kind:'内角高平棊枋下斗',shape:'dou',position:point.toArray() as Vec3,rotation:[0,0,0],size:[.29,.19,.29],stage:26,requires:[arm.id,`${id}-seventh-d`],role:'末跳正侧横材的实际端斗，承同方向整根高平棊边枋；没有上枋的另一端不复制空托斗。'});
      fitCornerSeat(seat,arm,rail);rail.requires.push(seat.id);a.contextPartIds!.push(rail.id);
    }
  }
  const sharedLowRims=new Map<string,string>();
  for(let ix=0;ix<7;ix++)for(let iz=0;iz<4;iz++){
    yield null;
    const isInner=ix>=1&&ix<=5&&(iz===1||iz===2),y=COLUMN_TOP+(isInner?INNER_CEILING_LEVEL:LOW_CEILING.frameCenter);
    const x0=isInner?HIGH_CEILING_X[ix-1]:LOW_CEILING_X[ix],x1=isInner?HIGH_CEILING_X[ix]:LOW_CEILING_X[ix+1],z0=isInner?HIGH_CEILING_Z[iz-1]:LOW_CEILING_Z[iz],z1=isInner?HIGH_CEILING_Z[iz]:LOW_CEILING_Z[iz+1];
    const deps=ceilingBearings.filter(p=>Math.abs(p.position[1]-(y-.08))<.03).sort((a,b)=>Math.hypot(a.position[0]-(x0+x1)/2,a.position[2]-(z0+z1)/2)-Math.hypot(b.position[0]-(x0+x1)/2,b.position[2]-(z0+z1)/2)).slice(0,4).map(p=>p.id);
    const rim:string[]=isInner?[highRuns[iz-1][ix-1],highRuns[iz][ix-1],highRails[ix-1],highRails[ix]]:[];
    if(!isInner)for(const [n,a,b] of [[0,[x0,y,z0],[x1,y,z0]],[1,[x0,y,z1],[x1,y,z1]],[2,[x0,y,z0],[x0,y,z1]],[3,[x1,y,z0],[x1,y,z1]]] as [number,Vec3,Vec3][]){
    yield null;const key=JSON.stringify([a,b]);let id=sharedLowRims.get(key);if(!id){id=member(`ceiling-rim-${ix}-${iz}-${n}`,'平棊枋',ceiling,'boards',a,b,.16,.16,27,deps,'box').id;sharedLowRims.set(key,id);}rim.push(id);}
    const lattice:{id:string;axis:number;u:number}[]=[];
    const latticeY=y+.13;
    for(let x=x0+.15,n=0;x<x1;x+=.3,n++)lattice.push({id:member(`ceiling-x-${ix}-${iz}-${n}`,'平闇方椽',ceiling,'boards',[x,latticeY,z0],[x,latticeY,z1],.1,.1,28,rim,'latticeTop','100mm方条与约200mm格空，依据历史调查规则化布置。').id,axis:0,u:x});
    for(let z=z0+.15,n=0;z<z1;z+=.3,n++)lattice.push({id:member(`ceiling-z-${ix}-${iz}-${n}`,'平闇横格木',ceiling,'boards',[x0,latticeY,z],[x1,latticeY,z],.1,.1,28,rim,'latticeBottom','与方椽交接形成平闇格网；交口按半搭接推定。').id,axis:1,u:z});
    for(let z=z0+.3,n=0;z<z1;z+=.6,n++)for(let x=x0,k=0;x<x1-.1;x+=1.2,k++){
    yield null;
      const end=Math.min(x1,x+1.195);const supports=lattice.filter(l=>l.axis===0&&l.u>=x&&l.u<=end).map(l=>l.id);
      const boardZ0=z-.2975,boardZ1=!isInner&&z+.6>=z1?z1:Math.min(z1,z+.2975);
      add({id:`ceiling-board-${ix}-${iz}-${n}-${k}`,name:'平闇覆板',kind:'平闇板',assembly:ceiling,layer:'boards',shape:'box',material:'wood',position:[(x+end)/2,y+.20,(boardZ0+boardZ1)/2],size:[end-x,.04,boardZ1-boardZ0],stage:29,requires:supports.length?supports:rim,role:'铺于平闇格木上方，遮蔽草架；每块覆板可独立取出。'});
    }
  }
  yield 9; // Organization task 9 complete.
  resolveCeilingRimOverlaps(parts,assemblies,add,mergedMembers);
  const infill=group('gongyan-walls','内外檐栱眼封护与斗耳泥','enclosure','内槽栱眼壁、外檐墙线大带与层间小面，以及低平闇斗耳泥。未逐处测绘的分布及隐面按同类关系推定，壁画未复刻。');
  for(let i=0;i<inner.length;i++)for(let j=i+1;j<inner.length;j++){
    yield null;
    const a=inner[i],b=inner[j];
    if(!((a.iz===b.iz&&Math.abs(a.ix-b.ix)===1)||(a.ix===b.ix&&Math.abs(a.iz-b.iz)===1)))continue;
    const delta=new Vector3(b.x-a.x,0,b.z-a.z),length=delta.length()-.72,angle=Math.atan2(-delta.z,delta.x);
    add({id:`gongyan-${a.ix}-${a.iz}-${b.ix}-${b.iz}`,name:`内槽栱眼壁 ${a.ix+1}—${a.iz+1} / ${b.ix+1}—${b.iz+1}`,kind:'栱眼壁',assembly:infill,layer:'enclosure',shape:'wallInfill',material:'clay',position:[(a.x+b.x)/2,COLUMN_TOP+.30,(a.z+b.z)/2],rotation:[0,angle,0],size:[length,.78,.13],stage:46,requires:[a.id,b.id],role:'柱列墙线上的泥质围护与壁画地仗；与外挑栱、昂的开放间隔分开表达。',joint:'可剥离观察墙后木构；复位只是学习操作，不表示泥作可作为整块榫卯件反复拆装。',evidence:{sources:['chcc2018','gongyan2026'],basis:'勘察及2026研究记录现存14幅栱眼壁画；沿内槽14开间对应定位。',inferred:'墙厚、背面、边角曲线与缺损为规则化推定；壁画和彩画未复刻。'}});
  }
  const walls=group('walls','围护墙体','enclosure','墙体按完整对象，山面后部留高窗洞口。');
  for(const side of [-1,1])add({id:`wall-side-${side}`,name:`${side<0?'北':'南'}山墙`,kind:'墙体',assembly:walls,layer:'enclosure',shape:'wallWindow',material:'plaster',position:[side*17.02,FLOOR+2.35,0],size:[17.7,4.7,.42],rotation:[0,Math.PI/2,0],stage:46,requires:['platform-cap'],role:'围护山面，后部高窗保留洞口；墙体表面按现状照片概括。'});
  add({id:'wall-back',name:'东面后墙',kind:'墙体',assembly:walls,layer:'enclosure',shape:'box',material:'plaster',position:[0,FLOOR+2.35,-8.86],size:[34.2,4.7,.42],stage:46,requires:['platform-cap'],role:'东侧后墙围护。'});
  function woodBox(id:string,name:string,g:string,pos:Vec3,size:Vec3,deps:string[],stage=47){return add({id,name,kind:name,assembly:g,layer:'enclosure',shape:'box',material:'redwood',position:pos,size,stage,requires:deps,role:'门窗木作的独立木件；构件类别依调查记录，截面和板缝为推定。'}).id;}
  // Each hollow jamb/lintel uses four independently removable shell boards.
  function hollow(id:string,name:string,g:string,pos:Vec3,size:Vec3,deps:string[],vertical:boolean){
    const ids:string[]=[];const t=.035;
    if(vertical){for(const sign of [-1,1]){
      ids.push(woodBox(`${id}-face-${sign}`,`${name}面板`,g,[pos[0],pos[1],pos[2]+sign*(size[2]/2-t/2)],[size[0],size[1],t],deps));
      ids.push(woodBox(`${id}-side-${sign}`,`${name}侧板`,g,[pos[0]+sign*(size[0]/2-t/2),pos[1],pos[2]],[t,size[1],size[2]-2*t],deps));
    }}else{for(const sign of [-1,1]){
      ids.push(woodBox(`${id}-face-${sign}`,`${name}面板`,g,[pos[0],pos[1],pos[2]+sign*(size[2]/2-t/2)],[size[0],size[1],t],deps));
      ids.push(woodBox(`${id}-side-${sign}`,`${name}侧板`,g,[pos[0],pos[1]+sign*(size[1]/2-t/2),pos[2]],[size[0],t,size[2]-2*t],deps));
    }}return ids;
  }
  for(let ix=1;ix<=5;ix++){
    yield null;
    const x=(GRID_X[ix]+GRID_X[ix+1])/2,w=GRID_X[ix+1]-GRID_X[ix]-.64,g=group(`entry-${ix}`,`前檐第${ix+1}间板门`,'enclosure','双扇板门、板合中空门框、门楅和门簪逐件拆分。');
    const base=woodBox(`door-ground-${ix}`,'地栿',g,[x,FLOOR+.1,8.82],[w+.3,.2,.4],['platform-cap']);
    const threshold=hollow(`threshold-${ix}`,'门槛',g,[x,FLOOR+.3,8.82],[w,.24,.32],[base],false);
    const jambs=[];for(const sign of [-1,1])jambs.push(...hollow(`jamb-${ix}-${sign}`,'门颊',g,[x+sign*w/2,FLOOR+2.2,8.82],[.21,3.8,.3],[base],true));
    const header=hollow(`lintel-${ix}`,'门额',g,[x,FLOOR+4.16,8.82],[w+.4,.28,.36],jambs,false);
    const chicken=woodBox(`chicken-${ix}`,'鸡栖木',g,[x,FLOOR+3.98,8.68],[w+.2,.14,.18],header);
    for(let n=0;n<4;n++)woodBox(`door-pin-${ix}-${n}`,'门簪',g,[x+(n-1.5)*.7,FLOOR+4.19,9.08],[.15,.16,.32],header);
    for(const sign of [-1,1]){
    yield null;
      const doorX=x+sign*(w-.28)/4,dw=(w-.28)/2-.025;
      const leaves=[];
      // Leave 20mm below the chicken timber and above the threshold for opening.
      for(let n=0;n<5;n++)leaves.push(woodBox(`door-${ix}-${sign}-${n}`,'门扇木板',g,[doorX+(n-2)*dw/5,FLOOR+2.165,8.84],[dw/5-.004,3.45,.06],[...threshold,chicken],48));
      for(let n=0;n<5;n++)woodBox(`door-rail-${ix}-${sign}-${n}`,'门楅',g,[doorX,FLOOR+.66+n*.71,8.77],[dw,.12,.10],leaves,49);
    }
  }
  for(const ix of [0,6]){
    yield null;
    const x=(GRID_X[ix]+GRID_X[ix+1])/2,w=GRID_X[ix+1]-GRID_X[ix]-.58,g=group(`front-window-${ix}`,`前檐${ix===0?'北':'南'}稍间直棂窗`,'enclosure','半墙上直棂窗，按历史记录每窗15根直棂。');
    add({id:`window-wall-${ix}`,name:'窗下槛墙',kind:'墙体',assembly:walls,layer:'enclosure',shape:'box',material:'plaster',position:[x,FLOOR+.9,8.83],size:[w,1.8,.35],stage:46,requires:['platform-cap'],role:'直棂窗下部的半墙。'});
    const lower=woodBox(`window-lower-${ix}`,'窗下串',g,[x,FLOOR+1.85,8.84],[w,.15,.20],[`window-wall-${ix}`]);
    const upper=woodBox(`window-upper-${ix}`,'窗额',g,[x,FLOOR+4.1,8.84],[w,.15,.20],[`column-${ix}-4`,`column-${ix+1}-4`]);
    for(const sign of [-1,1])woodBox(`window-jamb-${ix}-${sign}`,'窗立颊',g,[x+sign*(w/2-.07),FLOOR+2.98,8.84],[.14,2.2,.18],[lower,upper]);
    for(let n=0;n<15;n++)woodBox(`window-bar-${ix}-${n}`,'直棂',g,[x+(n-7)*(w-.35)/14,FLOOR+2.98,8.84],[.055,2.16,.07],[lower,upper]);
    woodBox(`window-mid-${ix}`,'承棂串',g,[x,FLOOR+2.96,8.80],[w-.2,.08,.07],[lower,upper]);
  }
  for(const side of [-1,1]){
    yield null;
    const g=group(`side-window-${side}`,`${side<0?'北':'南'}山墙后部高窗`,'enclosure','后部进深位置的高窗；精确尺寸按照片比例推定。');
    for(const sign of [-1,1])woodBox(`side-window-rail-${side}-${sign}`,'高窗横串',g,[side*17.02,FLOOR+3.38+sign*.55,-4.69],[.16,.10,4.1],[`wall-side-${side}`]);
    for(let n=0;n<15;n++)woodBox(`side-window-bar-${side}-${n}`,'高窗直棂',g,[side*17.02,FLOOR+3.38,-6.6+n*.275],[.08,1.1,.06],[`side-window-rail-${side}--1`,`side-window-rail-${side}-1`]);
  }
  const altar=group('altar','佛坛、扇面墙与造像','statues','五组主像分别重建坐姿、冠服、坐骑与背光；依照片建模，尚非扫描复刻。');
  add({id:'altar-base',name:'佛坛',kind:'佛坛',assembly:altar,layer:'statues',shape:'box',material:'stone',position:[0,FLOOR+.37,-.9],size:[25.2,.74,6.615],stage:46,requires:['platform-cap'],role:'五间宽的佛坛，宽深高采用原调查约值规则化。'});
  yield 10; // Organization task 10 complete.
  const altarBack=-.9-6.615/2,returnFront=-1.8,returnHeight=5.3-.74;
  add({id:'altar-screen',name:'佛坛扇面墙',kind:'扇面墙',assembly:altar,layer:'statues',shape:'box',material:'plaster',position:[0,FLOOR+2.65,altarBack-.12],size:[25.2,5.3,.24],stage:46,requires:['platform-cap'],role:'后内柱前的长屏墙，与佛坛后缘接合，区分佛坛和后外槽空间。'});
  // The returns start on the altar and butt against the back wall. Disjoint
  // solids prevent the former buried, nearly coincident faces from flickering.
  for(const sign of [-1,1])add({id:`altar-return-${sign}`,name:'扇面墙折返',kind:'屏墙',assembly:altar,layer:'statues',shape:'box',material:'plaster',position:[sign*(12.6-.12),FLOOR+.74+returnHeight/2,(altarBack+returnFront)/2],size:[.24,returnHeight,returnFront-altarBack],stage:46,requires:['altar-base'],role:'扇面墙两端向前折返的围护；可见墙体由坛面起，与后墙对接。墙厚、折返进深和接缝为规则化推定。'});
  const statue=(id:string,name:string,x:number,z:number,h:number,width:number,shape:Part['shape']='attendant',kind='塑像')=>add({id,name,kind,assembly:altar,layer:'statues',shape,material:'polychrome',position:[x,FLOOR+.74,z],size:[width,h,width*.7],stage:47,requires:['altar-base'],role:'东大殿现存彩塑的形体重建，区分坐姿、冠服、手势、台座与背光。',joint:'整体作为彩塑对象观察；不将泥塑衣纹或肢体当作可拆卸榫卯件。',evidence:{sources:['liang1937','statue-photos2024'],basis:'五主像与佛坛布置据调查；面形、垂足/跏趺、金脸蓝发与红青袍服据现存现场照片。',inferred:'独立曲面建模，侧背与隐藏轮廓为推定；复杂重妆纹样、个体损伤、内部骨架和完整侍从清单未逐件精确复刻。'}});
  const mainNames=['文殊菩萨骑狮','阿弥陀佛','释迦牟尼佛','弥勒佛（垂足坐）','普贤菩萨骑象'];
  const mainShapes:Part['shape'][]=['manjusri','amitabha','buddha','maitreya','samantabhadra'];
  for(let i=0;i<5;i++)statue(`statue-main-${i}`,mainNames[i],(i-2)*5.04,-1.8,i===0||i===4?4.8:5.3,i===0||i===4?2.2:2.7,mainShapes[i],mainNames[i]);
  for(let i=0;i<10;i++)statue(`statue-attendant-${i}`,'胁侍造像（位置与服饰概括）',(Math.floor(i/2)-2)*5.04+(i%2===0?-1.6:1.6),-.7,3.7,1.0);
  for(const sign of [-1,1])statue(`statue-king-${sign}`,'天王（甲胄形体重建）',sign*11.2,1.35,4.1,1.15,'guardian','天王');
  statue('donor-ning','宁公遇供养像（形体概括）',-2.2,1.7,1.95,.66,'donor');statue('monk-yuancheng','本随禅师像（旧称愿诚，形体概括）',2.2,1.7,1.95,.66,'donor');
  // Attach type names to longitudinal helpers without duplicating builder code.
  for(const part of parts) if(!part.kind)part.kind=part.name;
  for(const part of parts)part.requires=[...new Set(part.requires.map(id=>mergedMembers.get(id)??id))].filter(id=>id!==part.id);
  for(const a of assemblies){
    yield null;a.partIds=[...new Set(a.partIds.map(id=>mergedMembers.get(id)??id))];if(a.contextPartIds)a.contextPartIds=[...new Set(a.contextPartIds.map(id=>mergedMembers.get(id)??id))].filter(id=>!a.partIds.includes(id));}
  if(useBakedJoints)for(const p of parts){
    yield null;
    const mesh=(bracketJoints.assignments as Record<string,string>)[p.id];if(!mesh)continue;
    const spliced=splicedHeadfangIds.has(p.id);
    p.paintSourceShape=p.shape;
    p.shape=p.kind==='由昂'?`vaseYou:bracketJoint:${mesh}`:`bracketJoint:${mesh}`;
    const span=p.id.includes('-headfang-'),blind=span&&p.id.startsWith('inner-')&&/^第[12]层柱头枋$/.test(p.kind);
    if(!span&&p.kind!=='后尾丁头短栱'&&!p.id.startsWith('brace-low-'))p.insertion=[0,1,0];
    p.requires=[...new Set([...p.requires,...(bracketJoints as {supports?:Record<string,string[]>}).supports?.[p.id]??[]])];
    p.joint=spliced?(blind?'跨段两端先向下落入节点，后从槽口侧插入丁头短榫；枋面盲卯背壁保留，具体接缝和暗口为推定。':'跨段两端同时向下落入节点，再安装压住接头的上层散斗；端舌、止口和实际拼缝均为推定。'):blind?'枋面盲卯接后尾丁头短榫，背壁封闭；70mm榫与2mm总间隙为推定。纵向分段接头缺少逐件测绘依据。':span?'先沿柱列侧向进入，再装穿接华栱或耍头。端部退让斗耳；柱头段与柱间段的纵向接头缺少逐件测绘依据。':'与交接木件使用配对上下槽，按研究节点方向作局部减料。暗榫和具体槽深为项目推定。';
    p.evidence={...p.evidence,inferred:p.evidence.inferred+' 本接口采用节点研究启发的局部减料，未作为原物暗榫实测。'};
  }
  if(useBakedJoints&&useRoofJoints)for(const p of parts){
    yield null;
    const key=(roofJoints.assignments as Record<string,string>)[p.id];if(!key)continue;
    p.paintSourceShape=p.paintSourceShape??p.shape;
    p.shape=`roofJoint:${key}`;
    p.requires=[...new Set([...p.requires,...(roofJoints.supports as Record<string,string[]>)[p.id]??[]])];
    p.joint=p.id.startsWith('hip-child-')?'子角梁下部开放承口配合实际大角梁顶面，从上方落座；截面、承口和固定方式为推定。':'椽尾斜裁并在下部让出实际角梁承面，从上方落座；具体斜口和固定方式为推定。';
    const clearances=(roofJoints as {clearances?:Record<string,string[]>}).clearances?.[p.id]??[];
    if(clearances.length){p.orderOnlyRequires=[...new Set([...p.orderOnlyRequires??[],...clearances])];p.joint='椽条下部让开角梁端部，实际承于对应槫；角梁依赖仅规定先装次序，让位切口与固定方式为推定。';}
    p.insertion=[0,1,0];
  }
  // Dress the twelve upper end rafters to the board underside without moving
  // their axes or bearing ends. These cuts complement the existing hip seats.
  if(useBakedJoints&&useRoofJoints)for(const p of parts){
    const key=`board-${p.id}`;
    if(!(key in rafterBoardCuts.meshes))continue;
    p.paintSourceShape=p.paintSourceShape??p.shape;
    p.shape=`roofJoint:${key}`;
  }
  const resolvedParts=new Map(parts.filter(p=>!mergedMembers.has(p.id)).map(p=>[p.id,p]));
  for(const a of assemblies.filter(a=>a.variant==='outer')){
    yield null;
    // Shared milk beams and carved crossing meshes must be resolved before
    // fitting these seats; the discarded short-arm template has a different top.
    for(const [seatId,aboveId] of [['09','10'],['11','13'],['12','13'],['22','25'],['23','25']]){
    yield null;
      const seat=resolvedParts.get(`${a.id}-${seatId}`)!,above=resolvedParts.get(`${a.id}-${aboveId}`)!,below=resolvedParts.get(seat.requires[0])!;
      fitCornerSeat(seat,below,above);
      above.requires=[...new Set([...above.requires,seat.id])];
      seat.evidence={...seat.evidence,inferred:seat.evidence.inferred+' 斗高与斗底标高按最终上下木件承面协调；保留栱层标高，尺寸为接触闭合推定，未作为原物逐件实测。'};
    }
    resolvedParts.get(`${a.id}-26`)!.joint='草乳栿的下端舌托住压槽枋节点；先放梁，再将底部开放的节点向下落座。此反向搭口为推定。';
    resolvedParts.get(a.id.replace('outer-bracket-','grass-milk-'))!.joint='外端下舌延至压槽枋外面齐平，托住压槽枋节点；端长、反向搭口和2mm侧隙均为推定。两处昂尾与内柱承面先就位。';
  }

  for(const span of parts.filter(p=>splicedHeadfangIds.has(p.id))){
    yield null;
    const level=Number(span.id.split('-').at(-1));if(level%2)continue;
    const t=new Vector3(1,0,0).applyEuler(new Euler(...span.rotation));
    for(const id of span.requires.slice(0,2)){
    yield null;
      const node=resolvedParts.get(id)!,toward=new Vector3(...span.position).sub(new Vector3(...node.position)).dot(t);
      for(const q of parts.filter(p=>p.assembly===node.assembly&&p.id.includes(`-column-seat-${level+1}-`)&&p.requires.includes(id)))if(new Vector3(...q.position).sub(new Vector3(...node.position)).dot(t)*toward>0)q.requires.push(span.id);
    }
  }
  yield 11; // Organization task 11 complete.
  // Inner blind-tenon rear arms need their full straight entry corridor before
  // the corresponding outer rear dou closes it. This edge is erection order only.
  for(let i=4;i<=9;i++){
    yield null;
    const q=resolvedParts.get(`outer-inter-${i+4}-rear-first-dou`)!,id=`inner-inter-${i}-07`;
    q.requires.push(id);q.orderOnlyRequires=[...q.orderOnlyRequires??[],id];
  }
  // The shared middle-purlin support exposes the neighbouring end-bay frame
  // during an outer-corner lesson. Its F2 span must descend before the F3
  // members close that route; F3/F5 spans enter from the open outer aisle.
  for(const c of inner.filter(c=>c.corner)){
    yield null;
    const spans=parts.filter(p=>p.id.startsWith('inner-headfang-')&&Math.abs(p.position[0]-c.x)<1e-6&&Math.abs(p.position[2]-c.z/2)<1e-6);
    const second=spans.find(p=>p.kind==='第2层柱头枋')!;
    for(const id of [`inner-bracket-${c.ix}-2-04`,`ceiling-arm-milk-${c.ix}-${c.iz===1?0:4}`])resolvedParts.get(id)!.requires.push(second.id);
    for(const p of spans.filter(p=>['第3层柱头枋','第5层柱头枋'].includes(p.kind)))p.insertion=[Math.sign(c.x),0,0];
  }
  for(const panel of parts.filter(p=>p.kind==='栱眼壁')){
    yield null;
    const sill=parts.find(p=>p.kind==='柱间阑额'&&Math.abs(p.position[0]-panel.position[0])<1e-6&&Math.abs(p.position[2]-panel.position[2])<1e-6);
    if(sill)panel.requires=[sill.id];
  }
  if(useBakedJoints)installDouProfiles(parts.filter(p=>!mergedMembers.has(p.id)));
  if(useBakedJoints)installSharedDouSeats(parts,assemblies,mergedMembers);
  for(const mud of buildEarMud(parts.filter(p=>!mergedMembers.has(p.id)),infill)){
    yield null;add(mud);resolvedParts.set(mud.id,mud);}
  for(const panel of buildOuterInfill(parts.filter(p=>!mergedMembers.has(p.id)),infill,COLUMN_TOP)){
    yield null;add(panel);resolvedParts.set(panel.id,panel);}
  for(const a of assemblies.filter(a=>a.layer==='brackets'||/^(?:end-)?frame-|^beam-bracket-/.test(a.id))){
    yield null;
    const own=new Set(a.partIds),context=new Set(a.contextPartIds??[]);
    if(a.variant==='outer'||a.variant==='cornerOuter')for(const p of parts.filter(p=>p.id.startsWith('pressure-fang-')&&p.requires.some(id=>own.has(id))))context.add(p.id);
    for(const p of parts.filter(p=>splicedHeadfangIds.has(p.id)&&p.requires.some(id=>own.has(id))))context.add(p.id);
    const visited=new Set<string>();
    function follow(id:string){if(visited.has(id))return;visited.add(id);const p=resolvedParts.get(id);if(!p||p.id.startsWith('platform'))return;if(!own.has(id))context.add(id);p.requires.forEach(follow);}
    if(/^(?:end-)?frame-/.test(a.id)){
      const bearingMembers=new Set(own);
      if(a.id.startsWith('end-frame-'))for(const p of parts.filter(p=>p.assembly===`frame-${a.id==='end-frame--1'?2:5}`))bearingMembers.add(p.id);
      for(const p of parts.filter(p=>p.id.startsWith('purlin-')&&p.requires.some(id=>bearingMembers.has(id))))context.add(p.id);
    }
    [...a.partIds,...context].forEach(follow);
    for(const mud of parts.filter(p=>p.material==='clay'))if(mud.requires.every(id=>own.has(id)||context.has(id)))context.add(mud.id);
    a.contextPartIds=[...context].filter(id=>!own.has(id));
    if(a.variant==='cornerOuter'){
      const beforeUpper=a.partIds.filter(id=>!id.includes('-corner-upper-'));
      a.legacyPartIds=beforeUpper.filter(id=>!id.endsWith('-column-seat-1-z-in'));a.legacyPartSets=[beforeUpper];
      for(const version of [legacyCornerScopes,...legacyCornerScopes.additional]){
    yield null;
        const recorded=(version.studies as Record<string,string[]>)[a.id];
        if(recorded)a.legacyPartSets.push([...new Set(recorded.map(id=>mergedMembers.get(id)??id))]);
      }
    }
    if(a.variant==='cornerInner'){
      const beforeMilk=a.partIds.filter(id=>!id.includes('-column-seat-1-b-'));
      a.legacyPartIds=beforeMilk.filter(id=>!id.endsWith('-root-b'));a.legacyPartSets=[beforeMilk];
    }
    for(const recorded of [legacyBackArmScopes,legacyLowCeilingScopes,...legacyLowCeilingScopes.additional]){
    yield null;
      const scope=(recorded.studies as Record<string,string[]>)[a.id];
      if(scope)a.legacyPartSets=[...a.legacyPartSets??[],[...new Set(scope.map(id=>mergedMembers.get(id)??id))]];
    }
  }
  if(useBakedJoints)for(const p of parts)if(p.id in wallJoints){p.shape=`wallJoint:${p.id}`;if(p.kind==='墙体')p.evidence={...p.evidence,inferred:p.evidence.inferred+' 墙柱交界按本模型柱形扣除墙体，2mm净距为显示与几何协调推定，非实物缝宽测量。'};}
  yield 12; // Organization task 12 complete.
  for(const p of parts.filter(p=>p.kind.includes('散斗')&&p.shape==='dou')){
    yield null;
    p.joint='上部斗口承接栱枋，底面落在下层承托面。底部隐藏连接尚未核实，当前平底模型省略了这部分细节，不能据此判断实物无榫、无销。';
    p.evidence={...p.evidence,sources:[...new Set([...p.evidence.sources,'yingxian-joints2022'])],inferred:p.evidence.inferred+' 本件斗底卯口、栽销的有无与尺寸缺少实测依据；应县木塔隐藏连接研究仅供比较，不作为东大殿该节点的复原依据。'};
  }
  const plaqueGroup=group('front-plaque','佛光真容禪寺匾额','enclosure','西面明间正门上方的现存匾额；两列竖排，翻卷云纹边框。尺寸与背部挂接为推定。');
  const plaqueEvidence:Evidence={sources:['front-plaque2024','front-plaque-side2012'],basis:'2024年正面实景照片：右列佛光真、左列容禪寺，风化题字、翻卷云纹边框及正门上方位置。',inferred:'正面外包约3.05×3.30m；内板约47mm，框带起伏、卷尾进深与向下倾斜15°及离墙距离按照片推定；背面挂接和框内榫卯未测绘。边框折起和卷尾为实体曲面，细云纹仍以照片表现，未逐纹雕刻；具体制作年代未核。'};
  const plaqueBeam=parts.find(p=>p.kind==='罗汉枋'&&Math.abs(p.position[0])<.01&&Math.abs(p.position[2]-9.807)<.01)!;
  const beamFace=plaqueBeam.position[2]+plaqueBeam.size[2]/2;
  for(const [i,x] of [-1.10,1.10].entries()){
    yield null;
    const y=plaqueBeam.position[1],end=plaqueBackAt(x,y);
    add({id:`front-plaque-hanger-${i}`,name:'匾额背部挂接支座（推定）',kind:'匾额挂接',assembly:plaqueGroup,layer:'enclosure',shape:`plaqueMount:${x}:${y}:${beamFace}`,material:'wood',position:[x,y,(beamFace+end)/2],size:[.12,.16,end-beamFace],stage:35,requires:[plaqueBeam.id],insertion:[0,0,1],role:'联系匾额背面与檐下横枋的教学示意支座。',joint:'前端随匾额倾角与背部曲面收口；背部紧固方式未取得实测资料，当前支座仅表达悬挂依附关系。',evidence:plaqueEvidence});
  }
  add({id:'front-plaque-board',name:'佛光真容禪寺匾额',kind:'匾额',assembly:plaqueGroup,layer:'enclosure',shape:'frontPlaque',material:'plaque',position:[...PLAQUE_POSITION],rotation:[PLAQUE_TILT,0,0],size:[...PLAQUE_SIZE],stage:36,requires:['front-plaque-hanger-0','front-plaque-hanger-1'],insertion:[0,0,1],role:'悬于西面明间正门上方的寺名匾额。面对匾额，右列自上而下为佛、光、真，左列为容、禪、寺。',joint:'整匾作为一个附属物取下与复位；边框和拼板的隐藏连接未复原，背部挂接为推定。',evidence:plaqueEvidence});
  buildCeilingCoves(parts.filter(p=>!mergedMembers.has(p.id)),add,COLUMN_TOP+LOW_CEILING.frameCenter);
  if(useDouFittings)installDouFittings(parts.filter(p=>!mergedMembers.has(p.id)));
  const oldCeilingIds=new Set(legacyCeilingScope.partIds);
  const finalIds=new Set(parts.filter(p=>!mergedMembers.has(p.id)).map(p=>p.id));
  amap.get(ceiling)!.legacyPartSets=[[...new Set(legacyCeilingScope.partIds.map(id=>mergedMembers.get(id)??id).filter(id=>finalIds.has(id)))]];
  return {version:'east-hall-2026.4',practiceAdditions:parts.filter(p=>finalIds.has(p.id)).filter(p=>(p.assembly===ceiling&&!oldCeilingIds.has(p.id))||p.id.startsWith('rafter-corner-fill-')||p.id.startsWith('ridge-hip-cover-')||p.id.startsWith('ridge-step-beast-')||p.id.startsWith('ridge-eave-dragon-')).map(p=>p.id),partAliases:Object.fromEntries(mergedMembers),parts:parts.filter(p=>!mergedMembers.has(p.id)),assemblies:assemblies.filter(a=>a.partIds.length),sources};
}
