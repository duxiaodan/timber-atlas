import {drainWork,runWork,type WorkProgress} from './work-batches';
import {SectionView,type SectionAxis} from './section/section-view';
import {WorkerSectionComputer} from './section/worker-computer';
import {roofBoardGeometry} from './model/roof-boards';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {studyMemberIds,fixedStudyContextIds} from './model/study-scope';
import {isPracticePart} from './model/practice-material';
import {doorLeaves,doorTransform,type DoorLeaf} from './model/door-motion';
import { geometry, geometryKey } from './model/geometry';
import {isStudyTimber,presentTimberTint,paintedTimberTint,naturalTimberColor} from './model/timber-colors';
import {TimberContours} from './model/timber-contour';
import {timberPaintPosition,timberPaintExterior} from './model/timber-paint-coordinates';
import { addTimberGrain, timberTint } from './model/timber';
import { addGlazeWeathering } from './model/glaze';
import {addPolychromeSurface} from './model/polychrome';
import type { Catalog, MaterialKind, Part, Vec3 } from './model/types';
import {initialSession, type Session, type CameraPose} from './state';
import {FRONT_PLAQUE_PHOTO} from './model/front-plaque';
import {sculptureMaterials} from './model/sculpture-asset';
import {SurfaceOrbit} from './surface-orbit';

type ViewerMaterial = MaterialKind | 'roofSculpture' | `sculpture:${MaterialKind}`;
interface Batch { baseGeometry:THREE.BufferGeometry; timberStyle?:THREE.InstancedBufferAttribute; mesh:THREE.InstancedMesh; parts:Part[]; visibleParts:Part[]; roofSkin?:THREE.BufferGeometry; }
const exteriorCream=0xe3c58b;
const palettes: Record<Session['appearance'],Record<MaterialKind,number>>={
  present:{plaqueSolid:0xffffff,plaque:0xffffff,polychrome:0xffffff,clay:0x876256,mortar:0x464541,wood:0x67432d,redwood:0x713c30,stone:0x989186,plaster:0xc1b6a2,tile:0x3d4142,gold:0x9d7750,glaze:0xffffff},
  // Keep the existing storage key; this finish is labeled Painted in the UI.
  wood:{plaqueSolid:0xffffff,plaque:0xffffff,polychrome:0xffffff,clay:0x876256,mortar:0x464541,wood:0x923729,redwood:0xa43d30,stone:0x989186,plaster:0xc1b6a2,tile:0x3d4142,gold:0x9d7750,glaze:0xffffff},
  natural:{plaqueSolid:0xffffff,plaque:0xffffff,polychrome:0xffffff,clay:0x876256,mortar:0x464541,wood:0xb58952,redwood:0x9e713d,stone:0x989186,plaster:0xc1b6a2,tile:0x3d4142,gold:0x9d7750,glaze:0xffffff},
};

