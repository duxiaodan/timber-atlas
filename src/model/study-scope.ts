import {Euler,Quaternion,Vector3} from 'three';
import type {Assembly,Catalog,Part} from './types';
import {isPracticePart} from './practice-material';

/** Members that must be restored when rebuilding the observed assembly. */
export function practiceMemberIds(catalog:Catalog,assembly:Assembly):string[]{
  const eligible=new Set(catalog.parts.filter(isPracticePart).map(p=>p.id));
  if(assembly.intercolumnBay)return assembly.partIds.filter(id=>eligible.has(id));
  const members=new Set(assembly.partIds.filter(id=>eligible.has(id))),context=new Set(assembly.contextPartIds??[]);
  const candidates=catalog.parts.filter(p=>context.has(p.id)&&eligible.has(p.id));
  let changed=true;
  while(changed){
    changed=false;
    for(const p of candidates)if(!members.has(p.id)&&p.requires.some(id=>members.has(id))){members.add(p.id);changed=true;}
  }
  return [...members];
}

/** Local presentation is a bounded view, not a foundation/support closure. */
const localCache=new WeakMap<Catalog,Map<string,string[]>>();
function compactStudyMemberIds(catalog:Catalog,assembly:Assembly,expanded=false):string[]{
  if(expanded)return [...new Set([...assembly.partIds,...assembly.contextPartIds??[],...(assembly.intercolumnBay?studyMemberIds(catalog,assembly):[])])];
  let cache=localCache.get(catalog);if(!cache){cache=new Map();localCache.set(catalog,cache);}
  const cached=cache.get(assembly.id);if(cached)return cached;
  const byId=new Map(catalog.parts.map(p=>[p.id,p]));
  const own=new Set(assembly.partIds),members=new Set(own),context=new Set(assembly.contextPartIds??[]);
  if(assembly.intercolumnBay){
    const bay=assembly.intercolumnBay;
    // Preserve the actual bay and only the endpoint bracket members needed by its fangs.
    // Shared long wood retains its physical identity; remote support chains stay omitted.
    const allowed=new Set([...own,...bay.connectionIds,...bay.columnIds]);
    for(const id of bay.columnIds)for(const dep of byId.get(id)?.requires??[])if(byId.get(dep)?.kind==='柱础')allowed.add(dep);
    for(const id of bay.bracketIds)for(const p of catalog.assemblies.find(a=>a.id===id)?.partIds??[])allowed.add(p);
    const queue=[...own,...bay.connectionIds,...bay.columnIds];
    for(let i=0;i<queue.length;i++){
      const p=byId.get(queue[i]);if(!p)continue;members.add(p.id);
      for(const dep of p.requires)if(allowed.has(dep)&&!members.has(dep)&&!queue.includes(dep)&&!p.orderOnlyRequires?.includes(dep))queue.push(dep);
    }
    const result=[...members];cache.set(assembly.id,result);return result;
  }
  const primary=assembly.partIds.map(id=>byId.get(id)!).filter(p=>p.assembly===assembly.id);
  const root=primary.find(p=>p.kind==='栌斗')??primary[0];
  const bracket=/^(outer|inner)-(bracket|inter)-|^beam-bracket-/.test(assembly.id);
  // 2.1 m encloses the four outward jumps; the nearest other column is 4.41 m away.
  // Shared long wood may cross this neighbourhood. Its remote supports do not extend it.
  const near=(p:Part)=>{
    if(!root||!bracket)return true;
    if(p.kind==='柱'||p.kind==='柱础')return Math.hypot(p.position[0]-root.position[0],p.position[2]-root.position[2])<.1;
    const delta=new Vector3(root.position[0]-p.position[0],0,root.position[2]-p.position[2]);
    const axis=p.size[0]>=p.size[2]?0:2;
    const direction=new Vector3(axis===0?1:0,0,axis===2?1:0).applyQuaternion(new Quaternion().setFromEuler(new Euler(...p.rotation)));
    direction.y=0;const projectedLength=direction.length()*p.size[axis];direction.normalize();
    const along=Math.max(-projectedLength/2,Math.min(projectedLength/2,delta.dot(direction)));
    return delta.addScaledVector(direction,-along).length()<=2.1;
  };
  const queue=[...own];
  for(let i=0;i<queue.length;i++){
    const part=byId.get(queue[i])!;
    for(const id of part.requires){
      const candidate=byId.get(id);
      if(!candidate||members.has(id)||!context.has(id)||part.orderOnlyRequires?.includes(id)||!near(candidate))continue;
      // A frame keeps immediate connections; only the local column continues to its stone.
      if(!bracket&&!own.has(part.id)&&part.kind!=='柱')continue;
      members.add(id);queue.push(id);
    }
  }
  const result=[...members];cache.set(assembly.id,result);return result;
}

