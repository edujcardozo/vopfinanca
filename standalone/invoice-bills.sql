-- Install after plan-freeze.sql. Invoice payments are metadata, not new expenses.
begin;
create function vpo_private.valid_invoice_bills(p_value jsonb)
returns boolean language plpgsql immutable set search_path='' as $$
declare b jsonb; item jsonb; ids text[]='{}'; txids text[]='{}'; d date;
begin
 if p_value is null then return true; end if;
 if jsonb_typeof(p_value) is distinct from 'array' then return false; end if;
 if jsonb_array_length(p_value)>3000 then return false; end if;
 for b in select value from jsonb_array_elements(p_value) loop
  if jsonb_typeof(b) is distinct from 'object'
   or jsonb_typeof(b->'id') is distinct from 'string' or b->>'id'!~'^[a-zA-Z0-9_-]{1,64}$' or b->>'id' in ('__proto__','constructor','prototype') or b->>'id'=any(ids)
   or jsonb_typeof(b->'month') is distinct from 'string' or b->>'month'!~'^(19[0-9]{2}|20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$'
   or jsonb_typeof(b->'dueDate') is distinct from 'string' or b->>'dueDate'!~'^(19[0-9]{2}|20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])-[0-9]{2}$'
   or jsonb_typeof(b->'card') is distinct from 'string' or length(b->>'card')>70
   or not (b?'paidDate') or jsonb_typeof(b->'paidDate') not in ('null','string')
   or jsonb_typeof(b->'transactionIds') is distinct from 'array' then return false; end if;
  d=(b->>'dueDate')::date;
  if b->>'paidDate' is not null then
   if b->>'paidDate'!~'^(19[0-9]{2}|20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])-[0-9]{2}$' then return false; end if;
   d=(b->>'paidDate')::date;
  end if;
  if jsonb_array_length(b->'transactionIds') not between 1 and 3000 then return false; end if;
  for item in select value from jsonb_array_elements(b->'transactionIds') loop
   if jsonb_typeof(item) is distinct from 'string' or item#>>'{}'!~'^[a-zA-Z0-9_-]{1,64}$' or item#>>'{}' in ('__proto__','constructor','prototype') or item#>>'{}'=any(txids) then return false; end if;
   txids=array_append(txids,item#>>'{}');
  end loop;
  ids=array_append(ids,b->>'id');
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function vpo_private.valid_invoice_bills(jsonb) from public,anon,authenticated;
alter function vpo_private.api(text,text,jsonb) rename to invoice_bills_plan_api;
revoke execute on function vpo_private.invoice_bills_plan_api(text,text,jsonb) from public,anon,authenticated;
create function vpo_private.api(p_method text,p_path text,p_body jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 if p_path='/api/plan' and p_method='PUT' then
  previous=vpo_private.invoice_bills_plan_api('GET','/api/plan','{}');
  if (previous->>'status')::integer<>200 then return previous; end if;
  if not vpo_private.valid_invoice_bills(p_body->'state'->'invoiceBills') then return vpo_private.failure('Dados de faturas inválidos.',400); end if;
  if not (coalesce(p_body->'state','{}')?'invoiceBills') and
   (case when jsonb_typeof(previous#>'{body,state,invoiceBills}')='array' then jsonb_array_length(previous#>'{body,state,invoiceBills}')>0 else false end) then
   return vpo_private.failure('Atualize a página para preservar as faturas.',426,'CLIENT_UPDATE_REQUIRED');
  end if;
 end if;
 return vpo_private.invoice_bills_plan_api(p_method,p_path,p_body);
end $$;
revoke execute on function vpo_private.api(text,text,jsonb) from public,anon;
grant execute on function vpo_private.api(text,text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
