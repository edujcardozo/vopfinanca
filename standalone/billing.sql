-- Commercial access foundation. Payment processing stays OFF until a verified
-- merchant account, price and authorization flow have been connected.
begin;
create table vpo_private.billing_config (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  monthly_cents integer check(monthly_cents between 100 and 100000000),
  provider text,
  checkout_ready boolean not null default false,
  terms_version text not null default 'vpo-monthly-v1'
);
insert into vpo_private.billing_config(id) values(true);
create table vpo_private.billing_accounts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  trial_started_at timestamptz not null default now(),
  trial_ends_at timestamptz not null default now()+interval '15 days',
  first_charge_at timestamptz not null,
  monthly_cents integer not null check(monthly_cents between 100 and 100000000),
  payment_method text not null check(payment_method in ('credit_card','pix_automatic')),
  consent_version text not null,
  consent_at timestamptz not null default now(),
  authorization_confirmed boolean not null default false,
  provider_customer_id text,
  provider_subscription_id text unique,
  provider_authorization_id text,
  canceled_at timestamptz,
  check(trial_ends_at=trial_started_at+interval '15 days'),
  check(first_charge_at>=trial_ends_at)
);
create index billing_customer_idx on vpo_private.billing_accounts(provider_customer_id) where provider_customer_id is not null;
create table vpo_private.billing_payments (
  provider_payment_id text primary key,
  owner_id uuid not null references vpo_private.billing_accounts(owner_id) on delete cascade,
  amount_cents integer not null check(amount_cents>0),
  currency text not null check(currency='BRL'),
  period_start timestamptz not null,
  period_end timestamptz not null check(period_end>period_start),
  status text not null check(status in ('paid','refunded','disputed','void')),
  verified_at timestamptz not null default now()
);
create index billing_paid_access_idx on vpo_private.billing_payments(owner_id,period_end desc) where status='paid';
create table vpo_private.billing_events (
  event_id text primary key,
  owner_id uuid not null references vpo_private.billing_accounts(owner_id) on delete cascade,
  processed_at timestamptz not null default now()
);
create index billing_events_owner_idx on vpo_private.billing_events(owner_id);
alter table vpo_private.billing_config enable row level security;
alter table vpo_private.billing_accounts enable row level security;
alter table vpo_private.billing_payments enable row level security;
alter table vpo_private.billing_events enable row level security;
revoke all on vpo_private.billing_config,vpo_private.billing_accounts,vpo_private.billing_payments,vpo_private.billing_events from public,anon,authenticated;
create policy deny_direct_access on vpo_private.billing_config for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.billing_accounts for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.billing_payments for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.billing_events for all to anon,authenticated using(false) with check(false);

create function vpo_private.billing_access(plan_owner uuid)
returns jsonb language plpgsql set search_path='' as $$
declare config vpo_private.billing_config%rowtype; account vpo_private.billing_accounts%rowtype;
  paid_until timestamptz; allowed boolean; phase text;
begin
  select * into config from vpo_private.billing_config where id=true;
  select * into account from vpo_private.billing_accounts where owner_id=plan_owner;
  select max(period_end) into paid_until from vpo_private.billing_payments where owner_id=plan_owner and status='paid' and period_start<=now();
  allowed=not config.enabled;
  phase=case when not config.enabled then 'not_enabled' when account.owner_id is null then 'choose_payment'
    when paid_until>now() then 'active' when account.canceled_at is not null then 'canceled'
    when not account.authorization_confirmed then 'awaiting_authorization'
    when account.first_charge_at>now() then 'trialing' else 'payment_required' end;
  allowed=allowed or phase in ('active','trialing');
  return jsonb_build_object('enabled',config.enabled,'phase',phase,'canUse',allowed,'serverNow',now(),
    'trialDays',15,'trialStartedAt',account.trial_started_at,'trialEndsAt',account.trial_ends_at,
    'firstChargeAt',account.first_charge_at,'paidUntil',paid_until,'paymentMethod',account.payment_method,
    'monthlyCents',coalesce(account.monthly_cents,config.monthly_cents),'currency','BRL',
    'checkoutReady',config.enabled and config.checkout_ready and config.monthly_cents is not null,
    'termsVersion',config.terms_version,'canceledAt',account.canceled_at);
end $$;

