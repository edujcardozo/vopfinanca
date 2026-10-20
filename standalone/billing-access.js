// This improves the read-only experience. The database independently rejects
// unauthorized writes; editing this code cannot grant a subscription.
const editing='[data-add-transaction],[data-edit-tx],[data-delete-tx],[data-assigned-input],[data-category-menu],[data-edit-group],[data-add-category-group],[data-options-group],[data-options-category],#add-category,#add-group,#reset-empty,#start-empty,#load-demo,#import-trigger,[data-new-settlement],[data-edit-settlement],[data-delete-settlement]';
export function mountBillingAccess({root,showBilling,documentObject=document}){
  let allowed=true;
  const banner=documentObject.createElement('div');banner.className='vpo-readonly-banner';banner.hidden=true;
  banner.innerHTML='<span>Seu plano está disponível para consulta e backup.</span><button type="button" class="text-link">Conferir assinatura →</button>';
  banner.querySelector('button').onclick=showBilling;
  (root.querySelector('#app-main')||root).prepend(banner);
  function guard(event){
    if(allowed)return;
    const target=event.target.closest?.(editing);
    const submitting=event.type==='submit'&&event.target.matches('#transaction-form,#settlement-form,#category-form,#new-category-form,#delete-category-form,#category-menu,#group-form,#wealth-form');
    const dragging=event.type==='pointerdown'&&event.target.closest?.('[data-sort-handle],.group-name,.category-menu-trigger');
    if(target||submitting||dragging){event.preventDefault();event.stopImmediatePropagation();if(event.type!=='pointerdown')showBilling();}
  }
  function fields(){for(const input of root.querySelectorAll('[data-assigned-input]'))input.readOnly=!allowed;}
  for(const type of ['click','submit','pointerdown'])documentObject.addEventListener(type,guard,true);
  const observer=globalThis.MutationObserver?new MutationObserver(fields):null;
  observer?.observe(root,{subtree:true,childList:true});
  return {update(info){allowed=!info?.enabled||info.canUse===true;banner.hidden=allowed;root.toggleAttribute('data-subscription-readonly',!allowed);fields();},destroy(){observer?.disconnect();for(const type of ['click','submit','pointerdown'])documentObject.removeEventListener(type,guard,true);banner.remove();}};
}
