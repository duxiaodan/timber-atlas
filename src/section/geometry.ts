import * as THREE from 'three';

export interface SectionGeometry { positions:number[]; edges:number[]; openChains:number; gaps:number[]; repairedSeams:number; }
/** Intersect the original physical mesh, weld triangle-edge intersections, then
 * triangulate closed contours with nested holes. Coordinates remain local. */
export function sectionGeometry(geometry:THREE.BufferGeometry,plane:THREE.Plane,epsilon=1e-5,transform?:THREE.Matrix4,closeSolidSeams=false):SectionGeometry {
  const result:SectionGeometry={positions:[],edges:[],openChains:0,gaps:[],repairedSeams:0};
  if(!geometry.boundingBox)geometry.computeBoundingBox();
  const bounds=geometry.boundingBox!.clone();if(transform)bounds.applyMatrix4(transform);
  if(!bounds.intersectsPlane(plane))return result;
  const center=bounds.getCenter(new THREE.Vector3()),half=bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const radius=Math.abs(plane.normal.x)*half.x+Math.abs(plane.normal.y)*half.y+Math.abs(plane.normal.z)*half.z;
  if(Math.abs(plane.distanceToPoint(center))>=radius-epsilon)return result;
  const normal=plane.normal, u=new THREE.Vector3().crossVectors(normal,Math.abs(normal.y)<.9?new THREE.Vector3(0,1,0):new THREE.Vector3(1,0,0)).normalize(),v=new THREE.Vector3().crossVectors(normal,u);
  const pos=geometry.getAttribute('position'),idx=geometry.index,count=idx?.count??pos.count;
  const points:THREE.Vector3[]=[],links=new Map<number,Set<number>>(),keys=new Map<string,number[]>(),segments=new Set<string>(),orientations=new Map<string,number>();
  function vertex(p:THREE.Vector3){
    const cell=[p.x,p.y,p.z].map(n=>Math.floor(n/epsilon));
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const i of keys.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))??[])if(points[i].distanceToSquared(p)<=epsilon*epsilon)return i;
    const key=cell.join(','),i=points.length;points.push(p.clone());if(!keys.has(key))keys.set(key,[]);keys.get(key)!.push(i);return i;
  }
  const triangle=[new THREE.Vector3(),new THREE.Vector3(),new THREE.Vector3()];
  for(let i=0;i<count;i+=3){
    triangle.forEach((p,j)=>{p.fromBufferAttribute(pos,idx?idx.getX(i+j):i+j);if(transform)p.applyMatrix4(transform);});
    const d=triangle.map(p=>{const value=plane.distanceToPoint(p);return Math.abs(value)<epsilon?0:value;});
    if(d.every(x=>x>=0)||d.every(x=>x<0))continue;
    const hits:THREE.Vector3[]=[];
    for(let j=0;j<3;j++){const k=(j+1)%3;if((d[j]<0)!==(d[k]<0))hits.push(triangle[j].clone().lerp(triangle[k],d[j]/(d[j]-d[k])));}
    const unique=[...new Set(hits.map(p=>vertex(plane.projectPoint(p,p))))];if(unique.length!==2)continue;
    const [a,b]=unique,key=a<b?`${a}:${b}`:`${b}:${a}`;segments.add(key);
    const tangent=new THREE.Vector3().crossVectors(plane.normal,new THREE.Vector3().subVectors(triangle[1],triangle[0]).cross(new THREE.Vector3().subVectors(triangle[2],triangle[0])));
    const forward=new THREE.Vector3().subVectors(points[b],points[a]).dot(tangent)>=0?1:-1;
    orientations.set(key,(orientations.get(key)??0)+(a<b?1:-1)*forward);
    if(!links.has(a))links.set(a,new Set());if(!links.has(b))links.set(b,new Set());links.get(a)!.add(b);links.get(b)!.add(a);
  }
  // Resolve T junctions and overlapping collinear segments left by baked CSG.
  // Opposing coincident boundaries cancel; material winding remains directed.
  if([...links.values()].some(neighbours=>neighbours.size!==2)){
    const split=new Map<string,number>(),delta=new THREE.Vector3(),relative=new THREE.Vector3();
    for(const key of segments){const [a,b]=key.split(':').map(Number),length=delta.subVectors(points[b],points[a]).lengthSq();if(!length)continue;
      const cuts=[{id:a,t:0},{id:b,t:1}];
      points.forEach((p,id)=>{if(id===a||id===b)return;const t=relative.subVectors(p,points[a]).dot(delta)/length;if(t<=0||t>=1)return;const distance=relative.addScaledVector(delta,-t).lengthSq();if(distance<epsilon*epsilon)cuts.push({id,t});});cuts.sort((a,b)=>a.t-b.t);
      for(let j=1;j<cuts.length;j++){const x=cuts[j-1].id,y=cuts[j].id;if(x===y)continue;const edge=x<y?`${x}:${y}`:`${y}:${x}`;split.set(edge,(split.get(edge)??0)+(x<y?1:-1)*(orientations.get(key)??0));}
    }
    segments.clear();links.clear();orientations.clear();
    for(const [key,direction] of split){if(!direction)continue;const [a,b]=key.split(':').map(Number);segments.add(key);orientations.set(key,Math.sign(direction));if(!links.has(a))links.set(a,new Set());if(!links.has(b))links.set(b,new Set());links.get(a)!.add(b);links.get(b)!.add(a);}
  }
  // Baked CSG seams can differ by a few Float32 ulps. Bridge only nearby
  // degree-one endpoints; never close a macroscopic opening or a window.
  const ends=[...links.keys()].filter(i=>links.get(i)!.size===1);
  for(const a of ends){if(links.get(a)!.size!==1)continue;let closest=-1,distance=epsilon*epsilon*16;
    for(const b of ends){if(a===b||links.get(b)!.size!==1)continue;const d=points[a].distanceToSquared(points[b]);if(d<distance){closest=b;distance=d;}}
    if(closest<0&&closeSolidSeams){
      const incoming=points[a].clone().sub(points[[...links.get(a)!][0]]).normalize();let nearest=.02;
      for(const b of ends){if(a===b||links.get(b)!.size!==1)continue;const gap=points[b].clone().sub(points[a]),length=gap.length();if(length>=nearest||!length)continue;gap.divideScalar(length);
        const outgoing=points[[...links.get(b)!][0]].clone().sub(points[b]).normalize();
        if(incoming.dot(gap)>.995&&outgoing.dot(gap)>.995){closest=b;nearest=length;}
      }
      if(closest>=0)result.repairedSeams++;
    }
    if(closest>=0){links.get(a)!.add(closest);links.get(closest)!.add(a);segments.add(a<closest?`${a}:${closest}`:`${closest}:${a}`);}
  }
  const loops:THREE.Vector2[][]=[];
  while(segments.size){
    const first=segments.values().next().value!,[start,next]=first.split(':').map(Number),chain=[start];let current=start,to=next,closed=false,orientation=0;
    for(let guard=0;guard<=points.length+1;guard++){
      orientation+=(current<to?1:-1)*(orientations.get(current<to?`${current}:${to}`:`${to}:${current}`)??0);
      segments.delete(current<to?`${current}:${to}`:`${to}:${current}`);current=to;
      if(current===start){closed=true;break;}chain.push(current);
      const candidates=[...links.get(current)!].filter(n=>segments.has(current<n?`${current}:${n}`:`${n}:${current}`));
      if(!candidates.length)break;to=candidates[0];
    }
    if(!closed){result.openChains++;result.gaps.push(points[chain[0]].distanceTo(points[chain.at(-1)!]));for(let j=1;j<chain.length;j++)result.edges.push(...points[chain[j-1]].toArray(),...points[chain[j]].toArray());continue;}
    if(orientation<0)chain.reverse();
    const loop=chain.map(i=>new THREE.Vector2(points[i].dot(u),points[i].dot(v)));
    if(Math.abs(THREE.ShapeUtils.area(loop))>epsilon*epsilon)loops.push(loop);
  }
  function contains(loop:THREE.Vector2[],p:THREE.Vector2){let inside=false;for(let i=0,j=loop.length-1;i<loop.length;j=i++){const a=loop[i],b=loop[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;}return inside;}
  function encloses(outer:THREE.Vector2[],inner:THREE.Vector2[]){
    if(!inner.every(p=>contains(outer,p)))return false;
    const side=(a:THREE.Vector2,b:THREE.Vector2,p:THREE.Vector2)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
    for(let i=0;i<inner.length;i++)for(let j=0;j<outer.length;j++){const a=inner[i],b=inner[(i+1)%inner.length],c=outer[j],d=outer[(j+1)%outer.length];if(side(a,b,c)*side(a,b,d)<0&&side(c,d,a)*side(c,d,b)<0)return false;}
    return true;
  }
  const areas=loops.map(l=>Math.abs(THREE.ShapeUtils.area(l)));
  const parents=loops.map((l,i)=>{let parent=-1;loops.forEach((other,j)=>{if(areas[j]>areas[i]&&encloses(other,l)&&(parent<0||areas[j]<areas[parent]))parent=j;});return parent;});
  const signs=loops.map(loop=>Math.sign(THREE.ShapeUtils.area(loop)));
  const winding=(i:number):number=>signs[i]+(parents[i]<0?0:winding(parents[i]));
  const boundary=(i:number)=>parents[i]<0||((winding(i)===0)!==(winding(parents[i])===0));
  const origin=plane.coplanarPoint(new THREE.Vector3());
  const world=(p:THREE.Vector2)=>origin.clone().addScaledVector(u,p.x).addScaledVector(v,p.y).toArray();
  loops.forEach((loop,i)=>{
    if(!boundary(i))return;
    for(let j=0;j<loop.length;j++)result.edges.push(...world(loop[j]),...world(loop[(j+1)%loop.length]));
    if(winding(i)===0)return;
    const holes=loops.filter((_,j)=>{let parent=parents[j];while(parent>=0&&!boundary(parent))parent=parents[parent];return parent===i&&winding(j)===0&&boundary(j);}),flat=[...loop,...holes.flat()];
    for(const tri of THREE.ShapeUtils.triangulateShape(loop,holes))for(const index of tri)result.positions.push(...world(flat[index]));
  });
  return result;
}
