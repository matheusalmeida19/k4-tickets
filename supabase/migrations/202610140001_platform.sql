-- Independent local K4 Ingressos database. No production events or credentials.
create extension if not exists pgcrypto with schema extensions;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp()
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 100),
  title text not null check (length(btrim(title)) between 3 and 120),
  description text not null default '' check (length(description) <= 2000),
  event_starts_at timestamptz not null,
  sales_starts_at timestamptz,
  sales_closes_at timestamptz not null,
  promo_ends_at timestamptz not null,
  price_cents integer not null check (price_cents > 0 and price_cents <= 10000000),
  currency text not null default 'BRL' check (currency = 'BRL'),
  publication text not null default 'draft' check (publication in ('draft','published')),
  sales_status text not null default 'paused' check (sales_status in ('open','paused','closed')),
  reviewed boolean not null default false,
  is_demo boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (sales_closes_at < event_starts_at and promo_ends_at > event_starts_at),
  check (sales_starts_at is null or sales_starts_at < sales_closes_at),
  check (publication <> 'published' or (reviewed and sales_starts_at is not null))
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  buyer_name text not null,
  buyer_cpf text not null check (buyer_cpf ~ '^[0-9]{11}$'),
  access_hash text not null check (access_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key uuid not null unique,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = 'BRL'),
  commercial_snapshot jsonb not null check (jsonb_typeof(commercial_snapshot) = 'object'),
  status text not null default 'pending' check (status in ('pending','confirmed','expired','cancelled','needs_review')),
  is_test boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz
);
create index orders_event_created on public.orders(event_id,created_at desc);
create index orders_buyer_cpf on public.orders(buyer_cpf);
create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  provider text not null check (length(provider) between 1 and 64),
  provider_payment_id text check (length(provider_payment_id) between 1 and 200),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = 'BRL'),
  status text not null default 'pending' check (status in ('pending','confirmed','expired','cancelled','error','unknown')),
  expires_at timestamptz not null,
  is_test boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  paid_at timestamptz,
  unique(provider,provider_payment_id)
);
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  code text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
  status text not null default 'issued' check (status = 'issued'),
  is_test boolean not null,
  issued_at timestamptz not null default clock_timestamp(),
  check (code ~ '^[a-f0-9]{64}$')
);
create table public.payment_notifications (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  notification_id text not null,
  order_id uuid references public.orders(id),
  notification jsonb not null,
  received_at timestamptz not null default clock_timestamp(),
  unique(provider,notification_id)
);
create table public.payment_exceptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id),
  payment_attempt_id uuid references public.payment_attempts(id),
  notification_id uuid references public.payment_notifications(id),
  reason text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create table public.admin_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  action text not null,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp()
);
create table public.rate_limit_buckets (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  request_count integer not null check (request_count > 0),
  expires_at timestamptz not null
);

