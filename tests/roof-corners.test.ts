import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Euler,Vector3} from 'three';
import {createCatalog,ROOF} from '../src/model/catalog';
import {geometry} from '../src/model/geometry';
import {roofRafterGeometry} from '../src/model/roof-members';
import {initialSession,restoreSession,startPractice} from '../src/state';
import {practiceMemberIds} from '../src/model/study-scope';
import {sampleOverlaps} from '../scripts/lib/sample-overlaps';
import {hipRidgeSpan} from '../src/model/roof-ridges';
import {isPracticePart} from '../src/model/practice-material';

const c=createCatalog(),byId=new Map(c.parts.map(p=>[p.id,p]));
test('rafter revisions preserve all old identities and mirror placements at all four corners',()=>{
 const rafters=c.parts.filter(p=>p.id.startsWith('rafter-'));
 for(let i=0;i<790;i++)assert.ok(byId.has(`rafter-${i}`));
 assert.equal(rafters.length,800);
 const key=(p:number[])=>p.map(v=>v.toFixed(5).replace('-0.00000','0.00000')).join(':');
 const positions=new Map(rafters.map(p=>[key(p.position),p]));
 for(const p of rafters)for(const sx of [-1,1])for(const sz of [-1,1]){
  const mirror=positions.get(key([sx*p.position[0],p.position[1],sz*p.position[2]]));assert.ok(mirror,`${p.id}: mirror ${sx}/${sz}`);
  for(let i=0;i<3;i++)assert.ok(Math.abs(mirror.size[i]-p.size[i])<1e-5);
 }
 assert.ok(rafters.every(p=>p.name==='檐椽'||p.name==='圆椽'));
});
test('each eaves head is a dressed end of one closed round timber',()=>{
 const g=roofRafterGeometry([3,.15,.15],true,-.02,.03),v=g.getAttribute('position');
 assert.equal(v.count,64);
 for(let i=0;i<16;i++)assert.ok(Math.abs(Math.hypot(v.getY(i),v.getZ(i))*.15-.075)<1e-8);
 for(let i=48;i<64;i++)assert.ok(Math.abs(Math.max(Math.abs(v.getY(i)),Math.abs(v.getZ(i)))*.15-.0465)<1e-8);
 // Every edge of this single swept body has exactly two incident triangles.
 const edges=new Map<string,number>();
 for(let i=0;i<g.index!.count;i+=3){const ids=[0,1,2].map(k=>g.index!.getX(i+k));for(let k=0;k<3;k++){const edge=[ids[k],ids[(k+1)%3]].sort((a,b)=>a-b).join(':');edges.set(edge,(edges.get(edge)??0)+1);}}
 assert.ok([...edges.values()].every(n=>n===2));g.dispose();
});
test('hip courses and cap tiles follow the actual sloping ridge with seated cross-sections',()=>{
 const covers=c.parts.filter(p=>p.id.startsWith('ridge-hip-cover-'));assert.equal(covers.length,124);
 for(const cap of covers){
  const top=byId.get(cap.requires[0])!,courseAxis=new Vector3(1,0,0).applyEuler(new Euler(...top.rotation)),capAxis=new Vector3(0,0,1).applyEuler(new Euler(...cap.rotation)),normal=new Vector3(0,1,0).applyEuler(new Euler(...top.rotation));
  assert.ok(courseAxis.y<-.1);assert.ok(courseAxis.distanceTo(capAxis)<1e-7);
  const v=geometry(cap.shape,cap.size).getAttribute('position');let foot=Infinity;for(let i=0;i<v.count;i++)foot=Math.min(foot,v.getY(i)*cap.size[1]);
  assert.ok(Math.abs(new Vector3(...cap.position).sub(new Vector3(...top.position)).dot(normal)+foot-top.size[1]/2)<1e-7);
  const courses=hipRidgeSpan(Number(cap.id.split('-').at(-1)),ROOF.halfDepth).courses;
  let p=top;for(let i=courses-1;i>=0;i--){assert.ok(p.id.endsWith(`-${i}`));const under=byId.get(p.requires[0])!;
   assert.ok(Math.abs(new Vector3(...p.position).sub(new Vector3(...under.position)).dot(normal)-(p.size[1]+under.size[1])/2)<1e-7);p=under;
  }
  assert.equal(p.material,'mortar');assert.equal(isPracticePart(p),false);
 }
 for(const p of c.parts.filter(p=>p.id.startsWith('ridge-main-')))assert.ok(Math.abs(p.position[0])+p.size[0]/2<=ROOF.ridgeHalf+1e-7);
});
test('previous roof and whole-hall saves retain progress and leave added pieces uninstalled',()=>{
 const added=new Set(c.practiceAdditions);assert.equal([...added].filter(id=>byId.get(id)?.assembly!=='ceiling').length,142);
 for(const scope of ['roof-rafters','roof-ridges','hall']){
  const s=initialSession(c.version);s.scope=scope==='hall'?null:scope;
  const assembly=c.assemblies.find(a=>a.id===scope),current=assembly?practiceMemberIds(c,assembly):c.parts.filter(isPracticePart).map(p=>p.id);
  const old=current.filter(id=>!added.has(id));s.practice=startPractice(old.map(id=>byId.get(id)!));s.practice.completed=[...old];
  const restored=restoreSession(JSON.stringify(s),c).practice;assert.ok(restored,scope);
  for(const id of current)assert.ok(restored.scope.includes(id),`${scope}: lost ${id}`);
  for(const id of restored.completed)assert.ok(!added.has(id),`${scope}: auto-completed new ${id}`);
  assert.ok(restored.completed.length>old.length*.8,`${scope}: discarded unrelated progress`);
 }
});


