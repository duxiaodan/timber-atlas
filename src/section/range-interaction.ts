import type {SectionView} from './section-view';

/** Keep cap publication stable for one native range gesture, including keyboard repeat. */
export function bindSectionRange(input:HTMLInputElement,section:SectionView){
  let pointer=false,key=false,timer:ReturnType<typeof setTimeout>|null=null;
  const cancelTimer=()=>{if(timer!==null){clearTimeout(timer);timer=null;}};
  const finish=()=>{cancelTimer();section.endInteraction();};
  const settle=()=>{cancelTimer();timer=setTimeout(finish,150);};
  input.addEventListener('pointerdown',()=>{pointer=true;cancelTimer();});
  input.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(event.key)){key=true;cancelTimer();}});
  // Runs before the delegated document input handler changes the displayed pose.
  input.addEventListener('input',()=>{if(section.enabled){section.beginInteraction();if(!pointer&&!key)settle();}});
  const release=()=>{if(pointer){pointer=false;if(!key)finish();}};
  window.addEventListener('pointerup',release);
  window.addEventListener('pointercancel',release);
  input.addEventListener('keyup',()=>{if(key){key=false;if(!pointer)settle();}});
  const blur=()=>{if(pointer||key||timer!==null){pointer=false;key=false;finish();}};
  input.addEventListener('blur',blur);window.addEventListener('blur',blur);
}