export class HallViewer {
  readonly scene=new THREE.Scene();
  readonly section=new SectionView(this.scene,new WorkerSectionComputer(),()=>{
    if(this.section.hasCap(this.session.selected)){this.selection.visible=false;this.finialSelection.visible=false;}
    this.invalidate();
  });
  readonly camera=new THREE.PerspectiveCamera(36,1,.03,500);
  readonly renderer:THREE.WebGLRenderer;
  readonly controls:OrbitControls;
  readonly surfaceOrbit:SurfaceOrbit;
  readonly parts=new Map<string,Part>();
  readonly groups=new Map<string,Set<string>>();
  private localGroups=new Map<string,Set<string>>();
  private batches:Batch[]=[];
  private timberContours!:TimberContours;
  private plaqueTexture:THREE.Texture|null=null;
  presentTones=true; // Enable subtle tonal variation within timber families.
  private materials=new Map<ViewerMaterial,THREE.MeshStandardMaterial>();
  private sculptureSurfaces=new Map<string,{kind:MaterialKind;surfaces:THREE.MeshStandardMaterial[]}>();
  private selection=new THREE.Mesh(geometry('box'),new THREE.MeshBasicMaterial({color:0xecc579,wireframe:true,transparent:true,opacity:.58,depthTest:false}));
  private finialSelection=new THREE.LineSegments(new THREE.EdgesGeometry(geometry('box')),new THREE.LineBasicMaterial({color:0xecc579,transparent:true,opacity:.42,depthTest:false}));
  private ghost=new THREE.Mesh(geometry('box'),new THREE.MeshStandardMaterial({color:0x6c9e87,transparent:true,opacity:.18,depthWrite:false}));
  private activeMesh=new THREE.Mesh(geometry('box'),new THREE.MeshStandardMaterial({color:0xc99b5f,roughness:.72}));
  private axis=new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(),2,0xc78b31,.18,.1);
  private raycaster=new THREE.Raycaster();
  private session:Session;
  private visible=new Set<string>();
  private fixedContext=new Set<string>();
  private doors:DoorLeaf[]=[];
  private doorByPart=new Map<string,DoorLeaf>();
  private doorMatrices=new Map<string,THREE.Matrix4>();
  private doorInstances:{batch:Batch;index:number;part:Part}[]=[];
  private doorPresentation=false;
  private doorTarget=0;
  private doorAmount=0;
  private doorTween:{from:number;to:number;start:number}|null=null;
  private sectionBoundsPose="";
  private frame=0;
  private raf=0;
  private pointerDown:{x:number;y:number;time:number}|null=null;
  private drag:{x:number;y:number;distance:number;axis:THREE.Vector2;scale:number}|null=null;
  private resizeObserver!:ResizeObserver;
  private initializing=true;
  readonly startupCounts={parts:0,geometries:0,batches:0};
  private locationPreview:{session:Session;pose:CameraPose;near:number;shadows:boolean;materials:(THREE.Material|THREE.Material[])[];overlays:THREE.InstancedMesh[];temporary:THREE.Material[]}|null=null;
  onSelect:(id:string|null)=>void=()=>{};
  onMove:(distance:number,released:boolean)=>void=()=>{};
  onCameraPose:(pose:CameraPose)=>void=()=>{};
  onMetrics:(metrics:{drawCalls:number;triangles:number;geometries:number;visible:number})=>void=()=>{};

  constructor(readonly container:HTMLElement,readonly catalog:Catalog,session:Session,defer=false) {
    this.session=session;
    this.doors=doorLeaves(catalog);for(const door of this.doors)for(const p of door.parts)this.doorByPart.set(p.id,door);
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',logarithmicDepthBuffer:true});
    this.renderer.localClippingEnabled=true;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.6));
    this.renderer.setClearColor(0xd9d7ce);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.95;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.domElement.setAttribute('aria-label','佛光寺东大殿三维模型，拖动旋转，Shift加左键绕命中点旋转，右键平移，滚轮缩放，点击选择构件');
    this.renderer.domElement.tabIndex=0;container.append(this.renderer.domElement);
    this.camera.position.set(37,29,43);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);
    this.controls.target.set(0,5.5,0);this.controls.enableDamping=true;this.controls.dampingFactor=.1;this.controls.minDistance=.25;this.controls.maxDistance=120;this.controls.maxPolarAngle=Math.PI*.91;
    this.controls.addEventListener('change',()=>this.invalidate());
    this.controls.addEventListener('end',()=>this.emitCameraPose());
    this.surfaceOrbit=new SurfaceOrbit(this.camera,this.controls,this.renderer.domElement,{
      hit:e=>this.surfaceHit(e)?.point??null,
      partDrag:e=>!this.locationPreview&&!!this.session.practice?.active&&this.pick(e)===this.session.practice.active,
      select:e=>{if(!this.locationPreview)this.onSelect(this.pick(e));},
      change:()=>this.invalidate(),end:()=>this.emitCameraPose(),
    });
    const ambient=new THREE.HemisphereLight(0xfff6e2,0x797c7d,.7);this.scene.add(ambient);
    const sun=new THREE.DirectionalLight(0xfff0d2,2.4);sun.position.set(-20,36,24);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-32,right:32,top:32,bottom:-32,near:1,far:90});sun.shadow.bias=-.0006;sun.shadow.normalBias=.03;this.scene.add(sun);
    const fill=new THREE.DirectionalLight(0xdbeaff,.4);fill.position.set(20,10,-25);this.scene.add(fill);
    const envgen=new THREE.PMREMGenerator(this.renderer);const room=new RoomEnvironment();const env=envgen.fromScene(room,.04);this.scene.environment=env.texture;room.dispose();envgen.dispose();
    this.scene.environmentIntensity=.45;
    this.scene.fog=new THREE.Fog(0xd9d7ce,95,230);
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:0xc0c0b5,roughness:1}));ground.rotation.x=-Math.PI/2;ground.position.y=-.04;ground.receiveShadow=true;this.scene.add(ground);
    const grid=new THREE.GridHelper(80,40,0x9c9c94,0xc0bfb5);grid.material.transparent=true;grid.material.opacity=.24;grid.position.y=-.03;this.scene.add(grid);
    if(!defer)drainWork(this.buildScene());
  }
  static async create(container:HTMLElement,catalog:Catalog,session:Session,progress:WorkProgress){
    const viewer=new HallViewer(container,catalog,session,true);
    try{
      const work=viewer.buildScene();work.next(); // Grouping freezes the batch denominator.
      await runWork(work,viewer.startupCounts.batches,progress);
      return viewer;
    }catch(error){viewer.dispose();throw error;}
  }
  private *buildScene():Generator<number|null,void>{
    const {catalog,container}=this,session=this.session;
    this.timberContours=new TimberContours(catalog.parts);
    const grouped=new Map<string,Part[]>();
    for(const p of catalog.parts){this.parts.set(p.id,p);const key=`${geometryKey(p.shape,p.size)}:${p.material}`;const list=grouped.get(key)??[];list.push(p);grouped.set(key,list);}
    this.startupCounts.parts=catalog.parts.length;this.startupCounts.geometries=new Set(catalog.parts.map(p=>geometryKey(p.shape,p.size))).size;this.startupCounts.batches=grouped.size;
    yield 0;
    for(const a of catalog.assemblies){yield null;this.groups.set(a.id,new Set(studyMemberIds(catalog,a,true)));this.localGroups.set(a.id,new Set(studyMemberIds(catalog,a)));}
    let built=0;
    for(const [,parts] of grouped) {
      const p=parts[0],materialKey:ViewerMaterial=p.shape.startsWith('sculpture:')?`sculpture:${p.material}`:p.shape==='eaveDragon'||p.shape==='ridgeStopBeast'?'roofSculpture':p.material;let mat=this.materials.get(materialKey);
      if(!mat){mat=new THREE.MeshStandardMaterial({color:palettes.present[p.material],roughness:p.material==='glaze'?.57:p.material==='gold'?.62:.87,metalness:p.material==='gold'?.18:0,vertexColors:p.material==='glaze'||p.material==='polychrome'||p.material==='plaqueSolid'});if(p.material==='glaze'&&materialKey==='glaze')addGlazeWeathering(mat);if(p.material==='polychrome'&&materialKey==='polychrome')addPolychromeSurface(mat);if(p.material==='wood'||p.material==='redwood'||p.material==='plaqueSolid')addTimberGrain(mat,this.timberContours.texture);if(p.material==='plaque'){this.plaqueTexture=new THREE.TextureLoader().load(FRONT_PLAQUE_PHOTO,()=>this.invalidate());this.plaqueTexture.colorSpace=THREE.SRGBColorSpace;this.plaqueTexture.anisotropy=Math.min(4,this.renderer.capabilities.getMaxAnisotropy());mat.map=this.plaqueTexture;}this.materials.set(materialKey,mat);}
      const surfaces=sculptureMaterials(p.shape)?.map(m=>{const copy=m.clone();copy.userData.originalRoughness=m.roughness;copy.userData.originalMetalness=m.metalness;return copy;});
      if(surfaces)this.sculptureSurfaces.set(p.shape,{kind:p.material,surfaces});
      const sourceGeometry=geometry(p.shape,p.size);
      const timberStyle=p.material==='wood'||p.material==='redwood'?new THREE.InstancedBufferAttribute(new Float32Array(parts.map(p=>this.timberContours.code(p))),1):undefined;
      // Share the existing vertex/index buffers; only a tiny style buffer is per batch.
      let baseGeometry=sourceGeometry;
      if(timberStyle){baseGeometry=new THREE.BufferGeometry();for(const [key,attribute]of Object.entries(sourceGeometry.attributes))baseGeometry.setAttribute(key,attribute);baseGeometry.setIndex(sourceGeometry.index);baseGeometry.groups=sourceGeometry.groups.map(g=>({...g}));baseGeometry.boundingBox=sourceGeometry.boundingBox; baseGeometry.boundingSphere=sourceGeometry.boundingSphere;baseGeometry.setAttribute('timberStyle',timberStyle);baseGeometry.setAttribute('timberPaintPosition',timberPaintPosition(p,sourceGeometry));baseGeometry.setAttribute('timberExterior',timberPaintExterior(p,sourceGeometry));}
      const mesh=new THREE.InstancedMesh(baseGeometry,surfaces??mat,parts.length);mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=p.layer!=='tiles'||p.shape==='finial'||p.shape==='flame'||p.shape.startsWith('sculpture:');mesh.receiveShadow=true;mesh.frustumCulled=false;
      const batch={mesh,parts,visibleParts:parts,baseGeometry,timberStyle};this.batches.push(batch);this.scene.add(mesh);
      const color=new THREE.Color();parts.forEach((_,i)=>{color.setScalar(.91+this.hash(i+parts.length)*.18);mesh.setColorAt(i,color);});
      yield ++built;
    }
    this.selection.renderOrder=10;this.finialSelection.renderOrder=10;this.scene.add(this.selection,this.finialSelection,this.ghost,this.activeMesh,this.axis);
    this.renderer.domElement.addEventListener('pointerdown',this.pointerStart);
    this.renderer.domElement.addEventListener('pointermove',this.pointerMove);
    this.renderer.domElement.addEventListener('pointerup',this.pointerEnd);
    this.renderer.domElement.addEventListener('pointercancel',this.pointerCancel);
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();container.dispatchEvent(new CustomEvent('viewer-error',{detail:'图形上下文暂时丢失。请刷新页面，已保存的学习进度会保留。'}));});
    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(container);this.update(session);this.controls.update();this.invalidate();
  }
  private hash(n:number){return (Math.sin(n*78.233)*43758.5453)%1*.5+.5;}
  private matrix(p:Part,explode=0,removed=false) {
    const pos=new THREE.Vector3(...p.position);
    if(explode)pos.addScaledVector(new THREE.Vector3(...p.explode),explode);
    if(removed)pos.addScaledVector(new THREE.Vector3(...p.insertion),Math.max(1.2,p.size[1]*.5));
    return new THREE.Matrix4().compose(pos,new THREE.Quaternion().setFromEuler(new THREE.Euler(...p.rotation)),new THREE.Vector3(...p.size));
  }
  private displayMatrix(p:Part){
    const fixed=this.fixedContext.has(p.id);
    const matrix=this.matrix(p,this.session.practice||fixed?0:this.session.explode,!fixed&&this.session.removed.includes(p.id));
    const door=this.doorByPart.get(p.id),rotation=door&&this.doorMatrices.get(door.id);
    if(rotation&&this.doorAmount)matrix.premultiply(rotation);
    return matrix;
  }
  private setDoorAmount(amount:number){this.doorAmount=amount;for(const door of this.doors)this.doorMatrices.set(door.id,doorTransform(door,amount));}
  private syncDoors(session:Session){
    const presentation=!session.scope&&!session.isolated&&!session.practice&&!session.explode&&!this.locationPreview;
    const target=presentation&&session.doorsOpen?1:0;
    if(presentation!==this.doorPresentation){this.doorTween=null;this.setDoorAmount(target);}
    else if(target!==this.doorTarget){
      if(this.section.enabled||matchMedia('(prefers-reduced-motion: reduce)').matches){this.doorTween=null;this.setDoorAmount(target);}
      else this.doorTween={from:this.doorAmount,to:target,start:performance.now()};
    }
    if(this.section.enabled&&this.doorTween){this.doorTween=null;this.setDoorAmount(target);}
    this.doorPresentation=presentation;this.doorTarget=target;
  }
  private animateDoors(){
    if(!this.doorTween)return;
    const {from,to,start}=this.doorTween,t=Math.min(1,(performance.now()-start)/650);
    this.setDoorAmount(from+(to-from)*t*t*(3-2*t));
    const batches=new Set<Batch>();
    for(const {batch,index,part} of this.doorInstances){batch.mesh.setMatrixAt(index,this.displayMatrix(part));batches.add(batch);}
    for(const batch of batches){batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.computeBoundingSphere();}
    const selected=this.session.selected&&this.parts.get(this.session.selected);
    if(selected&&this.doorByPart.has(selected.id))this.selection.matrix.copy(this.displayMatrix(selected));
    if(t===1)this.doorTween=null;
  }
  update(session:Session) {
    this.syncDoors(session);this.doorInstances=[];
    this.session=session;this.visible.clear();
    const scoped=session.scope?(session.expandedContext?this.groups:this.localGroups).get(session.scope):null;
    const assembly=this.catalog.assemblies.find(a=>a.id===session.scope);
    this.fixedContext=new Set(assembly&&!session.isolated?fixedStudyContextIds(this.catalog,assembly,session.expandedContext):[]);
    const hidden=new Set(session.hidden),practice=session.practice;
    const practiceScope=practice?new Set(practice.scope):null;const installed=practice?new Set(practice.completed):null;
    const color=new THREE.Color();
    for(const batch of this.batches) {
      batch.visibleParts=[];
      for(let i=0;i<batch.parts.length;i++) {
        const p=batch.parts[i];
        const fixed=this.fixedContext.has(p.id);
        let show=(fixed||session.visible[p.layer]&&!hidden.has(p.id))&&(!scoped||scoped.has(p.id))&&(!session.isolated||session.isolated===p.id)&&(!practice||isPracticePart(p));
        if(practiceScope?.has(p.id)&&!installed!.has(p.id))show=false;
        if(show){
          this.visible.add(p.id);const index=batch.visibleParts.length;batch.visibleParts.push(p);
          batch.mesh.setMatrixAt(index,this.displayMatrix(p));
          if(this.doorByPart.has(p.id))this.doorInstances.push({batch,index,part:p});
          if(p.material==='wood'||p.material==='redwood'){if(session.appearance==='wood')paintedTimberTint(p,color);else if(session.appearance==='present'&&this.presentTones&&isStudyTimber(p))presentTimberTint(p,color);else timberTint(p,color);}else color.setScalar(.91+this.hash(i+batch.parts.length)*.18);
          if(batch.timberStyle)batch.timberStyle.setX(index,fixed||this.locationPreview?0:this.timberContours.code(p));
          if(p.kind==='外檐栱眼壁'||p.kind==='墙体'&&p.material==='plaster'){
            const base=new THREE.Color(palettes[session.appearance][p.material]),finish=new THREE.Color(exteriorCream);
            color.multiply(new THREE.Color(finish.r/base.r,finish.g/base.g,finish.b/base.b));
          }
          if(session.appearance==='natural'&&isStudyTimber(p)){const base=new THREE.Color(palettes.natural[p.material]);color.setHex(naturalTimberColor(p));color.setRGB(color.r/base.r,color.g/base.g,color.b/base.b);}
          if(this.locationPreview)color.setScalar(1);
          if(fixed){const base=new THREE.Color(palettes[session.appearance][p.material]);color.setRGB(.32/base.r,.31/base.g,.28/base.b);}
          batch.mesh.setColorAt(index,color);
        }
      }
      batch.mesh.count=batch.visibleParts.length;batch.mesh.visible=batch.mesh.count>0;
      if(batch.timberStyle)batch.timberStyle.needsUpdate=true;
      if(batch.mesh.instanceColor)batch.mesh.instanceColor.needsUpdate=true;
      batch.mesh.instanceMatrix.needsUpdate=true;batch.mesh.computeBoundingSphere();
    }
    this.configureSection(session,scoped??null);
    // Once the complete, unmoved roof is assembled, internal board contact walls
    // have no exposed area. Omit those walls from drawing to avoid MSAA edge speckles.
    // The physical mesh stays closed; any missing/moved board restores all its faces.
    const completeRoof=(!this.section.enabled||!!this.locationPreview)&&!session.explode&&!practice&&this.catalog.parts.filter(p=>p.assembly==='roof-boards').every(p=>this.visible.has(p.id)&&!session.removed.includes(p.id));
    for(const batch of this.batches){const p=batch.parts[0];if(!p.shape.startsWith('roofBoard:'))continue;
      batch.mesh.geometry=completeRoof?(batch.roofSkin??=roofBoardGeometry(p.shape.slice(10),true)):batch.baseGeometry;
      if(batch.timberStyle)batch.mesh.geometry.setAttribute('timberStyle',batch.timberStyle);
    }
    for(const [key,material] of this.materials){
      const kind=(key==='roofSculpture'?'glaze':key.startsWith('sculpture:')?key.slice(10):key) as MaterialKind;
      material.color.setHex(palettes[session.appearance][kind]);
      if(material.userData.timberPaint)material.userData.timberPaint.value=session.appearance==='wood'&&!this.locationPreview?1:0;
      if(kind==='plaque'){const map=this.plaqueTexture;if(material.map!==map){material.map=map;material.needsUpdate=true;}}
      if((kind==='glaze'||kind==='polychrome'||kind==='plaqueSolid')&&material.vertexColors!==true){
        material.vertexColors=true;material.needsUpdate=true;
      }
    }
    for(const {surfaces} of this.sculptureSurfaces.values())for(const surface of surfaces){
      surface.color.setHex(0xffffff);
      surface.roughness=surface.userData.originalRoughness;surface.metalness=surface.userData.originalMetalness;
      if(!surface.vertexColors){surface.vertexColors=true;surface.needsUpdate=true;}
    }
    const selected=session.selected?this.parts.get(session.selected):null;
    const highlight=!!selected&&this.visible.has(selected.id)&&!practice;
    const detailed=selected&&(selected.material==='glaze'||selected.material==='polychrome'||selected.material==='plaque'||selected.material==='plaqueSolid');
    this.selection.visible=highlight&&!detailed;this.finialSelection.visible=highlight&&!!detailed;
    if(selected&&highlight){
      const marker=detailed?this.finialSelection:this.selection;
      if(marker===this.selection)this.selection.geometry=geometry(selected.shape,selected.size);
      marker.matrixAutoUpdate=false;marker.matrix.copy(this.displayMatrix(selected));
      if(detailed){
        const bounds=geometry(selected.shape,selected.size).boundingBox!;
        marker.matrix.multiply(new THREE.Matrix4().compose(bounds.getCenter(new THREE.Vector3()),new THREE.Quaternion(),bounds.getSize(new THREE.Vector3())));
      }
    }
    const active=practice?.active?this.parts.get(practice.active):null;
    this.activeMesh.visible=!!active;this.ghost.visible=!!active&&!!practice?.hints;this.axis.visible=this.ghost.visible;
    if(active&&practice){
      const mat=this.activeMesh.material,map=active.material==='plaque'?this.plaqueTexture:null;
      if(mat.map!==map){mat.map=map;mat.needsUpdate=true;}const colored=active.material==='plaqueSolid';if(mat.vertexColors!==colored){mat.vertexColors=colored;mat.needsUpdate=true;}mat.color.setHex(map||colored?0xffffff:0xc99b5f);
      this.activeMesh.geometry=geometry(active.shape,active.size);this.ghost.geometry=geometry(active.shape,active.size);
      this.ghost.matrixAutoUpdate=false;this.ghost.matrix.copy(this.matrix(active));
      this.activeMesh.position.set(...active.position).addScaledVector(new THREE.Vector3(...active.insertion),practice.distance);
      this.activeMesh.rotation.set(...active.rotation);this.activeMesh.rotateY(practice.turn*Math.PI/2);this.activeMesh.scale.set(...active.size);
      this.axis.position.set(...active.position).addScaledVector(new THREE.Vector3(...active.insertion),2.6);
      this.axis.setDirection(new THREE.Vector3(...active.insertion).negate());this.axis.setLength(2.4,.16,.08);
    }
    this.controls.maxPolarAngle=this.section.enabled?Math.PI:Math.PI*.91;
    this.section.update(this.batches,!session.practice&&!this.locationPreview,session.selected);
    if(this.section.planes.length&&this.section.hasCap(session.selected)){this.selection.visible=false;this.finialSelection.visible=false;}
    for(const marker of [this.selection,this.finialSelection])marker.material.clippingPlanes=this.section.planes;
    this.invalidate();
  }
  private configureSection(session:Session,scoped:Set<string>|null){
    if(this.locationPreview)return;
    const key=(session.isolated?`part:${session.isolated}`:session.scope?`group:${session.scope}:${session.expandedContext}`:'hall')+(session.practice?':practice':'');
    const pose=JSON.stringify([key,session.explode,session.removed,session.doorsOpen]);if(pose===this.sectionBoundsPose)return;
    const part=session.isolated?this.parts.get(session.isolated):null,assembly=this.catalog.assemblies.find(a=>a.id===session.scope);
    const frame=new THREE.Matrix4();if(part){const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();this.displayMatrix(part).decompose(position,rotation,scale);frame.compose(position,rotation,new THREE.Vector3(1,1,1));}
    const inverse=frame.clone().invert(),box=new THREE.Box3(),target=new THREE.Box3();
    const own=new Set(assembly?.partIds??[]);
    for(const p of this.catalog.parts){if(part?p.id!==part.id:scoped&&!scoped.has(p.id))continue;const bounds=geometry(p.shape,p.size).boundingBox!.clone().applyMatrix4(inverse.clone().multiply(this.displayMatrix(p)));box.union(bounds);if(own.has(p.id))target.union(bounds);}
    let center=box.getCenter(new THREE.Vector3());
    if(assembly&&!part){const selected=session.selected&&own.has(session.selected)?this.parts.get(session.selected):null;
      const root=selected??assembly.partIds.map(id=>this.parts.get(id)!).find(p=>p.kind==='栌斗');
      if(root)center=geometry(root.shape,root.size).boundingBox!.getCenter(new THREE.Vector3()).applyMatrix4(this.displayMatrix(root));else if(!target.isEmpty())target.getCenter(center);
    }
    this.section.configure({key,kind:part?'part':assembly?'group':'hall',name:part?.kind??assembly?.name??'东大殿',frame,bounds:box,center,fixed:this.fixedContext});this.sectionBoundsPose=pose;
  }
  updateSection(){this.update(this.session);}
  faceSection(axis:SectionAxis){
    this.surfaceOrbit.reset();
    const center=this.section.bounds.getCenter(new THREE.Vector3());center[axis]=this.section.state[axis].position;this.section.pointToWorld(center);
    const size=this.section.bounds.getSize(new THREE.Vector3());size[axis]=0;
    const distance=Math.max(1,size.length()*.5/Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))/Math.min(1,this.camera.aspect));
    const direction=this.section.facing(axis);if(Math.abs(direction.y)>.999999)direction.z=.00001;
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(direction,distance);
    this.controls.update();this.invalidate();this.emitCameraPose();
  }
  private surfaceHit(event:Pick<PointerEvent,'clientX'|'clientY'>):{id:string;point:THREE.Vector3}|null {
    const r=this.renderer.domElement.getBoundingClientRect();
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(new THREE.Vector2((event.clientX-r.left)/r.width*2-1,-(event.clientY-r.top)/r.height*2+1),this.camera);
    const objects:THREE.Object3D[]=this.batches.filter(b=>b.mesh.visible&&b.mesh.count>0).map(b=>b.mesh);
    objects.push(...this.section.caps);
    if(this.activeMesh.visible){this.activeMesh.updateMatrixWorld();objects.push(this.activeMesh);}
    for(const hit of this.raycaster.intersectObjects(objects,false)){
      if(!this.section.accepts(hit.point))continue;
      const depth=hit.point.clone().project(this.camera).z;if(depth< -1||depth>1)continue;
      const id=this.section.partAt(hit)??(hit.object===this.activeMesh?this.session.practice?.active:this.batches.find(b=>b.mesh===hit.object)?.visibleParts[hit.instanceId!]?.id);
      if(id)return {id,point:hit.point};
    }
    return null;
  }
  private pick(event:PointerEvent):string|null{return this.surfaceHit(event)?.id??null;}
  private pointerStart=(e:PointerEvent)=>{
    if(this.locationPreview)return;
    if(e.button!==0)return;this.pointerDown={x:e.clientX,y:e.clientY,time:Date.now()};
    const practice=this.session.practice;
    if(practice?.active&&this.pick(e)===practice.active){
      const p=this.parts.get(practice.active)!;const a=new THREE.Vector3(...p.position),b=a.clone().add(new THREE.Vector3(...p.insertion));
      a.project(this.camera);b.project(this.camera);const rect=this.container.getBoundingClientRect();
      const axis=new THREE.Vector2((b.x-a.x)*rect.width*.5,-(b.y-a.y)*rect.height*.5);
      this.drag={x:e.clientX,y:e.clientY,distance:practice.distance,axis:axis.clone().normalize(),scale:Math.max(12,axis.length())};
      this.controls.enabled=false;this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };
  private pointerMove=(e:PointerEvent)=>{
    if(this.drag){const d=this.drag;const delta=new THREE.Vector2(e.clientX-d.x,e.clientY-d.y).dot(d.axis)/d.scale;this.onMove(Math.max(0,Math.min(3,d.distance+delta)),false);}
  };
  private pointerEnd=(e:PointerEvent)=>{
    if(this.locationPreview)return;
    if(this.drag){this.drag=null;this.controls.enabled=true;this.pointerDown=null;this.onMove(this.session.practice?.distance??2,true);return;}
    if(this.pointerDown&&Math.hypot(e.clientX-this.pointerDown.x,e.clientY-this.pointerDown.y)<5&&Date.now()-this.pointerDown.time<600)this.onSelect(this.pick(e));
    this.pointerDown=null;
  };
  private pointerCancel=()=>{this.drag=null;this.pointerDown=null;this.controls.enabled=true;};
  fit(ids?:string[],view:'perspective'|'study'|'front'|'side'|'top'='perspective') {
    this.surfaceOrbit.reset();
    const box=new THREE.Box3();const selected=ids??[...this.visible];
    const assembly=this.catalog.assemblies.find(a=>a.id===this.session.scope);
    const bay=assembly?.intercolumnBay&&!this.session.isolated?assembly:null;
    for(const id of selected){
      const p=this.parts.get(id);if(!p)continue;
      const local=geometry(p.shape,p.size).boundingBox!.clone().applyMatrix4(this.displayMatrix(p));box.union(local);
      if(id===this.session.practice?.active)box.union(local.clone().translate(new THREE.Vector3(...p.insertion).multiplyScalar(3)));
    }
    if(box.isEmpty())box.setFromCenterAndSize(new THREE.Vector3(0,5,0),new THREE.Vector3(42,16,26));
    const center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    if(bay&&selected.length>1){
      const target=new THREE.Box3();for(const id of bay.partIds){const p=this.parts.get(id)!;target.union(geometry(p.shape,p.size).boundingBox!.clone().applyMatrix4(this.displayMatrix(p)));}
      target.getCenter(center);
      size.set(Math.max(center.x-box.min.x,box.max.x-center.x)*2,Math.max(center.y-box.min.y,box.max.y-center.y)*2,Math.max(center.z-box.min.z,box.max.z-center.z)*2);
    }
    const radius=Math.max(size.length()*.5,.5);let distance=radius/Math.sin(THREE.MathUtils.degToRad(this.camera.fov/2))*(this.camera.aspect<1?1/this.camera.aspect:1)*(selected.length===1&&['glaze','polychrome'].includes(this.parts.get(selected[0])?.material??'')?1.22:1.05);
    const directions={perspective:new THREE.Vector3(.8,.55,1),study:new THREE.Vector3(.8,1.15,1),front:new THREE.Vector3(0,.13,1),side:new THREE.Vector3(1,.13,0),top:new THREE.Vector3(.001,1,.001)};
    if(bay&&selected.length>1){
      // Fit projected extents around the target's orbit centre instead of a large
      // enclosing sphere, which makes a full-height bay needlessly distant.
      const forward=directions[view].clone().normalize(),right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),forward).normalize(),up=new THREE.Vector3().crossVectors(forward,right);
      const tan=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2));distance=1;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const v=new THREE.Vector3(x,y,z).sub(center);distance=Math.max(distance,v.dot(forward)+Math.max(Math.abs(v.dot(right))/(tan*this.camera.aspect),Math.abs(v.dot(up))/tan)*1.08);
      }
    }
    this.controls.target.copy(center);this.camera.position.copy(center).addScaledVector(directions[view].normalize(),distance);this.camera.near=Math.max(.015,distance/3000);this.camera.updateProjectionMatrix();this.controls.update();this.invalidate();this.emitCameraPose();
  }
  private cameraPose():CameraPose{return {position:this.camera.position.toArray() as Vec3,target:this.controls.target.toArray() as Vec3,...this.surfaceOrbit.pivot?{pivot:this.surfaceOrbit.pivot.toArray() as Vec3}:{}};}
  private emitCameraPose(){if(!this.locationPreview)this.onCameraPose(this.cameraPose());}
  resize(){const r=this.container.getBoundingClientRect();if(r.width&&r.height){this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix();this.renderer.setSize(r.width,r.height);this.invalidate();}}
  /** A transient, read-only locator reuses this renderer without changing the learning session. */
  beginLocation(ids:string[]){
    if(this.locationPreview)return;
    const context=new THREE.MeshLambertMaterial({color:0xabb0a4});
    const shell=new THREE.MeshLambertMaterial({color:0xb9bcb2});
    const target=new THREE.MeshBasicMaterial({color:0xd28224,transparent:true,opacity:.94,depthTest:false,depthWrite:false});
    this.locationPreview={session:this.session,pose:this.cameraPose(),near:this.camera.near,shadows:this.renderer.shadowMap.enabled,materials:this.batches.map(b=>b.mesh.material),overlays:[],temporary:[context,shell,target]};
    this.renderer.shadowMap.enabled=false;
    this.pointerCancel();
    const preview=initialSession(this.catalog.version);preview.appearance=this.session.appearance;
    this.update(preview);
    const own=new Set(ids);
    for(const batch of this.batches){
      batch.mesh.material=['tiles','boards','enclosure','statues'].includes(batch.parts[0].layer)?shell:context;
      const parts=batch.parts.filter(p=>own.has(p.id));if(!parts.length)continue;
      const overlay=new THREE.InstancedMesh(batch.mesh.geometry,target,parts.length);
      parts.forEach((p,i)=>overlay.setMatrixAt(i,this.matrix(p)));
      overlay.frustumCulled=false;overlay.renderOrder=20;
      this.locationPreview.overlays.push(overlay);this.scene.add(overlay);
    }
    this.resize();this.fit();
  }
  endLocation(){
    const preview=this.locationPreview;if(!preview)return;
    this.batches.forEach((batch,i)=>{batch.mesh.material=preview.materials[i];});
    for(const mesh of preview.overlays){this.scene.remove(mesh);mesh.dispose();}
    for(const material of preview.temporary)material.dispose();
    this.renderer.shadowMap.enabled=preview.shadows;
    this.locationPreview=null;this.update(preview.session);this.resize();
    this.restoreCamera(preview.pose);
    this.camera.near=preview.near;this.camera.updateProjectionMatrix();this.locationPreview=null;this.invalidate();
  }
  setLocationEnvelope(visible:boolean){
    if(!this.locationPreview)return;
    for(const layer of ['tiles','enclosure','statues'] as const)this.session.visible[layer]=visible;
    // The boards layer also contains the ceiling's structural rails and lattice.
    // Remove covering panels individually so their supporting timber stays visible.
    this.session.hidden=visible?[]:this.catalog.parts.filter(p=>p.layer==='boards'&&(p.kind==='望板'||p.kind==='平闇板'||p.kind==='峻脚遮椽板')).map(p=>p.id);
    this.update(this.session);
  }
  restoreCamera(pose:CameraPose){this.surfaceOrbit.reset();this.camera.position.set(...pose.position);this.controls.target.set(...pose.target);this.controls.update();this.surfaceOrbit.reset(pose.pivot?new THREE.Vector3(...pose.pivot):null);this.invalidate();}
  capture():string {this.renderer.render(this.scene,this.camera);return this.renderer.domElement.toDataURL('image/png');}
  /** Initial render errors propagate to the startup screen's retry handling. */
  renderInitialFrame(){this.resize();this.renderer.render(this.scene,this.camera);this.initializing=false;this.invalidate();}
  private invalidate=()=>{if(this.initializing)return;this.frame=2;if(!this.raf)this.raf=requestAnimationFrame(this.render);};
  private render=()=>{
    this.animateDoors();
    this.controls.update();this.surfaceOrbit.updateMarker();this.renderer.render(this.scene,this.camera);
    if(!this.locationPreview)this.onMetrics({drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,geometries:this.renderer.info.memory.geometries,visible:this.visible.size});
    this.raf=0;if(--this.frame>0||this.doorTween)this.raf=requestAnimationFrame(this.render);
  };
  dispose(){this.timberContours?.dispose();this.endLocation();this.section.dispose();cancelAnimationFrame(this.raf);this.resizeObserver?.disconnect();this.surfaceOrbit.dispose();this.controls.dispose();this.renderer.dispose();for(const b of this.batches){b.roofSkin?.dispose();if(b.timberStyle)b.baseGeometry.dispose();}this.finialSelection.geometry.dispose();this.finialSelection.material.dispose();for(const m of this.materials.values())m.dispose();for(const {surfaces} of this.sculptureSurfaces.values())for(const m of surfaces)m.dispose();this.plaqueTexture?.dispose();}
}
