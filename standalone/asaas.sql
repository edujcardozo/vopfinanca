-- Asaas card subscriptions. Apply after database.sql and billing.sql.
-- Activating billing remains a separate, explicit deployment operation.
begin;
alter table vpo_private.billing_config add column allowed_methods jsonb not null default '["credit_card"]' check(jsonb_typeof(allowed_methods)='array');
alter table vpo_private.billing_config add column gateway_environment text not null default 'sandbox' check(gateway_environment in ('sandbox','production'));
update vpo_private.billing_config set monthly_cents=1290,provider='asaas',allowed_methods='["credit_card"]',terms_version='vpo-asaas-monthly-v1' where id=true;
alter table vpo_private.billing_accounts add column provider_environment text check(provider_environment in ('sandbox','production'));
alter table vpo_private.billing_accounts add column cancellation_requested_at timestamptz;

create table vpo_private.billing_checkouts (
  owner_id uuid primary key references vpo_private.billing_accounts(owner_id) on delete cascade,
  attempt_id uuid not null unique default gen_random_uuid(),
  environment text not null check(environment in ('sandbox','production')),
  checkout_id text unique,
  status text not null default 'creating' check(status in ('creating','ready','closed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '60 minutes'
);
alter table vpo_private.billing_checkouts enable row level security;
revoke all on vpo_private.billing_checkouts from public,anon,authenticated;
create policy deny_direct_access on vpo_private.billing_checkouts for all to anon,authenticated using(false) with check(false);

create or replace function vpo_private.billing_access(plan_owner uuid)
returns jsonb language plpgsql set search_path='' as $$
declare config vpo_private.billing_config%rowtype; account vpo_private.billing_accounts%rowtype;
  paid_until timestamptz; phase text;
begin
  select * into config from vpo_private.billing_config where id=true;
  select * into account from vpo_private.billing_accounts where owner_id=plan_owner;
  select max(period_end) into paid_until from vpo_private.billing_payments where owner_id=plan_owner and status='paid' and period_start<=now();
  phase=case when not config.enabled then 'not_enabled' when account.owner_id is null then 'choose_payment'
    when paid_until>now() then 'active' when account.canceled_at is not null then 'canceled'
    when not account.authorization_confirmed then 'awaiting_authorization'
    when account.first_charge_at>now() then 'trialing' else 'payment_required' end;
  return jsonb_build_object('enabled',config.enabled,'phase',phase,'canUse',not config.enabled or phase in ('active','trialing'),'serverNow',now(),
    'trialDays',15,'trialStartedAt',account.trial_started_at,'trialEndsAt',account.trial_ends_at,
    'firstChargeAt',account.first_charge_at,'paidUntil',paid_until,'paymentMethod',account.payment_method,
    'monthlyCents',coalesce(account.monthly_cents,config.monthly_cents),'currency','BRL','allowedMethods',config.allowed_methods,
    'checkoutReady',config.enabled and config.checkout_ready and config.monthly_cents is not null,
    'termsVersion',config.terms_version,'canceledAt',account.canceled_at,
    'cancellationPending',account.cancellation_requested_at is not null and account.canceled_at is null,
    'canCancel',account.owner_id is not null and account.canceled_at is null);
end $$;

-- Keep the original API and locks behind the provider-specific checks.
alter function vpo_private.api(text,text,jsonb) rename to billing_api;
revoke execute on function vpo_private.billing_api(text,text,jsonb) from public,anon,authenticated;
create function vpo_private.api(p_method text,p_path text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); config vpo_private.billing_config%rowtype; account vpo_private.billing_accounts%rowtype;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then return vpo_private.failure('Entre no VPO para continuar.',401,'AUTH_REQUIRED'); end if;
  if p_path='/api/billing/quote' and p_method='POST' then
    perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||actor::text,0));
    perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||actor::text,0));
    select * into config from vpo_private.billing_config where id=true;
    if not (config.allowed_methods ? coalesce(p_body->>'paymentMethod','')) then return vpo_private.failure('Escolha um meio de pagamento disponível.',400,'BILLING_METHOD_UNAVAILABLE'); end if;
    select * into account from vpo_private.billing_accounts where owner_id=actor;
    if account.cancellation_requested_at is not null then return vpo_private.failure('Conclua o cancelamento em andamento.',409,'BILLING_CANCELLATION_PENDING'); end if;
    if account.owner_id is not null and account.first_charge_at<=now() and not account.authorization_confirmed then return vpo_private.failure('Seu período inicial já terminou. Entre em contato para concluir a assinatura sem reiniciar o teste.',409,'BILLING_TRIAL_EXPIRED'); end if;
  end if;
  return vpo_private.billing_api(p_method,p_path,p_body);
