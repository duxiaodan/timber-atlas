import type {Assembly} from './model/types';
import type {HallViewer} from './viewer';

/** Modal navigation with one shared WebGL canvas; no learning-session writes. */
export class StudyLocator {
  private dialog=document.createElement('dialog');
  private anchor:Comment|null=null;
  private opener:HTMLElement|null=null;
  constructor(private viewer:HallViewer){
    this.dialog.id='location-dialog';
    this.dialog.setAttribute('aria-labelledby','location-title');
    this.dialog.innerHTML=`<div class="dialog-head"><div><h2 id="location-title">在整殿中定位</h2><p id="location-name"></p></div><button data-locator-close autofocus>返回研习 ×</button></div>
      <div class="location-stage"><div class="location-views" aria-label="定位视角"><button data-locator-view="perspective">立体</button><button data-locator-view="top">俯视</button><button data-locator-view="front">正面（西）</button><button data-locator-view="side">侧面（南）</button><button data-locator-envelope aria-pressed="false">只看木构</button></div><div class="location-key"><i></i>橙色透视标示当前研习位置 · 灰色为整殿参照</div></div>
      <p class="location-foot">拖动旋转 · Shift＋左拖指定中心 · 右键平移 · 滚轮缩放 · Esc 返回原研习</p>`;
    document.body.append(this.dialog);
    this.dialog.addEventListener('click',event=>{
      const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button)return;
      event.stopPropagation();
      if(button.hasAttribute('data-locator-close'))this.dialog.close();
      const view=button.dataset.locatorView as 'perspective'|'top'|'front'|'side'|undefined;
      if(view)this.viewer.fit(undefined,view);
      if(button.hasAttribute('data-locator-envelope')){
        const woodOnly=button.getAttribute('aria-pressed')!=='true';
        button.setAttribute('aria-pressed',String(woodOnly));button.textContent=woodOnly?'显示屋面与围护':'只看木构';
        this.viewer.setLocationEnvelope(!woodOnly);
      }
    });
    this.dialog.addEventListener('close',()=>{
      if(!this.anchor)return;
      this.anchor.replaceWith(this.viewer.container);this.anchor=null;
      this.viewer.endLocation();this.opener?.focus();this.opener=null;
    });
  }
  open(assembly:Assembly){
    if(this.dialog.open)return;
    this.opener=document.activeElement instanceof HTMLElement?document.activeElement:null;
    this.dialog.querySelector('#location-name')!.textContent=[assembly.name,assembly.location].filter(Boolean).join(' · ');
    const envelope=this.dialog.querySelector('[data-locator-envelope]')!;envelope.setAttribute('aria-pressed','false');envelope.textContent='只看木构';
    this.anchor=document.createComment('study viewport');
    this.viewer.container.before(this.anchor);
    this.dialog.querySelector('.location-stage')!.prepend(this.viewer.container);
    this.dialog.showModal();this.viewer.beginLocation(assembly.partIds);
  }
}