create function public.valid_cpf(p_cpf text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare i integer; total integer; digit integer;
begin
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' or p_cpf ~ '^([0-9])\1{10}$' then return false; end if;
  total := 0;
  for i in 1..9 loop total := total + substr(p_cpf,i,1)::integer * (11-i); end loop;
  digit := (total * 10) % 11; if digit = 10 then digit := 0; end if;
  if digit <> substr(p_cpf,10,1)::integer then return false; end if;
  total := 0;
  for i in 1..10 loop total := total + substr(p_cpf,i,1)::integer * (12-i); end loop;
  digit := (total * 10) % 11; if digit = 10 then digit := 0; end if;
  return digit = substr(p_cpf,11,1)::integer;
end $$;
create function public.guard_order_snapshot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if row(new.event_id,new.buyer_name,new.buyer_cpf,new.access_hash,new.idempotency_key,new.request_hash,new.amount_cents,new.currency,new.commercial_snapshot,new.created_at)
    is distinct from row(old.event_id,old.buyer_name,old.buyer_cpf,old.access_hash,old.idempotency_key,old.request_hash,old.amount_cents,old.currency,old.commercial_snapshot,old.created_at) then
    raise exception 'IMMUTABLE_ORDER';
  end if;
  if old.status = 'confirmed' and (new.status <> 'confirmed' or new.confirmed_at is distinct from old.confirmed_at or new.is_test is distinct from old.is_test) then raise exception 'IMMUTABLE_CONFIRMATION'; end if;
  return new;
end $$;
create trigger orders_snapshot_immutable before update on public.orders for each row execute function public.guard_order_snapshot();

create function public.create_order(p_event_slug text,p_full_name text,p_cpf text,p_acknowledged boolean,p_idempotency_key uuid,p_access_hash text,p_request_hash text,p_terms_version text default 'draft-2026-10')
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

create function public.reserve_payment(p_order_id uuid,p_provider text,p_ttl_seconds integer,p_is_test boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders; e public.events; a public.payment_attempts; v_now timestamptz; closing timestamptz;
begin
  if p_provider is null or p_provider in ('','unconfigured','unavailable') or length(p_provider)>64 or p_ttl_seconds is null or p_ttl_seconds not between 1 and 86400 or p_is_test is null then raise exception 'INVALID_PAYMENT'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into a from public.payment_attempts where order_id=o.id;
  if found then
    if a.provider<>p_provider or a.is_test<>p_is_test then raise exception 'PAYMENT_CONFLICT'; end if;
    return to_jsonb(a);
  end if;
  select * into e from public.events where id=o.event_id for share;
  v_now := clock_timestamp();
  closing := least(e.sales_closes_at,(o.commercial_snapshot->>'salesClosesAt')::timestamptz);
  if o.status<>'pending' or e.publication<>'published' or e.sales_status<>'open' or e.sales_starts_at is null or v_now<e.sales_starts_at or v_now>=closing then raise exception 'EVENT_UNAVAILABLE'; end if;
  insert into public.payment_attempts(order_id,provider,amount_cents,currency,expires_at,is_test)
    values(o.id,p_provider,o.amount_cents,o.currency,least(v_now+make_interval(secs=>p_ttl_seconds),closing),p_is_test) returning * into a;
  update public.orders set is_test=p_is_test where id=o.id;
  return to_jsonb(a);
end $$;

create function public.bind_payment(p_attempt_id uuid,p_provider_payment_id text,p_status text default 'pending')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts; o public.orders;
begin
  if p_provider_payment_id is null or length(p_provider_payment_id) not between 1 and 200 or p_status is null or p_status not in ('pending','error','unknown') then raise exception 'INVALID_PAYMENT'; end if;
  select * into a from public.payment_attempts where id=p_attempt_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into o from public.orders where id=a.order_id for update;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if a.provider_payment_id is not null and a.provider_payment_id<>p_provider_payment_id then raise exception 'PAYMENT_CONFLICT'; end if;
  if a.provider_payment_id is null then
    update public.payment_attempts set provider_payment_id=p_provider_payment_id,
      status=case when clock_timestamp()>=expires_at then 'expired' else p_status end,updated_at=clock_timestamp() where id=a.id returning * into a;
    if a.status='expired' then update public.orders set status='expired' where id=o.id and status='pending'; end if;
  end if;
  return to_jsonb(a);
end $$;

create function public.record_payment_exception(p_order_id uuid,p_attempt_id uuid,p_notification_id uuid,p_reason text,p_details jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into public.payment_exceptions(order_id,payment_attempt_id,notification_id,reason,details) values(p_order_id,p_attempt_id,p_notification_id,p_reason,p_details);
  update public.orders set status='needs_review' where id=p_order_id and status<>'confirmed';
end $$;

create function public.apply_payment_notification(p_notification jsonb,p_authenticated boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare n public.payment_notifications; a public.payment_attempts; o public.orders; ticket public.tickets;
  provider_name text; external_id text; notification_ref text; supplied_order uuid; amount integer; state text; paid_time timestamptz; reason text; safe_notification jsonb;
begin
  if not coalesce(p_authenticated,false) then raise exception 'NOTIFICATION_UNAUTHENTICATED'; end if;
  safe_notification := jsonb_build_object('notificationId',left(p_notification->>'notificationId',200),'provider',left(p_notification->>'provider',64),
    'paymentId',left(p_notification->>'paymentId',200),'orderId',left(p_notification->>'orderId',64),'amountCents',p_notification->'amountCents',
    'currency',left(p_notification->>'currency',20),'status',left(p_notification->>'status',20),'paidAt',left(p_notification->>'paidAt',100));
  provider_name := nullif(safe_notification->>'provider',''); external_id := nullif(safe_notification->>'paymentId','');
  notification_ref := coalesce(nullif(safe_notification->>'notificationId',''),gen_random_uuid()::text);
  if (safe_notification->>'orderId') ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' then supplied_order := (safe_notification->>'orderId')::uuid; end if;
  select * into a from public.payment_attempts where provider=provider_name and provider_payment_id=external_id;
  if found then
    select * into o from public.orders where id=a.order_id for update;
    select * into a from public.payment_attempts where id=a.id for update;
  elsif supplied_order is not null then
    select * into o from public.orders where id=supplied_order for update;
  end if;
  insert into public.payment_notifications(provider,notification_id,order_id,notification)
    values(coalesce(provider_name,'unknown'),notification_ref,o.id,safe_notification)
    on conflict(provider,notification_id) do nothing returning * into n;
  if not found then
    select * into n from public.payment_notifications where provider=coalesce(provider_name,'unknown') and notification_id=notification_ref;
    if n.notification is distinct from safe_notification then
      perform public.record_payment_exception(o.id,a.id,n.id,'notification_id_collision',safe_notification);
      return jsonb_build_object('outcome','exception','order_status',case when o.status='confirmed' then 'confirmed' else 'needs_review' end,'ticket_id',null);
    end if;
    select * into ticket from public.tickets where order_id=o.id;
    return jsonb_build_object('outcome','duplicate','order_status',o.status,'ticket_id',ticket.id);
  end if;
  state := safe_notification->>'status';
  if a.id is null then reason := 'unknown_payment_reference';
  elsif supplied_order is distinct from a.order_id then reason := 'order_reference_mismatch';
  elsif (safe_notification->>'amountCents') is null or (safe_notification->>'amountCents') !~ '^[0-9]{1,9}$' then reason := 'missing_or_invalid_amount';
  else
    amount := (safe_notification->>'amountCents')::integer;
    if amount<>a.amount_cents or amount<>o.amount_cents then reason := 'amount_mismatch';
    elsif safe_notification->>'currency' is distinct from a.currency then reason := 'currency_mismatch';
    elsif state is null or state not in ('pending','confirmed','expired','cancelled','error','unknown') then reason := 'invalid_status'; end if;
  end if;
  if reason is null and state='confirmed' then
    if coalesce(safe_notification->>'paidAt','') ~ '^\d{4}-\d{2}-\d{2}T' then
      begin paid_time := (safe_notification->>'paidAt')::timestamptz; exception when others then paid_time := null; end;
    end if;
    if paid_time is null or not isfinite(paid_time) or paid_time<a.created_at or paid_time>clock_timestamp() then reason := 'missing_or_invalid_paid_at';
    elsif paid_time>=a.expires_at then reason := 'payment_after_expiry';
    elsif a.status='confirmed' and a.paid_at is distinct from paid_time then reason := 'conflicting_confirmation'; end if;
  end if;
  if reason is not null then
    perform public.record_payment_exception(o.id,a.id,n.id,reason,safe_notification);
    return jsonb_build_object('outcome','exception','order_status',case when o.status='confirmed' then 'confirmed' when o.id is not null then 'needs_review' else null end,'ticket_id',null);
  end if;
  if o.status='confirmed' then
    select * into ticket from public.tickets where order_id=o.id;
    return jsonb_build_object('outcome','ignored','order_status','confirmed','ticket_id',ticket.id);
  end if;
  if state='confirmed' then
    update public.payment_attempts set status='confirmed',paid_at=paid_time,updated_at=clock_timestamp() where id=a.id;
    update public.orders set status='confirmed',confirmed_at=paid_time where id=o.id;
    insert into public.tickets(order_id,is_test) values(o.id,a.is_test) on conflict(order_id) do nothing returning * into ticket;
    if ticket.id is null then select * into ticket from public.tickets where order_id=o.id; end if;
    return jsonb_build_object('outcome','confirmed','order_status','confirmed','ticket_id',ticket.id);
  end if;
  -- Communication failures are not proof of non-payment. Stale observations cannot
  -- revive a terminal attempt or overwrite the exception queue.
  if a.status not in ('expired','cancelled') then
    update public.payment_attempts set status=state,updated_at=clock_timestamp() where id=a.id;
  end if;
  if o.status='pending' and state in ('expired','cancelled') then update public.orders set status=state where id=o.id returning * into o; end if;
  return jsonb_build_object('outcome','updated','order_status',o.status,'ticket_id',null);
end $$;

create function public.expire_order(p_order_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orders; a public.payment_attempts;
begin
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into a from public.payment_attempts where order_id=o.id for update;
  if a.id is not null and a.expires_at<=clock_timestamp() and a.status in ('pending','error','unknown') and o.status<>'confirmed' then
    update public.payment_attempts set status='expired',updated_at=clock_timestamp() where id=a.id;
    update public.orders set status='expired' where id=o.id and status='pending' returning * into o;
    if not found then select * into o from public.orders where id=p_order_id; end if;
  end if;
  return to_jsonb(o);
end $$;

create function public.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer) returns boolean
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

create function public.save_event(p_event jsonb,p_actor_id uuid,p_event_id uuid default null,p_expected_version integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.events; previous public.events; event_time timestamptz; start_time timestamptz; close_time timestamptz; promo_time timestamptz; event_price integer;
begin
  if not exists(select 1 from public.admin_users where user_id=p_actor_id) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_event is null or jsonb_typeof(p_event)<>'object' or p_event->>'slug' is null or p_event->>'title' is null
    or coalesce(p_event->>'priceCents','') !~ '^[0-9]{1,8}$' or coalesce(p_event->>'reviewed','') not in ('true','false')
    or coalesce(p_event->>'isDemo','') not in ('true','false') then raise exception 'INVALID_EVENT'; end if;
  begin
    event_time := (p_event->>'eventStartsAt')::timestamptz; start_time := (p_event->>'salesStartsAt')::timestamptz;
    close_time := (p_event->>'salesClosesAt')::timestamptz; promo_time := (p_event->>'promoEndsAt')::timestamptz; event_price := (p_event->>'priceCents')::integer;
  exception when others then raise exception 'INVALID_EVENT'; end;
  if event_time is null or close_time is null or promo_time is null or not isfinite(event_time) or not isfinite(close_time) or not isfinite(promo_time)
    or (start_time is not null and not isfinite(start_time)) then raise exception 'INVALID_EVENT'; end if;
  if p_event_id is null then
    insert into public.events(slug,title,description,event_starts_at,sales_starts_at,sales_closes_at,promo_ends_at,price_cents,publication,sales_status,reviewed,is_demo)
    values(p_event->>'slug',btrim(p_event->>'title'),coalesce(p_event->>'description',''),event_time,start_time,close_time,promo_time,event_price,p_event->>'publication',p_event->>'salesStatus',(p_event->>'reviewed')::boolean,(p_event->>'isDemo')::boolean) returning * into e;
  else
    select * into previous from public.events where id=p_event_id for update;
    if not found then raise exception 'EVENT_NOT_FOUND'; end if;
    if p_expected_version is null or previous.version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
    update public.events set slug=p_event->>'slug',title=btrim(p_event->>'title'),description=coalesce(p_event->>'description',''),event_starts_at=event_time,
      sales_starts_at=start_time,sales_closes_at=close_time,promo_ends_at=promo_time,price_cents=event_price,publication=p_event->>'publication',sales_status=p_event->>'salesStatus',
      reviewed=(p_event->>'reviewed')::boolean,is_demo=(p_event->>'isDemo')::boolean,version=version+1,updated_at=clock_timestamp() where id=p_event_id returning * into e;
  end if;
  insert into public.admin_audit(actor_id,action,target_id,details) values(p_actor_id,case when p_event_id is null then 'event.create' else 'event.update' end,e.id,
    jsonb_build_object('version',e.version,'publication',e.publication,'salesStatus',e.sales_status,'priceCents',e.price_cents));
  return to_jsonb(e);
exception when check_violation or not_null_violation or unique_violation then raise exception 'INVALID_EVENT';
end $$;

create function public.admin_order_search(p_filters jsonb,p_actor_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare event_filter uuid; status_filter text; search_filter text; cpf_filter text; page_offset integer := 0; result_rows jsonb; metrics jsonb;
begin
  if not exists(select 1 from public.admin_users where user_id=p_actor_id) then raise exception 'ADMIN_REQUIRED'; end if;
  begin event_filter := nullif(p_filters->>'eventId','')::uuid; page_offset := coalesce((p_filters->>'offset')::integer,0); exception when others then raise exception 'INVALID_FILTER'; end;
  if page_offset not between 0 and 100000 then raise exception 'INVALID_FILTER'; end if;
  status_filter := nullif(p_filters->>'status',''); search_filter := nullif(btrim(p_filters->>'search'),'');
  if status_filter is not null and status_filter not in ('pending','confirmed','expired','cancelled','needs_review') then raise exception 'INVALID_FILTER'; end if;
  if length(search_filter)>120 then raise exception 'INVALID_FILTER'; end if;
  cpf_filter := regexp_replace(coalesce(search_filter,''),'[. -]','','g');
  select coalesce(jsonb_agg(to_jsonb(filtered)),'[]'::jsonb) into result_rows from (
    select o.id,o.event_id,o.commercial_snapshot->>'eventTitle' as event_title,o.buyer_name,
      '***.***.'||substr(o.buyer_cpf,7,3)||'-**' as cpf_masked,o.status,o.amount_cents,o.created_at,a.status as payment_status,a.id as payment_id,t.id as ticket_id,o.is_test
    from public.orders o left join public.payment_attempts a on a.order_id=o.id left join public.tickets t on t.order_id=o.id
    where (event_filter is null or o.event_id=event_filter) and (status_filter is null or o.status=status_filter)
      and (search_filter is null or (cpf_filter ~ '^[0-9]{11}$' and o.buyer_cpf=cpf_filter) or (cpf_filter !~ '^[0-9]{11}$' and o.buyer_name ilike '%'||search_filter||'%'))
    order by o.created_at desc limit 50 offset page_offset
  ) filtered;
  select jsonb_build_object('confirmedCount',count(*) filter(where status='confirmed'),'confirmedCents',coalesce(sum(amount_cents) filter(where status='confirmed'),0),
    'pendingCount',count(*) filter(where status='pending'),'exceptionCount',(select count(*) from public.payment_exceptions x where event_filter is null or x.order_id in(select id from public.orders where event_id=event_filter)))
    into metrics from public.orders where event_filter is null or event_id=event_filter;
  return jsonb_build_object('rows',result_rows,'metrics',metrics);
end $$;

-- Fail closed: no public read/write or RPC execution, including functions exposed
-- by PostgREST. The authenticated admin session is verified by the backend; its
-- JWT alone never grants access to private buyer or financial rows.
alter table public.admin_users enable row level security;
alter table public.events enable row level security;
alter table public.orders enable row level security;
alter table public.payment_attempts enable row level security;
alter table public.tickets enable row level security;
alter table public.payment_notifications enable row level security;
alter table public.payment_exceptions enable row level security;
alter table public.admin_audit enable row level security;
alter table public.rate_limit_buckets enable row level security;
revoke all on table public.admin_users,public.events,public.orders,public.payment_attempts,public.tickets,public.payment_notifications,public.payment_exceptions,public.admin_audit,public.rate_limit_buckets from public,anon,authenticated,service_role;
grant select on table public.admin_users,public.events,public.orders,public.payment_attempts,public.tickets,public.payment_notifications,public.payment_exceptions,public.admin_audit,public.rate_limit_buckets to service_role;
grant insert,delete on table public.admin_users to service_role;
revoke all on function public.valid_cpf(text),public.guard_order_snapshot(),public.create_order(text,text,text,boolean,uuid,text,text,text),public.reserve_payment(uuid,text,integer,boolean),public.bind_payment(uuid,text,text),public.record_payment_exception(uuid,uuid,uuid,text,jsonb),public.apply_payment_notification(jsonb,boolean),public.expire_order(uuid),public.consume_rate_limit(text,integer,integer),public.save_event(jsonb,uuid,uuid,integer),public.admin_order_search(jsonb,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_order(text,text,text,boolean,uuid,text,text,text),public.reserve_payment(uuid,text,integer,boolean),public.bind_payment(uuid,text,text),public.apply_payment_notification(jsonb,boolean),public.expire_order(uuid),public.consume_rate_limit(text,integer,integer),public.save_event(jsonb,uuid,uuid,integer),public.admin_order_search(jsonb,uuid) to service_role;

