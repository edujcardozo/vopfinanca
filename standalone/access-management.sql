-- Upgrade after registration.sql and participants.sql in the dedicated VPO project.
-- Access removal is reversible; budgets, Auth accounts and payment records are retained.
begin;
alter table vpo_private.registrations
  add column access_mode text not null default 'subscription' check(access_mode in ('subscription','permanent')),
  add column trial_started_at timestamptz,
  add column trial_ends_at timestamptz,
  add column revoked_at timestamptz,
  add constraint registration_trial_window check(
    (trial_started_at is null and trial_ends_at is null) or
    (trial_started_at is not null and trial_ends_at is not null and trial_ends_at=trial_started_at+interval '15 days'));

-- Existing approvals keep their real approval date. The administrator is not a customer trial.
update vpo_private.registrations r set
  trial_started_at=coalesce(b.trial_started_at,r.decided_at,now()),
  trial_ends_at=coalesce(b.trial_started_at,r.decided_at,now())+interval '15 days'
from (select u.user_id,a.trial_started_at from vpo_private.registrations u
  left join vpo_private.billing_accounts a on a.owner_id=u.user_id) b
where r.user_id=b.user_id and r.status='approved';
update vpo_private.registrations set access_mode='permanent'
  where user_id in (select admin_id from vpo_private.access_config);
create index registration_revoked_idx on vpo_private.registrations(revoked_at desc,user_id) where revoked_at is not null;
create table vpo_private.access_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('approve_trial','approve_permanent','permanent','subscription','revoke','restore')),
  created_at timestamptz not null default now(),
  previous_access jsonb not null,
  next_access jsonb not null
);
create index access_events_user_idx on vpo_private.access_events(user_id,created_at desc);
create index access_events_actor_idx on vpo_private.access_events(actor_id);
alter table vpo_private.access_events enable row level security;
revoke all on vpo_private.access_events from public,anon,authenticated;
create policy deny_direct_access on vpo_private.access_events for all to anon,authenticated using(false) with check(false);

create or replace function vpo_private.owner_approved(owner_uuid uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from vpo_private.access_config where admin_id=owner_uuid)
    or exists(select 1 from vpo_private.registrations where user_id=owner_uuid and status='approved' and revoked_at is null)
$$;

create or replace function vpo_private.billing_access(plan_owner uuid)
returns jsonb language plpgsql set search_path='' as $$
declare config vpo_private.billing_config%rowtype; account vpo_private.billing_accounts%rowtype;
  profile vpo_private.registrations%rowtype; paid_until timestamptz; phase text;
  trial_start timestamptz; trial_end timestamptz; first_charge timestamptz; permanent boolean;
