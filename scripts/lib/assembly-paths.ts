import type {Catalog,Part,Vec3} from '../../src/model/types';
import {installationOrder} from '../../src/state';
import {sampleOverlaps} from './sample-overlaps';
import {practiceMemberIds} from '../../src/model/study-scope';

// Discrete collision audit of the exact straight insertion route used by practice mode.
// This is a geometric check, not a continuous sweep proof or structural/load simulation.
export function auditAssemblyPaths(catalog:Catalog,assemblyId:string,distances=[0,.03,.10,.25,.5,1,2,3]){
  const assembly=catalog.assemblies.find(a=>a.id===assemblyId)!;
  const byId=new Map(catalog.parts.map(p=>[p.id,p]));
  const ids=practiceMemberIds(catalog,assembly),scope=new Set(ids);
  const installed=(assembly.contextPartIds??[]).filter(id=>!scope.has(id)).map(id=>byId.get(id)!);
  const report:{part:string;distance:number;obstacles:string[]}[]=[];
  for(const part of installationOrder(ids.map(id=>byId.get(id)!))){
    for(const distance of distances){
      const moving:Part={...part,position:part.position.map((v,i)=>v+part.insertion[i]*distance) as Vec3};
      const collisions=sampleOverlaps([...installed,moving],moving.id);
      if(collisions.length){report.push({part:part.id,distance,obstacles:collisions.map(pair=>pair.a===part.id?pair.b:pair.a)});break;}
    }
    installed.push(part);
  }
  return report;
}
