import {validateState,createState,ensureMonth,payeeKey} from './core.js?v=vpo-126';
const missing=Symbol('missing');
const clone=v=>v===missing?missing:structuredClone(v);
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&v!==missing;
export function stableStringify(value){
  if(value===missing)return '[missing]';
  if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
  if(plain(value))return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
const same=(a,b)=>stableStringify(a)===stableStringify(b);
export function cloudPlan(raw){const plan=validateState(raw);plan.hideBalances=false;return plan;}
export function normalizePlan(raw){
  const p=cloudPlan(raw),transactions={};
  for(const month of Object.values(p.months))for(const tx of month.transactions)transactions[tx.id]=tx;
  return {version:p.version,planId:p.planId,example:p.example,groups:Object.fromEntries(p.groups.map(g=>[g.id,g])),groupOrder:p.groups.map(g=>g.id),categories:Object.fromEntries(p.categories.map(c=>[c.id,c])),categoryOrder:p.categories.map(c=>c.id),allocations:Object.fromEntries(Object.entries(p.months).map(([m,d])=>[m,d.assigned])),transactions,payees:Object.fromEntries(p.payees.map(name=>['payee:'+payeeKey(name),name])),wealth:p.wealth,settlements:Object.fromEntries(p.household.settlements.map(r=>[r.id,r])),savingsGoals:Object.fromEntries(p.savingsGoals.map(g=>[g.id,g])),savingsGoalOrder:p.savingsGoals.map(g=>g.id),invoiceBills:Object.fromEntries(p.invoiceBills.map(b=>[b.id,b])),cards:Object.fromEntries(p.cards.map(c=>[c.id,c]))};
}
function restorePlan(n){
  const ordered=(order,items)=>[...new Set([...order,...Object.keys(items)])].filter(id=>Object.hasOwn(items,id)).map(id=>items[id]);
  const p={version:1,planId:n.planId,example:n.example,hideBalances:false,groups:ordered(n.groupOrder,n.groups),categories:ordered(n.categoryOrder,n.categories),months:{},payees:Object.values(n.payees||{}),wealth:n.wealth,household:{version:1,settlements:Object.values(n.settlements||{})},savingsGoals:ordered(n.savingsGoalOrder||[],n.savingsGoals||{}),invoiceBills:Object.values(n.invoiceBills||{}),cards:Object.values(n.cards||{})};
  for(const [month,assigned] of Object.entries(n.allocations))p.months[month]={assigned,transactions:[]};
  for(const tx of Object.values(n.transactions))ensureMonth(p,tx.date.slice(0,7)).transactions.push(tx);
  return validateState(p);
}
export function plansEqual(a,b,{ignorePlanId=false}={}){
  if(!a||!b)return a===b;
  const aa=normalizePlan(a),bb=normalizePlan(b);if(ignorePlanId){delete aa.planId;delete bb.planId;}return same(aa,bb);
}
export function mergePlans(base,local,remote,{prefer=null}={}){
  const a=normalizePlan(base),b=normalizePlan(local),c=normalizePlan(remote),conflicts=[];
  if(same(b,c))return {ok:true,state:cloudPlan(local),conflicts:[]};
  if(same(a,b))return {ok:true,state:cloudPlan(remote),conflicts:[]};
  if(same(a,c))return {ok:true,state:cloudPlan(local),conflicts:[]};
  if(b.planId!==a.planId||c.planId!==a.planId)return {ok:false,state:null,conflicts:['plan-replaced']};
  function merge(old,left,right,path){
    if(path.startsWith('payees.')&&typeof left==='string'&&typeof right==='string'&&payeeKey(left)===payeeKey(right))return [left,right].sort()[0];
    if(same(left,right))return clone(left);
    if(same(left,old))return clone(right);
    if(same(right,old))return clone(left);
    if(Array.isArray(old)&&Array.isArray(left)&&Array.isArray(right)&&path.endsWith('Order')){
      const before=new Set(old),newIds=[...new Set([...left,...right].filter(id=>!before.has(id)))].sort();
      const valid=order=>order.filter(id=>before.has(id));
      if(!same(valid(left),old.filter(id=>left.includes(id)))||!same(valid(right),old.filter(id=>right.includes(id)))){conflicts.push(path);return clone(prefer==='local'?left:right);}
      return [...newIds,...old];
    }
    if((plain(old)||old===missing)&&plain(left)&&plain(right)){
      const out={},previous=old===missing?{}:old;
      for(const key of new Set([...Object.keys(previous),...Object.keys(left),...Object.keys(right)])){
        const value=merge(Object.hasOwn(previous,key)?previous[key]:missing,Object.hasOwn(left,key)?left[key]:missing,Object.hasOwn(right,key)?right[key]:missing,path?path+'.'+key:key);
        if(value!==missing)out[key]=value;
      }
      return out;
    }
    conflicts.push(path);return clone(prefer==='local'?left:right);
  }
  const merged=merge(a,b,c,'');if(conflicts.length&&!prefer)return {ok:false,state:null,conflicts};
  try{return {ok:true,state:restorePlan(merged),conflicts};}catch{return {ok:false,state:null,conflicts:['structure']};}
}
export function pristineExample(raw){
  if(!raw.example)return false;
  const p=cloudPlan(raw),months=Object.keys(p.months);if(months.length!==1)return false;
  const expected=cloudPlan(createState(true,months[0]));
  const withoutIds=plan=>{const n=normalizePlan(plan);delete n.planId;for(const c of Object.values(n.categories))delete c.target;n.transactions=Object.values(n.transactions).map(t=>{const c={...t};delete c.id;return c;}).sort((a,b)=>stableStringify(a).localeCompare(stableStringify(b)));return n;};
  return same(withoutIds(p),withoutIds(expected));
}
