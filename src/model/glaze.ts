import type {MeshStandardMaterial} from 'three';

// Procedural material variation only; no photograph is used as a texture.
// Patches suggest aged glaze without claiming a survey of individual losses.
export function addGlazeWeathering(material:MeshStandardMaterial):void {
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vGlazePosition;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGlazePosition = position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vGlazePosition;
      float glazeHash(vec3 p) {p=fract(p*.3183099+vec3(.13,.27,.39));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float glazeNoise(vec3 p) {
        vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
        return mix(mix(mix(glazeHash(i),glazeHash(i+vec3(1,0,0)),f.x),mix(glazeHash(i+vec3(0,1,0)),glazeHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(glazeHash(i+vec3(0,0,1)),glazeHash(i+vec3(1,0,1)),f.x),mix(glazeHash(i+vec3(0,1,1)),glazeHash(i+vec3(1,1,1)),f.x),f.y),f.z);
      }`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      #ifdef USE_COLOR
        float patinaNoise=glazeNoise(vGlazePosition*23.0);
        float grain=glazeNoise(vGlazePosition*290.0);
        float worn=smoothstep(.62,.81,patinaNoise+grain*.12);
        diffuseColor.rgb *= .87+.20*glazeNoise(vGlazePosition*68.0)+grain*.06;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.51,.46,.35),worn*.49);
      #endif`);
  };
  material.customProgramCacheKey=()=> 'east-hall-glaze-1';
}
