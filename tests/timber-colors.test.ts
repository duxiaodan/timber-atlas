import {test} from 'node:test';
import assert from 'node:assert/strict';
import {presentTimberTint,timberTone,timberPaintStyle,timberHeadRegion,isStudyTimber} from '../src/model/timber-colors';
import {Color} from 'three';
import type {Part} from '../src/model/types';
const part=(id:string,kind='栱'):Part=>({id,kind,position:[0,0,0],rotation:[0,0,0],name:id,assembly:'test',layer:'brackets',shape:'box',material:'wood',size:[2,.3,.3],explode:[0,1,0],insertion:[0,1,0],stage:1,requires:[],role:'',joint:'',evidence:{sources:[],basis:'',inferred:''}});
test('same timber family stays unified regardless of ID and position',()=>{
 const a=part('a'),b={...part('unrelated-id'),position:[10,2,3] as Part['position']};
 assert.equal(timberTone(a),timberTone(b));const c=presentTimberTint(a,new Color());assert.equal(c.r,c.g);assert.equal(c.g,c.b);
});
test('surface ornaments belong to specific members, and interior/exterior arm variants stay distinct',()=>{
 assert.equal(timberPaintStyle(part('a','栱头散斗')),3);
 assert.equal(timberPaintStyle(part('b','柱间阑额')),6);
 assert.equal(timberPaintStyle({...part('c','明栿'),layer:'frame'}),5);
 const arm={...part('d','华栱'),position:[-12.6,7,0] as Part['position']};
 assert.equal(timberHeadRegion(arm,-1),0);assert.equal(timberHeadRegion(arm,1),1);
 assert.equal(timberPaintStyle({...arm,assembly:'inner-bracket-1'}),timberPaintStyle({...arm,assembly:'outer-bracket-1'}));
 assert.equal(timberPaintStyle(part('ang','山面第一层下昂')),7);
 assert.equal(timberHeadRegion({...arm,position:[-13.6,7,0]},1),2);
});
test('present tones exclude ordinary rafters, boards and nonstructural finishes; input stays unchanged',()=>{
 const parts=[part('a'),{...part('wall'),layer:'enclosure' as const},{...part('rafter','椽'),layer:'rafters' as const},{...part('board'),layer:'boards' as const}];
 const before=JSON.stringify(parts);assert.deepEqual(parts.filter(isStudyTimber).map(p=>p.id),['a']);assert.equal(JSON.stringify(parts),before);
});
