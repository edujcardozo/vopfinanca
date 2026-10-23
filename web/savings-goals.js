const newGoalId=()=>globalThis.crypto?.randomUUID?.()||`goal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
export const MAX_SAVINGS_GOALS=200;
export function checkedSavingsGoals(input=[]){
  if(!Array.isArray(input)||input.length>MAX_SAVINGS_GOALS)throw new Error('Lista de objetivos inválida.');
  const seen=new Set(),cents=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
  return input.map(g=>{
    if(!g||typeof g!=='object'||Array.isArray(g)||typeof g.id!=='string'||!/^[a-z0-9_-]{1,64}$/i.test(g.id)||['__proto__','constructor','prototype'].includes(g.id)||seen.has(g.id)||typeof g.name!=='string'||!g.name.trim()||g.name.length>70||!cents(g.targetAmount)||g.targetAmount===0||!cents(g.savedAmount))throw new Error('Objetivo inválido.');
    seen.add(g.id);return {id:g.id,name:g.name.trim(),targetAmount:g.targetAmount,savedAmount:g.savedAmount};
  });
}
export function saveSavingsGoal(state,values,goalId=null){
  const goals=state.savingsGoals||[],index=goalId?goals.findIndex(g=>g.id===goalId):-1;
  if(goalId&&index<0)throw new Error('Este objetivo não está mais disponível.');
  if(!goalId&&goals.length>=MAX_SAVINGS_GOALS)throw new Error('Você pode acompanhar até 200 objetivos.');
  const goal=checkedSavingsGoals([{...values,id:goalId||newGoalId()}])[0];
  const next=[...goals];if(index>=0)next[index]=goal;else next.push(goal);
  state.savingsGoals=next;return goal;
}
export function savingsProgress(goal){return {percent:Math.min(100,Math.floor(goal.savedAmount/goal.targetAmount*100)),remaining:Math.max(0,goal.targetAmount-goal.savedAmount),complete:goal.savedAmount>=goal.targetAmount};}
