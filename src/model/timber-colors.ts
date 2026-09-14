import {Color,Euler,Vector3} from 'three';
import type {Part} from './types';

export const isStudyTimber=(p:Part)=>['wood','redwood'].includes(p.material)&&(['columns','brackets','frame'].includes(p.layer)||p.layer==='rafters'&&/角梁/.test(p.kind));
export function timberTone(p:Part):number{
  if(/斗/.test(p.kind))return 1.26;
  if(/昂/.test(p.kind))return .82;
  if(/栱/.test(p.kind))return .98;
  return 1.04;
}
export function presentTimberTint(p:Part,out:Color):Color{return out.setScalar(timberTone(p));}

/** Historical enclosure: front inner column line and north/south/rear walls.
 * A head on a boundary remains unverified; neither assembly nor instance order decides it.
 */
export function timberHeadRegion(p:Part,end:-1|1):0|1|2{
  const alongZ=p.size[2]>p.size[0],v=new Vector3(alongZ?0:end*p.size[0]/2,0,alongZ?end*p.size[2]/2:0).applyEuler(new Euler(...p.rotation)).add(new Vector3(...p.position));
  if([v.x+12.6,v.x-17.01,v.z-8.82,v.z+8.82].some(x=>Math.abs(x)<.06))return 2;
  return v.x> -12.6&&v.x<17.01&&v.z> -8.82&&v.z<8.82?1:0;
}
/** Low nibble = surface family. Arm head regions use the next nibble (base 3).
 * 0 gray; 1 plain; 2 column zones; 3 dou contour; 4 gong; 5 beam/fang;
 * 6 architrave; 7 ang (no assumed swallowtail); 8 root dou contour; 9 straight-sided mudao root dou.
 */
export function timberPaintStyle(p:Part):number{
  const shape=p.paintSourceShape??p.shape;
  if(p.kind==='柱')return 2;
  if(shape.startsWith('rootDou'))return shape.startsWith('rootDouMud:')?9:8;
  if(/斗/.test(p.kind))return 3;
  if(/阑额/.test(p.kind))return 6;
  if(/昂/.test(p.kind))return 7;
  if(/栱/.test(p.kind)&&p.layer==='brackets')return 4+16*(/华栱/.test(p.kind)?timberHeadRegion(p,-1)+3*timberHeadRegion(p,1):8);
  if(['frame','columns'].includes(p.layer)||/枋/.test(p.kind))return 5;
  return 1;
}
export function paintedTimberTint(p:Part,out:Color):Color{return out.setScalar(/斗/.test(p.kind)?1.08:/昂/.test(p.kind)?.9:1);}

/** Restored warm timber study: shared member-family tones, independent of IDs. */
export function naturalTimberColor(p:Part):number{
  if(/斗/.test(p.kind))return 0xc3a074;
  if(p.kind==='柱'||/昂/.test(p.kind))return 0x98704a;
  if(/栱/.test(p.kind))return 0xad8156;
  return 0xb08a60;
}