-- Keep the tested budget API intact behind the commercial access check.
alter function vpo_private.api(text,text,jsonb) rename to plan_api;
revoke execute on function vpo_private.plan_api(text,text,jsonb) from public,anon,authenticated;
create function vpo_private.api(p_method text,p_path text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); plan_owner uuid; authorized boolean; billing jsonb; scope jsonb; result jsonb;
  config vpo_private.billing_config%rowtype; account vpo_private.billing_accounts%rowtype;
  invite_owner uuid; method text; first_charge timestamptz;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then
    return vpo_private.failure('Entre no VPO para continuar.',401,'AUTH_REQUIRED');
  end if;
  if p_body is null or jsonb_typeof(p_body)<>'object' or octet_length(p_body::text)>10500000 then return vpo_private.failure('Pedido inválido.',400); end if;
  perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||actor::text,0));
  select coalesce((select active_owner_id from vpo_private.preferences where user_id=actor),actor) into plan_owner;
  authorized=plan_owner=actor or exists(select 1 from vpo_private.members where owner_id=plan_owner and member_id=actor);
  if p_path='/api/billing' and p_method='GET' then
    if not authorized then return vpo_private.failure('Seu acesso ao plano foi removido.',403,'PLAN_ACCESS_REVOKED'); end if;
    billing=vpo_private.billing_access(plan_owner);
    return vpo_private.reply(billing||jsonb_build_object('scopeId',plan_owner,'isOwner',plan_owner=actor));
  elsif p_path='/api/billing/quote' and p_method='POST' then
    if plan_owner<>actor then return vpo_private.failure('A assinatura é gerenciada por quem compartilhou o plano.',403); end if;
    perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||actor::text,0));
    select * into config from vpo_private.billing_config where id=true;
    if not config.enabled or not config.checkout_ready or config.monthly_cents is null then return vpo_private.failure('As assinaturas ainda não estão disponíveis.',503,'BILLING_NOT_CONFIGURED'); end if;
    method=p_body->>'paymentMethod';
    if method is null or method not in ('credit_card','pix_automatic') then return vpo_private.failure('Escolha cartão ou Pix Automático.',400); end if;
    if p_body->'consent' is distinct from 'true'::jsonb or p_body->>'termsVersion' is distinct from config.terms_version then return vpo_private.failure('Confirme o valor, a recorrência e a data da primeira cobrança.',400,'BILLING_CONSENT_REQUIRED'); end if;
    -- Payment providers with date-only scheduling must not debit at midnight
    -- before 15 full days have elapsed. The first local date is rounded UP.
    first_charge=((((now()+interval '15 days') at time zone 'America/Sao_Paulo')::date+1)::timestamp at time zone 'America/Sao_Paulo');
    insert into vpo_private.billing_accounts(owner_id,first_charge_at,monthly_cents,payment_method,consent_version)
      values(actor,first_charge,config.monthly_cents,method,config.terms_version) on conflict(owner_id) do nothing;
    select * into account from vpo_private.billing_accounts where owner_id=actor;
    if account.authorization_confirmed or account.canceled_at is not null then return vpo_private.failure('Gerencie a assinatura existente antes de contratar novamente.',409,'BILLING_ALREADY_STARTED'); end if;
    update vpo_private.billing_accounts set payment_method=method where owner_id=actor;
    return vpo_private.reply(vpo_private.billing_access(actor)||jsonb_build_object('scopeId',actor,'isOwner',true));
  end if;
  if authorized and p_path='/api/plan' and p_method='PUT' then
    -- Resolve and check again while holding the same owner lock as the CAS.
    perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||plan_owner::text,0));
    billing=vpo_private.billing_access(plan_owner);
    if not (billing->>'canUse')::boolean then return vpo_private.reply(jsonb_build_object('error','Confira sua assinatura para continuar editando. Seus dados continuam disponíveis para consulta e backup.','code','BILLING_REQUIRED','billing',billing),403); end if;
  elsif p_path='/api/sharing/invites' and p_method='POST' and authorized then
    billing=vpo_private.billing_access(plan_owner);
    if not (billing->>'canUse')::boolean then return vpo_private.failure('Ative sua assinatura antes de criar um convite.',403,'BILLING_REQUIRED'); end if;
  elsif p_path='/api/sharing/accept' and p_method='POST' then
    select owner_id into invite_owner from vpo_private.invites where token_hash=encode(sha256(convert_to(coalesce(p_body->>'token',''),'UTF8')),'hex') and not revoked and expires_at>now();
    if invite_owner is not null then
      perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||invite_owner::text,0));
      billing=vpo_private.billing_access(invite_owner);
      if not (billing->>'canUse')::boolean then return vpo_private.failure('Peça a quem enviou o convite para ativar a assinatura do plano.',403,'BILLING_REQUIRED'); end if;
    end if;
  end if;
  result=vpo_private.plan_api(p_method,p_path,p_body);
  if p_method='GET' and p_path in ('/api/plan','/api/plan/head') and (result->>'status')::integer=200 then
    result=jsonb_set(result,'{body,billing}',vpo_private.billing_access(plan_owner)||jsonb_build_object('scopeId',plan_owner,'isOwner',plan_owner=actor));
  end if;
  return result;
