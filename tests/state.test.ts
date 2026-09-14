import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCatalog} from '../src/model/catalog';
import {localPracticeMemberIds} from '../src/model/study-scope';
import {initialSession,restoreSession,startPractice,completePlacement,checkPlacement,installationOrder} from '../src/state';
const catalog=createCatalog();
const group=catalog.assemblies.find(a=>a.id==='outer-bracket-3-4')!;
const memberIds=localPracticeMemberIds(catalog,group);
const parts=memberIds.map(id=>catalog.parts.find(p=>p.id===id)!);

test('guided assembly requires correct order, orientation, and insertion',()=>{
  let practice=startPractice(parts);
  const first=parts.find(p=>p.id===practice.active)!;
  assert.match(checkPlacement(practice,first).message,/朝向/);
  practice={...practice,turn:0};
  assert.match(checkPlacement(practice,first).message,/插入/);
  practice={...practice,distance:.09};
  assert.equal(checkPlacement(practice,first).ok,true);
  const after=completePlacement(practice,first);
  assert.deepEqual(after.completed,[first.id]);assert.notEqual(after.active,first.id);
  assert.equal(completePlacement(after,first),after);
  const dependent=parts.find(p=>p.requires.includes(first.id))!;
  assert.match(checkPlacement({...practice,active:dependent.id},dependent).message,/前置/);
  practice=startPractice(parts);
  while(practice.active){const p=parts.find(p=>p.id===practice.active)!;practice=completePlacement({...practice,turn:0,distance:0},p);}
  assert.equal(practice.completed.length,parts.length);assert.equal(practice.active,null);
});
test('progress survives reload, malformed saves cannot skip supports or stall a lesson',()=>{
  const state=initialSession(catalog.version);state.scope=group.id;state.expandedContext=true;state.practice=startPractice(parts);
  const first=parts.find(p=>p.id===state.practice!.active)!;
  state.practice=completePlacement({...state.practice,turn:0,distance:0},first);
  state.hidden=[catalog.parts[100].id];state.explode=.6;
  const restored=restoreSession(JSON.stringify(state),catalog);
  assert.deepEqual(restored,state);
  const malformed={...state,practice:{...state.practice,active:'missing',completed:parts.map(p=>p.id).filter(id=>id!==first.id)}};
  const recovered=restoreSession(JSON.stringify(malformed),catalog);
  assert.equal(recovered.practice!.active,first.id);assert.ok(!recovered.practice!.completed.includes(first.id));
  for(const id of recovered.practice!.completed){const p=parts.find(p=>p.id===id)!;assert.ok(p.requires.every(d=>!memberIds.includes(d)||recovered.practice!.completed.includes(d)));}
  assert.deepEqual(restoreSession('{broken',catalog),initialSession(catalog.version));
  assert.deepEqual(restoreSession(JSON.stringify({...state,version:'stale'}),catalog),initialSession(catalog.version));
});
test('paused component lessons persist and invalid scopes are discarded',()=>{
  const state=initialSession(catalog.version);state.lessons[group.id]=startPractice(parts);
  const restored=restoreSession(JSON.stringify(state),catalog);assert.deepEqual(restored.lessons,state.lessons);
  const poisoned={...state,lessons:{'missing-group':state.lessons[group.id]}};
  assert.deepEqual(restoreSession(JSON.stringify(poisoned),catalog).lessons,{});
});
test('dependency cycles fail explicitly and orientation/distance corruption cannot install',()=>{
  const [a,b]=parts;
  assert.throws(()=>installationOrder([{...a,requires:[b.id]},{...b,requires:[a.id]}]),/依赖成环/);
  const p=startPractice(parts),part=parts.find(a=>a.id===p.active)!;
  for(const distance of [NaN,Infinity,-.1])assert.equal(checkPlacement({...p,turn:0,distance},part).ok,false);
  assert.equal(checkPlacement({...p,turn:NaN,distance:0},part).ok,false);
});

test('symmetric members accept geometrically equivalent orientations',()=>{
  const rectangular=parts.find(p=>p.kind==='栌斗')!;
  const square=catalog.parts.find(p=>p.shape==='dou'&&p.size[0]===p.size[2])!;
  assert.equal(checkPlacement({...startPractice([rectangular]),turn:2,distance:0},rectangular).ok,true);
  assert.equal(checkPlacement({...startPractice([square]),turn:1,distance:0},square).ok,true);
  const ang=catalog.parts.find(p=>p.kind.includes('下昂'))!;
  assert.equal(checkPlacement({...startPractice([ang]),turn:2,distance:0},ang).ok,false);
});

test('a valid lesson key cannot restore another component’s member set',()=>{
  const state=initialSession(catalog.version);
  state.lessons['column-grid']=startPractice(parts);
  assert.deepEqual(restoreSession(JSON.stringify(state),catalog).lessons,{});
  state.scope='column-grid';state.practice=startPractice(parts);
  assert.equal(restoreSession(JSON.stringify(state),catalog).practice,null);
});
