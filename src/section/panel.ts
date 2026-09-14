import {bindSectionRange} from './range-interaction';
import type {HallViewer} from '../viewer';
import {sectionAxes,type SectionAxis} from './section-view';
export function createSectionPanel(viewer:HallViewer){
  const button=document.createElement('button');button.className='section-toggle';button.textContent='剖切';button.setAttribute('aria-expanded','false');document.querySelector('.stage-tools')!.prepend(button);
  const panel=document.createElement('section');panel.className='section-panel';panel.hidden=true;panel.setAttribute('aria-label','整殿剖切');
  const labels={x:'X · 纵剖（沿进深）',y:'Y · 水平剖（竖向位置）',z:'Z · 横剖（沿面阔）'};
  panel.innerHTML=`<div class="section-heading"><b data-section-title>整殿剖切</b><button data-section-close aria-label="关闭剖切">×</button></div><p data-section-scope></p><p data-section-note>启用方向，再移动切面。Y 为竖向。</p>${sectionAxes.map(a=>`<div class="section-axis" data-axis="${a}"><label><input type="checkbox" data-section-enable="${a}"><b data-section-axis-label="${a}">${labels[a]}</b></label><div class="section-position"><input type="range" data-section-position="${a}" step="0.01" aria-label="${a.toUpperCase()} 剖切位置"><input type="number" data-section-number="${a}" step="0.01" aria-label="${a.toUpperCase()} 剖切位置（米）"><span>m</span></div><div class="section-actions"><button data-section-flip="${a}" aria-pressed="false">保留负侧</button><button data-section-face="${a}">正对剖面</button></div></div>`).join('')}<div class="section-footer"><label><input type="checkbox" data-section-helpers checked>切面边框</label><button data-section-reset>重置</button></div><small>实心截面以浅金色显示；开放曲面保留开口。</small><small>退出或切换观察范围时重置剖切；拼装时关闭。</small>`;
  document.querySelector('.stage')!.append(panel);
  for(const input of panel.querySelectorAll<HTMLInputElement>('input[type=range]'))bindSectionRange(input,viewer.section);
  let scopeKey=viewer.section.scopeKey;
  const refresh=()=>{
    const kind=viewer.section.scopeKind;
    const title=kind==='part'?'单件剖切':kind==='group'?'组件剖切':'整殿剖切';panel.querySelector('[data-section-title]')!.textContent=title;panel.setAttribute('aria-label',title);
    panel.querySelector('[data-section-scope]')!.textContent=viewer.section.scopeName;
    panel.querySelector('[data-section-note]')!.textContent=kind==='part'?'坐标随构件自身方向；Y 为构件高度。':kind==='group'?'当前组件与固定参照共用切面。Y 为竖向。':'启用方向，再移动切面。Y 为竖向。';
    for(const a of sectionAxes)panel.querySelector(`[data-section-axis-label="${a}"]`)!.textContent=kind==='part'?{x:'X · 构件长度',y:'Y · 构件高度',z:'Z · 构件宽度'}[a]:labels[a];

    for(const a of sectionAxes){const state=viewer.section.state[a];panel.querySelector<HTMLInputElement>(`[data-section-enable="${a}"]`)!.checked=state.enabled;
      for(const attr of ['position','number']){const el=panel.querySelector<HTMLInputElement>(`[data-section-${attr}="${a}"]`)!;el.min=String(viewer.section.bounds.min[a]);el.max=String(viewer.section.bounds.max[a]);
        const unit=kind==='hall'?.01:.001,extent=viewer.section.bounds.max[a]-viewer.section.bounds.min[a];
        el.step=String(attr==='position'?extent/Math.max(1,Math.ceil(extent/unit)):unit);
        el.value=attr==='position'?String(state.position):(Math.abs(state.position)<unit/2?0:state.position).toFixed(kind==='hall'?2:3);el.disabled=!state.enabled;}
      const flip=panel.querySelector<HTMLButtonElement>(`[data-section-flip="${a}"]`)!;flip.textContent=state.flipped?'保留正侧':'保留负侧';flip.setAttribute('aria-pressed',String(state.flipped));
    }
    panel.querySelector<HTMLInputElement>('[data-section-helpers]')!.checked=viewer.section.state.helpers;
    button.classList.toggle('active',viewer.section.enabled);button.setAttribute('aria-expanded',String(!panel.hidden));
  };
  const update=()=>{viewer.updateSection();refresh();};
  const close=()=>{viewer.section.reset();panel.hidden=true;update();};
  button.onclick=()=>{panel.hidden=!panel.hidden;refresh();};
  panel.addEventListener('click',event=>{const target=(event.target as Element).closest('button');if(!target)return;
    if(target.hasAttribute('data-section-close'))close();
    if(target.hasAttribute('data-section-reset')){viewer.section.reset();update();}
    const flip=target.dataset.sectionFlip as SectionAxis|undefined;if(flip){viewer.section.state[flip].flipped=!viewer.section.state[flip].flipped;update();}
    const face=target.dataset.sectionFace as SectionAxis|undefined;if(face){viewer.section.state[face].enabled=true;update();viewer.faceSection(face);}
  });
  let pending=0;
  panel.addEventListener('input',event=>{const input=event.target as HTMLInputElement;
    const enabled=input.dataset.sectionEnable as SectionAxis|undefined;if(enabled){viewer.section.state[enabled].enabled=input.checked;update();}
    const axis=(input.dataset.sectionPosition??input.dataset.sectionNumber) as SectionAxis|undefined;
    if(axis&&input.value!==''&&Number.isFinite(input.valueAsNumber)){viewer.section.state[axis].position=Math.max(viewer.section.bounds.min[axis],Math.min(viewer.section.bounds.max[axis],input.valueAsNumber));cancelAnimationFrame(pending);pending=requestAnimationFrame(update);}
    if(input.hasAttribute('data-section-helpers')){viewer.section.state.helpers=input.checked;update();}
  });
  refresh();
  return {sync(available:boolean){if(scopeKey!==viewer.section.scopeKey){scopeKey=viewer.section.scopeKey;panel.hidden=true;}button.hidden=!available;if(!available)panel.hidden=true;refresh();}};
}
