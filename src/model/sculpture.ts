import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Independent observed-form sculptures. These are not scans or traced photograph textures. */
class Sculpture {
  pieces:T.BufferGeometry[]=[];
  add(g:T.BufferGeometry,color:number){
    const c=new T.Color(color),values=new Float32Array(g.getAttribute('position').count*3);
    for(let i=0;i<values.length;i+=3){values[i]=c.r;values[i+1]=c.g;values[i+2]=c.b;}
    g.setAttribute('color',new T.BufferAttribute(values,3));g.deleteAttribute('uv');this.pieces.push(g);return g;
  }
  oval(x:number,y:number,z:number,rx:number,ry:number,rz:number,color:number,segments=24){return this.add(new T.SphereGeometry(1,segments,16).scale(rx,ry,rz).translate(x,y,z),color);}
  box(x:number,y:number,z:number,w:number,h:number,d:number,color:number){return this.add(new T.BoxGeometry(w,h,d).translate(x,y,z),color);}
  lathe(profile:number[][],color:number,z=0){return this.add(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),32).translate(0,0,z),color);}
  tube(points:number[][],r:number,color:number,steps=28){return this.add(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),steps,r,7,false),color);}
  relief(points:number[][],depth:number,z:number,color:number){const s=new T.Shape();points.forEach(([x,y],i)=>i?s.lineTo(x,y):s.moveTo(x,y));s.closePath();return this.add(new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:.005,bevelSize:.005,bevelSegments:2,curveSegments:12}).translate(0,0,z-depth/2),color);}
  surface(point:(u:number,v:number)=>number[],color:(u:number,v:number)=>number,nu=72,nv=48,reverse=false){
    const positions:number[]=[],colors:number[]=[],indices:number[]=[];
    for(let j=0;j<=nv;j++)for(let i=0;i<=nu;i++){
      const u=i/nu,v=j/nv;positions.push(...point(u,v));const c=new T.Color(color(u,v));colors.push(c.r,c.g,c.b);
      if(i<nu&&j<nv){const k=j*(nu+1)+i,a=[k,k+1,k+nu+1,k+1,k+nu+2,k+nu+1];if(reverse)for(let n=0;n<a.length;n+=3)[a[n+1],a[n+2]]=[a[n+2],a[n+1]];indices.push(...a);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();this.pieces.push(g);return g;
  }
  tapered(points:number[][],radius:(t:number)=>number,color:number,fold=0){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),frames=curve.computeFrenetFrames(48,false);
    return this.surface((u,v)=>{
      const i=Math.min(48,Math.round(v*48)),a=u*Math.PI*2,r=radius(v)*(1+fold*Math.cos(a*7+v*9));
      return curve.getPoint(v).addScaledVector(frames.normals[i],Math.cos(a)*r).addScaledVector(frames.binormals[i],Math.sin(a)*r).toArray();
    },()=>color,28,48);
  }
  sleeve(points:number[][],color:number){
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),frames=curve.computeFrenetFrames(64,false);
    return this.surface((u,v)=>{
      const i=Math.min(64,Math.round(v*64)),a=u*Math.PI*2;
      const r=(.054+.018*Math.sin(Math.PI*v)+.007*v)*(1+.07*Math.cos(a*9+v*15)*Math.sin(Math.PI*v));
      return curve.getPoint(v).addScaledVector(frames.normals[i],Math.cos(a)*r).addScaledVector(frames.binormals[i],Math.sin(a)*r).toArray();
    },(u,v)=>v>.96?edge:v>.91?teal:v>.90?edge:color,48,64);
  }
  hand(x:number,y:number,z:number,color:number,raised:boolean,holding=false){
    // Palm, unequal phalanges and rounded tips follow the posed wrist; the hidden grip remains inferred.
    this.oval(x,y,z,.030,.045,.015,color,24);
    const direction=raised?1:-1;
    for(let i=0;i<4;i++){
      const dx=(i-1.5)*.014,len=[.043,.055,.051,.039][i],start=y+direction*.030;
      const curl=holding?.032:raised?.017:.009;
      const pts=[[x+dx,start,z],[x+dx,start+direction*len*.50,z+.007],[x+dx+(i-1.5)*.001,start+direction*len*.88,z+curl],[x+dx,start+direction*len*.91,z+curl+.009]];
      this.tapered(pts,t=>.0064*(1-.36*t),color);
      const end=pts[3];this.oval(end[0],end[1],end[2],.0042,.005,.0042,color,12);
    }
    this.tapered([[x+.024,y-.012,z],[x+.040,y+.003,z+.006],[x+.034,y+.025,z+.025],[x+.022,y+.029,z+.035]],t=>.009*(1-.4*t),color);
  }
  finish(centered=false){
    const pieces=this.pieces.map(g=>g.index?g.toNonIndexed():g),g=mergeGeometries(pieces,false)!;
    g.computeBoundingBox();const b=g.boundingBox!,size=b.getSize(new T.Vector3()),center=b.getCenter(new T.Vector3());
    g.translate(-center.x,centered?-center.y:-b.min.y,-center.z);g.scale(1/size.x,1/size.y,1/size.z);g.computeBoundingBox();
    for(const p of new Set([...pieces,...this.pieces]))p.dispose();return g;
  }
}
const green=0x427760,lightGreen=0x679787,goldGlaze=0xc49645,ivory=0xd3caaa,dark=0x272723;

