import {Shape,ExtrudeGeometry} from 'three';
import type {Vec3} from './types';

// Inferred side profile: a continuous sloping timber with a horizontal tail
// shoulder and, for the you-ang, a small head platform carved into the same wood.
export function seatedAngGeometry(size:Vec3,slope:number,tailPlane:number,headPlatform:boolean){
 const theta=Math.atan(slope),co=Math.cos(theta),si=Math.sin(theta),run=size[0]*co,h=size[1]/co;
 const cap=tailPlane+run*slope/2,shoulder=(cap-h/2)/slope;
 const points:number[][]=[[0,-h*.1],[.25,.25*slope-h/2],[run-.04,(run-.04)*slope-h/2],[run,run*slope-h*.3],[run,cap],[shoulder,cap]];
 if(headPlatform){
  const axis=.25*Math.SQRT2,outer=axis-.1,inner=axis+.1,level=outer*slope+h/2;
  points.push([inner,inner*slope+h/2],[inner,level],[outer,level]);
 }
 points.push([.25,.25*slope+h/2],[.125,.125*slope+h*.2]);
 const shape=new Shape();
 points.forEach(([x,y],i)=>{
  const dx=x-run/2,dy=y-run*slope/2,px=(dx*co+dy*si)/size[0],py=(-dx*si+dy*co)/size[1];
  if(i)shape.lineTo(px,py);else shape.moveTo(px,py);
 });shape.closePath();
 return new ExtrudeGeometry(shape,{depth:1,bevelEnabled:false}).translate(0,0,-.5);
}
