-- Upgrade existing VPO projects after registration.sql. No budget or profile data is rewritten.
begin;
create or replace function vpo_private.api(p_method text,p_path text,p_body jsonb)
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
    -- Only participants of the authorized active plan are returned. Names come
    -- from confirmed registrations, never editable authorization metadata.
    select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',coalesce(nullif(r.full_name,''),u.email),'email',u.email,
      'role',case when u.id=(result#>>'{body,scope,id}')::uuid then 'owner' else 'editor' end)
      order by case when u.id=(result#>>'{body,scope,id}')::uuid then 0 else 1 end),'[]') into items
      from auth.users u join vpo_private.registrations r on r.user_id=u.id
      where u.email_confirmed_at is not null and not coalesce((result#>>'{body,scope,revoked}')::boolean,true)
      and u.id in (select (result#>>'{body,scope,id}')::uuid union all select m.member_id from vpo_private.members m
        where m.owner_id=(result#>>'{body,scope,id}')::uuid);
    result=jsonb_set(result,'{body,participants}',items);
  end if;
  return result;
end $$;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
commit;
