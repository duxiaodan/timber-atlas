import {Euler,Vector3} from 'three';
import type {Part,Vec3} from './types';

/** A distribution hypothesis limited to dou between low-ceiling sofang and rails. */
export function buildEarMud(parts:Part[],assembly:string):Part[]{
 const result:Part[]=[];
 for(const dou of parts.filter(p=>p.id.startsWith('ceiling-radial-head-'))){
  const rail=parts.find(p=>p.id.startsWith('ceiling-radial-milk-')&&p.requires.includes(dou.id));
  if(!rail)throw new Error(`Missing ceiling rail above ${dou.id}`);
  const axis=new Vector3(1,0,0).applyEuler(new Euler(...rail.rotation));
  if(Math.abs(axis.y)>1e-6)throw new Error(`Sloping rail requires a separate mud profile: ${rail.id}`);
  const normal=new Vector3(-axis.z,0,axis.x),yaw=Math.atan2(-axis.z,axis.x);
  const bottom=dou.position[1]+.44*dou.size[1],top=rail.position[1]+rail.size[1]/2-.008;
  const depth=(dou.size[2]-rail.size[2])/2,height=top-bottom;
  if(depth<=0||height<=0)throw new Error(`No exposed ear for mud: ${dou.id}`);
  for(const sign of [-1,1]){
   const documentedRegion=dou.id==='ceiling-radial-head-milk-0-3-0';
   const position=new Vector3(...dou.position).addScaledVector(normal,sign*(rail.size[2]/2+depth/2));position.y=(top+bottom)/2;
   result.push({id:documentedRegion?`ear-mud-north-${sign}`:`ear-mud-${dou.id.slice('ceiling-radial-head-'.length)}-${sign}`,
    name:`${documentedRegion?'北梢间照片区域':'低平闇素枋上斗'}斗耳泥 · ${dou.id.slice('ceiling-radial-head-'.length)}侧${sign<0?1:2}（分布推定）`,
    kind:'斗耳泥',assembly,layer:'enclosure',shape:'earMud',material:'clay',position:position.toArray() as Vec3,
    rotation:[0,yaw+(sign<0?Math.PI:0),0],size:[dou.size[0]-.008,height,depth],stage:46,requires:[dou.id,rail.id],
    insertion:[0,1,0],explode:[position.x*.12,1,position.z*.12],
    role:'贴在平棊枋侧面、下沿落在斗耳上沿的楔形泥面。按同类低平闇素枋上斗补建；逐处残存范围与双侧分布为推定。',
    joint:'泥层附着于斗耳和上枋，可剥离观察；不参与榫卯插装，也不承担木构支承。',
    evidence:{sources:['chcc2018'],basis:'2018勘察记录斗耳多有楔泥；北梢间北缝素枋与平棊枋间的带彩画实例提供形态参照。',
     inferred:`${documentedRegion?'本件位于照片描述的北侧区域，具体内外端映射仍为推定。':'此处按同类素枋—斗—平棊枋关系推广，尚无本件逐处近照。'}两侧成对、厚度、边界和保存程度为建模推定；44处88片为模型数量，非实物清点。彩画未复制，其他斗型不套用。`}});
  }
 }
 return result;
}