const frameEnvironmentCache=new WeakMap<Catalog,Map<string,string[]>>();
/** Recognisable nearby structure, added only to presentation, not the saved lesson. */
export function fixedFrameContextIds(catalog:Catalog,assembly:Assembly):string[]{
  if(assembly.variant!=='centralFrame'&&assembly.variant!=='endFrame'&&!assembly.id.startsWith('beam-bracket-'))return [];
  let cache=frameEnvironmentCache.get(catalog);if(!cache){cache=new Map();frameEnvironmentCache.set(catalog,cache);}
  const cached=cache.get(assembly.id);if(cached)return cached;
  const byId=new Map(catalog.parts.map(p=>[p.id,p])),byAssembly=new Map(catalog.assemblies.map(a=>[a.id,a]));
  const own=new Set(assembly.partIds),anchors=new Set(own),environment=new Set<string>();
  if(assembly.variant==='endFrame')for(const id of own)for(const dep of byId.get(id)!.requires){
    const neighbour=byAssembly.get(byId.get(dep)!.assembly);
    if(neighbour?.variant==='centralFrame')for(const p of neighbour.partIds){anchors.add(p);environment.add(p);}
  }
  const anchorParts=[...anchors].map(id=>byId.get(id)!);
  // These are joined at the rail's ends and centre. Include only the adjoining
  // spans, without recursively importing the distant frames supporting them.
  const ceilingRails=new Set(anchorParts.filter(p=>p.shape==='ceilingRail').map(p=>p.id));
  for(const p of catalog.parts)if(p.shape==='ceilingSpan'&&p.requires.some(id=>ceilingRails.has(id)))environment.add(p.id);
  const minX=Math.min(...anchorParts.map(p=>p.position[0])),maxX=Math.max(...anchorParts.map(p=>p.position[0]));
  const maxZ=Math.max(...anchorParts.map(p=>Math.abs(p.position[2])))+.5;
  const columns=catalog.parts.filter(p=>!assembly.id.startsWith('beam-bracket-')&&p.kind==='柱'&&(assembly.variant==='centralFrame'
    ?Math.abs(p.position[0]-anchorParts[0].position[0])<.01
    :p.position[0]>=minX-.5&&p.position[0]<=maxX+.5&&Math.abs(p.position[2])<=maxZ));
  for(const column of columns){
    environment.add(column.id);for(const id of column.requires)if(byId.get(id)?.kind==='柱础')environment.add(id);
    const root=catalog.parts.find(p=>p.kind==='栌斗'&&p.requires.includes(column.id));
    const bracket=root&&byAssembly.get(root.assembly);
    if(bracket)for(const id of compactStudyMemberIds(catalog,bracket))environment.add(id);
  }
  // Keep the actual purlins carried by this frame (and the adjacent frame under a gable frame).
  for(const p of catalog.parts)if(p.id.startsWith('purlin-')&&p.requires.some(id=>anchors.has(id)))environment.add(p.id);
  const original=new Set(compactStudyMemberIds(catalog,assembly));
  const result=[...environment].filter(id=>!original.has(id));cache.set(assembly.id,result);return result;
}

export function studyMemberIds(catalog:Catalog,assembly:Assembly,expanded=false):string[]{
  return [...new Set([...compactStudyMemberIds(catalog,assembly,expanded),...fixedFrameContextIds(catalog,assembly)])];
}

export function localPracticeMemberIds(catalog:Catalog,assembly:Assembly):string[]{
  const local=new Set(compactStudyMemberIds(catalog,assembly));
  return practiceMemberIds(catalog,{...assembly,contextPartIds:(assembly.contextPartIds??[]).filter(id=>local.has(id))});
}

const fixedStudyCache=new WeakMap<Catalog,Map<string,string[]>>();
/** Only local lesson members move; expanded neighbours remain presentation context.
 * Own coatings retain their observation-only peeling/explosion behaviour. */
export function fixedStudyContextIds(catalog:Catalog,assembly:Assembly,expanded=false):string[]{
  let cache=fixedStudyCache.get(catalog);if(!cache){cache=new Map();fixedStudyCache.set(catalog,cache);}
  const key=`${assembly.id}:${expanded}`,cached=cache.get(key);if(cached)return cached;
  const moving=new Set([...assembly.partIds,...localPracticeMemberIds(catalog,assembly)]);
  const fixed=studyMemberIds(catalog,assembly,expanded).filter(id=>!moving.has(id));
  cache.set(key,fixed);return fixed;
}
