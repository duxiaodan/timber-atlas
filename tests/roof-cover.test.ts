import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Mesh,MeshBasicMaterial,Raycaster,Vector3} from 'three';
import {createCatalog,hipX,roofY,ROOF} from '../src/model/catalog';
import {geometry} from '../src/model/geometry';

test('assembled hip ridges cover the timber beneath all four roof junctions',()=>{
  const catalog=createCatalog(),material=new MeshBasicMaterial();
  const meshes=catalog.parts.filter(p=>['tiles','boards','rafters'].includes(p.layer)).map(p=>{
    const m=new Mesh(geometry(p.shape,p.size),material);m.name=p.id;m.userData.layer=p.layer;
    m.position.set(...p.position);m.rotation.set(...p.rotation);m.scale.set(...p.size);m.updateMatrixWorld();return m;
  });
  const ray=new Raycaster(),leaks:string[]=[];
  for(const sx of [-1,1])for(const sz of [-1,1])for(let t=.4;t<12.3;t+=.17)for(const across of [-.4,-.2,0,.2,.4])for(const elevation of [1,3,100]){
    if(Math.abs(sx*hipX(t)+across)>ROOF.halfWidth-.05)continue;
    const target=new Vector3(sx*hipX(t)+across,roofY(t)+.17,sz*t),out=new Vector3(sx,elevation,sz).normalize();
    ray.set(target.clone().addScaledVector(out,20),out.clone().negate());
    const hit=ray.intersectObjects(meshes,false)[0];
    if(!hit||hit.object.userData.layer!=='tiles')leaks.push(`${sx}/${sz} run ${t.toFixed(2)} cross ${across}: ${hit?.object.name??'open'}`);
  }
  assert.equal(leaks.length,0,`${leaks.length} exposed roof samples: ${leaks.slice(0,12).join('; ')}`);
});
