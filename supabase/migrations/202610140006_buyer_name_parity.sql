-- Match the frontend/backend full-name contract: Unicode letters, ASCII or
-- typographic apostrophes and hyphens; at least two parts of two characters.
-- Collapse whitespace before trimming so pasted tabs/newlines normalize equally.
create or replace function public.create_order(p_event_slug text,p_full_name text,p_cpf text,p_acknowledged boolean,p_idempotency_key uuid,p_access_hash text,p_request_hash text,p_terms_version text default 'draft-2026-10')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare e public.events; o public.orders; v_now timestamptz; normalized_cpf text; normalized_name text;
begin
  normalized_cpf := regexp_replace(coalesce(p_cpf,''),'[. -]','','g');
  normalized_name := btrim(regexp_replace(coalesce(p_full_name,''),'\s+',' ','g'));
  if not coalesce(p_acknowledged,false) or not public.valid_cpf(normalized_cpf)
    or length(normalized_name) not between 5 and 120 or normalized_name !~ '^[[:alpha:]][[:alpha:]''’-]+( [[:alpha:]][[:alpha:]''’-]+)+$'
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
