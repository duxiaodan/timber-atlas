import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {registerSculptureAssetAsync} from './sculpture-asset';
import {sculpturePlacement} from './sculpture-placement';
import {applyRoofSculptureFitAsync,type RoofSculptureFit} from './sculpture-fit';
import type {Catalog,Vec3} from './types';
import accepted from './roof-sculptures-accepted.json';
import pearl from './runtime-sculptures/ridge-pearl.json';
import chiwenA from './runtime-sculptures/ridge-finial-1.json';
import chiwenB from './runtime-sculptures/ridge-finial--1.json';
import assets from 'virtual:loading-assets';
import {receiveAsset} from '../loading-data';
import {bootActivity,bootProgress,bootPaint} from '../boot-progress';
/** Install the three roof sculptures before constructing the viewer. */
export async function installRoofSculptures(catalog:Catalog){
  const loader=new GLTFLoader(),installed=[];
  const roof=assets.filter(a=>!a.model),total=roof.reduce((n,a)=>n+a.bytes,0);
  let loaded=0,item=0;
  const receive=async(asset:typeof roof[number])=>{const bytes=await receiveAsset(asset,n=>bootProgress('ridgeReceive',loaded+n,total));loaded+=asset.bytes;return bytes;};
  for(const [meta,asset,offset] of [
    [pearl,roof[0],[0,-.30,0]],
    [chiwenA,roof[1],[0,0,0]],
    [chiwenB,roof[2],[0,0,0]],
  ] as const){
    const part=catalog.parts.find(p=>p.id===meta.partId);
    if(!part)throw Error(`Missing roof sculpture ${meta.partId}`);
    const placement=sculpturePlacement(part,meta,[...offset] as Vec3);
    const approved=accepted.parts.find(p=>p.partId===part.id);
    if(JSON.stringify(placement)!==JSON.stringify(approved?.placement))
      throw Error(`Roof sculpture placement changed: ${part.id}`);
    const bytes=await receive(asset);
    bootActivity('ridgeParse',++item);await bootPaint();
    const gltf=await loader.parseAsync(bytes,new URL('.',new URL(asset.url,location.href)).href);
    bootActivity('ridgePlace',item);await bootPaint();
    part.shape=await registerSculptureAssetAsync(part.id,gltf.scene);
    part.size=placement.size;part.position=placement.position;
    part.evidence={...part.evidence,
      basis:part.id==='ridge-pearl'?"火珠整体高度参考调查连座2.66米；现存照片用于核对分层台盘、绿色鼓体、金色卷饰和兽面、人物与双兽首。":"鸱吻现存近照用于核对青绿主体、黄色吻缘与附龙、鳍纹、接缝和残损；整体残高参考调查约3.07米。",
      inferred:part.id==='ridge-pearl'?"火珠在模型中的安装位置下调0.30米，该定位为推定；宽厚、背面人物、未见面、局部浮雕和隐藏支承仍为照片近似或推定，未取得完整实测。":"当前模型宽厚、浮雕深度、背侧复用、未见暗部、灰浆收口及锔条锚固为照片比例或安装推定；残釉界线为近似，尚无逐件实测。"
    };
    installed.push({partId:part.id,version:meta.version,placement});
  }
  const bytes=await receive(roof[3]);await bootPaint();
  bootActivity('fitParse');await bootPaint();
  const fit:RoofSculptureFit=JSON.parse(new TextDecoder().decode(bytes));
  await applyRoofSculptureFitAsync(catalog,fit,installed,(done,total)=>bootProgress('fit',done,total));
  await bootPaint();
}