end $$;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
create or replace function public.vpo_api(p_method text,p_path text,p_body jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.api(p_method,p_path,p_body)$$;

-- This is a SERVER-ONLY boundary. A payment integration must first verify the
-- provider notification AND retrieve its canonical object before calling this.
-- The browser cannot authorize itself, alter trial dates or mark invoices paid.
create function vpo_private.billing_verified_event(p_event_id text,p_owner uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare account vpo_private.billing_accounts%rowtype; kind text=p_data->>'kind';
  period_from timestamptz; period_to timestamptz; amount integer;
begin
  if p_event_id is null or length(p_event_id) not between 8 and 200 or p_owner is null or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid billing event'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||p_owner::text,0));
  select * into account from vpo_private.billing_accounts where owner_id=p_owner for update;
  if not found then raise exception 'Unknown billing account'; end if;
  if exists(select 1 from vpo_private.billing_events where event_id=p_event_id and owner_id<>p_owner) then raise exception 'Event belongs to another account'; end if;
  if exists(select 1 from vpo_private.billing_events where event_id=p_event_id) then return jsonb_build_object('ok',true,'replayed',true); end if;
  if kind='authorization' then
    if account.canceled_at is not null then raise exception 'Canceled authorization cannot be revived'; end if;
    if coalesce(p_data->>'customerId','')='' or coalesce(p_data->>'subscriptionId','')='' then raise exception 'Missing provider identity'; end if;
    if account.provider_customer_id is not null and account.provider_customer_id<>p_data->>'customerId' or account.provider_subscription_id is not null and account.provider_subscription_id<>p_data->>'subscriptionId' then raise exception 'Provider identity mismatch'; end if;
    update vpo_private.billing_accounts set authorization_confirmed=true,provider_customer_id=p_data->>'customerId',provider_subscription_id=p_data->>'subscriptionId',provider_authorization_id=p_data->>'authorizationId' where owner_id=p_owner;
  elsif kind='cancellation' then
    if account.provider_subscription_id is distinct from p_data->>'subscriptionId' then raise exception 'Provider identity mismatch'; end if;
    update vpo_private.billing_accounts set authorization_confirmed=false,canceled_at=now() where owner_id=p_owner;
  elsif kind='payment' then
    if account.provider_subscription_id is null or account.provider_subscription_id is distinct from p_data->>'subscriptionId' or account.provider_customer_id is distinct from p_data->>'customerId' then raise exception 'Provider identity mismatch'; end if;
    amount=(p_data->>'amountCents')::integer;period_from=(p_data->>'periodStart')::timestamptz;period_to=(p_data->>'periodEnd')::timestamptz;
    if amount is distinct from account.monthly_cents or p_data->>'currency' is distinct from 'BRL' or coalesce(p_data->>'paymentId','')='' or coalesce(p_data->>'status','') not in ('paid','refunded','disputed','void')
      or period_from is null or period_to is null or period_to<=period_from or period_to>period_from+interval '32 days' or period_from<account.first_charge_at then raise exception 'Payment amount, period or currency mismatch'; end if;
    if exists(select 1 from vpo_private.billing_payments where provider_payment_id=p_data->>'paymentId' and owner_id<>p_owner) then raise exception 'Payment belongs to another account'; end if;
    insert into vpo_private.billing_payments(provider_payment_id,owner_id,amount_cents,currency,period_start,period_end,status)
      values(p_data->>'paymentId',p_owner,amount,'BRL',period_from,period_to,p_data->>'status') on conflict(provider_payment_id) do update set
      status=case when vpo_private.billing_payments.status in ('refunded','disputed','void') and excluded.status='paid' then vpo_private.billing_payments.status else excluded.status end,verified_at=now();
  else raise exception 'Unknown billing event'; end if;
  insert into vpo_private.billing_events(event_id,owner_id) values(p_event_id,p_owner);
  return jsonb_build_object('ok',true);
end $$;
revoke execute on function vpo_private.billing_access(uuid) from public,anon,authenticated;
revoke execute on function vpo_private.billing_verified_event(text,uuid,jsonb) from public,anon,authenticated;
grant usage on schema vpo_private to service_role;
grant execute on function vpo_private.billing_verified_event(text,uuid,jsonb) to service_role;
create function public.vpo_billing_verified_event(p_event_id text,p_owner uuid,p_data jsonb)
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.billing_verified_event(p_event_id,p_owner,p_data)$$;
revoke execute on function public.vpo_billing_verified_event(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vpo_billing_verified_event(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
