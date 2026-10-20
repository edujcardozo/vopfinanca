-- VPO independent backend. Apply in a dedicated Supabase project.
-- Budget tables are not exposed to PostgREST. The only public entry point is
-- an invoker wrapper; the private implementation checks the verified identity
-- and membership for every request. No service_role key is used by the app.
begin;
create schema if not exists vpo_private;
revoke all on schema vpo_private from public, anon, authenticated;
grant usage on schema vpo_private to authenticated;

create table vpo_private.plans (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb,
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  updated_at timestamptz not null default now()
);
create table vpo_private.mutations (
  owner_id uuid not null references vpo_private.plans(owner_id) on delete cascade,
  mutation_id text not null,
  revision bigint not null,
  document_hash text not null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,mutation_id)
);
create table vpo_private.members (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  member_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  check (owner_id<>member_id)
);
create index vpo_members_member_idx on vpo_private.members(member_id);
create table vpo_private.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active_owner_id uuid not null references auth.users(id) on delete cascade
);
create index vpo_preferences_owner_idx on vpo_private.preferences(active_owner_id);
create table vpo_private.invites (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  token_hash text unique not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '24 hours',
  accepted_by uuid references auth.users(id) on delete cascade,
  revoked boolean not null default false
);
create index vpo_invites_owner_idx on vpo_private.invites(owner_id,created_at desc);
create index vpo_invites_accepted_idx on vpo_private.invites(accepted_by) where accepted_by is not null;

alter table vpo_private.plans enable row level security;
alter table vpo_private.mutations enable row level security;
alter table vpo_private.members enable row level security;
alter table vpo_private.preferences enable row level security;
alter table vpo_private.invites enable row level security;
revoke all on all tables in schema vpo_private from public,anon,authenticated;
create policy deny_direct_access on vpo_private.plans for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.mutations for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.members for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.preferences for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on vpo_private.invites for all to anon,authenticated using(false) with check(false);

create function vpo_private.reply(data jsonb, status integer default 200)
returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('status',status,'body',data)
$$;
create function vpo_private.failure(message text,status integer,code text default null)
returns jsonb language sql immutable set search_path='' as $$
  select vpo_private.reply(jsonb_build_object('error',message,'code',code),status)
$$;

