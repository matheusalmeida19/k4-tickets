-- A provider communication error is an unknown observation, never a fabricated
-- payment identifier, proof of non-payment or a source of ticket confirmation.
create or replace function public.bind_payment(p_attempt_id uuid,p_provider_payment_id text,p_status text default 'pending')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.payment_attempts; o public.orders;
begin
  if (p_provider_payment_id is not null and length(p_provider_payment_id) not between 1 and 200)
    or p_status is null or p_status not in ('pending','error','unknown')
    or (p_provider_payment_id is null and p_status not in ('error','unknown')) then raise exception 'INVALID_PAYMENT'; end if;
  select * into a from public.payment_attempts where id=p_attempt_id;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  select * into o from public.orders where id=a.order_id for update;
  select * into a from public.payment_attempts where id=p_attempt_id for update;
  if a.provider_payment_id is not null and p_provider_payment_id is not null and a.provider_payment_id<>p_provider_payment_id then raise exception 'PAYMENT_CONFLICT'; end if;
  update public.payment_attempts set provider_payment_id=coalesce(provider_payment_id,p_provider_payment_id),
    status=case when status in ('confirmed','expired','cancelled') then status when clock_timestamp()>=expires_at then 'expired' else p_status end,
    updated_at=clock_timestamp() where id=a.id returning * into a;
  if a.status='expired' then update public.orders set status='expired' where id=o.id and status='pending'; end if;
  return to_jsonb(a);
end $$;

create function public.record_admin_action(p_actor_id uuid,p_action text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.admin_users where user_id=p_actor_id) then raise exception 'ADMIN_REQUIRED'; end if;
  if p_action is null or p_action not in ('admin.login','admin.logout') then raise exception 'INVALID_ADMIN_ACTION'; end if;
  insert into public.admin_audit(actor_id,action,target_id,details) values(p_actor_id,p_action,p_actor_id,'{}'::jsonb);
end $$;
revoke all on function public.record_admin_action(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.record_admin_action(uuid,text) to service_role;
