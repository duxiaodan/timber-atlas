import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import type {Plugin} from 'vite';

// Browser-only boundary: Node modelling tools retain their original JSON imports.
// Every listed source is emitted once, with Vite's content hash and decoded size.
const modelFiles=['wall-joints','bracket-joints','eave-dragon','ridge-beast','roof-joints','dou-fittings','legacy-low-ceiling-scopes','dou-profiles','joint-geometry'];
const roofFiles=['assets/sculptures-finials/central-v33/ridge-pearl.glb','assets/sculptures-finials/chiwen-v37/ridge-finial-1.glb','assets/sculptures-finials/chiwen-v36/ridge-finial--1.glb','src/model/runtime-sculptures/receiving-patches.json'];
export function loadingAssets():Plugin {
 let root='';
 const virtual='virtual:loading-assets',resolved='\0'+virtual;
 return {name:'loading-assets',enforce:'pre',
  configResolved(config){root=config.root;},
  resolveId(id){if(id===virtual)return resolved;},
  load(id){
   if(id!==resolved)return;
   const files=[...modelFiles.map(n=>`src/model/${n}.json`),...roofFiles];
   return files.map((f,i)=>`import u${i} from ${JSON.stringify('/'+f+'?url&no-inline')};`).join('\n')+`\nexport default [${files.map((f,i)=>`{key:${JSON.stringify(f)},url:u${i},bytes:${readFileSync(resolve(root,f)).byteLength},model:${i<modelFiles.length}}`).join(',')}];`;
  },
  transform(code,id){
   if(!id.endsWith('.ts')||!id.startsWith(root+'/src/'))return;
   let changed=false;
   const output=code.replace(/import\s+(\w+)\s+from\s+(['"])([^'"]+\.json)\2\s*;/g,(original,name,_quote,path)=>{
    const key=resolve(dirname(id),path).slice(root.length+1);
    if(!modelFiles.some(n=>key===`src/model/${n}.json`))return original;
    changed=true;return `const ${name}=__loadedModelData(${JSON.stringify(key)});`;
   });
   if(changed)return {code:`import {loadedModelData as __loadedModelData} from '/src/loading-data.ts';\n${output}`,map:null};
  },
 };
}
