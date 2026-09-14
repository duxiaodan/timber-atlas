import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geometry} from '../src/model/geometry';
import {sampleTimberContour,TimberContours} from '../src/model/timber-contour';
import {createCatalog} from '../src/model/catalog';
import {douProfileGeometry,type DouProfile} from '../src/model/dou-profile';
import {timberPaintPosition,timberPaintExterior} from '../src/model/timber-paint-coordinates';
import data from '../src/model/dou-profiles.json';
import type {Part,Vec3} from '../src/model/types';

test('moon beam decoration follows the curved lower silhouette and preserves its mesh',()=>{
 const size:Vec3=[5,.6,.3],g=geometry('beam',size),before=Array.from(g.getAttribute('position').array),row=sampleTimberContour(g,size);
 assert.ok(Math.abs(row[(256+2)*4]+.5)<1e-5,'belly lower edge');
 assert.ok(Math.abs(row[8]+.11)<1e-5,'head lower edge must rise with geometry');
 assert.ok(row[2]>5,'underside arc length includes the curved rise');
 assert.deepEqual(Array.from(g.getAttribute('position').array),before);
});
test('every reviewed sloping dou keeps white borders aligned with its authored levels',()=>{
 for(const [key,raw] of Object.entries(data.profiles)){
  if(!('slope' in raw))continue;
  const [id,a]=Object.entries(data.assignments).find(([,a])=>a.profile===key)!;
  const profile=raw as DouProfile,size=a.size as Vec3,g=douProfileGeometry(size,profile),part={id,shape:`douProfile:${key}`,size} as Part;
  const before=Array.from(g.getAttribute('position').array),paint=timberPaintPosition(part,g);
  let min=Infinity,max=-Infinity;for(let i=0;i<paint.count;i++){min=Math.min(min,paint.getY(i));max=Math.max(max,paint.getY(i));}
  assert.ok(Math.abs(min+.48)<1e-5,key+' sole');assert.ok(Math.abs(max-.44)<1e-5,key+' ear');
  assert.deepEqual(Array.from(g.getAttribute('position').array),before);assert.equal(timberPaintPosition(part,g),paint);
 }
});
test('real catalog paint metadata stays stable through visibility compaction and uses one atlas',()=>{
 const catalog=createCatalog(),before=JSON.stringify(catalog),atlas=new TimberContours(catalog.parts);
 const ang=catalog.parts.find(p=>p.id==='outer-bracket-0-0-17')!;
 assert.ok(ang.paintSourceShape?.startsWith('seatedAng:'));assert.equal(atlas.code(ang)%16,7);
 const code=atlas.code(ang);for(const p of [...catalog.parts].reverse())atlas.code(p);assert.equal(atlas.code(ang),code);
 assert.equal(JSON.stringify(catalog),before);assert.ok(atlas.texture.image.height<1024);atlas.dispose();
});

test('tapered beam broad faces stay paintable without altering their triangulation',()=>{
 const p={shape:'fourBeam',size:[5.08,.6,.42]} as Part,g=geometry(p.shape,p.size),mask=timberPaintExterior(p,g),pos=g.getAttribute('position'),n=g.getAttribute('normal');
 for(let i=0;i<pos.count;i++)if(Math.abs(n.getZ(i))>.65)assert.equal(mask.getX(i),1,'a tapered broad face was dropped');
});
