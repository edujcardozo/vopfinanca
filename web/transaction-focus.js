// Measure only after the form, sharing fields and route have settled.
export function revealTransactionComposer(composer,{focusTarget,windowObject=window}={}){
  const reveal=()=>{
    if(composer.hidden||!composer.isConnected||!focusTarget?.isConnected||!composer.contains(focusTarget))return;
    const reduced=windowObject.matchMedia('(prefers-reduced-motion: reduce)').matches;
    focusTarget.focus({preventScroll:true});
    composer.scrollIntoView({block:'center',inline:'nearest',behavior:reduced?'instant':'smooth'});
    if(!reduced)composer.animate?.([{opacity:.45,transform:'translateY(8px)'},{opacity:1,transform:'none'}],{duration:240,easing:'cubic-bezier(.2,.75,.25,1)'});
  };
  if(windowObject.requestAnimationFrame)windowObject.requestAnimationFrame(reveal);
  else reveal();
}