test('all four upper ridges end above a lower extension at the same physical step',()=>{
 for(const sx of [-1,1])for(const sz of [-1,1]){
  const upper=byId.get(`ridge-hip-${sx}-${sz}-21-8`)!,lower=byId.get(`ridge-hip-${sx}-${sz}-22-2`)!;
  const axis=new Vector3(1,0,0).applyEuler(new Euler(...upper.rotation)),a=new Vector3(...upper.position).addScaledVector(axis,upper.size[0]/2),b=new Vector3(...lower.position).addScaledVector(axis,-lower.size[0]/2);
  assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<1e-6);assert.ok(a.y-b.y>.19&&a.y-b.y<.21);
  assert.ok(!byId.has(`ridge-hip-${sx}-${sz}-22-3`),'removed upper courses must not remain hidden below the roof');
  const head=byId.get(`ridge-step-beast-${sx}-${sz}`)!;assert.ok(head.requires.includes(upper.id));
 }
});
test('four independently selectable dragon caps have coloured relief and clear the timber inside their open backs',()=>{
 const caps=c.parts.filter(p=>p.shape==='eaveDragon');assert.equal(caps.length,4);
 for(const cap of caps){
  const v=geometry(cap.shape,cap.size).getAttribute('position'),colors=geometry(cap.shape,cap.size).getAttribute('color');assert.equal(v.count,colors.count);assert.ok(v.count<150000);
  const sx=Math.sign(cap.position[0]),sz=Math.sign(cap.position[2]),child=byId.get(`hip-child-${sx}-${sz}`)!,main=byId.get(`hip-main-${sx}-${sz}`)!;
  assert.ok(cap.requires.includes(child.id));
  const direction=new Vector3(1,0,0).applyEuler(new Euler(...cap.rotation));assert.ok(direction.x*sx>0&&direction.z*sz>0);
  assert.deepEqual(sampleOverlaps([cap,child,main]),[],cap.id);
  const lifted={...cap,position:new Vector3(...cap.position).addScaledVector(direction,.25).toArray() as [number,number,number]};assert.deepEqual(sampleOverlaps([lifted,child,main]),[]);
 }
});
test('the previous 134-addition hall save also migrates when eight ornaments are added',()=>{
 const old=c.parts.filter(p=>isPracticePart(p)&&!p.id.startsWith('ridge-step-beast-')&&!p.id.startsWith('ridge-eave-dragon-')),s=initialSession(c.version);
 s.practice=startPractice(old);s.practice.completed=s.practice.scope.slice(0,100);
 // Include a removed over-height course, as an actual preceding-version save would.
 s.practice.scope.push('ridge-hip-1-1-22-8');
 const result=restoreSession(JSON.stringify(s),c).practice;assert.ok(result);assert.equal(result.completed.length,100);
 assert.ok(result.scope.includes('ridge-eave-dragon-1-1'));assert.ok(!result.scope.includes('ridge-hip-1-1-22-8'));
});


test('ridge terminal heads and eaves caps clear the nearby timber and roofing',()=>{
 for(const sx of [-1,1])for(const sz of [-1,1])for(const kind of ['step-beast','eave-dragon']){
  const p=byId.get(`ridge-${kind}-${sx}-${sz}`)!;
  const near=c.parts.filter(q=>Math.hypot(...q.position.map((v,i)=>v-p.position[i]))<3);
  assert.deepEqual(sampleOverlaps(near,p.id),[],p.id);
 }
});
