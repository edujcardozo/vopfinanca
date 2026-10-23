-- Install after access-management.sql. Merchant details are configured privately,
-- outside source control. A customer's receipt never grants access by itself.
begin;
create table vpo_private.manual_pix_config (
  id boolean primary key default true check(id),
  enabled boolean not null default false,
  pix_key text check(pix_key ~ '^[0-9]{11}$'),
  merchant_name text check(length(merchant_name) between 1 and 25),
  merchant_city text check(length(merchant_city) between 1 and 15),
  whatsapp text check(whatsapp ~ '^55[1-9][0-9]{9,10}$'),
  check(not enabled or (pix_key is not null and merchant_name is not null and merchant_city is not null and whatsapp is not null))
);
insert into vpo_private.manual_pix_config(id) values(true);
create table vpo_private.manual_pix_payments (
  request_id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete restrict,
  confirmed_by uuid not null references auth.users(id) on delete restrict,
  amount_cents integer not null check(amount_cents>0),
  currency text not null default 'BRL' check(currency='BRL'),
  period_start timestamptz not null,
  period_end timestamptz not null check(period_end>period_start),
  confirmed_at timestamptz not null default now()
);
create index manual_pix_owner_period_idx on vpo_private.manual_pix_payments(owner_id,period_end desc);
create index manual_pix_confirmed_by_idx on vpo_private.manual_pix_payments(confirmed_by);
alter table vpo_private.manual_pix_config enable row level security;
alter table vpo_private.manual_pix_payments enable row level security;
revoke all on vpo_private.manual_pix_config,vpo_private.manual_pix_payments from public,anon,authenticated;
create policy deny_direct_access on vpo_private.manual_pix_config for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.manual_pix_payments for all to anon,authenticated using(false) with check(false);

create or replace function vpo_private.billing_access(plan_owner uuid)
returns jsonb language plpgsql set search_path='' as $$
declare config vpo_private.billing_config%rowtype; account vpo_private.billing_accounts%rowtype;
  profile vpo_private.registrations%rowtype; paid_until timestamptz; phase text;
  trial_start timestamptz; trial_end timestamptz; first_charge timestamptz; permanent boolean;
  manual_until timestamptz; manual_current_until timestamptz; provider_until timestamptz; next_start timestamptz; next_end timestamptz;
begin
  select * into config from vpo_private.billing_config where id=true;
  select * into account from vpo_private.billing_accounts where owner_id=plan_owner;
  select * into profile from vpo_private.registrations where user_id=plan_owner;
  select max(period_end) into paid_until from vpo_private.billing_payments
    where owner_id=plan_owner and status='paid' and period_start<=now();
  provider_until=paid_until;
  select max(period_end),max(period_end) filter(where period_start<=now()) into manual_until,manual_current_until
    from vpo_private.manual_pix_payments where owner_id=plan_owner;
  paid_until=greatest(paid_until,manual_until);
  permanent=profile.access_mode='permanent' or exists(select 1 from vpo_private.access_config where admin_id=plan_owner);
  trial_start=coalesce(profile.trial_started_at,account.trial_started_at);
  trial_end=coalesce(profile.trial_ends_at,account.trial_ends_at);
  first_charge=coalesce(account.first_charge_at,
    (((greatest(trial_end,now()) at time zone 'America/Sao_Paulo')::date+1)::timestamp at time zone 'America/Sao_Paulo'));
  phase=case when profile.revoked_at is not null then 'revoked'
    when not vpo_private.owner_approved(plan_owner) then 'pending'
    when permanent then 'permanent'
    when greatest(provider_until,manual_current_until)>now() then 'active'
    when trial_end>now() then 'trialing'
    when account.authorization_confirmed and account.canceled_at is null then 'awaiting_payment'
    when account.canceled_at is not null then 'canceled'
    when trial_end is not null then 'payment_required'
    else 'choose_payment' end;
  next_start=greatest(now(),trial_end,paid_until);
  next_end=((next_start at time zone 'America/Sao_Paulo')+interval '1 month') at time zone 'America/Sao_Paulo';
  return jsonb_build_object('manualPaymentVersion',md5(coalesce(paid_until::text,'')||'|'||coalesce(trial_end::text,'')),
    'manualMonthlyCents',config.monthly_cents,
    'manualPixAvailable',exists(select 1 from vpo_private.manual_pix_config where id and enabled) and not coalesce(account.authorization_confirmed and account.canceled_at is null,false),
    'nextManualPeriodStart',next_start,'nextManualPeriodEnd',next_end,
    'paymentSource',case when manual_until is not null and (provider_until is null or manual_until>=provider_until) then 'manual_pix' else 'asaas' end,
    'enabled',config.enabled,'accessEnforced',true,'phase',phase,
    'canUse',phase in ('permanent','active','trialing'),'serverNow',now(),
    'accessMode',coalesce(profile.access_mode,'subscription'),'accessSource','approval',
    'trialDays',15,'trialStartedAt',trial_start,'trialEndsAt',trial_end,
    'trialDaysRemaining',case when trial_end>now() then least(15,ceil(extract(epoch from (trial_end-now()))/86400)::integer) else 0 end,
    'firstChargeAt',case when permanent then null when account.first_charge_at is not null or config.enabled then first_charge else null end,
    'paidUntil',paid_until,'paymentMethod',account.payment_method,'hasBillingAccount',account.owner_id is not null,
    'authorizationConfirmed',coalesce(account.authorization_confirmed,false),
    'monthlyCents',coalesce(account.monthly_cents,config.monthly_cents),'currency','BRL','allowedMethods',config.allowed_methods,
    'checkoutReady',not coalesce(permanent,false) and config.enabled and config.checkout_ready and config.monthly_cents is not null,
    'termsVersion',config.terms_version,'canceledAt',account.canceled_at,
    'cancellationPending',account.cancellation_requested_at is not null and account.canceled_at is null,
    'canCancel',account.owner_id is not null and account.canceled_at is null);
