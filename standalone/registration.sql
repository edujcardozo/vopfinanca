-- Manual account approval, independent from paid subscriptions.
-- Apply after database.sql, billing.sql and asaas.sql in the dedicated project.
begin;
create table vpo_private.access_config (
  id boolean primary key default true check(id),
  admin_email text not null,
  admin_id uuid unique references auth.users(id) on delete restrict
);
insert into vpo_private.access_config(id,admin_email) values(true,'edujcardozo@gmail.com');
create table vpo_private.registrations (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check(length(full_name) between 2 and 100),
  email text not null,
  phone text not null default '' check(length(phone)<=30),
  status text not null check(status in ('guest','pending','approved','rejected')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
create index registration_status_idx on vpo_private.registrations(status,requested_at desc,user_id);
create table vpo_private.registration_mail (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references vpo_private.registrations(user_id) on delete cascade,
  payload jsonb not null,
  status text not null default 'queued' check(status in ('queued','sending','sent','failed','canceled')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  provider_id text,
  sent_at timestamptz
);
create index registration_mail_queue_idx on vpo_private.registration_mail(next_attempt_at) where status in ('queued','sending');
alter table vpo_private.access_config enable row level security;
alter table vpo_private.registrations enable row level security;
alter table vpo_private.registration_mail enable row level security;
revoke all on vpo_private.access_config,vpo_private.registrations,vpo_private.registration_mail from public,anon,authenticated;
create policy deny_direct_access on vpo_private.access_config for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.registrations for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.registration_mail for all to anon,authenticated using(false) with check(false);

create function vpo_private.owner_approved(owner_uuid uuid)
returns boolean language sql stable set search_path='' as $$
  select exists(select 1 from vpo_private.access_config where admin_id=owner_uuid)
    or exists(select 1 from vpo_private.registrations where user_id=owner_uuid and status='approved')
$$;
create function vpo_private.access_info(actor uuid)
returns jsonb language plpgsql set search_path='' as $$
declare profile vpo_private.registrations%rowtype; owner_uuid uuid; admin boolean; allowed boolean;
begin
  select * into profile from vpo_private.registrations where user_id=actor;
  select exists(select 1 from vpo_private.access_config where admin_id=actor) into admin;
  select coalesce((select active_owner_id from vpo_private.preferences where user_id=actor),actor) into owner_uuid;
  allowed=profile.user_id is not null and profile.status<>'rejected' and
    vpo_private.owner_approved(owner_uuid) and (owner_uuid=actor or exists(select 1 from vpo_private.members where owner_id=owner_uuid and member_id=actor));
  return jsonb_build_object('canUse',allowed,'isAdmin',admin,'ownApproved',vpo_private.owner_approved(actor),
    'hasProfile',profile.user_id is not null,'status',coalesce(profile.status,'incomplete'),
    'userId',actor,'fullName',profile.full_name,'phone',profile.phone,'email',(select email from auth.users where id=actor),
    'notification',coalesce((select status from vpo_private.registration_mail where user_id=actor),'none'));
end $$;

-- The former API cannot be called directly to bypass manual approval.
alter function vpo_private.api(text,text,jsonb) rename to approved_plan_api;
revoke execute on function vpo_private.approved_plan_api(text,text,jsonb) from public,anon,authenticated;
create function vpo_private.api(p_method text,p_path text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); actor_email text; is_admin boolean; info jsonb; profile vpo_private.registrations%rowtype;
  full_name text; phone text; purpose text; target uuid; choice text; result jsonb; plan_owner uuid;
  page integer; list_status text; items jsonb; total integer;
begin
  select email into actor_email from auth.users where id=actor and email_confirmed_at is not null;
  if actor is null or actor_email is null then return vpo_private.failure('Confirme seu e-mail para continuar.',401,'AUTH_REQUIRED'); end if;
  if jsonb_typeof(p_body) is distinct from 'object' or octet_length(p_body::text)>10500000 then return vpo_private.failure('Pedido inválido.',400); end if;
  perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||actor::text,0));
  -- A verified email bootstraps the owner's immutable Auth UUID once. Names,
  -- browser flags, editable metadata and other JWT claims never grant access.
  update vpo_private.access_config set admin_id=actor
    where id=true and admin_id is null and lower(admin_email)=lower(actor_email);
  select exists(select 1 from vpo_private.access_config where admin_id=actor) into is_admin;
  info=vpo_private.access_info(actor);
  if p_path='/api/access' and p_method='GET' then return vpo_private.reply(info); end if;
  if p_path='/api/access/register' and p_method='POST' then
    full_name=regexp_replace(btrim(p_body->>'fullName'),'\s+',' ','g');
    phone=btrim(coalesce(p_body->>'phone',''));purpose=p_body->>'purpose';
    if full_name is null or length(full_name) not between 2 and 100 or full_name~'[[:cntrl:]]'
      or jsonb_typeof(p_body->'fullName') is distinct from 'string' or length(phone)>30
      or phone<>'' and (phone!~'^[+0-9 ()-]+$' or length(regexp_replace(phone,'[^0-9]','','g')) not between 8 and 15)
      or purpose is null or purpose not in ('personal','guest') then return vpo_private.failure('Confira seu nome e telefone.',400); end if;
    select * into profile from vpo_private.registrations where user_id=actor;
    if profile.status='rejected' then return vpo_private.failure('Seu cadastro não foi autorizado. Entre em contato com o VPO.',403,'ACCESS_REJECTED'); end if;
    insert into vpo_private.registrations(user_id,full_name,email,phone,status,decided_at,decided_by)
      values(actor,full_name,actor_email,phone,case when is_admin then 'approved' when purpose='guest' then 'guest' else 'pending' end,
        case when is_admin then now() end,case when is_admin then actor end)
      on conflict(user_id) do update set full_name=excluded.full_name,email=excluded.email,phone=excluded.phone,
        status=case when is_admin then 'approved' when vpo_private.registrations.status='guest' and purpose='personal' then 'pending' else vpo_private.registrations.status end;
    if (select status from vpo_private.registrations where user_id=actor)='pending' then
      insert into vpo_private.registration_mail(user_id,payload) values(actor,jsonb_build_object('name',full_name,'email',actor_email,'phone',phone,'requestedAt',now())) on conflict(user_id) do nothing;
    end if;
    return vpo_private.reply(vpo_private.access_info(actor));
  end if;
  if p_path='/api/access/requests' and p_method='POST' then
    if not is_admin then return vpo_private.failure('Acesso restrito ao administrador.',403); end if;
    list_status=coalesce(p_body->>'status','pending');
    if list_status not in ('pending','approved','rejected') or coalesce(p_body->>'page','0')!~'^[0-9]{1,4}$' then return vpo_private.failure('Filtro inválido.',400); end if;
    page=coalesce(p_body->>'page','0')::integer;
    select count(*) into total from vpo_private.registrations where status=list_status and user_id<>actor;
    select coalesce(jsonb_agg(to_jsonb(r)),'[]') into items from (
      select u.user_id as id,u.full_name as name,u.email,u.phone,u.requested_at as "requestedAt",u.status,
        coalesce(m.status,'none') as notification
      from vpo_private.registrations u left join vpo_private.registration_mail m using(user_id)
      where u.status=list_status and u.user_id<>actor order by u.requested_at desc,u.user_id limit 10 offset page*10
    ) r;
    return vpo_private.reply(jsonb_build_object('items',items,'total',total,'page',page,'pageSize',10));
  end if;
  if p_path='/api/access/decision' and p_method='POST' then
    if not is_admin then return vpo_private.failure('Acesso restrito ao administrador.',403); end if;
    begin target=(p_body->>'userId')::uuid; exception when others then return vpo_private.failure('Cadastro inválido.',400); end;
    choice=p_body->>'decision';
    if target is null or target=actor or choice is null or choice not in ('approved','rejected') then return vpo_private.failure('Decisão inválida.',400); end if;
    select * into profile from vpo_private.registrations where user_id=target for update;
    if not found then return vpo_private.failure('Cadastro não encontrado.',404); end if;
    if profile.status=choice then return vpo_private.reply(jsonb_build_object('ok',true)); end if;
    if profile.status<>'pending' then return vpo_private.failure('Este cadastro já foi analisado.',409); end if;
    update vpo_private.registrations set status=choice,decided_at=now(),decided_by=actor where user_id=target;
    update vpo_private.registration_mail set status='canceled' where user_id=target and status in ('queued','failed');
    return vpo_private.reply(jsonb_build_object('ok',true));
  end if;
  if not (info->>'hasProfile')::boolean then return vpo_private.failure('Complete seu cadastro para continuar.',403,'ACCESS_PROFILE_REQUIRED'); end if;
  if info->>'status'='rejected' then return vpo_private.failure('Seu cadastro não foi autorizado.',403,'ACCESS_REJECTED'); end if;
  if p_path in ('/api/sharing/preview','/api/sharing/accept') and p_method='POST' then
    select owner_id into plan_owner from vpo_private.invites where token_hash=encode(sha256(convert_to(coalesce(p_body->>'token',''),'UTF8')),'hex');
    if plan_owner is not null and not vpo_private.owner_approved(plan_owner) then return vpo_private.failure('Quem enviou o convite ainda precisa de aprovação.',403,'INVITE_OWNER_PENDING'); end if;
    return vpo_private.approved_plan_api(p_method,p_path,p_body);
  end if;
  if p_path='/api/sharing/switch' and p_method='POST' then
    begin target=(p_body->>'scopeId')::uuid; exception when others then return vpo_private.failure('Plano inválido.',400); end;
    if not vpo_private.owner_approved(target) then return vpo_private.failure('Seu plano pessoal ainda aguarda aprovação.',403,'ACCESS_PENDING'); end if;
    return vpo_private.approved_plan_api(p_method,p_path,p_body);
  end if;
  if not (info->>'canUse')::boolean then return vpo_private.failure('Seu cadastro aguarda aprovação para abrir o plano.',403,'ACCESS_PENDING'); end if;
  result=vpo_private.approved_plan_api(p_method,p_path,p_body);
  if p_path='/api/sharing' and p_method='GET' and (result->>'status')::integer=200 then
    select coalesce(jsonb_agg(p),'[]') into items from jsonb_array_elements(result#>'{body,plans}') p where vpo_private.owner_approved((p->>'id')::uuid);
    result=jsonb_set(result,'{body,plans}',items);
  end if;
  return result;
end $$;
revoke execute on function vpo_private.owner_approved(uuid),vpo_private.access_info(uuid) from public,anon,authenticated;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
create or replace function public.vpo_api(p_method text,p_path text,p_body jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.api(p_method,p_path,p_body)$$;

-- Durable outbox: the server claims a bounded lease before talking to Resend.
-- No caller can choose a recipient, message body or another account's job.
create function vpo_private.registration_delivery(p_action text,p_actor uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job vpo_private.registration_mail%rowtype; result jsonb; lease uuid;
begin
  if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>4096 then raise exception 'Invalid delivery request'; end if;
  if p_action='claim' then
    update vpo_private.registration_mail set status='failed' where status in ('queued','sending')
      and (lease_until is null or lease_until<now()) and (attempts>=5 or first_attempt_at<=now()-interval '23 hours');
    select m.* into job from vpo_private.registration_mail m join vpo_private.registrations r using(user_id)
      where r.status='pending' and (p_actor is null or m.user_id=p_actor) and m.status in ('queued','sending')
        and m.next_attempt_at<=now() and (m.lease_until is null or m.lease_until<now())
        and m.attempts<5 and (m.first_attempt_at is null or m.first_attempt_at>now()-interval '23 hours')
      order by m.next_attempt_at,m.id limit 1 for update of m skip locked;
    if not found then return jsonb_build_object('job',null); end if;
    lease=gen_random_uuid();
    update vpo_private.registration_mail set status='sending',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),
      lease_id=lease,lease_until=now()+interval '2 minutes',next_attempt_at=now()+interval '5 minutes' where id=job.id;
    select jsonb_build_object('id',job.id,'lease',lease,'recipient',admin_email,'payload',job.payload) into result from vpo_private.access_config where id=true;
    return jsonb_build_object('job',result);
  elsif p_action='finish' then
    update vpo_private.registration_mail set
      status=case when p_data->'sent'='true'::jsonb then 'sent' when attempts>=5 then 'failed' else 'queued' end,
      provider_id=case when p_data->'sent'='true'::jsonb then left(p_data->>'providerId',200) end,
      sent_at=case when p_data->'sent'='true'::jsonb then now() end,lease_until=null
      where id=(p_data->>'id')::uuid and lease_id=(p_data->>'lease')::uuid and status='sending';
    return jsonb_build_object('ok',found);
  end if;
  raise exception 'Unknown delivery action';
end $$;
revoke execute on function vpo_private.registration_delivery(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function vpo_private.registration_delivery(text,uuid,jsonb) to service_role;
create function public.vpo_registration_delivery(p_action text,p_actor uuid default null,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$select vpo_private.registration_delivery(p_action,p_actor,p_data)$$;
revoke execute on function public.vpo_registration_delivery(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.vpo_registration_delivery(text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
