import { Mesh, MeshBasicMaterial, DoubleSide, Raycaster, Vector3, Euler, Matrix4 } from 'three';
import { geometry } from './geometry';
import { LOW_CEILING } from './low-ceiling-levels';
import type { Input } from './catalog';
import type { Layer, Part, Vec3 } from './types';

export type BracketStyle='outer'|'inner'|'interOuter'|'interInner'|'cornerOuter'|'cornerInner'|'innerSide';
export interface BracketContext {
  columnTop:number;
  innerCeilingLevel:number;
  innerCeilingHalfDepth:number;
  sideCeilingRun:number;
  add:(p:Input)=>Part;
  group:(id:string,name:string,layer:Layer,description:string)=>string;
  member:(id:string,name:string,assembly:string,layer:Layer,a:Vec3,b:Vec3,width:number,depth:number,stage:number,requires?:string[],shape?:Part['shape'],role?:string)=>Part;
}

export function buildBracket(ctx:BracketContext,id:string,label:string,x:number,z:number,angle:number,style:BracketStyle,support:string) {
  const {add,group,member,columnTop,innerCeilingLevel,innerCeilingHalfDepth,sideCeilingRun}=ctx;
  const assembly=group(id,label,'brackets',({outer:'双杪双下昂七铺作，第一与第三外跳偷心。',inner:'内槽向内四跳华栱，全偷心；后尾承明乳栿。',interOuter:'外檐补间双华栱，穿接柱头枋，不设栌斗。',interInner:'内槽补间朝内三跳；后尾短栱榫入枋面。',cornerOuter:'两正交面各双杪双昂；斜向两华栱、两角下昂、由昂与宝瓶。',cornerInner:'栌斗内三向栱交会；斜向出跳，上接梁与平棊。',innerSide:'内槽山面中柱三跳华栱，上部叠斗与翼形头。'})[style]);
  let n=0;
  const localParts=new Map<string,Part>();
  const partAliases:Record<string,string>={};
  const up:Vec3=[0,1,0];
  const dir:Vec3=[Math.sin(angle),0,Math.cos(angle)];
  const tangent:Vec3=[Math.cos(angle),0,-Math.sin(angle)];
  const pos=(a:number,y:number,b:number,d=dir,t=tangent):Vec3=>[x+t[0]*a+d[0]*b,columnTop+y,z+t[2]*a+d[2]*b];
  function piece(kind:string,shape:Part['shape'],point:Vec3,size:Vec3,deps:string[],yaw=0,insertion:Vec3=up,identity?:string) {
    const pid=identity?`${id}-${identity}`:`${id}-${String(n++).padStart(2,'0')}`;
    const p=add({id:pid,name:`${label} · ${kind}`,kind,assembly,layer:'brackets',shape,material:'wood',position:point,size,rotation:[0,yaw,0],insertion,stage:5+point[1]-columnTop,requires:deps,
      role:kind.includes('斗')?'斗口承接上层栱枋，将荷载传至对应的下层木件。':kind.includes('昂')?'斜置昂身利用内尾承压与外端出挑支承檐部。':kind.includes('枋')?'枋木沿柱列或檐部联结相邻铺作。':'按本攒的层序出跳、承托与联结相邻木件。',
      joint:shape==='dou'?'斗口为正交开放槽，方向对齐后落在对应栱或昂上。':shape==='gong'?'栱的槽口与正交构件搭接，跳头承斗。隐藏榫口按研究模型推定。':shape==='ang'?'沿昂身斜向装入；内尾由草乳栿上方承压约束。':'按对应承托节点复位；榫接尺寸为规则化推定。',
      explode:[(point[0]-x)*.65+(n%2?-.07:.07),.2+(point[1]-columnTop)*1.05,(point[2]-z)*.65]});
    localParts.set(p.id,p);return p;
  }
  const yawFor=(d:Vec3)=>Math.atan2(-d[2],d[0]);
  const isInter=style.startsWith('inter');
  let root=support;
  if(!isInter){
    root=piece('栌斗',`rootDou:${(style==='outer'||style==='cornerOuter'?.54:.57)*.25}`,[x,columnTop+.14,z],[.63,.36,.52],[support],angle).id;
    localParts.get(root)!.joint='柱头短榫进入栌斗底部盲卯，斗底承在柱肩；上方开放斗口承两向或三向栱。120mm柱榫、卯深与斗身分层为项目推定。';
  }
  const firstY=.252+.315/2;
  let center=root;
  const columnFangs:string[]=[];
  if(!isInter) {
    center=piece('泥道栱','gong',pos(0,firstY,0),[1.323,.315,.21],[root],yawFor(tangent)).id;
    // Local mortise-bearing segments represent the portion belonging to this bracket;
    // adjacent longitudinal lengths are generated separately between bracket endpoints.
    const levels=style==='outer'||style==='cornerOuter'?4:5;
    let lower={id:center,shape:'gong' as Part['shape'],length:1.323,y:firstY};
    for(let l=1;l<=levels;l++){
      const length=l%2?2.247:1.323,y=firstY+l*.441;
      const offset=Math.min(length,lower.length)/2-.13;
      // Solve the contact at the actual carved surfaces. Dou seats are at +.08h and soles at -.48h.
      const material=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster();
      const lowMesh=new Mesh(geometry(lower.shape,[lower.length,.315,.21]),material),highMesh=new Mesh(geometry('fangNode',[length,.315,.21]),material);
      lowMesh.scale.set(lower.length,.315,.21);highMesh.scale.set(length,.315,.21);lowMesh.updateMatrixWorld();highMesh.updateMatrixWorld();
      ray.set(new Vector3(offset,2,0),new Vector3(0,-1,0));const lowTop=ray.intersectObject(lowMesh)[0]!.point.y+lower.y;
      ray.set(new Vector3(offset,-2,0),new Vector3(0,1,0));const highBottom=ray.intersectObject(highMesh)[0]!.point.y+y;
      const height=(highBottom-lowTop)/.56;
      const seats=[-1,1].map(sign=>piece('柱头枋下散斗','dou',pos(sign*offset,lowTop+.48*height,0),[.29,height,.29],[lower.id],angle,up,`column-seat-${l}-${sign}`).id);
      material.dispose();
      const fang=piece(`第${l}层柱头枋节点`,'fangNode',pos(0,y,0),[length,.315,.21],seats,yawFor(tangent));
      fang.role='柱列上的枋木与隐栱轮廓同体，通过散斗逐层承托。隐栱不另计为独立木件。';
      fang.joint='与相邻长枋段衔接；节点分段、实际拼接位置与隐蔽榫口为规则化推定。';
      center=fang.id;columnFangs.push(center);lower={id:center,shape:'fangNode',length,y};
    }
  }
  const eaveSupports:string[]=[],luohanSupports:string[]=[],bullSupports:string[]=[],angTails:string[]=[];
  let pressureCap:string|undefined;
  const throughMembers:string[]=[];
  function transverse(kind:string,h:number,reach:number,length:number,dep:string,d=dir,t=tangent) {
    const g=piece(kind,'gongEndSeats',pos(0,h,reach,d,t),[length,.315,.21],[dep],yawFor(t)).id;
    const ends=[-1,1].map(sign=>piece('散斗','dou',pos(sign*(length/2-.13),h+.23,reach,d,t),[.29,.19,.29],[g]).id);
    return {g,ends};
  }
  function arm(kind:string,h:number,reach:number,length:number,dep:string,d=dir,t=tangent) {
    // Same set uses staggered half-lap seats; second member inserts horizontally.
    const g=piece(kind,'gong',pos(0,h,reach-length/2+.13,d,t),[length,.315,.21],[dep],yawFor(d),d).id;
    if(dep===root&&['outer','inner','innerSide'].includes(style)){const p=localParts.get(g)!;p.shape=`rootArm:${length/2-reach-.13}`;p.insertion=up;}
    const top=piece('交互斗','dou',pos(0,h+.24,reach,d,t),[.36,.19,.36],[g]).id;
    return {g,top};
  }
  function angled(kind:string,headRun:number,headY:number,tailRun:number,dep:string,d=dir,t=tangent) {
    if(kind.includes('下昂'))tailRun=headRun+.25-(2.772-.315/2-headY)/(21/47);
    // Ordinary grass beams press both ang tails. Extend the stock inward to
    // carve a finite horizontal shoulder at the beam underside.
    const ordinaryTail=style==='outer'&&kind.includes('下昂');
    if(ordinaryTail)tailRun-=.14;
    const head=pos(0,headY,headRun+.25,d,t),tail=pos(0,headY+(headRun+.25-tailRun)*21/47,tailRun,d,t);
    const pid=`${id}-${String(n++).padStart(2,'0')}`;
    const p=member(pid,`${label} · ${kind}`,assembly,'brackets',head,tail,.315*Math.cos(Math.atan(21/47)),.21,7+headY,[dep],'ang','下昂外端承托出挑部分，内尾受草乳栿压持；依2007图十取斜率21/47，固定水平位置的竖向昂高为15分。');
    if(ordinaryTail){
      p.shape=`seatedAng:${21/47}:${columnTop+2.772-p.position[1]}:0`;
      p.evidence={sources:['liang1937','dpm2007'],basis:'梁思成图417及原文：两层下昂后尾共同承托草乳栿。',inferred:'140mm水平尾肩由420mm草乳栿底面闭合；肩长和隐蔽切削为建模推定，未逐件实测。'};
    }
    p.kind=kind;p.insertion=[(tail[0]-head[0]),(tail[1]-head[1]),(tail[2]-head[2])];const norm=Math.hypot(...p.insertion);p.insertion=p.insertion.map(v=>v/norm) as Vec3;
    p.explode=[(p.position[0]-x)*.65,headY+1,(p.position[2]-z)*.65];
    localParts.set(p.id,p);return p.id;
  }
  function fitSeat(seat:Part,belowId:string,aboveId:string){
    const mat=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster();
    const surface=(id:string,above:boolean)=>{
      const p=localParts.get(id)!,m=new Mesh(geometry(p.shape,p.size),mat);
      m.position.set(...p.position);m.rotation.set(...p.rotation);m.scale.set(...p.size);m.updateMatrixWorld();
      ray.set(new Vector3(seat.position[0],columnTop+(above?20:-5),seat.position[2]),new Vector3(0,above?-1:1,0));
      return ray.intersectObject(m)[0]?.point.y;
    };
    const bottom=surface(belowId,true),top=surface(aboveId,false);mat.dispose();
    if(bottom===undefined||top===undefined||top<=bottom)throw new Error(`Invalid bearing ${seat.id}: ${bottom} -> ${top}, at ${seat.position}, below ${belowId}, above ${aboveId}`);
    seat.size[1]=(top-bottom)/.56;seat.position[1]=bottom+.48*seat.size[1];
    seat.evidence={...seat.evidence,sources:[...new Set([...seat.evidence.sources,'dpm2007'])],inferred:'斗高由上下木件的实际座面闭合求得；部位层序按对应研究图核查，座口与隐藏榫仍为教学推定。'};
  }
  function exterior(d:Vec3,t:Vec3,branch:string) {
    const a1=arm(`${branch}第一跳华栱`,firstY,.546,1.45,root,d,t);
    const a2=arm(`${branch}第二跳华栱`,firstY+.441,.987,1.83,a1.top,d,t);
    const gua=transverse('瓜子栱',firstY+.441+.44,.987,1.218,a2.top,d,t);
    const level=firstY+.441+.441+.44;
    const man=transverse('慢栱',level,.987,2.247,gua.g,d,t);
    luohanSupports.push(...man.ends);
    const luohanTop=level+.23+.19*.44+.21;
    const bullBottom=2.827125-.30;
    const bull=piece('牛脊枋下垫木','box',pos(0,(luohanTop+bullBottom)/2,.987,d,t),[.62,bullBottom-luohanTop,.21],man.ends,yawFor(t)).id;
    bullSupports.push(bull);
    const firstAng=angled(`${branch}第一层下昂`,1.428,1.205+(1.974-1.428)*21/47-.441,-1.0,a2.g,d,t);
    localParts.get(firstAng)!.requires=[gua.g];
    if(style==='outer'){
      // First ang enters before the next transverse/column-fang tier closes above it.
      localParts.get(man.g)!.requires.push(firstAng);
      localParts.get(columnFangs[3])!.requires.push(firstAng);
    }
    const tip1Part=piece('偷心跳头斗','dou',pos(0,1.20,1.428,d,t),[.36,.225,.36],[firstAng]),tip1=tip1Part.id;
    const secondAng=angled(`${branch}第二层下昂`,1.974,1.205,-1.0,tip1,d,t);
    fitSeat(tip1Part,firstAng,secondAng);
    tip1Part.shape='slopeDou';tip1Part.rotation[1]=yawFor(d);
    tip1Part.joint='上下座沿昂的斜面配合；倾斜座面按现有研究节点方向推定，斗耳和暗榫未逐件测绘。';
    angTails.push(firstAng,secondAng);
    const tip2Part=piece('昂头交互斗','dou',pos(0,level-.1735,1.974,d,t),[.38,.20,.38],[secondAng]),tip2=tip2Part.id;
    const ling=transverse('令栱',level,1.974,1.323,tip2,d,t);
    fitSeat(tip2Part,secondAng,ling.g);
    tip2Part.shape='slopeFootDou';tip2Part.rotation[1]=yawFor(d);
    tip2Part.joint='底座配合昂背斜面，顶部保留水平斗口承令栱；细部座口为教学推定。';
    const shua=piece('批竹耍头','ang',pos(0,level,1.974,d,t),[.672,.21,.21],[tip2],yawFor(d),d).id;
    localParts.get(shua)!.evidence={...localParts.get(shua)!.evidence,inferred:'耍头保留原出头端，内尾按下方昂背净空收短至672mm；尺寸和与令栱的配对槽口为项目推定。'};
    const replacement=piece('替木','box',pos(0,2.097,1.974,d,t),[2.604,.12,.22],ling.ends,yawFor(t)).id;
    eaveSupports.push(replacement);
    void man;void shua;return replacement;
  }
  let outerTop=center,innerTop=center;let diagonalTop:string|undefined;
  if(style==='outer')outerTop=exterior(dir,tangent,'');
  else if(style==='inner'||style==='innerSide') {
    const count=style==='inner'?4:3;let previous=root;
    for(let j=0;j<count;j++)previous=arm(`第${j+1}跳华栱（偷心）`,firstY+j*.441,.546+j*.441,1.55,previous).top;
    if(style==='innerSide') {
      const thirdJump=1.428;
      let headY=firstY+3*.441;
      for(let j=0;j<2;j++){
        const head=piece(j===0?'山面六分头':'山面批竹头',j===0?'bracketHead:sixfen':'bracketHead:pizhu',pos(0,headY,thirdJump-1.87/2+.25),[1.87,.315,.21],[previous],yawFor(dir),up,j===0?'sixfen-head':'pizhu-head').id;
        const below=localParts.get(previous)!;fitSeat(below,below.requires[0],head);
        previous=piece('山面叠斗','dou',pos(0,headY+.315/2+.225*.48,thirdJump),[.34,.225,.34],[head]).id;
        headY+=.441;
      }
      // Sixth-layer axial wing head and transverse small wing remain distinct wood members.
      const smallWing=piece('山面第六层小翼形栱','gong',pos(0,headY,thirdJump),[1.12,.315,.21],[previous],yawFor(tangent)).id;
      const axialWing=piece('山面第六层翼形头','bracketHead:wing',pos(0,headY,thirdJump-1.87/2+.25),[1.87,.315,.21],[previous,smallWing],yawFor(dir),up,'wing-head').id;
      const lowerSeat=localParts.get(previous)!;fitSeat(lowerSeat,lowerSeat.requires[0],axialWing);
      const topDou=piece('山面上层交互斗','dou',pos(0,headY+.315/2+.225*.48,thirdJump),[.34,.225,.34],[axialWing],angle,up,'upper-seat').id;
      const seventhY=headY+.441;
      const seventh=piece('山面第七层华栱','gongEndSeats',pos(0,seventhY,thirdJump),[1.352,.315,.21],[topDou],yawFor(dir),up,'seventh-arm').id;
      const ling=piece('山面第七层令栱','gongUpperEndSeats',pos(0,seventhY,thirdJump),[1.323,.315,.21],[seventh],yawFor(tangent),up,'seventh-ling').id;
      // These are shared building members, visible in both the whole hall and this study.
      // Their subdivision and section are inferred; both directions retain real seats.
      const cross=piece('山面横向平棊枋段','ceilingRail',pos(0,innerCeilingLevel,thirdJump),[innerCeilingHalfDepth*2,.16,.21],[],yawFor(tangent),up,'ceiling-transverse');
      const axial=piece('山面纵向平棊枋段','ceilingSpan',pos(0,innerCeilingLevel,(thirdJump+sideCeilingRun)/2),[sideCeilingRun-thirdJump,.16,.21],[],yawFor(dir),up,'ceiling-axial');
      for(const sign of [-1,1]){
        const seat=piece('山面令栱上散斗','dou',pos(sign*.5315,seventhY+.23,thirdJump),[.29,.19,.29],[ling],angle,up,`ceiling-seat-${sign}`);
        fitSeat(seat,ling,cross.id);cross.requires.push(seat.id);
      }
      const forward=piece('山面新跳头平棊斗','dou',pos(0,seventhY+.23,thirdJump+.546),[.29,.19,.29],[seventh],angle,up,'ceiling-forward-seat');
      fitSeat(forward,seventh,axial.id);axial.requires=[forward.id,cross.id];
      const oldTop=localParts.get(topDou)!;fitSeat(oldTop,axialWing,seventh);
      for(const p of localParts.values())if(p.id.includes('head')||p.id.includes('seventh')||p.id.includes('ceiling')||p.id===smallWing||p.kind==='山面叠斗'){
        p.evidence={sources:['liang1937','dpm2007','cao2005'],basis:'梁思成内槽山面中柱铺作图：三跳偷心，第四至六层连续杆身出不同头，第六层另有小翼形栱，第七层华栱/令栱交叉，分别承接两向平棊。',inferred:'441mm层差用作研究模数初值；跳距、斗高、头部控制点、平棊枋分段和互补槽口为项目推定，尚无这些木件的逐件实测表。'};
      }
      previous=seventh;
    }
    innerTop=previous;
  } else if(style==='interOuter') {
    const a=arm('补间第一跳华栱',firstY+.441,.546,1.58,support);
    const wing=transverse('翼形栱',firstY+.441+.44,.546,1.14,a.top);
    const b=arm('补间第二跳华栱',firstY+.882,.987,1.65,a.top);
    const ling=transverse('补间令栱',firstY+.882+.44,.987,1.323,b.top);
    const shua=piece('批竹耍头','interShua',pos(0,firstY+.882+.44,0),[2*(.987+.28),.21,.21],[b.top],yawFor(dir),up);
    outerTop=piece('补间承罗汉枋短木','box',pos(0,2.0109,.987),[1.52,.0684,.21],ling.ends,yawFor(tangent)).id;
    // Liang's exterior intercolumn section (image 439): the two gong and shuatou
    // pass through the column-fang line. Rear first jump is touxin, with no wing.
    for(const [pid,y,reach] of [[a.g,firstY+.441,.546],[b.g,firstY+.882,.987]] as const){
      const p=localParts.get(pid)!;p.position=pos(0,y,0);p.size[0]=2*(reach+.13);p.shape='gongUpperEndSeats';p.insertion=up;
    }
    const rearFirst=piece('后尾第一跳斗','dou',pos(0,firstY+.441+.24,-.546),[.36,.19,.36],[a.g],angle,up,'rear-first-dou');
    const rearSecond=piece('后尾第二跳斗','dou',pos(0,firstY+.882+.24,-.987),[.36,.19,.36],[b.g],angle,up,'rear-second-dou');
    const rearLing=piece('后尾令栱','gongEndSeats',pos(0,LOW_CEILING.ling,-.987),[1.323,.315,.21],[rearSecond.id],yawFor(tangent),up,'rear-ling');
    localParts.get(b.g)!.requires.push(rearFirst.id,wing.g);
    // Slide the span into the open line before the projecting members close its side.
    for(const p of [localParts.get(a.top)!,localParts.get(wing.g)!,rearFirst])p.requires.push(support.replace(/-1$/,'-2'));
    for(const p of [localParts.get(b.top)!,rearSecond,localParts.get(ling.g)!,rearLing])p.requires.push(support.replace(/-1$/,'-3'));
    for(const sign of [-1,1])piece('后尾平棊枋下斗','dou',pos(sign*(1.323/2-.13),LOW_CEILING.headCenter,-.987),[.29,.19,.29],[rearLing.id,shua.id],angle,up,`rear-head-${sign}`);
    fitSeat(localParts.get(a.top)!,a.g,wing.g);fitSeat(rearFirst,a.g,b.g);
    fitSeat(localParts.get(b.top)!,b.g,ling.g);fitSeat(rearSecond,b.g,rearLing.id);
    throughMembers.push(a.g,b.g,shua.id);
    for(const p of localParts.values())p.evidence={sources:['liang1937','cao2005','dpm2007'],basis:'梁思成外檐补间详图：两华栱及耍头前后贯通，后尾第一跳偷心、第二跳上施令栱与承平棊小斗。',inferred:'前后跳距、连续木件轮廓、斗高和柱头枋隐蔽交口按图式协调推定；低平棊连续枋及周边斜收口为规则化表达，具体交接缺少逐件实测。'};
  } else if(style==='interInner') {
    const front=[];let previous=support;
    for(let j=0;j<3;j++){const a=arm(`补间第${j+1}跳华栱`,firstY+(3+j)*.441,.546+j*.441,1.25+j*.30,previous);front.push(a);previous=a.top;}
    const first=localParts.get(front[0].g)!;
    first.shape='innerThrough';first.position=pos(0,firstY+3*.441,-.2955);first.size=[1.943,.315,.21];first.insertion=up;
    const rear=[];
    for(let j=0;j<2;j++){
      const reach=.546+j*.441,length=reach+.13-.035;
      rear.push(piece('后尾丁头短栱','rearShort',pos(0,firstY+(1+j)*.441,-.035-length/2),[length,.315,.21],[support.replace(/-3$/,`-${j+1}`)],yawFor(dir),dir.map(v=>-v) as Vec3));
    }
    const rearFirst=piece('后尾第一跳斗','dou',pos(0,firstY+.441+.24,-.546),[.36,.19,.36],[rear[0].id],angle,up,'rear-first-dou');
    const rearSecond=piece('后尾第二跳斗','dou',pos(0,firstY+2*.441+.24,-.987),[.36,.19,.36],[rear[1].id],angle,up,'rear-second-dou');
    rear[1].requires.push(rearFirst.id);
    for(const p of rear)p.joint='从外槽一侧水平插入本层枋面盲卯；根部70mm短榫与2mm总间隙为推定，背壁保持封闭。';
    const rearLing=piece('后尾令栱','gongEndSeats',pos(0,LOW_CEILING.ling,-.987),[1.323,.315,.21],[rearSecond.id],yawFor(tangent),up,'rear-ling');
    const frontLing=piece('内补间最高令栱','gongEndSeats',pos(0,firstY+6*.441,1.428),[1.323,.315,.21],[front[2].top],yawFor(tangent),up,'front-ling');
    for(const sign of [-1,1]){
      piece('后尾平棊枋下斗','dou',pos(sign*.5315,LOW_CEILING.headCenter,-.987),[.29,.19,.29],[rearLing.id,first.id],angle,up,`rear-head-${sign}`);
      const bottom=firstY+6*.441+.23-.19*.48,ceilingBottom=innerCeilingLevel-.08,height=(ceilingBottom-bottom)/.56;
      piece('高平棊枋下斗','dou',pos(sign*.5315,bottom+.48*height,1.428),[.29,height,.29],[frontLing.id],angle,up,`front-head-${sign}`);
    }
    fitSeat(rearFirst,rear[0].id,rear[1].id);fitSeat(rearSecond,rear[1].id,rearLing.id);
    for(let j=0;j<3;j++)fitSeat(localParts.get(front[j].top)!,front[j].g,j<2?front[j+1].g:frontLing.id);
    for(let j=0;j<2;j++)localParts.get(front[j].top)!.requires.push(support.replace(/-3$/,`-${j+4}`));
    throughMembers.push(...front.map(a=>a.g));innerTop=frontLing.id;
    for(const p of localParts.values())p.evidence={sources:['liang1937','dpm2007','cao2005'],basis:'梁内槽补间详图：前面自第三层枋起三跳；后尾前两层为入枋面丁头短栱，第三层与正面第一华栱贯通作耍头；前后最高令栱分别承高低平棊。',inferred:'跳距、斗高、70mm丁头榫及隐蔽槽口按图式协调推定，尚无逐件实测；高低平棊长枋和峻脚接入继续单独核查。'};
  } else if(style==='cornerOuter') {
    const u:Vec3=[Math.sign(x),0,0],v:Vec3=[0,0,Math.sign(z)];
    exterior(u,v,'山面');exterior(v,u,'檐面');
    const d:Vec3=[Math.sign(x)/Math.SQRT2,0,Math.sign(z)/Math.SQRT2],t:Vec3=[d[2],0,-d[0]];
    let previous=root;
    for(let j=0;j<2;j++)previous=arm('斜向角华栱',firstY+j*.441,(.546+j*.441)*Math.SQRT2,2.05,previous,d,t).top;
    const cornerSlope=21/47/Math.SQRT2,tailCap=2.982-.42/2;
    const firstHead=1.205+(1.974-1.428)*21/47-.441;
    const diagonalAng=(kind:string,run:number,height:number,dep:string,platform=false)=>{
      const headRun=(run+.25)*Math.SQRT2;
      const shoulder=platform?.4:.14;
      const tailRun=headRun-(tailCap-.315/2-height)/cornerSlope-shoulder;
      const tailY=height+(headRun-tailRun)*cornerSlope;
      const head=pos(0,height,headRun,d,t),tail=pos(0,tailY,tailRun,d,t),pid=`${id}-${String(n++).padStart(2,'0')}`;
      const p=member(pid,`${label} · ${kind}`,assembly,'brackets',head,tail,.315*Math.cos(Math.atan(cornerSlope)),.21,7+height,[dep],'ang');
      p.kind=kind;p.insertion=up;p.shape=`seatedAng:${cornerSlope}:${columnTop+tailCap-p.position[1]}:${platform?1:0}`;
      p.role=platform?'穿过角端交手令栱，头部雀台经宝瓶承角梁，完整内尾受角草栿压持。':'外端穿角部交手栱向外出挑，完整内尾伸至角草栿下，将外角与内槽梁架联系起来。';
      p.evidence={sources:['liang1937','dpm2007','cao2005','qi2021'],basis:'两角下昂及由昂具有连续内尾，分别受同一角向草栿压持；各层经过角部交手节点。',inferred:'头轴与正面对应层等高，柱心交会高度相同，由两端求角坡；315mm竖向截面、两角下昂140mm/由昂400mm水平尾肩、雀台轮廓及暗口为建模推定，未取得角昂实测详图。'};
      p.joint='整体从上落入开放交口；尾部水平肩承草栿；由昂肩跨过草栿角端的既有退让，肩及雀台与昂身同木。隐藏直榫及余下交会节点继续单独核查。';
      localParts.set(p.id,p);angTails.push(p.id);return p.id;
    };
    previous=diagonalAng('第一层角下昂',1.428,firstHead,previous);
    previous=diagonalAng('第二层角下昂',1.974,1.205,previous);
    n++; // Old third generic angle is superseded by the continuous you-ang.
    const you=diagonalAng('由昂',2.52,1.205+.441-.546*21/47,previous,true);
    partAliases[`${id}-52`]=you;
    diagonalTop=piece('角梁下宝瓶','vase',pos(0,2.41,2.52*Math.SQRT2,d,t),[.32,.6,.32],[you]).id;outerTop=diagonalTop;
    const upperY=firstY+.441+.441+.44,upperRun=1.974*Math.SQRT2;
    const flatDou=piece('角端平盘斗','dou',pos(0,upperY-.24,upperRun,d,t),[.38,.2,.38],[`${id}-51`],0,up,'corner-upper-dou');
    const cornerLing=[u,v].map((axis,i)=>piece('角端交手令栱','gongSolidEndSeats',pos(0,upperY,upperRun,d,t),[1.323,.315,.21],[flatDou.id],yawFor(axis),up,`corner-upper-ling-${i?'z':'x'}`));
    fitSeat(flatDou,`${id}-51`,cornerLing[0].id);
    flatDou.shape=`cornerFootDou:${-d[0]*cornerSlope}:${-d[2]*cornerSlope}`;
    localParts.get(you)!.requires.push(...cornerLing.map(p=>p.id));
    for(const [replacementId,direction,ling] of [['25',v,cornerLing[1]],['45',u,cornerLing[0]]] as const){
      const replacement=localParts.get(`${id}-${replacementId}`)!,extra=1.974+.5315+.13-replacement.size[0]/2;
      replacement.requires.push(you);
      replacement.position[0]+=direction[0]*extra/2;replacement.position[2]+=direction[2]*extra/2;replacement.size[0]+=extra;
      for(const sign of [-1,1]){
        const point=[...ling.position] as Vec3;point[0]+=direction[0]*sign*.5315;point[2]+=direction[2]*sign*.5315;
        const seat=piece('角端替木下斗','dou',point,[.29,.2,.29],[ling.id],0,up,`corner-upper-seat-${replacementId}-${sign}`);
        fitSeat(seat,ling.id,replacement.id);replacement.requires.push(seat.id);
      }
      for(const end of replacementId==='25'?['22','23']:['42','43'])fitSeat(localParts.get(`${id}-${end}`)!,`${id}-${replacementId==='25'?'21':'41'}`,replacement.id);
      replacement.evidence={sources:['liang1937','qi2021'],basis:'正侧两面上承枋延至角端交手令栱处，共同承檐部。',inferred:'同木延伸、角端总长、两枋交口及斗座按现有轴位推定，纵向连接另行核查。'};
    }
    for(const p of localParts.values())if(p.id.includes('-corner-upper-'))p.evidence={sources:['liang1937','cao2005','qi2021'],basis:'角端承斗上两向令栱交手，由昂从交会中通过，上承檐部枋木。',inferred:'平盘斗详形、令栱长短、三向开口及斗高按现有承面协调推定，未取得逐件实测图。'};
    // Three axes, one timber per axis and level. Explicit corner-specific ownership
    // avoids stacking a generic mud/F1 segment over the collinear projecting arm.
    const A=localParts.get(`${id}-06`)!,B=localParts.get(`${id}-26`)!,D=localParts.get(`${id}-46`)!;
    const A2=localParts.get(`${id}-08`)!,B2=localParts.get(`${id}-28`)!;
    partAliases[`${id}-01`]=A.id;partAliases[`${id}-02`]=A2.id;
    A.role='山面第一跳华栱与另一立面所见泥道栱共用这一木件；一木关系为当前分件推定。';
    for(const p of [A2,B2])p.role='第二跳华栱兼角柱局部柱头枋；两正交向保持独立，相邻长枋接头缺少逐件测绘依据。';
    for(const p of [A,B]){p.position=pos(0,firstY,0);p.size[0]=1.352;p.shape='gongSolidEndSeats';p.insertion=up;}
    for(const p of [A2,B2]){p.position=pos(0,firstY+.441,0);p.size[0]=2.247;p.shape='fangNode';p.insertion=up;}
    D.shape='gongSolidEndSeats';D.insertion=up;
    localParts.get(root)!.shape=`rootDou:${.54*.25}:diagonal:${Math.sign(d[0]*d[2])}`;
    const outA=localParts.get(`${id}-07`)!,outB=localParts.get(`${id}-27`)!;
    const oldASeats=[-1,1].map(sign=>localParts.get(`${id}-column-seat-1-${sign}`)!);
    const outward=oldASeats.find(p=>(p.position[0]-x)*Math.sign(x)>0)!,inward=oldASeats.find(p=>p!==outward)!;
    partAliases[outward.id]=outA.id;inward.requires=[A.id];
    const insideB=piece('柱头枋下散斗','dou',[x,columnTop+.67,z-Math.sign(z)*.5315],[.29,.2,.29],[B.id],0,up,'column-seat-1-z-in');
    A2.requires=[outA.id,inward.id];B2.requires=[outB.id,insideB.id];
    for(const seat of [outA,inward])fitSeat(seat,A.id,A2.id);
    for(const seat of [outB,insideB])fitSeat(seat,B.id,B2.id);
    for(const sign of [-1,1])fitSeat(localParts.get(`${id}-column-seat-2-${sign}`)!,A2.id,`${id}-03`);
    fitSeat(localParts.get(`${id}-09`)!,A2.id,`${id}-10`);
    fitSeat(localParts.get(`${id}-29`)!,B2.id,`${id}-30`);
    localParts.get(`${id}-47`)!.rotation=[0,yawFor(d),0];
    // Each cross-gong continues beyond the diagonal crossing as the next facade's
    // first/second projecting arm. The ordinary-facing half remains unchanged.
    for(const [gId,manId,lowHead,highHead,direction] of [['10','13','12','15',v],['30','33','32','35',u]] as const){
      const gua=localParts.get(`${id}-${gId}`)!,man=localParts.get(`${id}-${manId}`)!;
      const basePoint=[...gua.position] as Vec3;
      for(const [p,base,reach] of [[gua,1.218,1.428],[man,2.247,1.974]] as const){
        const extra=reach+.13-base/2;p.position[0]+=direction[0]*extra/2;p.position[2]+=direction[2]*extra/2;
        p.size[0]=base+extra;p.shape=`cornerGong:${base}:${reach}`;p.insertion=up;
        p.role+=' 向毗连立面连续伸出为华栱，尾端承单斗；整木同时承担两立面的作用。';
        p.evidence={sources:['liang1937','cao2005','qi2021'],basis:'梁转角条文及祁2021研究支持鸳鸯交手瓜/慢栱越过角交点延续为毗面华栱两跳。',inferred:'保留朝普通开间的出头位置，慢栱在散斗承位保留足材腹部；尾跳采用正身第三/四跳1.428m与1.974m，隐藏交手口和承面为项目推定。'};
      }
      const low=localParts.get(`${id}-${lowHead}`)!,high=localParts.get(`${id}-${highHead}`)!;
      low.position[0]=basePoint[0]+direction[0]*1.428;low.position[2]=basePoint[2]+direction[2]*1.428;
      high.position[0]=basePoint[0]+direction[0]*1.974;high.position[2]=basePoint[2]+direction[2]*1.974;
      for(const seatId of [String(Number(lowHead)-1).padStart(2,'0'),lowHead]){const seat=localParts.get(`${id}-${seatId}`)!;fitSeat(seat,gua.id,man.id);man.requires.push(seat.id);}
      // The high tail stands beside the adjoining facade's ling-gong under its timu.
      fitSeat(high,man.id,`${id}-${gId==='10'?'45':'25'}`);
      localParts.get(`${id}-${gId==='10'?'45':'25'}`)!.requires.push(high.id);
      gua.requires.push(`${id}-49`);
    }
    for(const p of [A,B,D,A2,B2])p.evidence={sources:['liang1937','cao2005'],basis:'梁转角条文与曹多向节点研究支持三向栱列及互补交会。',inferred:'泥道栱及第一层柱头枋局部各归入同轴华栱、1.352m与2.247m整木长度、槽深及斗高为明确分件推定，尚无本节点暗缝实测。'};
    // Restore both column-line directions. The upper two corner ends continue
    // inward along their own column rows and are bevelled below the face angs.
    const faceFangs:[Part[],Part[]]=[[],[]];
    for(const [axisIndex,axis] of [u,v].entries())for(const level of [2,3,4]){
      const old=localParts.get(`${id}-${String(level+1).padStart(2,'0')}`)!;
      const fullLength=level%2?2.247:1.323,half=level>=3;
      const fang=axisIndex?piece(`第${level}层柱头枋节点`,'fangNode',pos(0,firstY+level*.441,0),[fullLength,.315,.21],[],yawFor(axis),up,`corner-fang-z-${level}`):old;
      fang.rotation=[0,yawFor(axis),0];fang.size=[half?fullLength/2:fullLength,.315,.21];
      fang.position=pos(0,firstY+level*.441,half?-fullLength/4:0,axis,axisIndex?u:v);fang.insertion=up;
      const angColumn=firstHead+(1.428+.25)*21/47+(level===4?.441:0);
      fang.shape=`cornerFang:${fullLength}:${angColumn-.315/2-(firstY+level*.441)}:${half?1:0}`;
      fang.evidence={sources:['liang1937','qi2021'],basis:'转角两柱列的枋各自连续，柱心端局部削斜，与正侧昂及另一轴构件分别交会。',inferred:'保留已有柱间分界，F3/F4取向内半段及削斜端；端部斜接预留0.2mm装配间隙；截面、分件位置和隐藏榫均为建模推定。'};
      faceFangs[axisIndex].push(fang);
    }
    for(const [axisIndex,axis] of [u,v].entries()){
      const fangs=faceFangs[axisIndex],lower=axisIndex?B2:A2;
      for(const level of [2,3,4]){
        const fang=fangs[level-2],below=level===2?lower:fangs[level-3];fang.requires=[];
        for(const direction of [-1,1]){
          const sign=direction*Math.sign(x)*Math.sign(z);
          const oldId=`${id}-column-seat-${level}-${sign}`;
          if(level>=3&&direction>0){if(!axisIndex)partAliases[oldId]=fang.id;continue;}
          const seat=axisIndex?piece('柱头枋下散斗','dou',pos(0,firstY+level*.441-.2,direction*.5315,axis,u),[.29,.2,.29],[below.id],0,up,`corner-fang-seat-z-${level}-${direction}`):localParts.get(oldId)!;
          seat.requires=[below.id];fitSeat(seat,below.id,fang.id);fang.requires.push(seat.id);
          if(level===4){seat.rotation=[0,0,0];seat.shape=`cornerFootDou:${-axis[0]*21/47}:${-axis[2]*21/47}`;}
        }
      }
      for(const [suffix,run,height,cap] of [[axisIndex?'37':'17',1.428,firstHead,firstY+4*.441-.315/2],[axisIndex?'39':'19',1.974,1.205,2.9295-.315/2]] as const){
        const p=localParts.get(`${id}-${suffix}`)!,tailRun=run+.25-(cap-.315/2-height)/(21/47)-.14;
        const h=pos(0,height,run+.25,axis,u),end=pos(0,height+(run+.25-tailRun)*21/47,tailRun,axis,u);
        const start=new Vector3(...h),delta=new Vector3(...end).sub(start),along=delta.clone().normalize(),across=along.clone().cross(new Vector3(0,1,0));
        const e=new Euler().setFromRotationMatrix(new Matrix4().makeBasis(along,across.clone().cross(along).normalize(),across.normalize()));
        p.position=start.addScaledVector(delta,.5).toArray() as Vec3;p.rotation=[e.x,e.y,e.z];p.size=[delta.length(),.315*Math.cos(Math.atan(21/47)),.21];p.insertion=up;
        p.shape=`seatedAng:${21/47}:${columnTop+cap-p.position[1]}:0`;
        p.requires.push(...faceFangs.map(row=>row[suffix==='17'||suffix==='37'?1:2].id));
        p.evidence={sources:['liang1937','dpm2007','qi2021'],basis:'转角正侧第一昂经削斜F3到毗面F4下，第二昂经F4到压槽枋下；普通柱头保留草乳栿承尾。',inferred:'保持正面头轴和21/47参考坡率，140mm水平尾肩及具体暗口为建模推定。'};
      }
      fangs[2].requires.push(`${id}-${axisIndex?'37':'17'}`);
      localParts.get(`${id}-${axisIndex?'33':'13'}`)!.requires.push(`${id}-${axisIndex?'37':'17'}`);
      fitSeat(localParts.get(`${id}-${axisIndex?'38':'18'}`)!,`${id}-${axisIndex?'37':'17'}`,`${id}-${axisIndex?'39':'19'}`);
      fitSeat(localParts.get(`${id}-${axisIndex?'40':'20'}`)!,`${id}-${axisIndex?'39':'19'}`,`${id}-${axisIndex?'41':'21'}`);
    }
    for(const row of faceFangs)row[1].requires.push(...faceFangs.map(row=>row[0].id));

  } else {
    const d:Vec3=[-Math.sign(x)/Math.SQRT2,0,-Math.sign(z)/Math.SQRT2],t:Vec3=[d[2],0,-d[0]];
    // Capital block: two orthogonal short timbers and the separate diagonal timber.
    const mud=localParts.get(`${id}-01`)!;mud.shape='gongSolidEndSeats';
    const cross=piece('内角第二正向栱','gongSolidEndSeats',pos(0,firstY,0),[1.323,.315,.21],[root],yawFor(dir),up,'root-b');
    const bowl=localParts.get(root)!;bowl.shape=`rootDou:${.57*.25}:diagonal:${Math.sign(d[0]*d[2])}`;
    let previous=root;
    for(let j=0;j<2;j++){
      const a=arm('内角斜华栱',firstY+j*.441,(.48+j*.4)*Math.SQRT2,1.85,previous,d,t);
      if(j===0){const p=localParts.get(a.g)!;p.shape='gongSolid';p.insertion=up;}
      previous=a.top;
    }
    for(const p of [mud,cross,bowl,localParts.get(`${id}-07`)!])p.evidence={sources:['liang1937','cao2005'],basis:'Cao图4-76及梁内角详图支持栌斗内两正交向与斜向木件交会。',inferred:'215mm斜槽、三向错口与分层厚度为推定装配方案，未作为原物隐蔽节点实测。'};
    previous=piece('内角翼形头','gong',pos(0,1.2632,1.2445079348883237,d,t),[1.22,.315,.21],[previous],yawFor(t)).id;
    previous=piece('内角叠斗','dou',pos(0,1.5167,1.2445079348883237,d,t),[.35,.2,.35],[previous]).id;
    innerTop=arm('内角上层华栱',1.6902,1.82,1.65,previous,d,t).top;
    diagonalTop=innerTop;
  }
  if(style==='outer'||style==='cornerOuter')pressureCap=piece('压槽枋节点','box',pos(0,2.9295,0),[.72,.315,.21],angTails,yawFor(tangent)).id;
  if(style==='cornerOuter')piece('压槽枋节点','box',pos(0,2.9295,0),[.72,.315,.21],angTails,yawFor([0,0,Math.sign(z)]),up,'corner-pressure-z');
  return {assembly,last:center,top:columnTop+2.3,outerTop,innerTop,diagonalTop,eaveSupports,luohanSupports,bullSupports,angTails,pressureCap,columnFangs,throughMembers,partAliases};
}
