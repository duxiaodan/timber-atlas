import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog} from '../src/model/catalog';
import {productCatalog,productLayers,readProductFeatures} from '../src/product-features';
import {restoreSession,initialSession,startPractice} from '../src/state';

const full=createCatalog();
const without=productCatalog(full,{altarStatues:false});

test('default configuration preserves the full development catalog and validates the switch',()=>{
  assert.deepEqual(readProductFeatures(),{altarStatues:true});
  assert.deepEqual(readProductFeatures({VITE_ALTAR_STATUES:'false'}),{altarStatues:false});
  assert.equal(productCatalog(full,readProductFeatures()),full);
  assert.throws(()=>readProductFeatures({VITE_ALTAR_STATUES:'0'}));
  assert.equal(productLayers(readProductFeatures()).length,9);
});

test('disabled content leaves the building and roof ornaments unchanged with no dangling references',()=>{
  assert.equal(full.parts.length-without.parts.length,23);
  assert.equal(without.parts.length,22602);assert.equal(without.assemblies.length,108);
  assert.deepEqual(without.parts,full.parts.filter(p=>p.layer!=='statues'));
  assert.deepEqual(without.assemblies,full.assemblies.filter(a=>a.layer!=='statues'));
  assert.ok(!productLayers({altarStatues:false}).some(l=>l.id==='statues'));
  const ids=new Set(without.parts.map(p=>p.id));
  for(const p of without.parts)for(const id of [...p.requires,...p.orderOnlyRequires??[]])assert.ok(ids.has(id),`${p.id} -> ${id}`);
  for(const a of without.assemblies)for(const id of [...a.partIds,...a.contextPartIds??[]])assert.ok(ids.has(id),`${a.id} -> ${id}`);
  for(const id of ['ridge-pearl','ridge-finial-1','ridge-finial--1'])assert.ok(ids.has(id));
  assert.ok(!without.sources.some(s=>s.id==='statue-photos2024'));
});

test('a full-model save cannot restore disabled selections or lessons and preserves timber progress',()=>{
  const save=initialSession(full.version);
  save.scope='altar';save.selected='statue-main-2';save.isolated='statue-main-2';save.visible.statues=true;
  save.hidden=['altar-base'];save.removed=['statue-main-1'];
  const altar=full.parts.filter(p=>p.layer==='statues');
  save.practice=startPractice(altar);save.lessons.altar=save.practice;
  save.lessons['part:statue-main-2']=startPractice(altar.filter(p=>p.id==='statue-main-2'));
  const wood=full.parts.find(p=>p.id==='platform-cap')!;
  const timber=startPractice([wood]);timber.completed=[wood.id];timber.active=null;
  save.lessons['part:platform-cap']=timber;
  const restored=restoreSession(JSON.stringify(save),without);
  assert.equal(restored.selected,null);assert.equal(restored.scope,null);assert.equal(restored.isolated,null);
  assert.equal(restored.practice,null);assert.deepEqual(restored.hidden,[]);assert.deepEqual(restored.removed,[]);
  assert.ok(!restored.lessons.altar);assert.ok(!restored.lessons['part:statue-main-2']);
  assert.deepEqual(restored.lessons['part:platform-cap'].completed,['platform-cap']);
  const practice=startPractice(without.parts);
  assert.ok(practice.scope.every(id=>!altar.some(p=>p.id===id)));
});