export function firePearlGeometry():T.BufferGeometry {
  const s=new Sculpture();
  // The beasts straddle the ridge. Their open mouths have no solid sphere filling the opening.
  s.box(0,.08,0,.72,.16,.45,goldGlaze);s.box(0,.53,0,.47,.88,.37,green);
  for(const sign of [-1,1])for(const face of [-1,1]){
    const z=face*.20;
    s.relief([[sign*.16,.10],[sign*.36,.12],[sign*.43,.26],[sign*.40,.46],[sign*.33,.64],[sign*.43,.87],[sign*.23,1.08],[sign*.14,.87]],.09,z,green);
    s.tube([[sign*.20,.15,z*1.2],[sign*.40,.24,z*1.3],[sign*.36,.48,z*1.32],[sign*.44,.64,z*1.3],[sign*.65,.62,z*1.1]],.04,ivory);
    s.tube([[sign*.65,.62,z*1.1],[sign*.71,.76,z],[sign*.57,.82,z],[sign*.34,.86,z]],.037,goldGlaze);
    s.oval(sign*.52,.80,z,.15,.105,.13,goldGlaze);
    s.oval(sign*.52,.84,z+face*.10,.085,.085,.03,ivory);
    s.oval(sign*.53,.84,z+face*.125,.057,.056,.025,dark);
    s.tube([[sign*.36,.90,z],[sign*.38,1.09,z],[sign*.30,1.30,z],[sign*.32,1.38,z]],.028,goldGlaze);
    s.tube([[sign*.56,.91,z],[sign*.69,1.01,z],[sign*.65,.93,z],[sign*.61,.90,z]],.028,lightGreen);
    for(let i=0;i<4;i++)s.oval(sign*(.50+i*.045),.65,z+face*.016,.013,.03,.025,ivory,12);
  }
  // Small frontal standing reliefs, seen on the base and the square shrine.
  function figure(y:number,h:number,z:number){
    s.oval(0,y+h*.82,z,.04,h*.11,.025,goldGlaze,16);
    s.relief([[-.04,y+h*.68],[-.07,y+h*.2],[0,y],[.065,y+h*.2],[.04,y+h*.68]],.04,z,goldGlaze);
    for(const sign of [-1,1])s.tube([[sign*.025,y+h*.65,z],[sign*.07,y+h*.44,z+.01],[sign*.025,y+h*.35,z+.035]],.014,goldGlaze,12);
  }
  figure(.14,.28,.23);figure(.46,.46,.235);
  for(const y of [1.04,1.32])s.box(0,y,0,.55,.055,.47,goldGlaze);
  s.box(0,1.18,-.035,.39,.24,.29,lightGreen);
  for(const x of [-.21,.21])s.box(x,1.18,.19,.035,.24,.035,ivory);
  figure(1.08,.23,.175);
  s.lathe([[.25,1.35],[.25,1.38],[.21,1.42],[.19,1.50],[.10,1.57]],green);
  for(let i=0;i<12;i++){
    const a=i*Math.PI/6,x=Math.cos(a),z=Math.sin(a);
    s.tube([[x*.245,1.38,z*.245],[x*.208,1.44,z*.208],[x*.15,1.52,z*.15]],.012,goldGlaze,12);
  }
  s.lathe([[.24,1.55],[.24,1.60],[.11,1.62],[.10,1.71],[.19,1.73],[.21,1.76],[.21,1.80],[.13,1.82]],green);
  for(const y of [1.59,1.73,1.78])s.lathe([[.20,y],[.21,y+.015],[.20,y+.03]],goldGlaze);
  for(const face of [-1,1])s.oval(0,1.665,face*.112,.08,.045,.014,goldGlaze);
  s.oval(0,1.87,0,.14,.13,.14,goldGlaze);
  for(let row=0;row<2;row++)for(let i=0;i<12;i++){
    const a=(i+row*.5)*Math.PI/6,rx=Math.cos(a),rz=Math.sin(a);
    s.tube([[rx*.07,1.91+row*.04,rz*.07],[rx*.18,1.95+row*.045,rz*.18],[rx*.185,2.015+row*.04,rz*.185]],.033,row?lightGreen:green,12);
  }
  s.lathe([[.065,2.00],[.14,2.05],[.17,2.13],[.155,2.25],[.115,2.34],[.064,2.40],[.047,2.49],[.055,2.51],[.038,2.57],[.019,2.61]],green);
  for(let i=0;i<8;i++){
    const a=i*Math.PI/4,x=Math.cos(a),z=Math.sin(a);
    s.tube([[x*.152,2.1,z*.152],[x*.178,2.14,z*.178],[x*.153,2.20,z*.153],[x*.135,2.18,z*.135]],.01,lightGreen,16);
  }
  s.lathe([[.05,2.48],[.057,2.49],[.05,2.505]],goldGlaze);
  return s.finish(true);
}

