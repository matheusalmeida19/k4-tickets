-- Forward-only hardening for installations that applied the initial schema.
revoke all on table public.admin_users,public.events,public.orders,public.payment_attempts,public.tickets,public.payment_notifications,public.payment_exceptions,public.admin_audit,public.rate_limit_buckets from service_role;
grant select on table public.admin_users,public.events,public.orders,public.payment_attempts,public.tickets,public.payment_notifications,public.payment_exceptions,public.admin_audit,public.rate_limit_buckets to service_role;
grant insert,delete on table public.admin_users to service_role;
revoke all on function public.valid_cpf(text),public.guard_order_snapshot(),public.create_order(text,text,text,boolean,uuid,text,text,text),public.reserve_payment(uuid,text,integer,boolean),public.bind_payment(uuid,text,text),public.record_payment_exception(uuid,uuid,uuid,text,jsonb),public.apply_payment_notification(jsonb,boolean),public.expire_order(uuid),public.consume_rate_limit(text,integer,integer),public.save_event(jsonb,uuid,uuid,integer),public.admin_order_search(jsonb,uuid) from service_role;
grant execute on function public.create_order(text,text,text,boolean,uuid,text,text,text),public.reserve_payment(uuid,text,integer,boolean),public.bind_payment(uuid,text,text),public.apply_payment_notification(jsonb,boolean),public.expire_order(uuid),public.consume_rate_limit(text,integer,integer),public.save_event(jsonb,uuid,uuid,integer),public.admin_order_search(jsonb,uuid) to service_role;

create or replace function public.create_order(p_event_slug text,p_full_name text,p_cpf text,p_acknowledged boolean,p_idempotency_key uuid,p_access_hash text,p_request_hash text,p_terms_version text default 'draft-2026-10')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; o public.orders; v_now timestamptz; normalized_cpf text; normalized_name text;
begin
  normalized_cpf := regexp_replace(coalesce(p_cpf,''),'[. -]','','g');
  normalized_name := regexp_replace(btrim(coalesce(p_full_name,'')),'\s+',' ','g');
  if not coalesce(p_acknowledged,false) or not public.valid_cpf(normalized_cpf)
    or length(normalized_name) not between 5 and 120 or normalized_name !~ '^[[:alpha:]][[:alpha:]''-]* [[:alpha:]][[:alpha:] ''-]*$'
    or p_idempotency_key is null or p_access_hash is null or p_access_hash !~ '^[a-f0-9]{64}$' or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
    or p_terms_version is null or length(p_terms_version) not between 1 and 64 then raise exception 'INVALID_BUYER'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key::text,0));
  select * into o from public.orders where idempotency_key=p_idempotency_key;
  if found then
    if o.request_hash<>p_request_hash or o.access_hash<>p_access_hash or o.buyer_cpf<>normalized_cpf or o.buyer_name<>normalized_name then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
    return to_jsonb(o);
  end if;
  select * into e from public.events where slug=p_event_slug for share;
  v_now := clock_timestamp();
  if not found or e.publication<>'published' or e.sales_status<>'open' or e.sales_starts_at is null
    or v_now<e.sales_starts_at or v_now>=e.sales_closes_at then raise exception 'EVENT_UNAVAILABLE'; end if;
  insert into public.orders(event_id,buyer_name,buyer_cpf,access_hash,idempotency_key,request_hash,amount_cents,currency,commercial_snapshot)
  values(e.id,normalized_name,normalized_cpf,p_access_hash,p_idempotency_key,p_request_hash,e.price_cents,e.currency,
    jsonb_build_object('eventTitle',e.title,'eventStartsAt',e.event_starts_at,'promoEndsAt',e.promo_ends_at,'salesClosesAt',e.sales_closes_at,
      'priceCents',e.price_cents,'currency',e.currency,'entryRule','Entrada promocional até o horário indicado no ingresso. Depois, é necessário pagar a diferença da bilheteria.','termsVersion',p_terms_version))
  returning * into o;
  return to_jsonb(o);
end $$;

create or replace function public.expire_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; a public.payment_attempts;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into a from public.payment_attempts where order_id=o.id for update;
  if a.id is null and (o.commercial_snapshot->>'salesClosesAt')::timestamptz<=clock_timestamp() and o.status='pending' then
    update public.orders set status='expired' where id=o.id returning * into o;
  elsif a.id is not null and a.expires_at<=clock_timestamp() and a.status in ('pending','error','unknown') and o.status<>'confirmed' then
    update public.payment_attempts set status='expired',updated_at=clock_timestamp() where id=a.id;
    update public.orders set status='expired' where id=o.id and status='pending' returning * into o;
    if not found then select * into o from public.orders where id=p_order_id; end if;
  end if;
  return to_jsonb(o);
end $$;

create or replace function public.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare bucket public.rate_limit_buckets; v_now timestamptz := clock_timestamp();
begin
  if p_key is null or p_key !~ '^[a-f0-9]{64}$' or p_limit is null or p_limit not between 1 and 100000 or p_window_seconds is null or p_window_seconds not between 1 and 86400 then raise exception 'INVALID_RATE_LIMIT'; end if;
  insert into public.rate_limit_buckets(key,request_count,expires_at) values(p_key,1,v_now+make_interval(secs=>p_window_seconds))
  on conflict(key) do update set request_count=case when public.rate_limit_buckets.expires_at<=v_now then 1 else least(public.rate_limit_buckets.request_count+1,100001) end,
    expires_at=case when public.rate_limit_buckets.expires_at<=v_now then v_now+make_interval(secs=>p_window_seconds) else public.rate_limit_buckets.expires_at end
  returning * into bucket;
  return bucket.request_count<=p_limit;
end $$;
