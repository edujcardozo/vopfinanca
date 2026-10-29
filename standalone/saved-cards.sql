-- Install after invoice-bills.sql. Cards are labels, never payment credentials.
begin;
create function vpo_private.valid_saved_cards(p_state jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare cards jsonb=coalesce(p_state->'cards','[]'); c jsonb; m jsonb; t jsonb; b jsonb; ids text[]='{}'; names text[]='{}'; normalized text;
begin
 if jsonb_typeof(cards) is distinct from 'array' then return false; end if;
 if jsonb_array_length(cards)>200 then return false; end if;
 for c in select value from jsonb_array_elements(cards) loop
  if jsonb_typeof(c) is distinct from 'object' or jsonb_typeof(c->'id') is distinct from 'string' or c->>'id'!~'^[a-zA-Z0-9_-]{1,64}$' or c->>'id' in ('__proto__','constructor','prototype') or c->>'id'=any(ids)
   or jsonb_typeof(c->'name') is distinct from 'string' or length(btrim(c->>'name')) not between 1 and 70 then return false; end if;
  normalized=lower(regexp_replace(btrim(c->>'name'),'\s+',' ','g'));
  if normalized=any(names) then return false; end if;
  ids=array_append(ids,c->>'id');names=array_append(names,normalized);
 end loop;
 for m in select value from jsonb_each(p_state->'months') loop
  for t in select value from jsonb_array_elements(m->'transactions') loop
   if t?'cardId' and (jsonb_typeof(t->'cardId') is distinct from 'string' or not (t->>'cardId'=any(ids)) or t->>'type'<>'expense') then return false; end if;
  end loop;
 end loop;
 for b in select value from jsonb_array_elements(coalesce(p_state->'invoiceBills','[]')) loop
  if b?'cardId' and (jsonb_typeof(b->'cardId') is distinct from 'string' or not (b->>'cardId'=any(ids))) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function vpo_private.valid_saved_cards(jsonb) from public,anon,authenticated;
alter function vpo_private.api(text,text,jsonb) rename to saved_cards_plan_api;
revoke execute on function vpo_private.saved_cards_plan_api(text,text,jsonb) from public,anon,authenticated;
create function vpo_private.api(p_method text,p_path text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 if p_path='/api/plan' and p_method='PUT' then
  previous=vpo_private.saved_cards_plan_api('GET','/api/plan','{}');
  if (previous->>'status')::integer<>200 then return previous; end if;
  if jsonb_typeof(p_body) is distinct from 'object' or octet_length(p_body::text)>10500000 then return vpo_private.failure('Pedido inválido.',400); end if;
  if not vpo_private.valid_saved_cards(p_body->'state') then return vpo_private.failure('Dados de cartões inválidos.',400); end if;
  if not (coalesce(p_body->'state','{}')?'cards') and
   (case when jsonb_typeof(previous#>'{body,state,cards}')='array' then jsonb_array_length(previous#>'{body,state,cards}')>0 else false end) then
   return vpo_private.failure('Atualize a página para preservar seus cartões.',426,'CLIENT_UPDATE_REQUIRED');
  end if;
 end if;
 return vpo_private.saved_cards_plan_api(p_method,p_path,p_body);
end $$;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