end $$;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
create or replace function public.vpo_api(p_method text,p_path text,p_body jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.api(p_method,p_path,p_body)$$;

-- No direct table grants or arbitrary SQL. These operations are available only
-- to the Netlify function using its private Supabase key.
create function vpo_private.billing_gateway(p_action text,p_owner uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare config vpo_private.billing_config%rowtype; account vpo_private.billing_accounts%rowtype;
  checkout vpo_private.billing_checkouts%rowtype; actor_owner uuid; create_new boolean=false;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>8192 then raise exception 'Invalid gateway request'; end if;
  select * into config from vpo_private.billing_config where id=true;
  if p_data->>'environment' is distinct from config.gateway_environment or config.provider is distinct from 'asaas' then raise exception 'Gateway environment mismatch'; end if;
  if p_action='lookup' then
    if coalesce(p_data->>'checkoutId','')<>'' then
      select owner_id into actor_owner from vpo_private.billing_checkouts where checkout_id=p_data->>'checkoutId' and environment=config.gateway_environment;
    elsif coalesce(p_data->>'subscriptionId','')<>'' then
      select owner_id into actor_owner from vpo_private.billing_accounts where provider_subscription_id=p_data->>'subscriptionId' and provider_environment=config.gateway_environment;
    end if;
    if actor_owner is null then return null; end if;
    p_owner=actor_owner;
  end if;
  if p_owner is null then raise exception 'Missing billing account'; end if;
  perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||p_owner::text,0));
  select * into account from vpo_private.billing_accounts where owner_id=p_owner for update;
  if not found then raise exception 'Unknown billing account'; end if;
  select * into checkout from vpo_private.billing_checkouts where owner_id=p_owner for update;
  if account.provider_environment is not null and account.provider_environment<>config.gateway_environment then raise exception 'Gateway environment mismatch'; end if;
  if p_action in ('prepare','cancel') then
    select coalesce((select active_owner_id from vpo_private.preferences where user_id=p_owner),p_owner) into actor_owner;
    if actor_owner<>p_owner then raise exception 'Only the active plan owner can manage billing'; end if;
  end if;
  if p_action='prepare' then
    if not config.enabled or not config.checkout_ready then raise exception 'Billing not configured'; end if;
    if account.payment_method<>'credit_card' or account.consent_version<>config.terms_version or account.canceled_at is not null or account.cancellation_requested_at is not null or account.authorization_confirmed then raise exception 'Billing already started or canceled'; end if;
    if account.first_charge_at<=now() then raise exception 'Trial quote expired'; end if;
    update vpo_private.billing_accounts set provider_environment=config.gateway_environment where owner_id=p_owner;
    if checkout.owner_id is null or checkout.status='closed' then
      insert into vpo_private.billing_checkouts(owner_id,environment) values(p_owner,config.gateway_environment)
      on conflict(owner_id) do update set attempt_id=gen_random_uuid(),environment=excluded.environment,checkout_id=null,status='creating',created_at=now(),expires_at=now()+interval '60 minutes';
      select * into checkout from vpo_private.billing_checkouts where owner_id=p_owner;
      create_new=true;
    end if;
  elsif p_action='attach' then
    if checkout.attempt_id::text is distinct from p_data->>'attemptId' or checkout.status<>'creating' or coalesce(p_data->>'checkoutId','')!~'^[a-zA-Z0-9_-]{8,100}$' then raise exception 'Checkout identity mismatch'; end if;
    update vpo_private.billing_checkouts set checkout_id=p_data->>'checkoutId',status='ready' where owner_id=p_owner;
    select * into checkout from vpo_private.billing_checkouts where owner_id=p_owner;
  elsif p_action='retire' then
    if checkout.checkout_id is distinct from p_data->>'checkoutId' or account.authorization_confirmed or account.cancellation_requested_at is not null then raise exception 'Checkout cannot be replaced'; end if;
    update vpo_private.billing_checkouts set status='closed' where owner_id=p_owner;
  elsif p_action='cancel' then
    update vpo_private.billing_accounts set cancellation_requested_at=coalesce(cancellation_requested_at,now()) where owner_id=p_owner;
    select * into account from vpo_private.billing_accounts where owner_id=p_owner;
  elsif p_action='cancel_finish' then
    if account.cancellation_requested_at is null then raise exception 'Cancellation was not requested'; end if;
    if checkout.status='creating' then raise exception 'Checkout creation still unresolved'; end if;
    update vpo_private.billing_accounts set canceled_at=coalesce(canceled_at,now()),authorization_confirmed=false where owner_id=p_owner;
    update vpo_private.billing_checkouts set status='closed' where owner_id=p_owner;
    select * into account from vpo_private.billing_accounts where owner_id=p_owner;
  elsif p_action not in ('lookup','context') then raise exception 'Unknown gateway action'; end if;
  return jsonb_build_object('ownerId',p_owner,'create',create_new,'attemptId',checkout.attempt_id,'checkoutId',checkout.checkout_id,
    'checkoutStatus',checkout.status,'expiresAt',checkout.expires_at,'monthlyCents',account.monthly_cents,
    'firstChargeAt',account.first_charge_at,'trialStartedAt',account.trial_started_at,'customerId',account.provider_customer_id,
    'subscriptionId',account.provider_subscription_id,'authorized',account.authorization_confirmed,'canceledAt',account.canceled_at,
    'cancellationPending',account.cancellation_requested_at is not null and account.canceled_at is null);
end $$;
revoke execute on function vpo_private.billing_gateway(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function vpo_private.billing_gateway(text,uuid,jsonb) to service_role;
create function public.vpo_billing_gateway(p_action text,p_owner uuid default null,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.billing_gateway(p_action,p_owner,p_data)$$;
revoke execute on function public.vpo_billing_gateway(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vpo_billing_gateway(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
