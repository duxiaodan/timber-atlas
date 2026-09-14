import {LAYERS,type Catalog} from './model/types';

export interface ProductFeatures {readonly altarStatues:boolean;}

/** Build-time product scope. Unset keeps the complete development model. */
export function readProductFeatures(env:{VITE_ALTAR_STATUES?:string}={}):ProductFeatures {
  const value=env.VITE_ALTAR_STATUES;
  if(value!==undefined&&value!=='true'&&value!=='false')throw Error('VITE_ALTAR_STATUES must be true or false');
  return Object.freeze({altarStatues:value!=='false'});
}

export function productLayers(features:ProductFeatures){
  return LAYERS.filter(layer=>features.altarStatues||layer.id!=='statues');
}

/** Remove disabled content before state restoration, selection and geometry creation. */
export function productCatalog(catalog:Catalog,features:ProductFeatures):Catalog {
  if(features.altarStatues)return catalog;
  const removed=new Set(catalog.parts.filter(part=>part.layer==='statues').map(part=>part.id));
  const keep=(ids:string[])=>ids.filter(id=>!removed.has(id));
  const parts=catalog.parts.filter(part=>!removed.has(part.id)).map(part=>({
    ...part,requires:keep(part.requires),
    ...(part.orderOnlyRequires?{orderOnlyRequires:keep(part.orderOnlyRequires)}:{}),
  }));
  const usedSources=new Set(parts.flatMap(part=>part.evidence.sources));
  const removedSources=new Set(catalog.parts.filter(part=>removed.has(part.id)).flatMap(part=>part.evidence.sources));
  return {...catalog,parts,
    assemblies:catalog.assemblies.filter(a=>a.layer!=='statues').map(a=>({...a,
      partIds:keep(a.partIds),
      ...(a.contextPartIds?{contextPartIds:keep(a.contextPartIds)}:{}),
      ...(a.legacyPartIds?{legacyPartIds:keep(a.legacyPartIds)}:{}),
      ...(a.legacyPartSets?{legacyPartSets:a.legacyPartSets.map(keep)}:{}),
    })).filter(a=>a.partIds.length),
    sources:catalog.sources.filter(source=>!removedSources.has(source.id)||usedSources.has(source.id)),
    ...(catalog.practiceAdditions?{practiceAdditions:keep(catalog.practiceAdditions)}:{}),
    ...(catalog.partAliases?{partAliases:Object.fromEntries(Object.entries(catalog.partAliases).filter(([,id])=>!removed.has(id)))}:{}),
  };
}