end $$;

-- Preserve the established registration, trial, removal and Asaas guards.
alter function vpo_private.api(text,text,jsonb) rename to access_api;
revoke execute on function vpo_private.access_api(text,text,jsonb) from public,anon,authenticated;
create function vpo_private.api(p_method text,p_path text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); is_admin boolean; target uuid; request_uuid uuid; result jsonb; info jsonb;
  config vpo_private.manual_pix_config%rowtype; profile vpo_private.registrations%rowtype;
  receipt vpo_private.manual_pix_payments%rowtype; price integer; period_start timestamptz; period_end timestamptz;
begin
  if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then
    return vpo_private.failure('Entre no VPO para continuar.',401,'AUTH_REQUIRED');
  end if;
  if p_body is null or jsonb_typeof(p_body) is distinct from 'object' or octet_length(p_body::text)>10500000 then
    return vpo_private.failure('Pedido inválido.',400);
  end if;
  if exists(select 1 from vpo_private.registrations where user_id=actor and revoked_at is not null) then
    return vpo_private.access_api(p_method,p_path,p_body);
  end if;
  select exists(select 1 from vpo_private.access_config where admin_id=actor) into is_admin;
  if p_path='/api/access/pix' and p_method='POST' then
    if not is_admin then return vpo_private.failure('Acesso restrito ao administrador.',403); end if;
    if p_body->'confirm' is distinct from 'true'::jsonb then return vpo_private.failure('Confirme o recebimento do Pix no seu banco.',400); end if;
    begin target=(p_body->>'userId')::uuid; request_uuid=(p_body->>'requestId')::uuid;
      exception when others then return vpo_private.failure('Confirmação inválida.',400); end;
    if target is null or request_uuid is null or exists(select 1 from vpo_private.access_config where admin_id=target) then
      return vpo_private.failure('Escolha um cliente para confirmar o Pix.',400);
    end if;
    perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||target::text,0));
    perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||target::text,0));
    select * into profile from vpo_private.registrations where user_id=target for update;
    if not found or profile.status<>'approved' or profile.revoked_at is not null or profile.access_mode='permanent' then
      return vpo_private.failure('O Pix mensal é destinado a clientes aprovados com acesso por assinatura.',409);
    end if;
    select * into receipt from vpo_private.manual_pix_payments where request_id=request_uuid;
    if found then
      if receipt.owner_id<>target or receipt.confirmed_by<>actor then return vpo_private.failure('Confirmação já utilizada.',409); end if;
      return vpo_private.reply(jsonb_build_object('ok',true,'replayed',true,'paidUntil',receipt.period_end));
    end if;
    -- A pending/active provider subscription must be settled before manual Pix.
    if exists(select 1 from vpo_private.billing_accounts a left join vpo_private.billing_checkouts c on c.owner_id=a.owner_id
      where a.owner_id=target and a.canceled_at is null and
        (a.authorization_confirmed or a.cancellation_requested_at is not null or c.status in ('creating','ready'))) then
      return vpo_private.failure('Cancele e confirme a renovação do Asaas antes de receber por Pix manual.',409,'BILLING_CANCEL_FIRST');
    end if;
    select * into config from vpo_private.manual_pix_config where id;
    select monthly_cents into price from vpo_private.billing_config where id;
    if not config.enabled or price is null then return vpo_private.failure('O Pix está indisponível.',503); end if;
    info=vpo_private.billing_access(target);
    if p_body->>'paymentVersion' is distinct from info->>'manualPaymentVersion' then
      return vpo_private.failure('O período deste cliente mudou. Atualize a lista antes de confirmar outro pagamento.',409,'PAYMENT_CHANGED');
    end if;
    period_start=(info->>'nextManualPeriodStart')::timestamptz;
    period_end=(info->>'nextManualPeriodEnd')::timestamptz;
    insert into vpo_private.manual_pix_payments(request_id,owner_id,confirmed_by,amount_cents,period_start,period_end)
      values(request_uuid,target,actor,price,period_start,period_end);
    return vpo_private.reply(jsonb_build_object('ok',true,'paidUntil',period_end));
  end if;
  if p_path='/api/billing/quote' and p_method='POST' and exists(
    select 1 from vpo_private.manual_pix_payments mp where mp.owner_id=actor and mp.period_end>now()) then
    return vpo_private.failure('Seu período Pix já está pago. Aguarde o fim dele antes de autorizar uma assinatura automática.',409,'MANUAL_PERIOD_ACTIVE');
  end if;
  result=vpo_private.access_api(p_method,p_path,p_body);
  if p_path='/api/billing' and p_method='GET' and (result->>'status')::integer=200 then
    info=result->'body';
    -- Shared invitees never see a second payment request. Permanent customers
    -- have no payment CTA; only the administrator can preview the customer UI.
    if (info->>'isOwner')::boolean and (info->>'phase'<>'permanent' or is_admin) and vpo_private.owner_approved(actor) then
      select * into config from vpo_private.manual_pix_config where id;
      select monthly_cents into price from vpo_private.billing_config where id;
      if config.enabled and price is not null and not exists(
        select 1 from vpo_private.billing_accounts a left join vpo_private.billing_checkouts c on c.owner_id=a.owner_id
        where a.owner_id=actor and a.canceled_at is null and
          (a.authorization_confirmed or a.cancellation_requested_at is not null or c.status in ('creating','ready'))) then
        info=info||jsonb_build_object('manualPix',jsonb_build_object('ready',true,'key',config.pix_key,'keyType','cpf',
          'merchantName',config.merchant_name,'merchantCity',config.merchant_city,'whatsapp',config.whatsapp,
          'amountCents',price,'accountEmail',(select email from auth.users where id=actor),
          'preview',is_admin and info->>'phase'='permanent'));
        result=jsonb_set(result,'{body}',info);
      end if;
    end if;
  end if;
  return result;
end $$;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
create or replace function public.vpo_api(p_method text,p_path text,p_body jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.api(p_method,p_path,p_body)$$;

-- A stale checkout prepared before a manual confirmation cannot overlap it.
create or replace function vpo_private.billing_gateway(p_action text,p_owner uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_action='prepare' then
    perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||p_owner::text,0));
    perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||p_owner::text,0));
    if not vpo_private.owner_approved(p_owner) or exists(select 1 from vpo_private.registrations where user_id=p_owner and revoked_at is not null)
      or (vpo_private.billing_access(p_owner)->>'phase')='permanent'
      or exists(select 1 from vpo_private.manual_pix_payments where owner_id=p_owner and period_end>now()) then
      raise exception 'Account is not eligible for checkout';
    end if;
  end if;
  return vpo_private.provider_billing_gateway(p_action,p_owner,p_data);
end $$;
revoke execute on function vpo_private.billing_gateway(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function vpo_private.billing_gateway(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
