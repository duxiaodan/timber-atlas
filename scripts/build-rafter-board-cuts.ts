import {mkdirSync,writeFileSync} from 'node:fs';
import {Box3,BufferGeometry,Euler,Float32BufferAttribute,Matrix4,Quaternion,Vector3} from 'three';
import {Brush,Evaluator,SUBTRACTION} from 'three-bvh-csg';
import {createCatalog,roofPoint} from '../src/model/catalog';
import {geometry} from '../src/model/geometry';

// Local dressing of the upper side-slope timbers. Keep stock axes, bearing ends,
// identifiers and board geometry; remove only wood above the board underside.
// Baking follows the existing roof-joint path and avoids runtime CSG.
const c=createCatalog(true,false),evaluator=new Evaluator();evaluator.useGroups=false;evaluator.attributes=['position','normal'];
const meshes:Record<string,unknown>={},audit:unknown[]=[];
for(const p of c.parts.filter(p=>p.shape.startsWith('roofRafter:')&&Math.abs(p.position[0])<10.5&&Math.abs(p.position[0])>8.6&&Math.abs(p.position[2])<1.1)){
 const matrix=new Matrix4().compose(new Vector3(...p.position),new Quaternion().setFromEuler(new Euler(...p.rotation)),new Vector3(...p.size));
 const stock=geometry(p.shape,p.size).clone().applyMatrix4(matrix),v=stock.getAttribute('position');
 let penetration=-Infinity;
 for(let i=0;i<16;i++)for(let k=0;k<=80;k++){const q=new Vector3().fromBufferAttribute(v,i).lerp(new Vector3().fromBufferAttribute(v,v.count-16+i),k/80);penetration=Math.max(penetration,q.y-roofPoint(q.x,q.z)[1]-.19);}
 if(penetration<=.0001)continue;
 const box=new Box3().setFromBufferAttribute(v).expandByScalar(.01),vertices:number[]=[],indices:number[]=[];
 const nx=Math.ceil((box.max.x-box.min.x)/.04),nz=Math.ceil((box.max.z-box.min.z)/.04),stride=nz+1;
 // The actual boards are chords sampled every <=40 mm. A 40 mm cutter grid
 // and 0.5 mm clearance stay beneath them, including the adjacent hip partition.
 for(let i=0;i<=nx;i++)for(let j=0;j<=nz;j++){const x=box.min.x+(box.max.x-box.min.x)*i/nx,z=box.min.z+(box.max.z-box.min.z)*j/nz;vertices.push(x,roofPoint(x,z)[1]+.1495,z);}
 const n=vertices.length/3;for(let i=0;i<n;i++)vertices.push(vertices[i*3],20,vertices[i*3+2]);
 const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,b,c,a,c,d);
 for(let i=0;i<nx;i++)for(let j=0;j<nz;j++){const a=i*stride+j,b=a+stride;quad(a,b,b+1,a+1);quad(a+n,a+1+n,b+1+n,b+n);}
 for(let i=0;i<nx;i++){const a=i*stride,b=a+stride;quad(a,a+n,b+n,b);const d=a+nz,e=b+nz;quad(d,e,e+n,d+n);}
 for(let j=0;j<nz;j++){quad(j,j+1,j+1+n,j+n);const a=nx*stride+j;quad(a,a+n,a+1+n,a+1);}
 const cut=new BufferGeometry();cut.setAttribute('position',new Float32BufferAttribute(vertices,3));cut.setIndex(indices);cut.computeVertexNormals();
 const a=new Brush(stock),b=new Brush(cut);a.updateMatrixWorld();b.updateMatrixWorld();const result=evaluator.evaluate(a,b,SUBTRACTION);
 const local=result.geometry.clone().applyMatrix4(matrix.clone().invert()),data=local.toJSON();delete data.uuid;
 for(const a of Object.values(data.data.attributes) as {array:number[]}[])a.array=a.array.map(n=>Math.round(n*1e7)/1e7);
 meshes[`board-${p.id}`]=data;
 audit.push({id:p.id,aboveBoardTopMm:penetration*1000,vertices:local.getAttribute('position').count});
 stock.dispose();cut.dispose();result.geometry.dispose();local.dispose();
}
if(Object.keys(meshes).length!==12)throw Error(`Unexpected affected set: ${Object.keys(meshes)}`);
writeFileSync('src/model/rafter-board-cuts.json',JSON.stringify({meshes}));
mkdirSync('artifacts/rafter-board-clearance',{recursive:true});writeFileSync('artifacts/rafter-board-clearance/cut-audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