-- This validator enforces the structural limits before storing a document.
-- The browser also uses the app's canonical validator on imports and reads.
create function vpo_private.valid_document(s jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare g jsonb; c jsonb; m record; a record; t jsonb; p jsonb; r jsonb;
  gids text[]='{}'; cids text[]='{}'; tids text[]='{}'; rids text[]='{}'; n integer=0;
begin
  if s is null or jsonb_typeof(s)<>'object' or s->>'version' is distinct from '1'
    or octet_length(s::text)>10485760
    or jsonb_typeof(s->'groups') is distinct from 'array'
    or jsonb_typeof(s->'categories') is distinct from 'array'
    or jsonb_typeof(s->'months') is distinct from 'object'
    or jsonb_typeof(s->'payees') is distinct from 'array'
    or jsonb_typeof(s->'wealth') is distinct from 'object'
    or jsonb_typeof(s->'household'->'settlements') is distinct from 'array'
    or s->'household'->>'version' is distinct from '1'
    or jsonb_array_length(s->'groups') not between 1 and 200
    or jsonb_array_length(s->'categories') not between 1 and 1000
    or jsonb_array_length(s->'payees')>20000
    or jsonb_array_length(s->'household'->'settlements')>20000
    or jsonb_typeof(s->'planId') is distinct from 'string' or length(s->>'planId') not between 1 and 64
    or s->>'planId'!~'^[a-zA-Z0-9_-]+$' or s->>'planId' in ('__proto__','constructor','prototype') then return false; end if;
  for g in select value from jsonb_array_elements(s->'groups') loop
    if jsonb_typeof(g->'id') is distinct from 'string' or g->>'id'!~'^[a-zA-Z0-9_-]{1,64}$' or g->>'id'=any(gids)
      or g->>'id' in ('__proto__','constructor','prototype')
      or jsonb_typeof(g->'name') is distinct from 'string' or length(btrim(g->>'name')) not between 1 and 70 then return false; end if;
    gids=array_append(gids,g->>'id');
  end loop;
  for c in select value from jsonb_array_elements(s->'categories') loop
    if jsonb_typeof(c->'id') is distinct from 'string' or c->>'id'!~'^[a-zA-Z0-9_-]{1,64}$' or c->>'id'=any(cids)
      or c->>'id' in ('__proto__','constructor','prototype')
      or not(coalesce(c->>'group','')=any(gids)) or jsonb_typeof(c->'name') is distinct from 'string' or length(btrim(c->>'name')) not between 1 and 70
      or jsonb_typeof(c->'target') is distinct from 'number' or (c->>'target')::numeric not between 0 and 1000000000000
      or (c->>'target')::numeric<>trunc((c->>'target')::numeric)
      or jsonb_typeof(c->'icon') is distinct from 'string' or length(c->>'icon')>12 then return false; end if;
    if c ? 'hidden' and jsonb_typeof(c->'hidden')<>'boolean' then return false; end if;
    cids=array_append(cids,c->>'id');
  end loop;
  if (select count(*) from jsonb_each(s->'months'))>240 or (select count(*) from jsonb_each(s->'wealth'))>240 then return false; end if;
  for m in select * from jsonb_each(s->'months') loop
    if m.key!~'^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$'
      or jsonb_typeof(m.value->'assigned') is distinct from 'object'
      or jsonb_typeof(m.value->'transactions') is distinct from 'array'
      or jsonb_array_length(m.value->'transactions')>10000 then return false; end if;
    for a in select * from jsonb_each(m.value->'assigned') loop
      if not(a.key=any(cids)) or jsonb_typeof(a.value)<>'number' or a.value::numeric not between 0 and 1000000000000 or a.value::numeric<>trunc(a.value::numeric) then return false; end if;
    end loop;
    for t in select value from jsonb_array_elements(m.value->'transactions') loop
      n=n+1;
      if n>20000 or jsonb_typeof(t->'id') is distinct from 'string' or t->>'id'!~'^[a-zA-Z0-9_-]{1,64}$' or t->>'id'=any(tids)
        or coalesce(t->>'type','') not in ('income','expense')
        or jsonb_typeof(t->'amount') is distinct from 'number' or (t->>'amount')::numeric not between 1 and 1000000000000
        or (t->>'amount')::numeric<>trunc((t->>'amount')::numeric)
        or t->>'id' in ('__proto__','constructor','prototype')
        or jsonb_typeof(t->'description') is distinct from 'string' or length(btrim(t->>'description')) not between 1 and 100
        or jsonb_typeof(t->'date') is distinct from 'string'
        or left(t->>'date',7) is distinct from m.key or length(t->>'date')<>10
        or to_char((t->>'date')::date,'YYYY-MM-DD') is distinct from t->>'date'
        or (t->>'type'='expense' and not(coalesce(t->>'categoryId','')=any(cids)))
        or (t->>'type'='income' and t->'categoryId' is distinct from 'null'::jsonb)
        or (t ? 'payee' and (jsonb_typeof(t->'payee')<>'string' or length(btrim(t->>'payee')) not between 1 and 100))
        or (t ? 'memo' and (jsonb_typeof(t->'memo')<>'string' or length(t->>'memo')>280)) then return false; end if;
      if t ? 'sharing' and (t->>'type'<>'expense' or coalesce(t->'sharing'->>'paidBy','') not in ('edu','larissa')
        or jsonb_typeof(t->'sharing'->'eduPercent') is distinct from 'number' or (t->'sharing'->>'eduPercent')::numeric not between 0 and 100
        or (t->'sharing'->>'eduPercent')::numeric<>trunc((t->'sharing'->>'eduPercent')::numeric)) then return false; end if;
      tids=array_append(tids,t->>'id');
    end loop;
  end loop;
  for p in select value from jsonb_array_elements(s->'payees') loop
    if jsonb_typeof(p)<>'string' or length(btrim(p#>>'{}')) not between 1 and 100 then return false; end if;
  end loop;
  for m in select * from jsonb_each(s->'wealth') loop
    if m.key!~'^(19|20|21)[0-9]{2}-(0[1-9]|1[0-2])$' then return false; end if;
    if jsonb_typeof(m.value->'otherAssets') is distinct from 'number' or jsonb_typeof(m.value->'debt') is distinct from 'number'
      or (m.value->>'otherAssets')::numeric not between 0 and 1000000000000 or (m.value->>'debt')::numeric not between 0 and 1000000000000
      or (m.value->>'otherAssets')::numeric<>trunc((m.value->>'otherAssets')::numeric) or (m.value->>'debt')::numeric<>trunc((m.value->>'debt')::numeric) then return false; end if;
  end loop;
  for r in select value from jsonb_array_elements(s->'household'->'settlements') loop
    if jsonb_typeof(r->'id') is distinct from 'string' or r->>'id'!~'^[a-zA-Z0-9_-]{1,64}$' or r->>'id'=any(rids)
      or coalesce(r->>'from','') not in ('edu','larissa') or jsonb_typeof(r->'amount') is distinct from 'number'
      or (r->>'amount')::numeric not between 1 and 1000000000000 or (r->>'amount')::numeric<>trunc((r->>'amount')::numeric)
      or r->>'id' in ('__proto__','constructor','prototype')
      or jsonb_typeof(r->'date') is distinct from 'string' or length(r->>'date')<>10 or to_char((r->>'date')::date,'YYYY-MM-DD') is distinct from r->>'date'
      or jsonb_typeof(r->'memo') is distinct from 'string' or length(r->>'memo')>280 then return false; end if;
    rids=array_append(rids,r->>'id');
  end loop;
  return true;
exception when others then return false;
end $$;

create function vpo_private.api(p_method text,p_path text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); actor_email text; owner uuid; owner_email text; scope jsonb; usr jsonb;
  revoked boolean=false; is_owner boolean; doc vpo_private.plans%rowtype; prior vpo_private.mutations%rowtype;
  invite vpo_private.invites%rowtype; token text; invite_hash text; planlist jsonb; memberlist jsonb; invitelist jsonb;
  next_scope uuid; member uuid; mutation text; revision bigint; document_hash text; ack jsonb;
begin
  if actor is null then return vpo_private.failure('Entre no VPO para continuar.',401,'AUTH_REQUIRED'); end if;
  select u.email into actor_email from auth.users u where u.id=actor and u.email_confirmed_at is not null;
  if actor_email is null then return vpo_private.failure('Confirme seu e-mail para continuar.',401,'AUTH_REQUIRED'); end if;
  if p_body is null or jsonb_typeof(p_body)<>'object' or octet_length(p_body::text)>10500000 then return vpo_private.failure('Pedido inválido ou muito grande.',400); end if;
  -- Serialize the user's active-plan changes, then the plan's writes. No request
  -- takes another user's identity lock, preventing switch/revoke/write races.
  perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||actor::text,0));
  select coalesce((select active_owner_id from vpo_private.preferences where user_id=actor),actor) into owner;
  if p_path in ('/api/sharing/preview','/api/sharing/accept') and p_method='POST' then
    token=p_body->>'token';
    if token is null or token!~'^[a-f0-9]{64}$' then return vpo_private.failure('Convite inválido.',400); end if;
    invite_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
    select * into invite from vpo_private.invites i where i.token_hash=invite_hash;
    if not found then return vpo_private.failure('Este convite não está disponível.',410); end if;
    perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||invite.owner_id::text,0));
    select * into invite from vpo_private.invites i where i.token_hash=invite_hash;
    if invite.revoked or invite.expires_at<=now() or invite.accepted_by is not null and invite.accepted_by<>actor then return vpo_private.failure('Este convite expirou, foi cancelado ou já foi usado.',410); end if;
    if invite.owner_id=actor then return vpo_private.failure('Este é o convite do seu próprio plano.',400); end if;
    select email into owner_email from auth.users where id=invite.owner_id;
    if p_path='/api/sharing/preview' then return vpo_private.reply(jsonb_build_object('ownerEmail',owner_email,'expiresAt',invite.expires_at,'canEdit',true)); end if;
    if exists(select 1 from vpo_private.members where owner_id=invite.owner_id and member_id<>actor) then return vpo_private.failure('Este plano já está compartilhado.',409); end if;
    update vpo_private.invites set accepted_by=actor where id=invite.id;
    insert into vpo_private.members(owner_id,member_id) values(invite.owner_id,actor) on conflict(owner_id) do nothing;
    insert into vpo_private.preferences(user_id,active_owner_id) values(actor,invite.owner_id) on conflict(user_id) do update set active_owner_id=excluded.active_owner_id;
    return vpo_private.reply(jsonb_build_object('ok',true,'scopeId',invite.owner_id));
  end if;
  if p_path='/api/sharing/switch' and p_method='POST' then
    begin next_scope=(p_body->>'scopeId')::uuid; exception when others then return vpo_private.failure('Plano inválido.',400); end;
    if next_scope is null then return vpo_private.failure('Plano inválido.',400); end if;
    perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||next_scope::text,0));
    if next_scope<>actor and not exists(select 1 from vpo_private.members where owner_id=next_scope and member_id=actor) then return vpo_private.failure('Você não tem acesso a este plano.',403,'PLAN_ACCESS_REVOKED'); end if;
    insert into vpo_private.preferences(user_id,active_owner_id) values(actor,next_scope) on conflict(user_id) do update set active_owner_id=excluded.active_owner_id;
    return vpo_private.reply(jsonb_build_object('ok',true,'scopeId',next_scope));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||owner::text,0));
  is_owner=owner=actor;
  revoked=not is_owner and not exists(select 1 from vpo_private.members where owner_id=owner and member_id=actor);
  select email into owner_email from auth.users where id=owner;
  usr=jsonb_build_object('id',actor,'email',actor_email);
  scope=jsonb_build_object('id',owner,'role',case when is_owner then 'owner' else 'editor' end,'ownerEmail',owner_email,'revoked',revoked);
  if p_path='/api/sharing' and p_method='GET' then
    select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'ownerEmail',x.email,'role',x.role) order by x.role desc),'[]') into planlist from (
      select actor as id,actor_email as email,'owner' as role union all
      select m.owner_id,u.email,'editor' from vpo_private.members m join auth.users u on u.id=m.owner_id where m.member_id=actor
    ) x;
    select coalesce(jsonb_agg(jsonb_build_object('id',m.member_id,'email',u.email,'joinedAt',m.joined_at)),'[]') into memberlist from vpo_private.members m join auth.users u on u.id=m.member_id where m.owner_id=owner and is_owner;
    select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'expiresAt',i.expires_at)),'[]') into invitelist from vpo_private.invites i where i.owner_id=owner and is_owner and not i.revoked and i.accepted_by is null and i.expires_at>now();
    return vpo_private.reply(jsonb_build_object('user',usr,'scope',scope,'plans',planlist,'members',memberlist,'invites',invitelist));
  end if;
  if revoked then return vpo_private.failure('O acesso foi removido. Abra seu plano pessoal em Ajustes.',403,'PLAN_ACCESS_REVOKED'); end if;
  select * into doc from vpo_private.plans where owner_id=owner;
  if p_path='/api/plan/head' and p_method='GET' then
    return vpo_private.reply(jsonb_build_object('user',usr,'scope',scope,'revision',coalesce(doc.revision,0),'updatedAt',doc.updated_at));
  elsif p_path='/api/plan' and p_method='GET' then
    select jsonb_build_object('revision',m.revision,'hash',m.document_hash) into ack from vpo_private.mutations m where m.owner_id=owner and m.mutation_id=p_body->>'ack';
    return vpo_private.reply(jsonb_build_object('user',usr,'scope',scope,'exists',doc.state is not null,'state',doc.state,'revision',coalesce(doc.revision,0),'updatedAt',doc.updated_at,'acknowledged',ack));
  elsif p_path='/api/plan' and p_method='PUT' then
    if p_body->>'scopeId' is distinct from owner::text then return vpo_private.failure('O plano ativo mudou. Reabra o app.',409,'PLAN_SCOPE_CHANGED'); end if;
    if not vpo_private.valid_document(p_body->'state') then return vpo_private.failure('Plano inválido. Seus dados locais foram mantidos.',400); end if;
    mutation=p_body->>'mutationId';
    if mutation is null or mutation!~'^[a-zA-Z0-9_-]{8,80}$' or jsonb_typeof(p_body->'revision') is distinct from 'number' then return vpo_private.failure('Revisão inválida.',400); end if;
    begin revision=(p_body->>'revision')::bigint; exception when others then return vpo_private.failure('Revisão inválida.',400); end;
    if revision<0 or revision>9007199254740991 or revision::numeric<>(p_body->>'revision')::numeric then return vpo_private.failure('Revisão inválida.',400); end if;
    document_hash=encode(sha256(convert_to((p_body->'state')::text,'UTF8')),'hex');
    select * into prior from vpo_private.mutations where owner_id=owner and mutation_id=mutation;
    if found then
      if prior.document_hash<>document_hash then return vpo_private.failure('Operação já utilizada com outro conteúdo.',409); end if;
      return vpo_private.reply(jsonb_build_object('accepted',true,'revision',prior.revision,'updatedAt',prior.updated_at,'replayed',true,'user',usr,'scope',scope));
    end if;
    if coalesce(doc.revision,0)<>revision then
      return vpo_private.reply(jsonb_build_object('code','REVISION_CONFLICT','user',usr,'scope',scope,'exists',true,'state',doc.state,'revision',doc.revision,'updatedAt',doc.updated_at),409);
    end if;
    insert into vpo_private.plans(owner_id,state,revision,updated_at) values(owner,(p_body->'state')||'{"hideBalances":false}'::jsonb,revision+1,now())
      on conflict(owner_id) do update set state=excluded.state,revision=excluded.revision,updated_at=excluded.updated_at returning * into doc;
    insert into vpo_private.mutations(owner_id,mutation_id,revision,document_hash) values(owner,mutation,doc.revision,document_hash);
    return vpo_private.reply(jsonb_build_object('accepted',true,'revision',doc.revision,'updatedAt',doc.updated_at,'user',usr,'scope',scope));
  end if;
  if p_path like '/api/sharing/%' and p_method='POST' then
    if not is_owner then return vpo_private.failure('Somente o dono do plano pode gerenciar acessos.',403); end if;
    if p_path='/api/sharing/invites' then
      if doc.state is null then return vpo_private.failure('Sincronize o plano antes de convidar.',409); end if;
      if exists(select 1 from vpo_private.members where owner_id=owner) then return vpo_private.failure('Este plano já está compartilhado.',409); end if;
      update vpo_private.invites set revoked=true where owner_id=owner and accepted_by is null;
      token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
      insert into vpo_private.invites(owner_id,token_hash) values(owner,encode(sha256(convert_to(token,'UTF8')),'hex')) returning * into invite;
      return vpo_private.reply(jsonb_build_object('id',invite.id,'token',token,'expiresAt',invite.expires_at),201);
    elsif p_path='/api/sharing/revoke-invite' then
      update vpo_private.invites set revoked=true where id::text=p_body->>'id' and owner_id=owner;
      return vpo_private.reply('{"ok":true}');
    elsif p_path='/api/sharing/remove-member' then
      begin member=(p_body->>'memberId')::uuid; exception when others then return vpo_private.failure('Pessoa inválida.',400); end;
      if member is null or member=actor then return vpo_private.failure('Selecione a pessoa convidada.',400); end if;
      delete from vpo_private.members where owner_id=owner and member_id=member;
      update vpo_private.invites set revoked=true where owner_id=owner and accepted_by=member;
      return vpo_private.reply('{"ok":true}');
    end if;
  end if;
  return vpo_private.failure('Não encontrado.',404);
end $$;

create function public.vpo_api(p_method text,p_path text,p_body jsonb default '{}')
returns jsonb language sql security invoker set search_path='' as $$
  select vpo_private.api(p_method,p_path,p_body)
$$;
revoke execute on all functions in schema vpo_private from public,anon,authenticated;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
revoke execute on function public.vpo_api(text,text,jsonb) from public,anon;
grant execute on function public.vpo_api(text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
