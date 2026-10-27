-- Install after savings-goals.sql. Suspension never deletes Auth or budget data.
begin;
alter table vpo_private.registrations add column frozen_at timestamptz;
alter table vpo_private.access_events drop constraint access_events_action_check;
alter table vpo_private.access_events add constraint access_events_action_check check(action in ('approve_trial','approve_permanent','permanent','subscription','revoke','restore','freeze','unfreeze','renew'));
create or replace function vpo_private.owner_approved(owner_uuid uuid)
returns boolean language sql stable set search_path='' as $$
 select exists(select 1 from vpo_private.access_config where admin_id=owner_uuid) or exists(select 1 from vpo_private.registrations where user_id=owner_uuid and status='approved' and revoked_at is null and frozen_at is null)
$$;
alter function vpo_private.billing_access(uuid) rename to retained_billing_access;
revoke execute on function vpo_private.retained_billing_access(uuid) from public,anon,authenticated;
create function vpo_private.billing_access(plan_owner uuid) returns jsonb language plpgsql set search_path='' as $$
declare info jsonb; frozen timestamptz; revoked timestamptz;
begin
 info=vpo_private.retained_billing_access(plan_owner);
 select frozen_at,revoked_at into frozen,revoked from vpo_private.registrations where user_id=plan_owner;
 if frozen is not null and revoked is null then info=info||jsonb_build_object('phase','frozen','canUse',false); end if;
 return info||jsonb_build_object('frozenAt',frozen,'revokedAt',revoked,'manualPaymentVersion',md5((info->>'manualPaymentVersion')||'|'||coalesce(frozen::text,'')||'|'||coalesce(revoked::text,'')));
