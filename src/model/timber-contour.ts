import {DataTexture,FloatType,NearestFilter,RGBAFormat,type BufferGeometry} from 'three';
import {geometry} from './geometry';
import {timberPaintStyle} from './timber-colors';
import type {Part,ShapeKind,Vec3} from './types';

const SAMPLES=512,WIDTH=SAMPLES+2;
/** Lower exterior silhouette, sampled from the uncut member, in its own frame.
 * This is surface metadata: joinery vertices, normals and indices are untouched.
 * RGBA = lower Y, physical slope, distance along underside, half breadth.
 */
export function sampleTimberContour(g:BufferGeometry,size:Vec3):Float32Array {
  const p=g.getAttribute('position'),index=g.index,axis=size[2]>size[0]?2:0,cross=2-axis;
  let lo=Infinity,hi=-Infinity;
  for(let i=0;i<p.count;i++){lo=Math.min(lo,p.getComponent(i,axis));hi=Math.max(hi,p.getComponent(i,axis));}
  const row=new Float32Array(WIDTH*4);row[0]=lo;row[1]=hi;
  for(let s=0;s<SAMPLES;s++){
    const x=lo+(hi-lo)*s/(SAMPLES-1),at=(s+2)*4;let lower=Infinity,breadth=0,slope=0;
    for(let t=0;t<(index?.count??p.count);t+=3)for(let k=0;k<3;k++){
      const a=index?index.getX(t+k):t+k,b=index?index.getX(t+(k+1)%3):t+(k+1)%3;
      const ax=p.getComponent(a,axis),bx=p.getComponent(b,axis);if(Math.abs(bx-ax)<1e-8)continue;
      const u=(x-ax)/(bx-ax);if(u< -1e-6||u>1+1e-6)continue;
      const y=p.getY(a)+(p.getY(b)-p.getY(a))*u,z=Math.abs(p.getComponent(a,cross)+(p.getComponent(b,cross)-p.getComponent(a,cross))*u);
      if(y<lower-1e-6){lower=y;breadth=z;slope=(p.getY(b)-p.getY(a))*size[1]/((bx-ax)*size[axis]);}
      else if(Math.abs(y-lower)<1e-6)breadth=Math.max(breadth,z);
    }
    if(!Number.isFinite(lower))throw new Error('Missing timber exterior contour');
    row[at]=lower;row[at+1]=slope;row[at+3]=breadth;
    if(s)row[at+2]=row[at-2]+Math.hypot((hi-lo)*size[axis]/(SAMPLES-1),(lower-row[at-4])*size[1]);
  }
  row[2]=row[row.length-2];return row;
}

function exteriorShape(p:Part):ShapeKind {
  const shape=p.paintSourceShape??p.shape;
  // These source profiles already contain joint seats. Paint follows the blank.
  if(['gong','gongUpper','gongEndSeats','gongUpperEndSeats'].includes(shape)||shape.startsWith('rootArm:'))return 'gongSolid';
  if(shape==='linkedBeam')return 'linkedBeamBlank';
  return shape;
}

/** One shared lookup texture and one existing float per instance; no extra draws. */
export class TimberContours {
  readonly texture:DataTexture;
  private codes=new Map<string,number>();
  constructor(parts:Part[]){
    const byId=new Map(parts.map(p=>[p.id,p]));
    const rows:Float32Array[]=[new Float32Array(WIDTH*4)];const cache=new Map<string,number>();
    for(const p of parts){
      if(!['wood','redwood'].includes(p.material))continue;
      const style=timberPaintStyle(p),family=style%16;let row=0;
      if([4,5,6,7].includes(family)){
        const shape=exteriorShape(p);
        const columns=family===6?p.requires.map(id=>byId.get(id)).filter((v):v is Part=>v?.kind==='柱'):[];
        const half=columns.length===2?columns.map(c=>Math.min(c.size[0],c.size[2])*.47):[0,0];
        const key=shape+':'+p.size.join(',')+':'+half.join(',');
        row=cache.get(key)??0;
        if(!row){row=rows.length;const samples=sampleTimberContour(geometry(shape,p.size),p.size);samples[3]=['beam','fourBeam'].includes(shape)?1:0;samples[4]=half[0];samples[5]=half[1];rows.push(samples);cache.set(key,row);}
      }
      this.codes.set(p.id,row*256+style);
    }
    const data=new Float32Array(rows.length*WIDTH*4);rows.forEach((row,i)=>data.set(row,i*WIDTH*4));
    this.texture=new DataTexture(data,WIDTH,rows.length,RGBAFormat,FloatType);
    this.texture.magFilter=this.texture.minFilter=NearestFilter;this.texture.needsUpdate=true;
  }
  code(p:Part){return this.codes.get(p.id)??0;}
  dispose(){this.texture.dispose();}
}
