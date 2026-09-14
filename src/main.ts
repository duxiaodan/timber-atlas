import {bindSectionRange} from './section/range-interaction';
import {createSectionPanel} from './section/panel';
import './style.css';
import {currentLanguage,englishText,romanization,setLanguage,localize} from './i18n/locale';
import {bootStep,bootProgress,bootActivity,bootPaint} from './boot-progress';
import {runWork} from './work-batches';
import { createCatalogAsync, GRID_X, GRID_Z } from './model/catalog';
import { type Layer, type Part } from './model/types';
import {productCatalog,productLayers,readProductFeatures} from './product-features';
import { geometry } from './model/geometry';
import {studyMemberIds,localPracticeMemberIds,fixedStudyContextIds} from './model/study-scope';
import { HallViewer } from './viewer';
import {StudyLocator} from './study-locator';
import {isPracticePart} from './model/practice-material';
import { type Session, checkPlacement, completePlacement, initialSession, lessonKey, restoreSession, SAVE_KEY, startPractice } from './state';

await bootStep(1,'catalog');
const features=readProductFeatures({VITE_ALTAR_STATUES:import.meta.env.VITE_ALTAR_STATUES});
const LAYERS=productLayers(features);
const catalog=productCatalog(await createCatalogAsync((done,total)=>bootProgress('catalog',done,total)),features);
await bootPaint();
const {installRoofSculptures}=await import('./model/roof-sculptures');
await installRoofSculptures(catalog);
const byId=new Map(catalog.parts.map(p=>[p.id,p]));
const assemblyById=new Map(catalog.assemblies.map(a=>[a.id,a]));
bootActivity('index');await bootPaint();
const expandableStudies=new Set<string>();
await runWork((function*(){for(const a of catalog.assemblies){const local=new Set(studyMemberIds(catalog,a));if(studyMemberIds(catalog,a,true).some(id=>!local.has(id)))expandableStudies.add(a.id);yield null;}})(),catalog.assemblies.length);
let saved:string|null=null;try{saved=localStorage.getItem(SAVE_KEY);}catch{}
let state=restoreSession(saved,catalog);
let query='';let catalogPage=0;let showCatalog=false;let toastTimer=0;let saveTimer=0;let savingAvailable=true;
const app=document.querySelector<HTMLDivElement>('#app')!;
const esc=(v:unknown)=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const icon=(name:string,size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${({
  layers:'<path d="m12 3 10 5-10 5L2 8Z"/><path d="m2 12 10 5 10-5M2 16l10 5 10-5"/>',
  home:'<path d="m3 10 9-7 9 7M5 9v11h14V9M10 20v-7h4v7"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  focus:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="4"/>',
  explode:'<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/>',
  rotate:'<path d="M20 8A8 8 0 1 0 20 16M20 3v5h-5"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  book:'<path d="M12 5C8 2 4 3 2 4v15c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Zm0 0v15"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  reset:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7"/>',
  hide:'<path d="m3 3 18 18M10 5c5-1 10 4 12 7l-3 4M6 6c-2 2-4 6-4 6s4 7 10 7l4-1"/>',
  chevron:'<path d="m9 5 7 7-7 7"/>',
  save:'<path d="M5 3h12l4 4v14H3V3h2Zm2 0v6h10V3M7 21v-8h10v8"/>',
} as Record<string,string>)[name]??'<circle cx="12" cy="12" r="7"/>'}</svg>`;

await bootStep(2,'groups');
app.innerHTML=`
<header class="topbar">
  <a class="brand" href="#" data-action="home" aria-label="返回整座东大殿"><img src="/icon.svg" alt=""/><div><h1 data-i18n-preserve>木构图志 · Timber Atlas</h1><p>佛光寺东大殿</p></div></a>
  <div class="header-facts"><span>山西 · 五台山</span><i></i><span>七间四进深 · 单檐庑殿顶</span></div>
  <nav class="top-actions" aria-label="学习模式"><div class="language-switch" role="group" aria-label="Language / 语言" data-i18n-preserve><button data-language="zh-CN" lang="zh-CN" aria-pressed="${currentLanguage()==='zh-CN'}">中文</button><button data-language="en" lang="en" aria-pressed="${currentLanguage()==='en'}">EN</button></div><button data-action="explore" id="explore-tab" class="mode active">${icon('eye')}自由观察</button><button data-action="practice" id="practice-tab" class="mode">${icon('book')}引导拼装</button><button data-action="about" class="icon-button" title="资料与操作说明" aria-label="资料与操作说明">${icon('info')}</button></nav>
</header>
<main class="workspace">
  <aside class="sidebar left-panel" aria-label="建筑结构导航">
    <div class="panel-title"><span>建筑结构</span><span class="label-en">STRUCTURE</span></div>
    <button class="whole-building" data-action="home">${icon('home',21)}<span>佛光寺东大殿<small id="total-count"></small></span>${icon('chevron',15)}</button>
    <div class="section-heading">结构层级<button data-action="structure" title="隐藏屋面与围护">查看木构</button></div>
    <div class="layer-visibility-actions" role="group" aria-label="结构层显隐"><button data-action="show-all-layers">${icon('eye',14)}全部显示</button><button data-action="hide-all-layers">${icon('hide',14)}全部隐藏</button></div>
    <div id="layer-list" class="layers"></div>
    <div class="section-heading">局部研习<span>选择一组独立观察</span></div>
    <div class="studies">
      <button data-scope="outer-bracket-3-4"><span class="study-mark">01</span><span>外檐柱头斗拱<small>双杪双下昂 · 第一、三跳偷心</small></span>${icon('chevron',15)}</button>
      <button data-scope="outer-inter-8"><span class="study-mark">02</span><span>外檐补间斗拱<small>穿接柱头枋 · 无栌斗</small></span>${icon('chevron',15)}</button>
      <button data-scope="outer-bracket-7-4"><span class="study-mark">03</span><span>外檐转角斗拱<small>两正交面与斜向角昂</small></span>${icon('chevron',15)}</button>
      <button data-scope="inner-bracket-3-3"><span class="study-mark">04</span><span>内槽柱头斗拱<small>向内四跳 · 全偷心</small></span>${icon('chevron',15)}</button>
      <button data-scope="inner-bracket-6-2"><span class="study-mark">05</span><span>内槽山面中柱斗拱<small>三跳与上层叠斗、翼形头</small></span>${icon('chevron',15)}</button>
      <button data-scope="inner-bracket-6-3"><span class="study-mark">06</span><span>内槽转角斗拱<small>斜向华栱 · 相交平棊枋</small></span>${icon('chevron',15)}</button>
      <button data-scope="inner-inter-6"><span class="study-mark">07</span><span>内槽补间斗拱<small>三跳华栱 · 后尾丁头短栱</small></span>${icon('chevron',15)}</button>
      <button data-scope="beam-bracket-3"><span class="study-mark">08</span><span>梁上十字斗栱<small>明栿中驼峰与正交小栱</small></span>${icon('chevron',15)}</button>
      <button data-scope="frame-3"><span class="study-mark">09</span><span>中央梁架<small>明栿、平闇与草架</small></span>${icon('chevron',15)}</button>
      <button data-scope="end-frame--1"><span class="study-mark">10</span><span>山面梁架<small>三丁栿、太平梁与脊端斜撑</small></span>${icon('chevron',15)}</button>
    </div>
    <button class="catalog-toggle" data-action="catalog">${icon('search')}构件目录 <span id="catalog-count"></span></button>
    <div class="left-foot"><span class="small-seal">研</span><p>依据测绘与研究资料重建<small>推定细节均附说明</small></p></div>
  </aside>
  <section class="stage" aria-label="三维观察工作区">
    <div id="viewport"></div>
    <div class="stage-top"><div class="breadcrumb"><button data-action="home">东大殿</button><span id="scope-label">整体观察</span></div><div class="stage-tools"><button class="hall-door-toggle" data-action="toggle-doors" aria-pressed="false">打开殿门</button><div class="appearance-switch" role="group" aria-label="外观切换"><button data-appearance="present">现状色</button><button data-appearance="wood">彩绘色</button><button data-appearance="natural">原木色</button></div></div></div>
    <div class="view-buttons" aria-label="视角"><button data-view="perspective" title="立体视角">立体</button><button data-view="front">正面</button><button data-view="side">侧面</button><button data-view="top">俯视</button><button data-action="fit" title="适应视图" aria-label="适应视图">${icon('focus')}</button></div>
    <div id="scope-banner" class="scope-banner" hidden></div>
    <div class="stage-caption"><span>佛光寺东大殿</span><p id="scene-caption">点击构件，了解它在建筑中的位置与作用</p></div>
    <div class="orientation-note">正面朝西</div>
    <div class="stage-bottom"><div class="explode-control"><button data-action="toggle-explode" title="展开或收拢爆炸图">${icon('explode')}<span>拆解观察</span></button><input id="explode-range" type="range" min="0" max="100" step="1" value="0" aria-label="爆炸图展开程度"/><output id="explode-value">0%</output><button data-action="reassemble" title="恢复全部构件" aria-label="恢复全部构件">${icon('reset')}</button></div><div class="gesture-hint">拖动旋转 · Shift＋左拖指定中心 · 右键平移 · 滚轮缩放</div></div>
    <div id="practice-panel" class="practice-panel" hidden></div>
    <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  </section>
  <aside class="sidebar right-panel" aria-label="构件详情"><div class="panel-title"><span>构件札记</span><span class="label-en">FIELD NOTES</span></div><div id="details"></div></aside>
</main>
<footer class="statusbar"><span id="visible-count"></span><span id="save-status">${icon('check',13)}进度保存在此浏览器</span><span class="status-right">现存形制 · 规则化重建 <button data-action="about">资料说明</button></span></footer>
<dialog id="catalog-dialog"><div class="dialog-head"><h2>构件目录</h2><button data-action="close-catalog" aria-label="关闭构件目录">${icon('close')}</button></div><label class="search-box">${icon('search')}<input id="part-search" type="search" placeholder="搜索构件、斗拱、梁架或编号" autocomplete="off"/></label><div class="catalog-filter"><label>组件 <select id="assembly-filter"><option value="">全部组件</option>${catalog.assemblies.map(a=>`<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select></label><span id="search-count"></span></div><div id="catalog-results"></div><div class="pagination"><button data-action="prev-page">上一页</button><span id="page-label"></span><button data-action="next-page">下一页</button></div></dialog>
<dialog id="about-dialog"><div class="dialog-head"><h2 data-i18n-preserve>木构图志 · Timber Atlas</h2><button data-action="close-about" aria-label="关闭说明">${icon('close')}</button></div><div class="about-body"><p class="lead">从一座殿，走进每一道连接。</p><p>本模型依据现存东大殿的测绘与研究，以规则化构件表达结构。柱网与铺作类型有文献依据；隐藏榫卯、局部尺寸、屋面排布及表面细节包含明确推定。构件数量是模型生成数量，完整现状逐件清点资料尚未取得。</p><h3>如何观察</h3><p>拖动旋转、滚轮缩放、右键平移。Shift＋左键拖动可绕按下位置的模型表面旋转，松开后保留该中心；复位视角或切换研习恢复默认中心。此手势在拼装时也只控制视角。点击构件查看说明；左侧可隐藏结构层或进入一组斗拱。拖动“拆解观察”展开爆炸图。快捷键：F 聚焦，H 隐藏选中件，Esc 返回整体。</p><h3>如何拼装</h3><p>先进入感兴趣的组件，再选择“引导拼装”。旋转待安装构件、拖动构件或使用插入滑块，沿提示方向接近目标位置。按 R 旋转，方向键调整插入，Enter 检查安装。可以关闭提示。</p><h3>资料与模型依据</h3>${catalog.sources.map(s=>`<article class="source-item"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><small>${esc(s.author)}</small><p>${esc(s.detail)}</p></article>`).join('')}<h3>学习进度</h3><p>自动保存当前视图、拆解状态及拼装进度。更换浏览器或访问端口前，可以导出进度文件。</p><div class="button-row"><button data-action="export">${icon('save')}导出进度</button><button data-action="import">导入进度</button><input type="file" id="import-file" accept="application/json" hidden/></div></div></dialog>`;

const viewport=document.querySelector<HTMLElement>('#viewport')!;
let viewer:HallViewer;
try {viewer=await HallViewer.create(viewport,catalog,state,(done,total)=>bootProgress('scene',done,total));await bootPaint();}catch(error){
  viewport.innerHTML=`<div class="webgl-error"><h2>暂时无法启动三维视图</h2><p>请在 Chrome 设置中开启图形加速，然后重新打开页面。</p><details><summary>错误详情</summary>${esc(error instanceof Error?error.message:error)}</details></div>`;
  throw error;
}
const sectionPanel=createSectionPanel(viewer);
bindSectionRange(document.querySelector<HTMLInputElement>('#explode-range')!,viewer.section);
viewer.onCameraPose=pose=>{state.camera=pose;save();};
viewer.onSelect=id=>{if(state.practice){if(id&&id!==state.practice.active)toast('请先安装当前高亮构件。');return;}state.selected=id;refresh();};
viewer.onMove=(distance,released)=>{if(!state.practice)return;state.practice.distance=distance;viewer.update(state);renderPractice();save();if(released&&distance<=.10)attempt();};
viewer.onMetrics=m=>{document.querySelector('#visible-count')!.textContent=`当前显示 ${m.visible.toLocaleString()} 件`;};
const studyLocator=new StudyLocator(viewer);
viewport.addEventListener('viewer-error',(event)=>toast((event as CustomEvent).detail,10000));
document.querySelector('#total-count')!.textContent=`${catalog.parts.length.toLocaleString()} 件 · ${catalog.assemblies.length} 组`;
document.querySelector('#catalog-count')!.textContent=catalog.parts.length.toLocaleString();

function toast(message:string,duration=3800){const t=document.querySelector<HTMLElement>('#toast')!;t.textContent=message;t.hidden=false;window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>t.hidden=true,duration);}
function save(){window.clearTimeout(saveTimer);saveTimer=window.setTimeout(()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));savingAvailable=true;}catch{savingAvailable=false;}document.querySelector('#save-status')!.innerHTML=savingAvailable?`${icon('check',13)}进度保存在此浏览器`:'无法自动保存 · 可在资料说明中导出';},250);}
window.addEventListener('pagehide',()=>{try{localStorage.setItem(SAVE_KEY,JSON.stringify(state));}catch{}});
function studyIds(id:string){const a=assemblyById.get(id);return a?studyMemberIds(catalog,a,state.expandedContext):[];}
function studyFocusIds(id:string){return studyIds(id);}
let fixedContextCache:{key:string;ids:Set<string>}|null=null;
function fixedStudyContext(id:string){const a=state.scope&&!state.isolated?assemblyById.get(state.scope):null;if(!a)return false;const key=`${a.id}:${state.expandedContext}`;if(fixedContextCache?.key!==key)fixedContextCache={key,ids:new Set(fixedStudyContextIds(catalog,a,state.expandedContext))};return fixedContextCache.ids.has(id);}
function scopedParts(){if(state.isolated)return [byId.get(state.isolated)!];return state.scope?(assemblyById.get(state.scope)?.partIds??[]).map(id=>byId.get(id)!):catalog.parts;}
function practiceParts(){const a=state.scope&&!state.isolated?assemblyById.get(state.scope):null;return (a?(localPracticeMemberIds(catalog,a)).map(id=>byId.get(id)!):scopedParts()).filter(isPracticePart);}
function practiceScopeNote(){const a=state.scope&&!state.isolated?assemblyById.get(state.scope):null;const note=a?.intercolumnBay?'只拼装目标补间斗拱；左右柱、横枋与浅色柱头构件固定保留。':a?.contextPartIds?.length?'按当前局部范围复装；灰色参照保持原位，展开关联结构不增加拼装构件。':'按承接顺序逐件复位，观察构件之间的连接。';return note+(scopedParts().some(p=>!isPracticePart(p))?' 泥作与铺垫已暂时隐藏。':'');}
function refresh(){viewer.update(state);renderLayers();renderDetails();renderPractice();renderChrome();save();}
function renderDoorButton(){const doors=document.querySelector<HTMLButtonElement>('.hall-door-toggle')!;doors.hidden=!!state.scope||!!state.isolated||!!state.practice;doors.disabled=state.explode>0||!state.visible.enclosure;doors.textContent=state.doorsOpen?'关闭殿门':'打开殿门';doors.setAttribute('aria-pressed',String(state.doorsOpen));doors.title=state.explode>0?'请先收拢构件，再开合殿门':!state.visible.enclosure?'请先显示墙体与门窗':'统一向内开合前檐板门';}
function renderChrome(){
  sectionPanel.sync(!state.practice);
  const scope=state.scope?assemblyById.get(state.scope):null;
  document.querySelector('#scope-label')!.textContent=state.isolated?`单件 · ${byId.get(state.isolated)!.kind}`:scope?scope.name:'整体观察';
  document.querySelector('#scene-caption')!.textContent=state.practice?practiceScopeNote():state.isolated?'沿构件自身方向观察连接与卯口。':scope?scope.description+(scope.intercolumnBay?' 浅色为固定的左右柱、连接横枋与柱头构件；只拆装目标补间。':scope.variant==='centralFrame'||scope.variant==='endFrame'?' 原色为目标梁架，浅色为周边关联构件。':scope.contextPartIds?.length?(state.expandedContext?' 已展开关联结构；原色参与本次拆装，灰色为固定参照。':' 原色参与本次拆装，灰色为固定参照；长梁远端支承可省略。'):''):'点击构件，了解它在建筑中的位置与作用';
  renderDoorButton();
  if(state.appearance==='wood')document.querySelector('#scene-caption')!.textContent+=' 彩绘色依据本殿遗迹并参照古制试配，部分纹样仍待核实。';
  const banner=document.querySelector<HTMLElement>('#scope-banner')!;banner.hidden=!scope&&!state.isolated;
  banner.innerHTML=state.isolated?`<span>独立构件 · ${esc(byId.get(state.isolated)!.kind)}</span><button data-scope="${byId.get(state.isolated)!.assembly}" data-inspected-part="${state.isolated}">返回所属组件</button>`:scope?`<span>${esc(scope.name)}</span>${scope.variant?`<label class="study-location">位置 <select id="study-location" aria-label="选择同类构架位置">${catalog.assemblies.filter(a=>a.variant===scope.variant).map(a=>`<option value="${a.id}" ${a.id===scope.id?'selected':''}>${esc(a.location)} · ${esc(a.name)}</option>`).join('')}</select></label>`:''}<button data-action="locate-study">${icon('focus',14)}在整殿中定位</button>${expandableStudies.has(scope.id)?`<button data-action="toggle-context" aria-pressed="${state.expandedContext}">${state.expandedContext?'收起关联结构':'展开完整关联结构'}</button>`:''}<button data-action="home">返回整殿 ${icon('close',14)}</button>`:'';
  document.querySelectorAll<HTMLButtonElement>('[data-appearance]').forEach(b=>{b.classList.toggle('active',b.dataset.appearance===state.appearance);b.setAttribute('aria-pressed',String(b.dataset.appearance===state.appearance));});
  (document.querySelector('#explode-range') as HTMLInputElement).value=String(Math.round(state.explode*100));
  (document.querySelector('#explode-range') as HTMLInputElement).disabled=!!state.practice;
  document.querySelector('#explode-value')!.textContent=`${Math.round(state.explode*100)}%`;
  document.querySelector('#explore-tab')!.classList.toggle('active',!state.practice);document.querySelector('#practice-tab')!.classList.toggle('active',!!state.practice);
  const practiceButton=document.querySelector<HTMLButtonElement>('#practice-tab')!;
  practiceButton.disabled=practiceParts().length===0;practiceButton.title=practiceButton.disabled?'泥作与铺垫可观察，木构拼装时暂时隐藏':'';
  document.querySelector('.stage-bottom')!.classList.toggle('practicing',!!state.practice);
}
function renderLayers(){
  const scoped=new Set(state.scope&&!state.isolated?studyIds(state.scope):scopedParts().map(p=>p.id));
  document.querySelector('#layer-list')!.innerHTML=LAYERS.map(l=>{
    const parts=catalog.parts.filter(p=>p.layer===l.id&&scoped.has(p.id)),count=parts.length;
    const fixed=count>0&&parts.every(p=>fixedStudyContext(p.id)),visible=fixed||state.visible[l.id];
    return `<div class="layer-row ${visible?'':'muted'}"><button data-layer-focus="${l.id}" class="layer-name">${icon('layers',16)}<span>${l.name}</span><small>${count.toLocaleString()}</small></button><button data-layer="${l.id}" class="eye-button" ${fixed?'disabled title="固定环境构件"':''} aria-label="${fixed?'固定显示':visible?'隐藏':'显示'}${l.name}" aria-pressed="${visible}">${icon(visible?'eye':'hide',17)}</button></div>`;
  }).join('');
}
function renderDetails(){
  const p=state.selected?byId.get(state.selected):null;
  const el=document.querySelector('#details')!;
  if(!p){el.innerHTML=`<div class="overview-note"><div class="note-number">唐<span>大中十一年 · 857</span></div><h2>一座殿的<br/>构造秩序</h2><p>从完整建筑进入柱网、斗拱与梁架，观察木构件如何彼此承接。</p><div class="hall-facts"><div><b>7<span>间</span></b><small>面阔</small></div><div><b>4<span>间</span></b><small>进深</small></div><div><b>36<span>根</span></b><small>内外槽柱</small></div><div><b>72<span>攒</span></b><small>平闇以下铺作</small></div></div><div class="note-divider"></div><h3>从一攒斗拱开始</h3><p>先独立查看外檐柱头，再展开构件，最后亲手拼装。</p><button class="primary full" data-scope="outer-bracket-3-4">观察柱头斗拱 ${icon('arrow')}</button><div class="evidence-note">${icon('info',16)}<p>构造有依据，细部有推定。<br/>选择构件可查阅具体说明。</p></div></div>`;return;}
  const assembly=assemblyById.get(p.assembly)!;const fixed=fixedStudyContext(p.id),removed=!fixed&&state.removed.includes(p.id),hidden=!fixed&&state.hidden.includes(p.id);
  const bounds=geometry(p.shape,p.size).boundingBox!;
  const dimensions=p.size.map((v,i)=>`${Math.round(v*(bounds.max.getComponent(i)-bounds.min.getComponent(i))*1000)}`).join(' × ');
  const bearingIds=p.requires.filter(id=>!p.orderOnlyRequires?.includes(id));
  const connectionButtons=(ids:string[])=>ids.map(id=>`<button data-part="${esc(id)}">${icon('layers',14)}${esc(byId.get(id)?.name??id)}${icon('chevron',13)}</button>`).join('');
  el.innerHTML=`<div class="part-detail"><div class="part-eyebrow">${esc(LAYERS.find(l=>l.id===p.layer)?.short)}<span>${esc(p.id)}</span></div><h2>${esc(p.kind).replace(/（([^）]+)）/g,'<span class="part-pose">（$1）</span>')}</h2><p class="part-original" data-native-term="${esc(p.kind)}" data-i18n-preserve lang="zh-CN" hidden></p><p class="part-subtitle">${esc(p.name)}</p><div class="part-tags"><span>附参考资料</span><span class="inferred">含规则化推定</span>${fixed?'<span>固定环境构件</span>':''}${!isPracticePart(p)?'<span>附着层 · 不参与插装</span>':''}${removed?'<span>已移出</span>':''}${hidden?'<span>已隐藏</span>':''}</div><div class="detail-actions"><button data-action="focus-part">${icon('focus')}聚焦</button><button data-action="isolate-part">${icon('eye')}独立构件</button><button data-scope="${p.assembly}" data-inspected-part="${p.id}">${icon('layers')}独立组件</button></div><h3>在建筑中的作用</h3><p>${esc(p.role)}</p><h3>连接与安装</h3><p>${esc(p.joint)}</p><div class="dimension-box"><span>模型外包尺寸 · mm</span><b>${dimensions}</b><small>尺寸依据见下方资料说明</small></div><h3>承接关系</h3><div class="connections">${bearingIds.length?connectionButtons(bearingIds):'<p>基础定位构件，无前置木构件。</p>'}</div>${p.orderOnlyRequires?.length?`<h3>安装次序</h3><p>以下构件先就位，保留后续装入空间。</p><div class="connections order-connections">${connectionButtons(p.orderOnlyRequires)}</div>`:''}<div class="button-stack"><button class="primary" data-action="detach" ${state.practice||fixed?'disabled':''}>${icon(removed?'reset':'explode')}${removed?'复位这件构件':'单独移出这件构件'}</button><button data-action="hide-part" ${fixed?'disabled':''}>${icon(hidden?'eye':'hide')}${hidden?'显示构件':'暂时隐藏'}</button></div><details class="evidence-details" open><summary>资料依据与推定</summary><p>${esc(p.evidence.basis)}</p><p class="inference-text">${esc(p.evidence.inferred)}</p>${p.evidence.sources.map(id=>{const s=catalog.sources.find(s=>s.id===id);return s?`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`:'';}).join('')}</details><div class="assembly-link"><span>所属组件</span><button data-scope="${p.assembly}" data-inspected-part="${p.id}">${esc(assembly.name)} ${icon('arrow',15)}</button></div></div>`;
}
function renderPractice(){
  const panel=document.querySelector<HTMLElement>('#practice-panel')!;const practice=state.practice;panel.hidden=!practice;
  // Preserve the live message and its timer when rebuilding the practice controls.
  const notice=document.querySelector<HTMLElement>('#toast')!;panel.before(notice);
  if(!practice)return;
  const part=practice.active?byId.get(practice.active):null;
  const done=new Set(practice.completed),lessonIds=new Set(practice.scope);
  const ready=practice.scope.filter(id=>!done.has(id)&&byId.get(id)!.requires.every(dep=>!lessonIds.has(dep)||done.has(dep))).slice(0,12);
  if(!part){panel.innerHTML=`<div class="practice-complete">${icon('check',28)}<div><h3>这一组已拼装完成</h3><p>你已复位 ${practice.completed.length} 件构件，可以自由观察它们的连接。</p></div><button class="primary" data-action="explore">继续观察</button><button data-action="restart-practice">重新拼装</button></div>`;panel.prepend(notice);return;}
  panel.innerHTML=`<div class="practice-heading"><span>引导拼装 <small>${practice.completed.length+1} / ${practice.scope.length}</small></span><label class="hint-toggle"><input type="checkbox" id="hints-toggle" ${practice.hints?'checked':''}/>显示提示</label><button data-action="explore" aria-label="退出拼装">${icon('close',17)}</button></div><div class="practice-content"><div class="practice-description"><h3>${esc(part.kind)}</h3><p>${practice.hints?esc(part.joint):'观察连接位置，调整朝向并插入构件。'}</p></div><div class="practice-controls"><button data-action="rotate-part" title="旋转90度（R）">${icon('rotate')}旋转 90°</button><label>插入<input id="insert-range" aria-label="构件插入程度" type="range" min="0" max="300" value="${Math.round((3-practice.distance)*100)}"/><span>${Math.round((1-practice.distance/3)*100)}%</span></label><button class="primary" data-action="place-part">${icon('check')}检查安装</button></div></div><div class="piece-tray"><label>选择待装构件<select id="practice-choice" aria-label="选择待装构件">${ready.map(id=>`<option value="${id}" ${id===part.id?'selected':''}>${esc(byId.get(id)!.name)}</option>`).join('')}</select></label><small>${practiceScopeNote()}</small></div>`;
  panel.prepend(notice);
}
function pausePractice(){if(state.practice)state.lessons[lessonKey(state)]=state.practice;state.practice=null;}
function fitPractice(){const p=state.practice?.active?byId.get(state.practice.active):null;if(p)viewer.fit(state.isolated?[p.id]:state.scope?[...studyFocusIds(state.scope),p.id]:[p.id,...p.requires],state.scope&&!state.isolated?'study':'perspective');}
function enterScope(id:string,inspectedPart:string|null=null){const a=assemblyById.get(id);if(!a)return;pausePractice();state.isolated=null;state.scope=id;state.expandedContext=false;state.explode=0;state.selected=inspectedPart&&a.partIds.includes(inspectedPart)?inspectedPart:null;for(const pid of studyIds(id)){state.visible[byId.get(pid)!.layer]=true;state.hidden=state.hidden.filter(x=>x!==pid);}refresh();viewer.fit(studyFocusIds(id),'study');}
function selectPart(id:string){const p=byId.get(id);if(!p)return;pausePractice();if(state.isolated)state.isolated=id;state.selected=id;state.visible[p.layer]=true;state.hidden=state.hidden.filter(v=>v!==id);if(state.scope&&!studyIds(state.scope).includes(id)){
  const current=assemblyById.get(state.scope)!;
  if(studyMemberIds(catalog,current,true).includes(id))state.expandedContext=true;
  else{state.scope=p.assembly;state.expandedContext=false;}
}refresh();if(state.scope&&!state.isolated&&assemblyById.get(state.scope)?.intercolumnBay)viewer.fit(studyFocusIds(state.scope),'study');else viewer.fit([id]);}
function attempt(){const practice=state.practice;if(!practice?.active)return;const part=byId.get(practice.active)!;const result=checkPlacement(practice,part);toast(result.message);if(result.ok){state.practice=completePlacement(practice,part);state.selected=state.practice.active;refresh();if(!state.scope)fitPractice();}else{save();}}
function returnHome(){pausePractice();state.isolated=null;state.scope=null;state.selected=null;state.explode=0;refresh();viewer.fit();}
function openDialog(id:string){const dialog=document.querySelector<HTMLDialogElement>(id)!;dialog.showModal();}
function closeDialog(id:string){document.querySelector<HTMLDialogElement>(id)!.close();}
function renderCatalog(){
  const filter=(document.querySelector('#assembly-filter') as HTMLSelectElement).value;
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const list=catalog.parts.filter(p=>(!filter||assemblyById.get(filter)?.partIds.includes(p.id))&&terms.every(q=>`${p.name} ${p.id} ${p.kind} ${assemblyById.get(p.assembly)?.name} ${currentLanguage()==='en'?englishText(p.name)+' '+englishText(p.kind)+' '+romanization(p.kind)+' '+englishText(assemblyById.get(p.assembly)?.name??''):''}`.toLowerCase().includes(q)));
  const total=Math.max(1,Math.ceil(list.length/40));catalogPage=Math.min(Math.max(0,catalogPage),total-1);
  document.querySelector('#search-count')!.textContent=`${list.length.toLocaleString()} 件`;
  document.querySelector('#page-label')!.textContent=`${catalogPage+1} / ${total}`;
  document.querySelector('#catalog-results')!.innerHTML=list.length?list.slice(catalogPage*40,(catalogPage+1)*40).map(p=>`<button class="catalog-result" data-catalog-part="${p.id}"><span class="part-symbol">${icon('layers',18)}</span><span><b>${esc(p.name)}</b><small>${esc(assemblyById.get(p.assembly)?.name)} · ${esc(p.id)}</small></span>${icon('chevron',15)}</button>`).join(''):'<p class="empty-state">没有找到匹配构件，试试“华栱”“檐柱”或“瓦”。</p>';
}
document.addEventListener('click',async event=>{
  const target=(event.target as HTMLElement).closest<HTMLElement>('button, a[data-action]');if(!target)return;
  if(target.dataset.language){const next=target.dataset.language==='en'?'en':'zh-CN';try{await setLanguage(next);if(showCatalog)renderCatalog();}catch{toast('English could not load. Please retry. / 英文资源未能载入，请重试。');}return;}
  if(target.dataset.scope){enterScope(target.dataset.scope,target.dataset.inspectedPart);return;}
  if(target.dataset.part){selectPart(target.dataset.part);return;}
  if(target.dataset.catalogPart){closeDialog('#catalog-dialog');showCatalog=false;selectPart(target.dataset.catalogPart);return;}
  if(target.dataset.layer){const layer=target.dataset.layer as Layer;state.visible[layer]=!state.visible[layer];refresh();return;}
  if(target.dataset.layerFocus){const layer=target.dataset.layerFocus as Layer;state.visible[layer]=true;state.selected=null;pausePractice();state.isolated=null;state.scope=null;for(const l of LAYERS)state.visible[l.id]=l.id===layer;refresh();viewer.fit();return;}
  if(target.dataset.appearance){state.appearance=target.dataset.appearance as Session['appearance'];refresh();return;}
  if(target.dataset.view){const view=target.dataset.view as 'perspective'|'front'|'side'|'top';viewer.fit(state.scope?studyFocusIds(state.scope):undefined,state.scope&&view==='perspective'?'study':view);return;}
  const action=target.dataset.action;const part=state.selected?byId.get(state.selected):null;
  if(action==='locate-study'&&state.scope)studyLocator.open(assemblyById.get(state.scope)!);
  if(action==='show-all-layers'||action==='hide-all-layers'){
    const ids=state.scope&&!state.isolated?studyIds(state.scope):scopedParts().map(p=>p.id);
    const layers=new Set(ids.filter(id=>!fixedStudyContext(id)).map(id=>byId.get(id)!.layer));
    for(const layer of layers)state.visible[layer]=action==='show-all-layers';
    refresh();return;
  }
  if(action==='home'){event.preventDefault();returnHome();}
  if(action==='toggle-context'&&state.scope){
    pausePractice();state.expandedContext=!state.expandedContext;state.explode=0;
    const ids=studyIds(state.scope);if(state.selected&&!ids.includes(state.selected))state.selected=null;
    for(const id of ids){state.visible[byId.get(id)!.layer]=true;state.hidden=state.hidden.filter(hidden=>hidden!==id);}
    refresh();viewer.fit(studyFocusIds(state.scope),'study');
  }
  if(action==='toggle-doors'&&!state.scope&&!state.isolated&&!state.practice&&!state.explode&&state.visible.enclosure){state.doorsOpen=!state.doorsOpen;refresh();}
  if(action==='fit')viewer.fit();
  if(action==='structure'){pausePractice();state.isolated=null;state.scope=null;state.selected=null;state.explode=0;for(const l of LAYERS)state.visible[l.id]=!['tiles','boards','enclosure','statues'].includes(l.id);refresh();viewer.fit();}
  if(action==='toggle-explode'){if(state.practice){toast('先退出引导拼装，再展开爆炸图。');return;}state.explode=state.explode>.1?0:1;refresh();viewer.fit();}
  if(action==='reassemble'){state.removed=[];state.hidden=[];state.explode=0;for(const l of LAYERS)state.visible[l.id]=true;refresh();viewer.fit();toast('构件已恢复。');}
  if(action==='isolate-part'&&part){pausePractice();state.isolated=part.id;state.visible[part.layer]=true;state.hidden=state.hidden.filter(id=>id!==part.id);state.explode=0;refresh();viewer.fit([part.id]);}
  if(action==='focus-part'&&part)viewer.fit([part.id]);
  if(action==='detach'&&part&&!state.practice&&!fixedStudyContext(part.id)){state.removed=state.removed.includes(part.id)?state.removed.filter(id=>id!==part.id):[...state.removed,part.id];refresh();}
  if(action==='hide-part'&&part&&!fixedStudyContext(part.id)){state.hidden=state.hidden.includes(part.id)?state.hidden.filter(id=>id!==part.id):[...state.hidden,part.id];refresh();}
  if(action==='practice'){
    if(state.practice)return;const parts=practiceParts();if(!parts.length)return;state.practice=state.lessons[lessonKey(state)]??startPractice(parts);state.selected=state.practice.active;state.explode=0;state.removed=[];state.hidden=[];for(const p of parts)state.visible[p.layer]=true;refresh();fitPractice();toast('旋转待安装构件，再拖动或用滑块将它插入。',6000);
  }
  if(action==='explore'){pausePractice();refresh();}
  if(action==='restart-practice'){state.practice=startPractice(practiceParts(),state.practice?.hints);state.selected=state.practice.active;refresh();fitPractice();}
  if(action==='rotate-part'&&state.practice){state.practice.turn=(state.practice.turn+1)%4;refresh();}
  if(action==='place-part')attempt();
  if(action==='about')openDialog('#about-dialog');
  if(action==='close-about')closeDialog('#about-dialog');
  if(action==='catalog'){showCatalog=true;catalogPage=0;renderCatalog();openDialog('#catalog-dialog');document.querySelector<HTMLInputElement>('#part-search')!.focus();}
  if(action==='close-catalog'){showCatalog=false;closeDialog('#catalog-dialog');}
  if(action==='prev-page'){catalogPage--;renderCatalog();}
  if(action==='next-page'){catalogPage++;renderCatalog();}
  if(action==='export'){const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='木构图志 · Timber Atlas-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  if(action==='import')document.querySelector<HTMLInputElement>('#import-file')!.click();
});
document.addEventListener('input',event=>{
  const input=event.target as HTMLInputElement;
  if(input.id==='explode-range'){state.explode=Number(input.value)/100;viewer.update(state);document.querySelector('#explode-value')!.textContent=`${input.value}%`;renderDoorButton();save();}
  if(input.id==='insert-range'&&state.practice){state.practice.distance=3-Number(input.value)/100;viewer.update(state);input.nextElementSibling!.textContent=`${Math.round(Number(input.value)/3)}%`;save();}
  if(input.id==='part-search'){query=input.value;catalogPage=0;renderCatalog();}
});
document.addEventListener('change',async event=>{
  const input=event.target as HTMLInputElement;
  if(input.id==='study-location'){enterScope(input.value);return;}
  if(input.id==='practice-choice'&&state.practice){state.practice.active=input.value;state.practice.turn=1;state.practice.distance=2;state.selected=input.value;refresh();fitPractice();}
  if(input.id==='hints-toggle'&&state.practice){state.practice.hints=input.checked;refresh();}
  if(input.id==='insert-range'&&state.practice&&state.practice.distance<=.10)attempt();
  if(input.id==='assembly-filter'){catalogPage=0;renderCatalog();}
  if(input.id==='import-file'&&input.files?.[0]){try{const text=await input.files[0].text();const data=JSON.parse(text);if(data.version!==catalog.version)throw new Error('模型版本不一致');state=restoreSession(text,catalog);refresh();viewer.fit();toast('学习进度已导入。');}catch{toast('无法导入：请使用本模型导出的有效进度文件。');}input.value='';}
});
document.addEventListener('keydown',event=>{
  if(document.querySelector('#boot'))return;
  if((event.target as HTMLElement).matches('input, textarea, select')||document.querySelector('dialog[open]'))return;
  if(event.key==='Escape')returnHome();
  if(event.key.toLowerCase()==='f')viewer.fit(state.selected?[state.selected]:undefined);
  if(event.key.toLowerCase()==='h'&&state.selected&&!fixedStudyContext(state.selected)){state.hidden.push(state.selected);refresh();}
  if(state.practice){if(event.key.toLowerCase()==='r'){state.practice.turn=(state.practice.turn+1)%4;refresh();}if(event.key==='Enter')attempt();if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();state.practice.distance=Math.max(0,Math.min(3,state.practice.distance+(event.key==='ArrowDown'?-.1:.1)));refresh();}}
});
for(const dialog of document.querySelectorAll('dialog'))dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
const cameraPose=state.camera;refresh();if(cameraPose)viewer.restoreCamera(cameraPose);else if(state.isolated)viewer.fit([state.isolated]);else if(state.scope)viewer.fit(studyFocusIds(state.scope),'study');else viewer.fit();
await bootStep(3,'frame');
localize();
viewer.renderInitialFrame();
// A bounded test seam exposes observable state, not alternate product logic.
Object.assign(window,{sunmao:{catalog,features,get state(){return state;},viewer,selectPart,enterScope,setLanguage,get language(){return currentLanguage();},grid:{x:GRID_X,z:GRID_Z}}});
