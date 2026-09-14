import { Color, type MeshStandardMaterial, type DataTexture } from 'three';
import type { Part } from './types';

/** Stable subtle timber-to-timber variation, independent of visibility and batching. */
export function timberTint(part:Pick<Part,'id'>,out=new Color()):Color {
  let seed=2166136261;
  for(const ch of part.id)seed=Math.imul(seed^ch.charCodeAt(0),16777619);
  const tone=(seed>>>0)/4294967295;
  return out.setRGB(.78+tone*.30,.77+tone*.27,.74+tone*.26);
}

/** Grain follows each member's longest local dimension, including rotated beams. */
export function addTimberGrain(material:MeshStandardMaterial,contours?:DataTexture):void {
  const paint={value:0};material.userData.timberPaint=paint;
  material.onBeforeCompile=shader=>{
    shader.uniforms.uTimberPaint=paint;
    shader.uniforms.uTimberContours={value:contours??null};
    shader.uniforms.uTimberContourRows={value:contours?.image.height??1};
    shader.vertexShader=shader.vertexShader.replace('#include <common>',`#include <common>
      varying vec3 vWoodPosition;
      varying vec3 vWoodNormal;
      varying vec3 vTimberUnit;
      varying vec3 vTimberNormal;
      varying vec3 vTimberSize;
      varying float vTimberStyle;
      varying float vTimberExterior;
      #ifdef USE_INSTANCING
        attribute float timberStyle;
        attribute float timberExterior;
        attribute vec3 timberPaintPosition;
      #endif`);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec3 woodSize=vec3(1.0);
      #ifdef USE_INSTANCING
        woodSize=vec3(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz),length(instanceMatrix[2].xyz));
      #endif
      vTimberUnit=position;vTimberNormal=normal;vTimberSize=woodSize;
      vTimberStyle=0.0;vTimberExterior=0.0;
      #ifdef USE_INSTANCING
        vTimberStyle=timberStyle;vTimberExterior=timberExterior;
        vTimberUnit=timberPaintPosition;
      #endif
      vec3 wp=position*woodSize;
      if(woodSize.y>woodSize.x&&woodSize.y>woodSize.z){vWoodPosition=wp.yxz;vWoodNormal=normal.yxz;}
      else if(woodSize.z>woodSize.x){vWoodPosition=wp.zyx;vWoodNormal=normal.zyx;}
      else{vWoodPosition=wp;vWoodNormal=normal;}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vWoodPosition;
      varying vec3 vWoodNormal;
      varying vec3 vTimberUnit;
      varying vec3 vTimberNormal;
      varying vec3 vTimberSize;
      varying float vTimberStyle;
      varying float vTimberExterior;
      uniform float uTimberPaint;
      uniform sampler2D uTimberContours;
      uniform float uTimberContourRows;
      vec4 timberSample(float x,float row){return texture2D(uTimberContours,vec2((x+.5)/514.0,(row+.5)/uTimberContourRows));}
      float paintBand(float p,float a,float b){float w=max(fwidth(p),.0005);return smoothstep(a-w,a+w,p)*(1.0-smoothstep(b-w,b+w,p));}
      float woodHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float woodNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(woodHash(i),woodHash(i+vec2(1,0)),f.x),mix(woodHash(i+vec2(0,1)),woodHash(i+vec2(1,1)),f.x),f.y);}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 wp=vWoodPosition;
      float crossAxis=abs(vWoodNormal.y)>abs(vWoodNormal.z)?wp.z:wp.y;
      float wave=woodNoise(vec2(wp.x*.55,crossAxis*6.0));
      float grainPhase=crossAxis*300.0+wave*7.0+sin(wp.x*1.9)*.5;
      float grainFade=1.0-smoothstep(.6,2.2,fwidth(grainPhase));
      float grain=sin(grainPhase)*grainFade;
      float streaks=woodNoise(vec2(wp.x*1.7,crossAxis*95.0));
      float endPhase=length(wp.yz+vec2(.08,.035))*290.0+wave*3.0;
      float rings=sin(endPhase)*(1.0-smoothstep(.6,2.2,fwidth(endPhase)));
      float detail=mix(grain,rings,smoothstep(.7,.95,abs(vWoodNormal.x)));
      float painted=uTimberPaint*step(.5,vTimberStyle);
      diffuseColor.rgb *= mix(.94 + detail*.045 + streaks*.085, .985 + detail*.009 + streaks*.015, painted);
      if(painted>.5){
        vec3 p=vTimberUnit,n=abs(vTimberNormal),sz=vTimberSize;
        float style=floor(vTimberStyle+.5);
        float family=mod(style,16.0),ivory=0.0,dan=0.0;
        // Display pigments: soil-red sides, orange-red undersides, chalk edging.
        // The face rules and the limits of their historical attribution are documented.
        if(family==2.0){
          float y=p.y*sz.y,head=sz.y*.5-.42,foot=-sz.y*.5+.42;
          vec3 faceNormal=normalize(cross(dFdx(p),dFdy(p)));
          float side=1.0-step(.999,abs(faceNormal.y));
          dan=max(step(head,y),1.0-step(foot,y))*side*paintBand(p.y,-.5,.5);
          ivory=max(paintBand(y,head-.006,head+.006),paintBand(y,foot-.006,foot+.006))*side;
        }else if(family==3.0){
          // Original dou-ping, dou-qi and sole levels, restored before interpolation.
          float radius=mix(.43/.70*.5,.5,clamp((p.y+.40)/.30,0.0,1.0));
          float outside=step(radius-.004,max(abs(p.x),abs(p.z)))*(1.0-step(.98,n.y));
          // At an outer side face the other horizontal axis measures the corner.
          float across=n.x>n.z?(radius-abs(p.z))*sz.z:(radius-abs(p.x))*sz.x;
          float edges=max(paintBand(across,0.0,.015),max(paintBand(p.y*sz.y,-.10*sz.y-.007,-.10*sz.y+.007),paintBand(p.y*sz.y,-.48*sz.y,-.48*sz.y+.014)));
          if(p.y>.08)edges=max(paintBand(across,0.0,.015),paintBand(p.y,.44-.014/sz.y,.44));
          ivory=edges*outside;
        }else if(family==8.0||family==9.0){
          float bottom=-.14/sz.y,floorY=.112/sz.y;
          float progress=clamp((p.y-bottom)/(floorY-bottom),0.0,1.0);
          float rx=mix(family==9.0?.70/sqrt(2.0):.43/sqrt(2.0),.70/sqrt(2.0),progress);
          float rz=mix(.43/sqrt(2.0),.70/sqrt(2.0),progress);
          if(p.y>floorY){rx=.5;rz=.5;}
          float outside=step(.994,max(abs(p.x)/rx,abs(p.z)/rz))*(1.0-step(.98,n.y));
          float across=n.x>n.z?(rz-abs(p.z))*sz.z:(rx-abs(p.x))*sz.x;
          float edges=max(paintBand(across,0.0,.015),paintBand(p.y*sz.y,-.14,-.126));
          edges=max(edges,paintBand(p.y*sz.y,.105,.119));
          if(p.y>floorY)edges=max(paintBand(across,0.0,.015),paintBand(p.y,.44-.014/sz.y,.44));
          ivory=edges*outside;
        }else if(family>=4.0&&family<=7.0){
          bool alongZ=sz.z>sz.x;
          float axis=alongZ?p.z:p.x,cross=alongZ?p.x:p.z;
          float extent=alongZ?sz.z:sz.x,breadth=alongZ?sz.x:sz.z,side=alongZ?n.x:n.z;
          float row=floor(style/256.0);
          vec4 bounds=timberSample(0.0,row);
          float t=clamp((axis-bounds.x)/(bounds.y-bounds.x),0.0,1.0)*511.0;
          vec4 lower=mix(timberSample(floor(t)+2.0,row),timberSample(min(floor(t)+3.0,513.0),row),fract(t));
          float height=(p.y-lower.x)*sz.y;
          float edgeDistance=height/sqrt(1.0+lower.y*lower.y);
          float width=clamp(sz.y/8.0,.015,.030);
          // Moon-beam white narrows at the sloping neck and stops before the head.
          width*=mix(1.0,1.0-smoothstep(.34,.445,abs(axis)),bounds.w);
          float exterior=step(.5,vTimberExterior);
          ivory=paintBand(edgeDistance,0.0,max(width,.00001))*exterior*step(.001,width);
          // Only the original lower shell receives yellow lead pigment. Newly exposed
          // notches and mortise walls cannot acquire stripes by sharing a Y coordinate.
          float bottom=step(vTimberNormal.y,-.05)*(1.0-smoothstep(.001,.005,abs(height)));
          dan=bottom;
          if(family==6.0){
            float h=sz.y/(sz.y<.45?5.0:sz.y<.60?6.0:7.0);
            vec4 ends=timberSample(1.0,row);
            float length=(bounds.y-bounds.x)*extent-ends.x-ends.y,white=(length-7.0*h)/8.0;
            float x=clamp((axis-bounds.x)*extent-ends.x,0.0,length-.0001),cycle=white+h;
            float whiteInterval=1.0-paintBand(mod(x,cycle),white,cycle);
            // Seven red separators, eight equal whites; end whites continue into columns.
            ivory=max(ivory,paintBand(p.y*sz.y,-h/2.0,h/2.0)*whiteInterval*exterior);
          }
          if(family==4.0){
            float regions=mod(floor(style/16.0),16.0);
            float region=lower.z<bounds.z/2.0?mod(regions,3.0):floor(regions/3.0);
            float distanceFromHead=min(lower.z,bounds.z-lower.z);
            float headWidth=2.0*lower.w*breadth;
            float motifLength=.18,barLength=headWidth*.375;
            float domain=paintBand(distanceFromHead,.012,.012+motifLength);
            float tails=smoothstep(.25*headWidth-.002,.25*headWidth+.002,abs(cross)*breadth);
            float fork=max(1.0-smoothstep(.012+barLength-.002,.012+barLength+.002,distanceFromHead),tails);
            if(region<1.5)ivory=max(ivory,bottom*domain*(region>.5?fork:1.0-fork));
          }
          // Ang head ornaments are deliberately withheld: evidence does not justify
          // duplicating the arm-head motif at both ends of every ang.
        }
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.63,.165,.055),dan);
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.79,.72,.57),ivory);

      }
    `);
  };
  material.customProgramCacheKey=()=> 'east-hall-timber-surfaces-8';
}
