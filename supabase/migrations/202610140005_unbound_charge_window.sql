-- Retrying an unbound provider request must recheck the authoritative window.
-- A previously bound payment may still be tracked and reconciled after closing.
create or replace function public.reserve_payment(p_order_id uuid,p_provider text,p_ttl_seconds integer,p_is_test boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o public.orders; e public.events; a public.payment_attempts; v_now timestamptz; closing timestamptz;
begin
  if p_provider is null or p_provider in ('','unconfigured','unavailable') or length(p_provider)>64 or p_ttl_seconds is null or p_ttl_seconds not between 1 and 86400 or p_is_test is null
    or (p_provider='simulated' and not p_is_test) then raise exception 'INVALID_PAYMENT'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if not found then raise exception 'ORDER_NOT_FOUND'; end if;
  select * into e from public.events where id=o.event_id for share;
  if p_is_test and not e.is_demo then raise exception 'INVALID_PAYMENT'; end if;
  v_now := clock_timestamp();
  closing := least(e.sales_closes_at,(o.commercial_snapshot->>'salesClosesAt')::timestamptz);
  select * into a from public.payment_attempts where order_id=o.id;
  if found then
    if a.provider<>p_provider or a.is_test<>p_is_test then raise exception 'PAYMENT_CONFLICT'; end if;
    if a.provider_payment_id is null and (o.status<>'pending' or e.publication<>'published' or e.sales_status<>'open' or e.sales_starts_at is null
      or v_now<e.sales_starts_at or v_now>=least(closing,a.expires_at) or a.status in ('expired','cancelled')) then raise exception 'EVENT_UNAVAILABLE'; end if;
    return to_jsonb(a);
  end if;
  if o.status<>'pending' or e.publication<>'published' or e.sales_status<>'open' or e.sales_starts_at is null or v_now<e.sales_starts_at or v_now>=closing then raise exception 'EVENT_UNAVAILABLE'; end if;
  insert into public.payment_attempts(order_id,provider,amount_cents,currency,expires_at,is_test)
    values(o.id,p_provider,o.amount_cents,o.currency,least(v_now+make_interval(secs=>p_ttl_seconds),closing),p_is_test) returning * into a;
  update public.orders set is_test=p_is_test where id=o.id;
  return to_jsonb(a);
end $$;
