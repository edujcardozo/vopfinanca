import {historyIcon} from './planning-history-ui.js';

export const HISTORY_INTRO_KEY='vpo-planning-history-intro-v1';

// Use the account's own preference storage, separate from the shared budget.
export function createPlanningHistoryIntro({storage,canShow,getAccount=()=>'',openDialog,closeDialog,onExplore,documentObject=document}){
  let shown=false;
  function maybeShow(){
    if(shown||!canShow())return false;
    const account=getAccount(),key=HISTORY_INTRO_KEY+(account?':'+account:'');
    try{if(storage.getItem(key)==='seen'){shown=true;return false;}}catch{/* Keep this visit usable when browser storage is unavailable. */}
    openDialog('Seu histórico ajuda a planejar.',`<section class="history-welcome" aria-label="Como usar o histórico" data-dialog-flow>
      <div class="history-welcome-badge">${historyIcon}<span>Usar histórico</span></div>
      <p class="history-welcome-lead">Preencha o <strong>planejado do mês</strong> com base no que você já gastou. Escolha uma referência:</p>
      <ul class="history-welcome-methods">
        <li><span aria-hidden="true">↶</span><div><strong>Mês passado</strong><small>Use os gastos reais do mês anterior.</small></div></li>
        <li><span aria-hidden="true">6</span><div><strong>Média dos últimos 6 meses</strong><small>Suavize os meses com gastos diferentes.</small></div></li>
        <li><span aria-hidden="true">12</span><div><strong>Média do ano</strong><small>Considere os meses anteriores do mesmo ano.</small></div></li>
      </ul>
      <p class="history-welcome-note"><span aria-hidden="true">✓</span><span>Você escolhe as categorias, revisa os valores e confirma antes de alterar o planejado.</span></p>
      <p class="history-welcome-empty">Começou agora? Registre seus gastos para ter sugestões nos próximos meses.<span class="history-welcome-mobile">No celular: <strong>••• → Planejar com histórico</strong>.</span></p>
      <div class="history-welcome-actions"><button type="button" class="subtle-button" data-history-intro-explore>Ver opções <span aria-hidden="true">→</span></button><button type="button" class="btn btn-blue" data-history-intro-dismiss>Entendi</button></div>
    </section>`,'UM PLANEJAMENTO MAIS FÁCIL');
    shown=true;
    try{storage.setItem(key,'seen');}catch{/* In-memory dismissal still prevents repeated popups during this visit. */}
    documentObject.querySelector('[data-history-intro-dismiss]').onclick=closeDialog;
    documentObject.querySelector('[data-history-intro-explore]').onclick=()=>{closeDialog();onExplore();};
    return true;
  }
  return {maybeShow};
}
