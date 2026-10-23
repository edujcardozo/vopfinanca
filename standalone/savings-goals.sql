-- Install after manual-pix.sql. Objectives share the existing plan document,
-- account permissions, revision checks and payment access controls.
begin;
alter function vpo_private.api(text,text,jsonb) rename to savings_plan_api;
revoke execute on function vpo_private.savings_plan_api(text,text,jsonb) from public,anon,authenticated;
create function vpo_private.api(p_method text,p_path text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); goals jsonb; goal jsonb; seen text[]='{}'; previous jsonb;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then
    return vpo_private.failure('Entre no VPO para continuar.',401,'AUTH_REQUIRED');
  end if;
  if p_body is null or jsonb_typeof(p_body) is distinct from 'object' or octet_length(p_body::text)>10500000 then
    return vpo_private.failure('Pedido inválido.',400);
  end if;
  if p_path='/api/plan' and p_method='PUT' then
    -- The established read first verifies membership and holds the same plan
    -- lock until the delegated write completes in this transaction.
    previous=vpo_private.savings_plan_api('GET','/api/plan','{}');
    if (previous->>'status')::integer<>200 then return previous; end if;
    goals=p_body->'state'->'savingsGoals';
    if goals is not null then
      if jsonb_typeof(goals) is distinct from 'array' then return vpo_private.failure('Objetivos inválidos.',400); end if;
      if jsonb_array_length(goals)>200 then return vpo_private.failure('Limite de objetivos excedido.',400); end if;
      for goal in select value from jsonb_array_elements(goals) loop
        if jsonb_typeof(goal) is distinct from 'object'
          or jsonb_typeof(goal->'id') is distinct from 'string' or goal->>'id'!~'^[a-zA-Z0-9_-]{1,64}$'
          or goal->>'id'=any(seen) or goal->>'id' in ('__proto__','constructor','prototype')
          or jsonb_typeof(goal->'name') is distinct from 'string' or length(btrim(goal->>'name')) not between 1 and 70
          or jsonb_typeof(goal->'targetAmount') is distinct from 'number'
          or jsonb_typeof(goal->'savedAmount') is distinct from 'number' then return vpo_private.failure('Objetivo inválido.',400); end if;
        if (goal->>'targetAmount')::numeric not between 1 and 1000000000000
          or (goal->>'targetAmount')::numeric<>trunc((goal->>'targetAmount')::numeric)
          or (goal->>'savedAmount')::numeric not between 0 and 1000000000000
          or (goal->>'savedAmount')::numeric<>trunc((goal->>'savedAmount')::numeric) then return vpo_private.failure('Valores do objetivo inválidos.',400); end if;
        seen=array_append(seen,goal->>'id');
      end loop;
    elsif (case when jsonb_typeof(previous#>'{body,state,savingsGoals}')='array' then jsonb_array_length(previous#>'{body,state,savingsGoals}')>0 else false end) then
      return vpo_private.failure('Atualize a página para preservar seus objetivos.',426,'CLIENT_UPDATE_REQUIRED');
    end if;
  end if;
  return vpo_private.savings_plan_api(p_method,p_path,p_body);
end $$;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
create or replace function public.vpo_api(p_method text,p_path text,p_body jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.api(p_method,p_path,p_body)$$;
notify pgrst,'reload schema';
commit;
