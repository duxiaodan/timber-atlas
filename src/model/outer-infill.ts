import {Euler,Vector3} from 'three';
import type {Part} from './types';

/** Visible infill on the perimeter column plane; hidden thickness is inferred. */
export function buildOuterInfill(parts:Part[],assembly:string,columnTop:number):Part[]{
 const result:Part[]=[];
 for(const sill of parts.filter(p=>p.id.startsWith('outer-tie-'))){
  const axis=new Vector3(1,0,0).applyEuler(new Euler(...sill.rotation));
  const spans=parts.filter(p=>p.id.startsWith('outer-headfang-')&&
   new Vector3(...p.position).sub(new Vector3(...sill.position)).setY(0).length()<.01);
  // The large opening ends at F1. The two small upper strips occupy only
  // the clear interval between successive fangs, on this same wall plane.
  for(let band=0;band<3;band++){
   const below=band===0?sill:spans.find(p=>p.kind===`第${band}层柱头枋`);
   const above=spans.find(p=>p.kind===`第${band+1}层柱头枋`);
   if(!below||!above)throw new Error(`Missing outer infill boundary at ${sill.id}/${band}`);
   const bottom=band===0?columnTop-.09:below.position[1]+below.size[1]/2;
   const top=above.position[1]-above.size[1]/2;
   if(top<=bottom)throw new Error(`No infill interval at ${sill.id}/${band}`);
   const side=Math.abs(axis.x)>.9?(sill.position[2]>0?'西面前檐':'东面后檐'):(sill.position[0]<0?'北山面':'南山面');
   result.push({...sill,id:`outer-infill-${sill.id.slice('outer-tie-'.length)}-${band}`,
    name:`${side}栱眼封护 · ${sill.id.slice('outer-tie-'.length)}间${band===0?'下部大带':`第${band}层小面`}`,
    kind:'外檐栱眼壁',assembly,layer:'enclosure',shape:'box',material:'clay',
    position:[sill.position[0],(bottom+top)/2,sill.position[2]],size:[sill.size[0]-.54,top-bottom,.13],stage:46,
    requires:[below.id,above.id],
    role:'外柱墙线上随木构轮廓收口的浅色栱眼封护；大带上方保留层间小填面，外挑栱昂之间继续开放。',
    joint:'泥作附着层，可隐藏以查看木构，不参与榫卯拼装。按现有木件截面裁去穿过墙线的部分。',
    evidence:{sources:['chcc2018','liang1937'],basis:'CHCC后檐南尽间近照可见浅色长带及上层小填面。内槽14幅壁画记录不限定外檐范围。',
     inferred:'22个外柱间的同类分布、三个层间范围、130mm隐层厚度和背面为模型推定；未取得逐间材料剖面与残存清点。浅色表面概括现状，现存封护年代不等同857年大木年代。'}});
  }
 }
 return result;
}
