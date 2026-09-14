import type {DouProfile} from './dou-profile';
import data from './dou-profiles.json';
import fittings from './dou-fittings.json';
import type {Part,Vec3} from './types';

interface Placement {shape:string;size:number[];position:number[];rotation:number[]}
function matchesInput(part:Part,expected:Placement):boolean{
 return part.shape===expected.shape&&(['size','position','rotation'] as const).every(key=>part[key].every((value,i)=>Math.abs(value-expected[key][i])<=1e-8));
}

/** Explicit member IDs keep symmetric templates from silently changing type. */
export function installDouProfiles(parts:Part[]):void{
 const assignments:Record<string,{profile:string;rotation:number[];position:number[];size:number[]}>=data.assignments;
 const rootMudIds=new Set(data.rootMudIds),inputs:Record<string,Placement>=data.inputs;
 const present=new Set(parts.map(p=>p.id));
 for(const id of Object.keys(inputs))if(!present.has(id))throw new Error(`Missing specified dou: ${id}`);
 for(const p of parts){
  if(inputs[p.id]&&!matchesInput(p,inputs[p.id]))throw new Error(`Changed dou input: ${p.id}`);
  if(rootMudIds.has(p.id)){if(!p.shape.startsWith('rootDou:'))throw new Error(`Unexpected root dou ${p.id}`);p.shape=`rootDouMud:${Number(p.shape.split(':')[1])}`;p.evidence={...p.evidence,sources:[...new Set([...p.evidence.sources,'zhang2022'])],basis:p.evidence.basis+' 外檐栌斗沿泥道方向截直，两侧增加阑额衔接面。',inferred:p.evidence.inferred+' 侧向突出采用现有斗口外宽投影，具体突出量与底部接合为建模推定，非逐件测绘。'};}
  const a=assignments[p.id];if(!a)continue;
  p.shape=`douProfile:${a.profile}`;p.paintSourceShape=p.shape;p.rotation=[...a.rotation] as Vec3;p.position=[...a.position] as Vec3;p.size=[...a.size] as Vec3;
  const profiles:Record<string,{channels:unknown[]}>=data.profiles;
  const single=profiles[a.profile].channels.length===1;
  if(single){p.name=p.name.replaceAll('交互斗','单槽承斗');p.kind=p.kind.replaceAll('交互斗','单槽承斗');}
  p.joint=`${single?'单向通槽，两道连续斗耳':'两向交会承口'}；槽底承托上材，斗底落在下承木件。斗平、斗欹和斗底分层表达；隐藏底卯或栽销未据此新增。`;
  p.evidence={...p.evidence,basis:p.evidence.basis+` 按本部位承托关系复核${single?'单向两耳':'交叉口'}，槽向跟随实际木件。`,inferred:p.evidence.inferred+' 槽宽净距、斗平及斗欹比例为模型协调参数，未取得逐件槽口实测。'};
 }
 const byId=new Map(parts.map(p=>[p.id,p]));
 for(const [dou,upperIds] of Object.entries(data.upperSupports))for(const id of upperIds){
  const upper=byId.get(id);if(!upper||!byId.has(dou))throw new Error(`Missing dou bearing: ${dou}/${id}`);
  upper.requires=[...new Set([...upper.requires,dou])];
 }
 for(const id of data.unverifiedEndIds){const p=byId.get(id)!;p.evidence={...p.evidence,inferred:p.evidence.inferred+' 本翼形栱端斗尚无可核实的上承木件，保留原形等待直接图证，不据此宣称原物节点准确。'};}
 for(const id of data.diagonalRimIds){const p=byId.get(id)!;p.evidence={...p.evidence,inferred:p.evidence.inferred+' 斜向端斗保留交叉口，正交边枋仅在局部角区接触；未据此另造斜向上枋，完整承托形制仍缺直接图证。'};}

}

export function getDouProfile(key:string):DouProfile{
 const profiles:Record<string,{channels:{angle:number;width:number}[];earTop?:number;slope?:number[];slopeMode?:string}>=data.profiles;
 const p=profiles[key];if(!p)throw new Error(`Unknown dou profile ${key}`);
 if(p.slopeMode!==undefined&&p.slopeMode!=='whole'&&p.slopeMode!=='foot')throw new Error(`Invalid dou slope ${key}`);
 if(p.slope&&(p.slope.length!==2||!p.slope.every(Number.isFinite)))throw new Error(`Invalid dou slope vector ${key}`);
 return {channels:p.channels,earTop:p.earTop,slope:p.slope?[p.slope[0],p.slope[1]]:undefined,slopeMode:p.slopeMode};
}

/** Local joints cut only the specified recipient, leaving the mating member intact. */
export function installDouFittings(parts:Part[]):void{
 const ids=new Set(Object.keys(fittings.meshes)),present=new Set(parts.map(p=>p.id));
 for(const id of ids)if(!present.has(id))throw new Error(`Missing fitting recipient: ${id}`);
 const inputs:Record<string,{shape:string;size:number[];position:number[];rotation:number[]}>=fittings.inputs;
 for(const p of parts)if(ids.has(p.id)){
  const expected=inputs[p.id];
  if(!matchesInput(p,expected))throw new Error(`Stale dou fitting: ${p.id}`);
  p.paintSourceShape=p.shape;
  p.shape=`douJoint:${p.id}`;
  p.evidence={...p.evidence,inferred:p.evidence.inferred+' 与现有相邻木件交接处作局部退让，接触面形状为装配协调推定。'};
 }
}

/** Two nearly coincident inventory entries describe one shared bearing block. */
export function installSharedDouSeats(parts:Part[],assemblies:import('./types').Assembly[],aliases:Map<string,string>):void{
 const byId=new Map(parts.map(p=>[p.id,p]));
 for(const seat of data.sharedSeats){
  const shared=byId.get(seat.canonical),former=byId.get(seat.alias);
  if(!shared||!former)throw new Error(`Missing shared dou inputs: ${seat.canonical}`);
  shared.position=[...seat.position] as Vec3;
  shared.requires=[...new Set([...shared.requires,...former.requires])];
  shared.name='内角与补间共用高平棊承斗';shared.kind='共用单槽承斗';
  shared.evidence={...shared.evidence,inferred:shared.evidence.inferred+' 两个相邻铺作的原斗位重叠，合为共用单斗；中心取原两位置中点，数量与偏距为模型协调推定。'};
  aliases.set(former.id,shared.id);
 }
 const resolve=(ids:string[])=>[...new Set(ids.map(id=>aliases.get(id)??id))];
 for(const part of parts){part.requires=resolve(part.requires).filter(id=>id!==part.id);if(part.orderOnlyRequires)part.orderOnlyRequires=resolve(part.orderOnlyRequires).filter(id=>id!==part.id);}
 for(const assembly of assemblies){assembly.partIds=resolve(assembly.partIds);if(assembly.contextPartIds)assembly.contextPartIds=resolve(assembly.contextPartIds).filter(id=>!assembly.partIds.includes(id));}
}
