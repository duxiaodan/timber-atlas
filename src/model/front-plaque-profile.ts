import type {Vec3} from './types';

// Photograph-constrained shape, with unmeasured depths and hanging angle kept
// explicit. Coordinates x/y refer to the unchanged photographic silhouette.
export const PLAQUE_SIZE:Vec3=[3.05,3.30,.48];
export const PLAQUE_POSITION:Vec3=[0,6.6,10.23];
export const PLAQUE_TILT=Math.PI/12;
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
function distance(x:number,y:number,a:number[],b:number[]){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}
const panel=[[-.23865,.36722],[.24003,.36722],[.24003,-.23253],[-.24966,-.23253]];
export function plaqueFrameDepth(x:number,y:number):{front:number;back:number}{
 const ax=Math.abs(x),edge=Math.min(...panel.map((a,i)=>distance(x,y,a,panel[(i+1)%4]))),blend=smooth(0,.026,edge);
 // Side bands bow forward, the upper horizontal head sits further back, and
 // pendant ends turn back after their outward-curving belly.
 const side=smooth(.24,.285,ax)*(1-smooth(.30,.39,y))*smooth(-.31,-.23,y);
 const bow=.085*side*Math.exp(-(((y-.025)/.25)**2));
 const header=.030*smooth(.36,.41,y)+.045*smooth(.29,.40,ax)*smooth(.37,.43,y);
 const tail=smooth(.265,.32,ax)*(1-smooth(-.32,-.27,y));
 const t=Math.max(0,Math.min(1,(-y-.285)/.215));
 const curl=tail*(.19*Math.sin(t*Math.PI*1.12)-.018*t);
 const warp=blend*(bow+header+curl);
 const upper=distance(ax,y,[.24,.367],[.385,.456]);
 const lower=distance(ax,y,[.24,-.235],[.377,-.398]);
 const ridge=.082*Math.exp(-((Math.min(upper,lower)/.019)**2))*blend;
 const roll=.024*Math.sin(Math.min(1,edge/.10)*Math.PI)*blend;
 return {front:.040+warp+ridge+roll,back:-.075+warp};
}
// Invert the inclined back surface at a world x/y. Mount ends use this same
// function, so changing the curve or angle cannot leave a gap or intersection.
export function plaqueBackAt(worldX:number,worldY:number):number{
 const x=(worldX-PLAQUE_POSITION[0])/PLAQUE_SIZE[0],c=Math.cos(PLAQUE_TILT),s=Math.sin(PLAQUE_TILT);
 let lo=-.6,hi=.6;
 for(let i=0;i<48;i++){const y=(lo+hi)/2,z=plaqueFrameDepth(x,y).back;const wy=PLAQUE_POSITION[1]+y*PLAQUE_SIZE[1]*c-z*s;if(wy<worldY)lo=y;else hi=y;}
 const y=(lo+hi)/2,z=plaqueFrameDepth(x,y).back;
 return PLAQUE_POSITION[2]+y*PLAQUE_SIZE[1]*s+z*c;
}
