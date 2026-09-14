import {Euler,Vector3} from 'three';
import type {Part,Assembly,Vec3} from './types';

/** Replace duplicated bay-edge timber only where a physical radial rail exists. */
export function resolveCeilingRimOverlaps(parts:Part[],assemblies:Assembly[],add:(p:Part)=>Part,aliases:Map<string,string>){
 const rails=parts.filter(p=>p.id.startsWith('ceiling-radial-milk-'));
 const replacements=new Map<string,string[]>();
 const axis=(p:Part)=>new Vector3(1,0,0).applyEuler(new Euler(...p.rotation));
 for(const rim of parts.filter(p=>p.id.startsWith('ceiling-rim-'))){
  const along=axis(rim);
  const rail=rails.find(p=>{
   const d=new Vector3(...p.position).sub(new Vector3(...rim.position));
   return Math.abs(along.dot(axis(p)))>.99999&&Math.abs(d.y)<1e-6&&d.clone().addScaledVector(along,-d.dot(along)).length()<(p.size[2]+rim.size[2])/2&&Math.abs(d.dot(along))<(p.size[0]+rim.size[0])/2;
  });
  if(!rail)continue;
  const center=new Vector3(...rail.position).sub(new Vector3(...rim.position)).dot(along);
  const ranges=[[-rim.size[0]/2,center-rail.size[0]/2],[center+rail.size[0]/2,rim.size[0]/2]];
  const ids=[rail.id];
  ranges.forEach(([from,to],i)=>{
   from=Math.max(from,-rim.size[0]/2);to=Math.min(to,rim.size[0]/2);if(to-from<.005)return;
   const p=add({...rim,id:`${rim.id}-end-${i}`,name:'平闇边框端段（接径向枋）',kind:'平棊边枋端段',size:[to-from,rim.size[1],rim.size[2]],position:new Vector3(...rim.position).addScaledVector(along,(from+to)/2).toArray() as Vec3,
    requires:[...new Set([...rim.requires,rail.id])],role:'保留原边框超出径向平棊枋两端的木段；中间重合区共用实际径向枋。',
    evidence:{...rim.evidence,inferred:rim.evidence.inferred+' 按现有实体边界分段接入径向枋，接长与端部做法为推定，尚非低平闇完整测绘复原。'}});
   ids.push(p.id);
  });
  aliases.set(rim.id,rail.id);replacements.set(rim.id,ids);
 }
 for(const p of parts)p.requires=[...new Set(p.requires.flatMap(id=>replacements.get(id)??[id]))].filter(id=>id!==p.id);
 for(const a of assemblies){a.partIds=[...new Set(a.partIds.flatMap(id=>replacements.get(id)??[id]))];if(a.contextPartIds)a.contextPartIds=[...new Set(a.contextPartIds.flatMap(id=>replacements.get(id)??[id]))];}
}