end $$;
revoke execute on function vpo_private.billing_access(uuid) from public,anon,authenticated;
alter function vpo_private.access_info(uuid) rename to retained_access_info;
revoke execute on function vpo_private.retained_access_info(uuid) from public,anon,authenticated;
create function vpo_private.access_info(actor uuid) returns jsonb language plpgsql set search_path='' as $$
declare info jsonb; frozen timestamptz;
begin
 info=vpo_private.retained_access_info(actor);
 select frozen_at into frozen from vpo_private.registrations where user_id=actor;
 if frozen is not null then info=info||jsonb_build_object('canUse',false,'status',case when info->>'status'='revoked' then 'revoked' else 'frozen' end); end if;
 return info||jsonb_build_object('frozenAt',frozen,'planPaused',info#>>'{billing,phase}' in ('frozen','revoked'));
end $$;
revoke execute on function vpo_private.access_info(uuid) from public,anon,authenticated;
alter function vpo_private.api(text,text,jsonb) rename to retained_plan_api;
revoke execute on function vpo_private.retained_plan_api(text,text,jsonb) from public,anon,authenticated;
create function vpo_private.api(p_method text,p_path text,p_body jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid=auth.uid(); target uuid; profile vpo_private.registrations%rowtype; info jsonb; result jsonb; cfg vpo_private.manual_pix_config%rowtype; price integer;
 admin boolean; action text; status_filter text; page integer; total integer; items jsonb; previous_access jsonb; old_revoked timestamptz; old_frozen timestamptz;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then return vpo_private.failure('Confirme seu e-mail para continuar.',401,'AUTH_REQUIRED'); end if;
 if p_body is null or jsonb_typeof(p_body) is distinct from 'object' or octet_length(p_body::text)>10500000 then return vpo_private.failure('Pedido inválido.',400); end if;
 perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||actor::text,0));
 select exists(select 1 from vpo_private.access_config where admin_id=actor) into admin;
 info=vpo_private.access_info(actor);
 if p_path='/api/access' and p_method='GET' then return vpo_private.reply(info); end if;
 -- This endpoint exposes payment instructions only, never the suspended budget.
 if p_path='/api/access/renewal' and p_method='GET' then
  select * into profile from vpo_private.registrations where user_id=actor;
  result=vpo_private.billing_access(actor)||jsonb_build_object('isOwner',true);
  if profile.status='approved' and profile.access_mode<>'permanent' and (profile.revoked_at is not null or profile.frozen_at is not null) then
   select * into cfg from vpo_private.manual_pix_config where id;
   select monthly_cents into price from vpo_private.billing_config where id;
   if cfg.enabled and price is not null and not exists(select 1 from vpo_private.billing_accounts a left join vpo_private.billing_checkouts c on c.owner_id=a.owner_id where a.owner_id=actor and a.canceled_at is null and (a.authorization_confirmed or a.cancellation_requested_at is not null or c.status in ('creating','ready'))) then
    result=result||jsonb_build_object('manualPix',jsonb_build_object('ready',true,'key',cfg.pix_key,'keyType','cpf','merchantName',cfg.merchant_name,'merchantCity',cfg.merchant_city,'whatsapp',cfg.whatsapp,'amountCents',price,'accountEmail',(select email from auth.users where id=actor)));
   end if;
  end if;
  return vpo_private.reply(result);
 end if;
 if p_path='/api/access/requests' and p_method='POST' then
  if not admin then return vpo_private.failure('Acesso restrito ao administrador.',403); end if;
  status_filter=coalesce(p_body->>'status','pending');
  if status_filter not in ('pending','approved','rejected','revoked','frozen') or coalesce(p_body->>'page','0')!~'^[0-9]{1,4}$' then return vpo_private.failure('Filtro inválido.',400); end if;
  page=coalesce(p_body->>'page','0')::integer;
  select count(*) into total from vpo_private.registrations r where r.user_id<>actor and case when status_filter='revoked' then r.revoked_at is not null when status_filter='frozen' then r.revoked_at is null and r.frozen_at is not null else r.revoked_at is null and r.frozen_at is null and case when status_filter='approved' then r.status in ('approved','guest') else r.status=status_filter end end;
  select coalesce(jsonb_agg(to_jsonb(s)),'[]') into items from (
   select r.user_id as id,r.full_name as name,u.email,r.phone,r.requested_at as "requestedAt",r.status,r.decided_at as "approvedAt",r.revoked_at as "revokedAt",r.frozen_at as "frozenAt",r.access_mode as "accessMode",coalesce(m.status,'none') as notification,vpo_private.billing_access(r.user_id)||jsonb_build_object('isOwner',true) as access
   from vpo_private.registrations r join auth.users u on u.id=r.user_id left join vpo_private.registration_mail m on m.user_id=r.user_id
   where r.user_id<>actor and case when status_filter='revoked' then r.revoked_at is not null when status_filter='frozen' then r.revoked_at is null and r.frozen_at is not null else r.revoked_at is null and r.frozen_at is null and case when status_filter='approved' then r.status in ('approved','guest') else r.status=status_filter end end
   order by r.requested_at desc,r.user_id limit 10 offset page*10) s;
  return vpo_private.reply(jsonb_build_object('items',items,'total',total,'page',page,'pageSize',10));
 end if;
 if p_path='/api/access/manage' and p_method='POST' and p_body->>'action' in ('freeze','unfreeze') then
  if not admin then return vpo_private.failure('Acesso restrito ao administrador.',403); end if;
  if p_body->'confirm' is distinct from 'true'::jsonb then return vpo_private.failure('Confirme a alteração.',400); end if;
  begin target=(p_body->>'userId')::uuid; exception when others then return vpo_private.failure('Cadastro inválido.',400); end;
  if target is null or exists(select 1 from vpo_private.access_config where admin_id=target) then return vpo_private.failure('Escolha um cliente.',400); end if;
  perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||target::text,0));perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||target::text,0));
  select * into profile from vpo_private.registrations where user_id=target for update;
  if not found or profile.status not in ('approved','guest') or profile.revoked_at is not null then return vpo_private.failure('Restaure ou aprove o acesso antes de congelar.',409); end if;
  if exists(select 1 from vpo_private.billing_accounts a left join vpo_private.billing_checkouts c on c.owner_id=a.owner_id where a.owner_id=target and a.canceled_at is null and (a.authorization_confirmed or a.cancellation_requested_at is not null or c.status in ('creating','ready'))) then return vpo_private.failure('Cancele e confirme a renovação no Asaas antes de congelar. Congelar não cancela cobranças.',409,'BILLING_CANCEL_FIRST'); end if;
  action=p_body->>'action';previous_access=to_jsonb(profile);
  if (action='freeze' and profile.frozen_at is null) or (action='unfreeze' and profile.frozen_at is not null) then
   update vpo_private.registrations set frozen_at=case when action='freeze' then now() else null end where user_id=target;
   insert into vpo_private.access_events(user_id,actor_id,action,previous_access,next_access) select target,actor,action,previous_access,to_jsonb(r) from vpo_private.registrations r where user_id=target;
  end if;
  return vpo_private.reply(jsonb_build_object('ok',true));
 end if;
 -- A verified admin payment resumes the same account, using the existing
 -- receipt idempotency/version checks. A failure restores suspension atomically.
 if p_path='/api/access/pix' and p_method='POST' and admin then
  begin target=(p_body->>'userId')::uuid; exception when others then return vpo_private.failure('Cadastro inválido.',400); end;
  perform pg_advisory_xact_lock(hashtextextended('vpo-user:'||target::text,0));perform pg_advisory_xact_lock(hashtextextended('vpo-plan:'||target::text,0));
  select * into profile from vpo_private.registrations where user_id=target for update;
  if profile.revoked_at is not null or profile.frozen_at is not null then
   if p_body->'confirm' is distinct from 'true'::jsonb or p_body->>'paymentVersion' is distinct from vpo_private.billing_access(target)->>'manualPaymentVersion' then return vpo_private.failure('Atualize a lista e confirme o pagamento recebido.',409,'PAYMENT_CHANGED'); end if;
   previous_access=to_jsonb(profile);old_revoked=profile.revoked_at;old_frozen=profile.frozen_at;
   update vpo_private.registrations set revoked_at=null,frozen_at=null where user_id=target;
   result=vpo_private.retained_plan_api(p_method,p_path,p_body||jsonb_build_object('paymentVersion',vpo_private.billing_access(target)->>'manualPaymentVersion'));
   if (result->>'status')::integer<>200 then update vpo_private.registrations set revoked_at=old_revoked,frozen_at=old_frozen where user_id=target;return result; end if;
   insert into vpo_private.access_events(user_id,actor_id,action,previous_access,next_access) select target,actor,'renew',previous_access,to_jsonb(r) from vpo_private.registrations r where user_id=target;
   return result;
  end if;
 end if;
 if info->>'status'='revoked' then return vpo_private.failure('Renove seu plano para continuar de onde parou.',403,'ACCESS_REVOKED'); end if;
 if info->>'status'='frozen' or coalesce((info->>'planPaused')::boolean,false) then return vpo_private.failure('Seu plano está pausado. Renove para continuar de onde parou.',403,'ACCESS_FROZEN'); end if;
 return vpo_private.retained_plan_api(p_method,p_path,p_body);
end $$;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
create or replace function public.vpo_api(p_method text,p_path text,p_body jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select vpo_private.api(p_method,p_path,p_body)$$;
notify pgrst,'reload schema';
commit;
