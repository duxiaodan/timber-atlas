import type {MeshStandardMaterial} from 'three';

/** Small pigment variation, not a map of the original sculpture's actual losses. */
export function addPolychromeSurface(material:MeshStandardMaterial):void {
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vClayPosition;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvClayPosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vClayPosition;
      float clayHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float clayNoise(vec3 p){
        vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(clayHash(i),clayHash(i+vec3(1,0,0)),f.x),mix(clayHash(i+vec3(0,1,0)),clayHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(clayHash(i+vec3(0,0,1)),clayHash(i+vec3(1,0,1)),f.x),mix(clayHash(i+vec3(0,1,1)),clayHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      #ifdef USE_COLOR
        float clayGrain=clayNoise(vClayPosition*240.0);
        float clayPatina=clayNoise(vClayPosition*42.0);
        diffuseColor.rgb*=.89+.13*clayPatina+.06*clayGrain;
      #endif`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
      #ifdef USE_COLOR
        float ochre=smoothstep(.42,.65,vColor.g/max(vColor.r,.001))*(1.0-smoothstep(.50,.80,vColor.b/max(vColor.g,.001)));
        roughnessFactor*=mix(1.0,.65,ochre);
      #endif`);
  };
  material.customProgramCacheKey=()=> 'east-hall-polychrome-1';
}