export type StatueForm='seated'|'amitabha'|'maitreya'|'lion'|'elephant'|'attendant'|'guardian'|'donor';
const skin=0xbb944d,whiteSkin=0xcac6ae,robe=0x8b4b3a,teal=0x4e817c,blue=0x334963,edge=0xb1a477;
export function statueGeometry(form:StatueForm):T.BufferGeometry {
  const s=new Sculpture(),main=['seated','amitabha','maitreya','lion','elephant'].includes(form),mounted=form==='lion'||form==='elephant',standing=!main;
  const faceColor=form==='lion'?skin:mounted||standing?whiteSkin:skin;
  const base=.10,hip=mounted?.41:form==='maitreya'?.35:standing?.39:.29;
  const shoulder=standing?.72:mounted?.66:.56,headY=shoulder+.12,headRx=standing?.078:.096;
  // Distinct plinth and lotus seat. Each statue remains one inspectable sculptural object.
  s.box(0,.035,0,main?.76:.37,.07,main?.49:.30,robe);
  s.box(0,.085,0,main?.80:.41,.03,main?.52:.33,teal);
  if(main&&!mounted){
    if(form==='maitreya'){
      // The high seat stays behind the hanging shins, with separate lotus foot supports in front.
      s.box(0,.18,-.09,.55,.19,.25,blue);s.box(0,hip-.048,-.055,.67,.035,.30,edge);
      for(const sign of [-1,1])s.box(sign*.235,.18,.015,.055,.19,.035,robe);
    }else{
      s.box(0,.135,0,.57,.08,.39,blue);s.box(0,.19,0,.74,.035,.48,edge);
      for(const sign of [-1,1])s.box(sign*.25,.13,.18,.09,.075,.08,robe);
    }
  }
  if(mounted){
    const animalColor=form==='lion'?0x345d90:0xc7c5b7;
    s.oval(0,.24,0,.22,.15,.30,animalColor);
    for(const x of [-.15,.15])for(const z of [-.20,.20])s.oval(x,.14,z,.065,.11,.065,animalColor);
    s.oval(0,.29,.23,.15,.14,.14,animalColor);
    if(form==='elephant'){
      s.tube([[0,.32,.35],[0,.23,.40],[.015,.09,.45],[.06,.08,.45]],.039,animalColor);
      for(const sign of [-1,1])s.oval(sign*.15,.30,.20,.065,.12,.035,animalColor);
      for(const sign of [-1,1])for(let n=0;n<3;n++)s.tube([[sign*.08,.25+n*.025,.34],[sign*(.16+n*.012),.22+n*.035,.41],[sign*(.20+n*.016),.23+n*.038,.43]],.008,ivory,12);
      s.tube([[0,.41,.26],[0,.35,.35],[0,.26,.37]],.012,teal,14);
      s.tube([[-.14,.32,.29],[0,.33,.37],[.14,.32,.29]],.012,teal,14);
    }else{
      for(let i=0;i<22;i++){const a=i*Math.PI/11;s.oval(Math.cos(a)*.15,.30+Math.sin(a)*.14,.24,.033,.044,.05,lightGreen,12);}
      s.oval(0,.235,.335,.10,.057,.032,0x703b31);
      s.tube([[-.085,.25,.36],[0,.285,.38],[.085,.25,.36],[0,.20,.38],[-.085,.25,.36]],.016,0xb26761,24);
      for(let i=-3;i<=3;i++)s.oval(i*.02,.265,.375,.007,.015,.006,ivory,8);
      s.oval(0,.32,.36,.045,.027,.025,0xb98b83);
      s.add(new T.TorusGeometry(.024,.006,7,20).translate(.018,.30,.386),skin);
    }
    s.oval(-.066,.34,.345,.032,.021,.012,ivory,12);s.oval(.066,.34,.345,.032,.021,.012,ivory,12);
    for(const x of [-.066,.066])s.oval(x,.34,.356,.012,.016,.009,dark,12);
    s.oval(0,.37,0,.28,.045,.19,robe);
  }
  // Tailored continuous torso and a separate curved collar make a clean cloth boundary.
  const chest=form==='lion'?0x315ba0:form==='elephant'?whiteSkin:main?0x7c7966:teal;
  const bodyColor=mounted?chest:robe;
  const torso=(a:number,t:number,offset=0)=>{
    const width=(standing?.105:.185)+(standing?.028:.027)*Math.sin(Math.PI*t)-.11*Math.pow(t,12);
    const depth=.100-.035*Math.pow(t,10),fold=.006*Math.sin(a*11+t*7)*Math.sin(Math.PI*t);
    return [(width+fold+offset)*Math.cos(a),hip+(shoulder+.025-hip)*t,(depth+fold+offset)*Math.sin(a)];
  };
  s.surface((u,v)=>torso(u*Math.PI*2,v),()=>bodyColor,96,64,true);
  // Undergarment follows the chest; its edge is geometry rather than jagged vertex-colour triangles.
  if(main){
    const panel=(u:number,v:number)=>{
      const t=.10+v*.90,left=.32+v*.85,right=Math.PI-.35-v*.76;
      return torso(left+(right-left)*u,t,.0025);
    };
    s.surface(panel,(_u,v)=>mounted?chest:v<.34?blue:chest,64,64,true);
    const collar=(side:number)=>Array.from({length:35},(_,i)=>panel(side,i/34));
    for(const side of [0,1])s.tube(collar(side),.0045,form==='lion'?edge:teal,36);
    if(mounted){
      for(const sign of [-1,1]){
        // Paired collar scrolls and draped green shoulder scarves visible on the two mounted figures.
        const curve:number[][]=[];
        for(let i=0;i<44;i++){const a=i/43*Math.PI*2.3,r=.036*(1-i/60);curve.push([sign*(.073+Math.cos(a)*r),shoulder-.027+Math.sin(a)*r,.105]);}
        s.tube(curve,.004,edge,44);
        s.tube([[sign*.05,shoulder+.015,.03],[sign*.175,shoulder-.02,.065],[sign*.20,shoulder-.13,.11],[sign*.165,hip+.07,.135]],.009,form==='elephant'?green:teal,36);
      }
    }
  }
  if(form==='maitreya'){
    for(const sign of [-1,1]){
      s.oval(sign*.18,.285,.12,.135,.11,.145,robe);
      s.oval(sign*.18,.19,.17,.105,.16,.085,robe);
      s.oval(sign*.18,.065,.24,.082,.035,.12,faceColor);
      for(let i=0;i<5;i++)s.oval(sign*.18+(i-2)*.023,.06,.335,.013,.016,.026,faceColor,12);
      for(let i=0;i<9;i++){const a=i*Math.PI*2/9;s.oval(sign*.18+Math.cos(a)*.09,.025,.24+Math.sin(a)*.095,.031,.02,.05,teal,12);}
    }
  }else if(main){
    for(const sign of [-1,1])s.oval(sign*.175,hip-.012,.035,.205,.062,.16,robe);
    s.tube([[-.32,hip+.02,.17],[-.14,hip+.01,.23],[.12,hip+.025,.21],[.29,hip+.055,.13]],.019,teal);
    s.oval(.095,hip+.018,.175,.12,.03,.06,faceColor);
  }else{
    // Long standing skirt and separately visible feet.
    s.lathe([[.15,.11],[.145,.17],[.115,hip]],teal);
    for(const sign of [-1,1])s.oval(sign*.065,.09,.105,.055,.033,.10,whiteSkin);
    for(let i=-3;i<=3;i++)s.tube([[i*.033,.12,.13],[i*.029,.24,.11],[i*.025,hip,.105]],.005,edge,18);
  }
  if(main){
    // One draped front crosses the knees; Maitreya has a long hanging skirt between the feet.
    const hanging=form==='maitreya',skirtBottom=hanging?.086:mounted?hip-.19:hip-.09;
    const apron=(u:number,v:number)=>{
      const a=u*Math.PI,width=mounted?.27:.375,x=-width*Math.cos(a);
      const knee=.023*Math.exp(-(((Math.abs(x)-.19)/.11)**2));
      const y=skirtBottom+(hip+.020-skirtBottom)*Math.sin(v*Math.PI/2)+knee*v;
      const folds=(.012*Math.cos(u*Math.PI*16+.6)+.007*Math.cos(u*Math.PI*8))*Math.sin(Math.PI*v);
      // Wrap both sides and turn back over the knees into the body; no upright curtain edge.
      return [x,y,(.235*(1-Math.pow(v,5))+folds)*Math.sin(a)+.025];
    };
    s.surface(apron,(u,v)=>{
      const hem=v+.024*Math.sin(u*Math.PI*10);
      if(hem<.07)return teal;if(hem<.09)return edge;if(hem<.16)return blue;if(hem<.18)return edge;
      return robe;
    },112,80);
    // Sparse painted cloud lines follow the same surface. Their motifs and repeat are representative.
    for(let row=0;row<3;row++)for(let col=0;col<7;col++){
      const u0=.075+col*.14,v0=.30+row*.23,points:number[][]=[];
      for(let i=0;i<30;i++){
        const a=i/29*Math.PI*2.1,r=.032*(1-i/40),p=apron(u0+Math.cos(a)*r,v0+Math.sin(a)*r*1.3);p[2]+=.0015;points.push(p);
      }
      s.tube(points,.0009,row%2?teal:edge,28);
    }
    // Waist sash wraps the front, with two overlapping tapered ends.
    s.tube([[-.17,hip+.072,.10],[-.08,hip+.059,.12],[.02,hip+.067,.13],[.16,hip+.078,.10]],.007,edge,32);
    for(const sign of [-1,1])s.surface((u,v)=>[sign*(.018+.04*v)+(u-.5)*(.020-.008*v),hip+.061-v*.069,.137+.018*v+.003*Math.sin(v*8)],()=>mounted?teal:edge,12,24);
  }
  const raised=form==='maitreya'||form==='amitabha'||mounted||standing;
  for(const sign of [-1,1]){
    if(sign===1&&(form==='seated'||form==='amitabha')){
      const y=hip+.065;
      s.sleeve([[.19,shoulder-.035,0],[.24,hip+.09,.08],[.095,y,.235]],robe);
      s.oval(.065,y,.255,.057,.019,.040,faceColor);
      for(let i=0;i<4;i++)s.tube([[.04,y,.232+i*.015],[.008,y+.004,.232+i*.015],[-.025,y+.012,.232+i*.015]],.0065,faceColor,14);
      s.tube([[.09,y,.22],[.05,y+.025,.218],[.028,y+.027,.234]],.009,faceColor,14);
      continue;
    }
    const right=sign<0,endY=right&&raised?shoulder-.015:hip+.04,endX=right&&raised?-.27:sign*.13,endZ=right&&raised?.22:.25;
    if(main)s.sleeve([[sign*.19,shoulder-.035,0],[sign*.245,shoulder-.14,.07],[endX,endY-.035,endZ-.015]],form==='seated'&&right?0x7c7966:robe);
    else s.tapered([[sign*.15,shoulder-.035,0],[sign*.20,shoulder-.14,.07],[endX,endY-.03,endZ-.015]],t=>.037*(1-.15*t),robe,.07);
    s.hand(endX,endY,endZ,faceColor,right&&raised,mounted||form==='amitabha');
  }
  if(form==='seated')s.lathe([[.045,hip+.087],[.06,hip+.117],[.05,hip+.147]],skin,.255);
  s.oval(0,headY-.065,0,.048,.075,.051,faceColor);
  // A continuous face surface keeps the cheeks and nose integrated with the head.
  const face=new T.SphereGeometry(1,64,48),faceVertices=face.getAttribute('position');
  function facialRelief(x:number,y:number){return .016*Math.exp(-((x/.017)**2+((y+.006)/.034)**2))+.005*Math.exp(-(((Math.abs(x)-.044)/.026)**2+((y+.016)/.025)**2))-.003*Math.exp(-(((Math.abs(x)-.042)/.019)**2+((y-.015)/.010)**2));}
  function faceZ(x:number,y:number){return .007+.086*Math.sqrt(Math.max(0,1-(x/headRx)**2-(y/.080)**2))+facialRelief(x,y);}
  for(let i=0;i<faceVertices.count;i++){
    const x=faceVertices.getX(i)*headRx,y=faceVertices.getY(i)*.080,z=faceVertices.getZ(i);
    faceVertices.setXYZ(i,x,headY+y,.007+z*.086+(z>0?facialRelief(x,y)*Math.min(1,z*3):0));
  }
  face.computeVertexNormals();s.add(face,faceColor);
  for(const sign of [-1,1]){
    s.oval(sign*(headRx-.002),headY-.008,-.002,.016,.044,.017,faceColor);
    const eyebrow=[[sign*.020,.026],[sign*.041,.033],[sign*.062,.025]];
    const eyelid=[[sign*.022,.014],[sign*.041,.014],[sign*.060,.012]];
    s.surface((u,v)=>{const x=sign*(.022+.038*u),y=.014+Math.sin(u*Math.PI)*.0045*(2*v-1);return [x,headY+y,faceZ(x,y)+.0007];},()=>ivory,24,6,sign<0);
    s.oval(sign*.041,headY+.014,faceZ(sign*.041,.014)+.0012,.0032,.002,.0011,dark,16);
    s.tube(eyebrow.map(([x,y])=>[x,headY+y,faceZ(x,y)+.001]),.0014,dark,24);
    s.tube(eyelid.map(([x,y])=>[x,headY+y,faceZ(x,y)+.001]),.0012,dark,24);
    s.tube([[sign*.022,.016],[sign*.041,.023],[sign*.060,.013]].map(([x,y])=>[x,headY+y,faceZ(x,y)+.0005]),.002,faceColor,24);
    s.oval(sign*.010,headY-.021,faceZ(sign*.010,-.021)-.001,.007,.004,.002,faceColor,16);
  }
  s.tube([[-.023,-.043],[-.010,-.040],[0,-.042],[.010,-.040],[.023,-.043]].map(([x,y])=>[x,headY+y,faceZ(x,y)+.002]),.0018,0x873d32,24);
  s.oval(0,headY-.049,faceZ(0,-.049),.015,.003,.002,0xa56645,20);
  s.oval(0,headY+.051,faceZ(0,.051),.004,.004,.002,0x63372d,12);
  if(main&&!mounted){
    // Dense spiral hair bosses sit on a cap; no pointed generic crown on the Buddhas.
    s.oval(0,headY+.063,-.012,headRx*.99,.035,.078,blue);
    s.oval(0,headY+.094,-.012,.040,.025,.038,blue);
    for(let row=0;row<7;row++)for(let i=0;i<36;i++){
      const a=(i+row*.5)*Math.PI/18,r=headRx*Math.cos(row*.17);
      s.oval(Math.cos(a)*r,headY+.048+row*.008,Math.sin(a)*r*.82-.007,.0045,.0045,.0045,blue,8);
    }
  }else{
    s.oval(0,headY+.052,-.018,.086,.083,.070,blue);
    if(form!=='donor'){
      s.surface((u,v)=>{const a=u*Math.PI*2,r=.078+.016*v,scallop=.015*Math.cos(a*5);return [Math.cos(a)*r,headY+.069+v*(.095+scallop),Math.sin(a)*r-.012];},()=>mounted?skin:robe,64,24,true);
      for(let l=0;l<2;l++)s.add(new T.TorusGeometry(.080+l*.004,.004,8,48).rotateX(Math.PI/2).translate(0,headY+.073+l*.044,-.012),edge);
      for(let k=-2;k<=2;k++){
        const x=k*.032,cy=headY+.132+(2-Math.abs(k))*.010,points:number[][]=[];
        for(let i=0;i<32;i++){const a=i/31*Math.PI*2.2,r=.016*(1-i/45);points.push([x+Math.cos(a)*r,cy+Math.sin(a)*r,.077]);}
        s.tube(points,.0022,edge,30);
      }
      for(let i=-2;i<=2;i++)s.oval(i*.038,headY+.112+(2-Math.abs(i))*.012,.044,.018,.016,.009,teal,12);
      for(const sign of [-1,1])s.tube([[sign*.09,headY+.09,0],[sign*.12,shoulder,.025],[sign*.15,hip+.06,.08]],.018,robe);
    }
  }
  if(mounted){
    s.oval(.22,hip-.10,.20,.09,.16,.085,robe);
    s.oval(.22,hip-.22,.23,.064,.025,.09,faceColor);
    s.tube([[-.28,shoulder+.14,.25],[-.22,shoulder-.02,.27],[.10,hip+.07,.27]],.010,form==='lion'?edge:blue,24);
    s.oval(-.28,shoulder+.14,.25,.031,.011,.019,teal,12);
  }
  if(form==='guardian'){
    for(const sign of [-1,1]){
      s.oval(sign*.17,.68,.01,.092,.056,.084,edge);
      s.box(sign*.07,.51,.117,.13,.18,.028,0x62695d);
      s.oval(sign*.072,.19,.088,.065,.11,.07,0x635547);
    }
    for(let row=0;row<4;row++)for(let col=-2;col<=2;col++)s.box(col*.047,.39-row*.027,.126,.043,.023,.018,row%2?edge:blue);
    s.tube([[-.16,.59,.12],[0,.57,.145],[.16,.59,.12]],.013,edge);
  }
  if(main&&!mounted){
    // Round head halo with an open scroll crest, as in the present-day photographs.
    const haloY=headY+.015,r=.18;
    s.add(new T.TorusGeometry(r,.017,8,64).translate(0,haloY,-.115),teal);
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8;s.tube([[Math.cos(a)*.165,haloY+Math.sin(a)*.165,-.115],[Math.cos(a)*.190,haloY+Math.sin(a)*.190,-.115]],.012,i%2?robe:edge,8);
    }
    // Connected openwork: each curled leaf grows from the preceding branch or halo.
    const crestBottom=haloY-.07,crestTop=haloY+.42;
    for(const sign of [-1,1]){
      s.tube([[sign*.17,crestBottom,-.13],[sign*.25,haloY+.10,-.13],[sign*.14,haloY+.29,-.13],[0,crestTop,-.13]],.0048,skin,50);
      for(let row=0;row<7;row++){
        const y=haloY-.045+row*.061,span=.22*(1-row/8),x=sign*span;
        const stalk=[[sign*.17,crestBottom,-.13],[sign*.20,y-.04,-.13],[x,y,-.13],[sign*Math.max(.025,span-.045),y+.047,-.13]];
        s.tube(stalk,.004,skin,30);
        for(let col=0;col<Math.max(1,3-Math.floor(row/3));col++){
          const cx=x-sign*col*.052,cy=y+col*.014,points=[[cx+sign*.025,cy+.050,-.13],[cx+sign*.031,cy+.017,-.13]];
          for(let i=0;i<=30;i++){const a=i/30*Math.PI*2.0,r=.026*(1-i/38);points.push([cx+sign*Math.cos(a)*r,cy+Math.sin(a)*r,-.13]);}
          s.tube(points,.0035,skin,34);
          s.tube([[x,y,-.13],[cx,cy-.024,-.13],[cx+sign*.031,cy+.017,-.13]],.0035,skin,16);
        }
      }
    }
    s.add(new T.TorusGeometry(.29,.011,7,64,Math.PI).rotateZ(0).translate(0,shoulder-.08,-.13),edge);
  }
  return s.finish();
}
