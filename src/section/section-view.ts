import * as THREE from 'three';
import {computeSection,type SectionInput,type SectionResult,type SectionComputer} from './computation';
export const sectionAxes=['x','y','z'] as const;
export type SectionAxis=typeof sectionAxes[number];
export type SectionScopeKind='hall'|'group'|'part';
export interface SectionScope {key:string;kind:SectionScopeKind;name:string;frame:THREE.Matrix4;bounds:THREE.Box3;center:THREE.Vector3;fixed:Set<string>;}
export interface SectionPlane {enabled:boolean;position:number;flipped:boolean;}
export interface SectionState {helpers:boolean;x:SectionPlane;y:SectionPlane;z:SectionPlane;}
export interface SectionBatch {mesh:THREE.InstancedMesh;visibleParts:{id:string;shape?:string}[];}
export const initialSection=():SectionState=>({helpers:true,x:{enabled:false,position:0,flipped:false},y:{enabled:false,position:0,flipped:false},z:{enabled:false,position:0,flipped:false}});
const directions={x:new THREE.Vector3(1,0,0),y:new THREE.Vector3(0,1,0),z:new THREE.Vector3(0,0,1)};
const axisColors={x:0xb75e40,y:0x768a58,z:0x477f8b};
/** Transient observation state. Original meshes, identifiers and saved lessons stay intact. */
export class SectionView {
  readonly state=initialSection();
  readonly bounds=new THREE.Box3();
  readonly group=new THREE.Group();
  readonly frame=new THREE.Matrix4();
  readonly defaultPosition=new THREE.Vector3();
  scopeKey='hall';
  scopeKind:SectionScopeKind='hall';
  scopeName='东大殿';
  private fixed=new Set<string>();
  planes:THREE.Plane[]=[];
  caps:THREE.Mesh[]=[];
  metrics={milliseconds:0,triangles:0,openChains:0};
  private signature='';
  private ready=false;
  private faceIds=new WeakMap<THREE.Object3D,string[]>();
  private input:SectionInput|null=null;
  private selected:string|null=null;
  private revision=0;
  private busy=false;
  private timer:ReturnType<typeof setTimeout>|null=null;
  private queued:{input:SectionInput;revision:number}|null=null;
  private disposed=false;
  private motion=false;
  private completed:{result:SectionResult;revision:number}|null=null;
  pending=false;
  get interacting(){return this.motion;}
  beginInteraction(){this.motion=true;}
  endInteraction(){
    this.motion=false;
    const completed=this.completed;this.completed=null;
    if(!this.disposed&&completed?.revision===this.revision){this.applyResult(completed.result);this.pending=false;this.onReady();}
    else this.schedule();
  }
  constructor(scene:THREE.Scene,private computer?:SectionComputer,private onReady:()=>void=()=>{}){scene.add(this.group);}
  private cancelPending(){this.completed=null;this.revision++;this.queued=null;this.pending=false;if(this.timer!==null){clearTimeout(this.timer);this.timer=null;}}
  private schedule(){
    if(this.motion||this.busy||this.timer!==null||!this.queued||this.disposed)return;
    // Let input and rendering finish before preparing a worker message.
    this.timer=setTimeout(()=>{this.timer=null;void this.runNext();},0);
  }
  private async runNext(){
    const work=this.queued;if(!work||this.motion||this.disposed)return;this.queued=null;this.busy=true;
    try {
      let result:SectionResult;
      try {result=this.computer?await this.computer.compute(work.input):computeSection(work.input);}
      catch(error){
        if(this.disposed)return;
        console.warn('Section worker unavailable; using synchronous sections.',error);
        this.computer?.dispose();this.computer=undefined;
        if(work.revision!==this.revision)return;
        result=computeSection(work.input);
      }
      if(!this.disposed&&work.revision===this.revision){
        if(this.motion)this.completed={result,revision:work.revision};
        else {this.applyResult(result);this.pending=false;this.onReady();}
      }
    }finally{
      this.busy=false;
      this.schedule();
    }
  }
  private matches(batches:SectionBatch[]){
    if(!this.input||this.input.batches.length!==batches.length)return false;
    return batches.every((batch,i)=>{
      const before=this.input!.batches[i],array=batch.mesh.instanceMatrix.array;
      if(before.geometry!==batch.mesh.geometry||before.parts.length!==batch.mesh.count)return false;
      for(let j=0;j<batch.mesh.count;j++)if(before.parts[j].id!==batch.visibleParts[j].id||before.parts[j].shape!==batch.visibleParts[j].shape)return false;
      for(let j=0;j<batch.mesh.count*16;j++)if(before.matrices[j]!==array[j])return false;
      return true;
    });
  }
  get enabled(){return sectionAxes.some(a=>this.state[a].enabled);}
  configure(scope:SectionScope){
    const changed=scope.key!==this.scopeKey||!this.ready;
    this.scopeKey=scope.key;this.scopeKind=scope.kind;this.scopeName=scope.name;this.frame.copy(scope.frame);this.fixed=scope.fixed;
    this.setBounds(scope.bounds);this.defaultPosition.copy(scope.center).clamp(scope.bounds.min,scope.bounds.max);
    if(changed)this.reset();
  }
  pointToWorld(point:THREE.Vector3){return point.applyMatrix4(this.frame);}
  setBounds(box:THREE.Box3){if(box.isEmpty())return;this.bounds.copy(box);if(!this.ready){box.getCenter(this.defaultPosition);this.reset();this.ready=true;}for(const a of sectionAxes)this.state[a].position=THREE.MathUtils.clamp(this.state[a].position,box.min[a],box.max[a]);}
  reset(){this.motion=false;for(const a of sectionAxes)Object.assign(this.state[a],{enabled:false,flipped:false,position:this.defaultPosition[a]});this.state.helpers=true;}
  accepts(point:THREE.Vector3){return this.planes.every(p=>p.distanceToPoint(point)>=-1e-5);}
  hasCap(id:string|null){return !!id&&this.caps.some(cap=>this.faceIds.get(cap)?.includes(id));}
  partAt(hit:THREE.Intersection){return this.faceIds.get(hit.object)?.[hit.faceIndex??-1];}
  private clear(){for(const o of [...this.group.children]){this.group.remove(o);if(o instanceof THREE.Mesh||o instanceof THREE.LineSegments){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}}this.caps=[];}
  private tintSelection(selected:string|null){
    for(const cap of this.caps){const ids=this.faceIds.get(cap)!,colors=cap.geometry.getAttribute('color');for(let face=0;face<ids.length;face++){
      const fixed=this.fixed.has(ids[face]),color=new THREE.Color(ids[face]===selected?(fixed?0xc9c5b9:0xf1cf93):(fixed?0xaaa394:0xe3b976));
      for(let vertex=0;vertex<3;vertex++)colors.setXYZ(face*3+vertex,color.r,color.g,color.b);
    }colors.needsUpdate=true;}
  }
  update(batches:SectionBatch[],allowed:boolean,selected:string|null=null){
    const matrix=new THREE.Matrix4();
    if(!this.ready){const box=new THREE.Box3();for(const batch of batches){if(!batch.mesh.geometry.boundingBox)batch.mesh.geometry.computeBoundingBox();for(let i=0;i<batch.mesh.count;i++){batch.mesh.getMatrixAt(i,matrix);box.union(batch.mesh.geometry.boundingBox!.clone().applyMatrix4(matrix));}}this.setBounds(box);}
    this.planes=allowed?sectionAxes.filter(a=>this.state[a].enabled).map(a=>new THREE.Plane(directions[a].clone().multiplyScalar(this.state[a].flipped?1:-1),(this.state[a].flipped?-1:1)*this.state[a].position).applyMatrix4(this.frame)):[];
    const allMaterials=new Set<THREE.Material>();for(const b of batches)for(const m of Array.isArray(b.mesh.material)?b.mesh.material:[b.mesh.material])allMaterials.add(m);
    for(const m of allMaterials){if(m.clippingPlanes?.length!==this.planes.length)m.needsUpdate=true;m.clippingPlanes=this.planes;m.clipShadows=true;}
    if(!this.planes.length){this.cancelPending();this.input=null;if(this.signature){this.clear();this.signature='';}this.metrics={milliseconds:0,triangles:0,openChains:0};return;}
    const signature=JSON.stringify([this.scopeKey,this.frame.elements,[...this.fixed],this.state]);
    this.selected=selected;
    if(signature===this.signature&&this.matches(batches)){this.tintSelection(selected);return;}
    this.signature=signature;this.clear();this.drawHelpers();this.cancelPending();this.metrics={milliseconds:0,triangles:0,openChains:0};
    const input:SectionInput={planes:this.planes.map(p=>p.clone()),batches:batches.map(b=>({geometry:b.mesh.geometry,parts:b.visibleParts.slice(0,b.mesh.count),matrices:new Float32Array(b.mesh.instanceMatrix.array.slice(0,b.mesh.count*16))}))};
    this.input=input;
    if(this.computer||this.motion){this.pending=true;this.queued={input,revision:this.revision};this.schedule();}
    else this.applyResult(computeSection(input));
  }
  private applyResult(result:SectionResult){
    this.clear();this.metrics={milliseconds:result.milliseconds,triangles:0,openChains:result.openChains};
    result.surfaces.forEach(({positions,edges,ids},index)=>{
      const colors=new Float32Array(positions.length);
      const others=this.planes.filter((_,i)=>i!==index);
      const capGeometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3));capGeometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));capGeometry.computeVertexNormals();
      const cap=new THREE.Mesh(capGeometry,new THREE.MeshBasicMaterial({color:0xffffff,vertexColors:true,side:THREE.DoubleSide,clippingPlanes:others,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));
      cap.castShadow=true;(cap.material as THREE.Material).clipShadows=true;
      this.faceIds.set(cap,ids);this.caps.push(cap);this.group.add(cap);this.metrics.triangles+=ids.length;
      const line=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(edges,3)),new THREE.LineBasicMaterial({color:0x694523,clippingPlanes:others}));line.renderOrder=1;this.group.add(line);
    });
    this.drawHelpers();this.tintSelection(this.selected);this.group.updateMatrixWorld(true);
  }
  private drawHelpers(){
    if(!this.state.helpers)return;
    this.planes.forEach((_,index)=>{
        const axis=sectionAxes.filter(a=>this.state[a].enabled)[index],otherAxes=sectionAxes.filter(a=>a!==axis),center=this.bounds.getCenter(new THREE.Vector3());center[axis]=this.state[axis].position;
        const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(pair=>{const p=center.clone();otherAxes.forEach((a,i)=>p[a]=(pair[i]<0?this.bounds.min[a]:this.bounds.max[a]) + pair[i]*.25);return this.pointToWorld(p);});
        const frame:number[]=[];corners.forEach((p,i)=>frame.push(...p.toArray(),...corners[(i+1)%4].toArray()));
        this.group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(frame,3)),new THREE.LineBasicMaterial({color:axisColors[axis],transparent:true,opacity:.65,depthWrite:false})));
    });
  }
  facing(axis:SectionAxis){return directions[axis].clone().multiplyScalar(this.state[axis].flipped?-1:1).transformDirection(this.frame);}
  dispose(){this.disposed=true;this.cancelPending();this.computer?.dispose();this.input=null;this.clear();this.group.removeFromParent();}
}