begin
  select * into config from vpo_private.billing_config where id=true;
  select * into account from vpo_private.billing_accounts where owner_id=plan_owner;
  select * into profile from vpo_private.registrations where user_id=plan_owner;
  select max(period_end) into paid_until from vpo_private.billing_payments
    where owner_id=plan_owner and status='paid' and period_start<=now();
  permanent=profile.access_mode='permanent' or exists(select 1 from vpo_private.access_config where admin_id=plan_owner);
  trial_start=coalesce(profile.trial_started_at,account.trial_started_at);
  trial_end=coalesce(profile.trial_ends_at,account.trial_ends_at);
  first_charge=coalesce(account.first_charge_at,
    (((greatest(trial_end,now()) at time zone 'America/Sao_Paulo')::date+1)::timestamp at time zone 'America/Sao_Paulo'));
  phase=case when profile.revoked_at is not null then 'revoked'
    when not vpo_private.owner_approved(plan_owner) then 'pending'
    when permanent then 'permanent'
    when paid_until>now() then 'active'
    when trial_end>now() then 'trialing'
    when account.authorization_confirmed and account.canceled_at is null then 'awaiting_payment'
    when account.canceled_at is not null then 'canceled'
    when trial_end is not null then 'payment_required'
    else 'choose_payment' end;
  return jsonb_build_object('enabled',config.enabled,'accessEnforced',true,'phase',phase,
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

create or replace function vpo_private.access_info(actor uuid)
returns jsonb language plpgsql set search_path='' as $$
declare profile vpo_private.registrations%rowtype; owner_uuid uuid; admin boolean; allowed boolean;
begin
  select * into profile from vpo_private.registrations where user_id=actor;
  select exists(select 1 from vpo_private.access_config where admin_id=actor) into admin;
  select coalesce((select active_owner_id from vpo_private.preferences where user_id=actor),actor) into owner_uuid;
  allowed=profile.user_id is not null and profile.status<>'rejected' and profile.revoked_at is null and
    vpo_private.owner_approved(owner_uuid) and (owner_uuid=actor or exists(
      select 1 from vpo_private.members where owner_id=owner_uuid and member_id=actor));
  return jsonb_build_object('canUse',allowed,'isAdmin',admin,'ownApproved',vpo_private.owner_approved(actor),
    'hasProfile',profile.user_id is not null,'status',case when profile.revoked_at is not null then 'revoked' else coalesce(profile.status,'incomplete') end,
    'userId',actor,'fullName',profile.full_name,'phone',profile.phone,'email',(select email from auth.users where id=actor),
    'notification',coalesce((select status from vpo_private.registration_mail where user_id=actor),'none'),
    'billing',vpo_private.billing_access(owner_uuid)||jsonb_build_object('scopeId',owner_uuid,'isOwner',owner_uuid=actor));
end $$;

-- Older entry points remain private. Existing registration and participant behavior is retained.
alter function vpo_private.api(text,text,jsonb) rename to registration_api;
revoke execute on function vpo_private.registration_api(text,text,jsonb) from public,anon,authenticated;
create function vpo_private.api(p_method text,p_path text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); actor_email text; is_admin boolean; target uuid; action text;
  profile vpo_private.registrations%rowtype; before_access jsonb; result jsonb; info jsonb;
  list_status text; page integer; items jsonb; total integer; owner_uuid uuid; had_account boolean;
begin
  select email into actor_email from auth.users where id=actor and email_confirmed_at is not null;
  if actor is null or actor_email is null then return vpo_private.failure('Confirme seu e-mail para continuar.',401,'AUTH_REQUIRED'); end if;
  if jsonb_typeof(p_body) is distinct from 'object' or octet_length(p_body::text)>10500000 then return vpo_private.failure('Pedido inválido.',400); end if;
  perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||actor::text,0));
  update vpo_private.access_config set admin_id=actor where id and admin_id is null and lower(admin_email)=lower(actor_email);
  select exists(select 1 from vpo_private.access_config where admin_id=actor) into is_admin;
  info=vpo_private.access_info(actor);
  if p_path='/api/access' and p_method='GET' then return vpo_private.reply(info); end if;
  if info->>'status'='revoked' then return vpo_private.failure('Seu acesso ao VPO foi removido. Entre em contato com o administrador.',403,'ACCESS_REVOKED'); end if;

  if p_path='/api/access/requests' and p_method='POST' then
    if not is_admin then return vpo_private.failure('Acesso restrito ao administrador.',403); end if;
    list_status=coalesce(p_body->>'status','pending');
    if list_status not in ('pending','approved','rejected','revoked') or coalesce(p_body->>'page','0')!~'^[0-9]{1,4}$' then return vpo_private.failure('Filtro inválido.',400); end if;
    page=coalesce(p_body->>'page','0')::integer;
    select count(*) into total from vpo_private.registrations r where r.user_id<>actor and
      case when list_status='revoked' then r.revoked_at is not null else r.revoked_at is null and
        case when list_status='approved' then r.status in ('approved','guest') else r.status=list_status end end;
    select coalesce(jsonb_agg(to_jsonb(s)),'[]') into items from (
      select r.user_id as id,r.full_name as name,u.email,r.phone,r.requested_at as "requestedAt",r.status,
        r.decided_at as "approvedAt",r.revoked_at as "revokedAt",r.access_mode as "accessMode",
        coalesce(m.status,'none') as notification,
        vpo_private.billing_access(r.user_id)||jsonb_build_object('isOwner',true) as access
      from vpo_private.registrations r join auth.users u on u.id=r.user_id
      left join vpo_private.registration_mail m on m.user_id=r.user_id
      left join vpo_private.preferences p on p.user_id=r.user_id
      where r.user_id<>actor and case when list_status='revoked' then r.revoked_at is not null else r.revoked_at is null and
        case when list_status='approved' then r.status in ('approved','guest') else r.status=list_status end end
      order by r.requested_at desc,r.user_id limit 10 offset page*10
    ) s;
    return vpo_private.reply(jsonb_build_object('items',items,'total',total,'page',page,'pageSize',10));
  end if;

  if p_path in ('/api/access/manage','/api/access/decision') and p_method='POST' then
    if not is_admin then return vpo_private.failure('Acesso restrito ao administrador.',403); end if;
    begin target=(p_body->>'userId')::uuid; exception when others then return vpo_private.failure('Cadastro inválido.',400); end;
    if target is null or exists(select 1 from vpo_private.access_config where admin_id=target) then return vpo_private.failure('A conta do administrador não pode ser alterada por esta opção.',400); end if;
    perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||target::text,0));
    perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||target::text,0));
    select * into profile from vpo_private.registrations where user_id=target for update;
    if not found then return vpo_private.failure('Cadastro não encontrado.',404); end if;
    before_access=jsonb_build_object('status',profile.status,'accessMode',profile.access_mode,'trialStartedAt',profile.trial_started_at,'trialEndsAt',profile.trial_ends_at,'revokedAt',profile.revoked_at);
    if p_path='/api/access/decision' then
      if profile.revoked_at is not null then return vpo_private.failure('Use Restaurar acesso para esta pessoa.',409); end if;
      if p_body->>'decision'='approved' and coalesce(p_body->>'accessMode','subscription') not in ('subscription','permanent') then return vpo_private.failure('Tipo de acesso inválido.',400); end if;
      result=vpo_private.registration_api(p_method,p_path,p_body);
      if (result->>'status')::integer<>200 or profile.status<>'pending' or p_body->>'decision'<>'approved' then return result; end if;
      update vpo_private.registrations set access_mode=coalesce(p_body->>'accessMode','subscription'),trial_started_at=now(),trial_ends_at=now()+interval '15 days' where user_id=target;
      action=case when p_body->>'accessMode'='permanent' then 'approve_permanent' else 'approve_trial' end;
    else
      action=p_body->>'action';
      if action is null or action not in ('permanent','subscription','revoke','restore') or p_body->'confirm' is distinct from 'true'::jsonb then return vpo_private.failure('Confirme a alteração de acesso.',400); end if;
      if action in ('permanent','subscription') and (profile.status<>'approved' or profile.revoked_at is not null) then return vpo_private.failure('Aprove ou restaure o plano pessoal antes de alterar o tipo de acesso.',409); end if;
      if action in ('permanent','revoke') and exists(select 1 from vpo_private.billing_accounts a left join vpo_private.billing_checkouts c on c.owner_id=a.owner_id where a.owner_id=target and a.canceled_at is null and
        (a.authorization_confirmed or a.cancellation_requested_at is not null or c.status in ('creating','ready'))) then
        return vpo_private.failure('Existe uma renovação ou contratação no Asaas. Cancele e confirme a renovação antes de alterar este acesso. Remover o acesso não cancela uma cobrança.',409,'BILLING_CANCEL_FIRST');
      end if;
      if action='revoke' then
        if profile.revoked_at is not null then return vpo_private.reply(jsonb_build_object('ok',true)); end if;
        update vpo_private.registrations set revoked_at=now() where user_id=target;
      elsif action='restore' then
        if profile.revoked_at is null then return vpo_private.reply(jsonb_build_object('ok',true)); end if;
        update vpo_private.registrations set revoked_at=null where user_id=target;
      else
        if profile.access_mode=action then return vpo_private.reply(jsonb_build_object('ok',true)); end if;
        update vpo_private.registrations set access_mode=action where user_id=target;
      end if;
    end if;
    insert into vpo_private.access_events(user_id,actor_id,action,previous_access,next_access)
      select target,actor,action,before_access,jsonb_build_object('status',r.status,'accessMode',r.access_mode,'trialStartedAt',r.trial_started_at,'trialEndsAt',r.trial_ends_at,'revokedAt',r.revoked_at)
      from vpo_private.registrations r where user_id=target;
    return vpo_private.reply(jsonb_build_object('ok',true));
  end if;

  if p_path='/api/billing/quote' and p_method='POST' then
    select coalesce((select active_owner_id from vpo_private.preferences where user_id=actor),actor) into owner_uuid;
    if owner_uuid=actor and (vpo_private.billing_access(actor)->>'phase')='permanent' then return vpo_private.failure('Seu acesso permanente não precisa de assinatura.',409,'PERMANENT_ACCESS'); end if;
    select exists(select 1 from vpo_private.billing_accounts where owner_id=actor) into had_account;
    result=vpo_private.registration_api(p_method,p_path,p_body);
    if (result->>'status')::integer<>200 then return result; end if;
    if not had_account then
      select * into profile from vpo_private.registrations where user_id=actor;
      if profile.trial_started_at is not null then
        update vpo_private.billing_accounts set trial_started_at=profile.trial_started_at,trial_ends_at=profile.trial_ends_at,
          first_charge_at=(((greatest(profile.trial_ends_at,now()) at time zone 'America/Sao_Paulo')::date+1)::timestamp at time zone 'America/Sao_Paulo') where owner_id=actor;
      end if;
    end if;
    return vpo_private.reply(vpo_private.billing_access(actor)||jsonb_build_object('scopeId',actor,'isOwner',true));
  end if;
  result=vpo_private.registration_api(p_method,p_path,p_body);
  -- Exclude a removed person from participant names, even if a membership is retained for restoration.
  if p_path='/api/sharing' and p_method='GET' and (result->>'status')::integer=200 then
    select coalesce(jsonb_agg(p),'[]') into items from jsonb_array_elements(result#>'{body,participants}') p
      where not exists(select 1 from vpo_private.registrations r where r.user_id=(p->>'id')::uuid and r.revoked_at is not null);
    result=jsonb_set(result,'{body,participants}',items);
  end if;
  return result;
end $$;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
create or replace function public.vpo_api(p_method text,p_path text,p_body jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.api(p_method,p_path,p_body)$$;

-- A previously opened checkout cannot bypass a later removal/permanent grant.
alter function vpo_private.billing_gateway(text,uuid,jsonb) rename to provider_billing_gateway;
revoke execute on function vpo_private.provider_billing_gateway(text,uuid,jsonb) from public,anon,authenticated,service_role;
create function vpo_private.billing_gateway(p_action text,p_owner uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_action='prepare' then
    perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||p_owner::text,0));
    perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||p_owner::text,0));
    if not vpo_private.owner_approved(p_owner) or exists(select 1 from vpo_private.registrations where user_id=p_owner and revoked_at is not null)
      or (vpo_private.billing_access(p_owner)->>'phase')='permanent' then raise exception 'Account is not eligible for checkout'; end if;
  end if;
  return vpo_private.provider_billing_gateway(p_action,p_owner,p_data);
end $$;
revoke execute on function vpo_private.billing_gateway(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function vpo_private.billing_gateway(text,uuid,jsonb) to service_role;
create or replace function public.vpo_billing_gateway(p_action text,p_owner uuid default null,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.billing_gateway(p_action,p_owner,p_data)$$;
notify pgrst,'reload schema';
commit;
