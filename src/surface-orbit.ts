import {MathUtils,PerspectiveCamera,Quaternion,Vector3} from 'three';
import type {OrbitControls} from 'three/addons/controls/OrbitControls.js';

/** Rotate the camera and its look target as one rigid frame around a surface point. */
export function rotateAroundSurface(camera:PerspectiveCamera,target:Vector3,pivot:Vector3,dx:number,dy:number,height:number,limits:{min:number;max:number;speed:number}){
 const up=camera.up.clone().normalize(),offset=camera.position.clone().sub(target);
 const yaw=new Quaternion().setFromAxisAngle(up,-2*Math.PI*dx/height*limits.speed);
 const phi=offset.angleTo(up),next=MathUtils.clamp(phi-2*Math.PI*dy/height*limits.speed,Math.max(1e-5,limits.min),Math.min(Math.PI-1e-5,limits.max));
 const right=new Vector3(1,0,0).applyQuaternion(camera.quaternion).applyQuaternion(yaw);
 const rotation=new Quaternion().setFromAxisAngle(right,next-phi).multiply(yaw);
 camera.position.sub(pivot).applyQuaternion(rotation).add(pivot);
 target.sub(pivot).applyQuaternion(rotation).add(pivot);
 camera.quaternion.premultiply(rotation);camera.updateMatrixWorld();
}

/** Captures only surface-orbit gestures; normal pan, zoom and part drags stay native. */
export class SurfaceOrbit {
 pivot:Vector3|null=null;
 private gesture:{id:number;x:number;y:number;startX:number;startY:number;time:number;moved:boolean;shift:boolean;enabled:boolean}|null=null;
 private internal=false;
 private lastTarget=new Vector3();
 private marker:HTMLDivElement;
 private timer:ReturnType<typeof setTimeout>|undefined;
 constructor(private camera:PerspectiveCamera,private controls:OrbitControls,private element:HTMLElement,
  private callbacks:{hit:(e:PointerEvent)=>Vector3|null;partDrag:(e:PointerEvent)=>boolean;select:(e:PointerEvent)=>void;change:()=>void;end:()=>void}){
  this.lastTarget.copy(controls.target);
  this.marker=document.createElement('div');this.marker.className='orbit-center-marker';this.marker.hidden=true;this.marker.setAttribute('aria-hidden','true');element.parentElement!.append(this.marker);
  element.addEventListener('pointerdown',this.down,true);element.addEventListener('pointermove',this.move,true);
  element.addEventListener('pointerup',this.up,true);element.addEventListener('pointercancel',this.cancel,true);
  element.addEventListener('lostpointercapture',this.cancel,true);window.addEventListener('blur',this.blur);
  controls.addEventListener('change',this.trackPan);
 }
 private trackPan=()=>{
  if(this.pivot&&!this.internal)this.pivot.add(this.controls.target.clone().sub(this.lastTarget));
  this.lastTarget.copy(this.controls.target);
 };
 /** Clear native damping without consuming it as an extra camera movement. */
 settle(){
  this.internal=true;
  const position=this.camera.position.clone(),quaternion=this.camera.quaternion.clone(),target=this.controls.target.clone(),damping=this.controls.enableDamping;
  this.controls.enableDamping=false;this.controls.update();
  this.camera.position.copy(position);this.controls.target.copy(target);this.controls.update();this.camera.quaternion.copy(quaternion);this.camera.updateMatrixWorld();
  this.controls.enableDamping=damping;this.lastTarget.copy(target);this.internal=false;
 }
 reset(pivot:Vector3|null=null){this.finish();this.settle();this.pivot=pivot?.clone()??null;clearTimeout(this.timer);this.marker.hidden=true;}
 private consume(e:PointerEvent){e.preventDefault();e.stopImmediatePropagation();}
 private down=(e:PointerEvent)=>{
  if(e.button!==0||e.pointerType==='touch'||this.gesture||!this.controls.enabled||this.element.hasPointerCapture(e.pointerId))return;
  if(!e.shiftKey&&(!this.pivot||e.ctrlKey||e.metaKey||e.altKey||this.callbacks.partDrag(e)))return;
  this.consume(e);this.settle();
  if(e.shiftKey){const hit=this.callbacks.hit(e);if(hit){this.pivot=hit.clone();this.marker.hidden=false;clearTimeout(this.timer);this.timer=setTimeout(()=>{this.marker.hidden=true;},1200);this.updateMarker();}}
  this.gesture={id:e.pointerId,x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,time:Date.now(),moved:false,shift:e.shiftKey,enabled:this.controls.enabled};
  this.controls.enabled=false;this.element.setPointerCapture(e.pointerId);this.callbacks.change();
 };
 private move=(e:PointerEvent)=>{
  const g=this.gesture;if(!g||g.id!==e.pointerId)return;this.consume(e);
  this.internal=true;
  rotateAroundSurface(this.camera,this.controls.target,this.pivot??this.controls.target.clone(),e.clientX-g.x,e.clientY-g.y,Math.max(1,this.element.clientHeight),{min:this.controls.minPolarAngle,max:this.controls.maxPolarAngle,speed:this.controls.rotateSpeed});
  this.controls.update();this.lastTarget.copy(this.controls.target);this.internal=false;
  g.x=e.clientX;g.y=e.clientY;g.moved ||= Math.hypot(g.x-g.startX,g.y-g.startY)>=5;this.callbacks.change();
 };
 private up=(e:PointerEvent)=>{
  const g=this.gesture;if(!g||g.id!==e.pointerId||e.button!==0)return;this.consume(e);
  this.finish();if(!g.shift&&!g.moved&&Date.now()-g.time<600)this.callbacks.select(e);this.callbacks.end();
 };
 private finish(){const g=this.gesture;if(!g)return;this.gesture=null;this.controls.enabled=g.enabled;if(this.element.hasPointerCapture(g.id))this.element.releasePointerCapture(g.id);}
 private cancel=(e:PointerEvent)=>{if(this.gesture?.id===e.pointerId){this.consume(e);this.finish();this.callbacks.end();}};
 private blur=()=>{if(this.gesture){this.finish();this.callbacks.end();}};
 updateMarker(){
  if(this.marker.hidden||!this.pivot)return;
  this.camera.updateMatrixWorld();
  const point=this.pivot.clone().project(this.camera);this.marker.style.visibility=point.z>1||point.z< -1?'hidden':'visible';
  this.marker.style.left=`${(point.x+1)*.5*this.element.clientWidth}px`;this.marker.style.top=`${(1-point.y)*.5*this.element.clientHeight}px`;
 }
 dispose(){this.finish();clearTimeout(this.timer);this.marker.remove();this.controls.removeEventListener('change',this.trackPan);
  this.element.removeEventListener('pointerdown',this.down,true);this.element.removeEventListener('pointermove',this.move,true);this.element.removeEventListener('pointerup',this.up,true);this.element.removeEventListener('pointercancel',this.cancel,true);this.element.removeEventListener('lostpointercapture',this.cancel,true);window.removeEventListener('blur',this.blur);
 }
}
