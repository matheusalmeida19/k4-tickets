-- Run as a trusted database operator after applying migrations.
-- Catalog checks only: no buyer data, business RPC execution or writes.
begin transaction read only;

select 'migrations' as check_name, count(*) = 7 as ok
from supabase_migrations.schema_migrations
where version in ('202610140001','202610140002','202610140003',
                  '202610140004','202610140005','202610140006','202610150001');

with expected(name) as (values
  ('admin_users'),('events'),('orders'),('payment_attempts'),('tickets'),
  ('payment_notifications'),('payment_exceptions'),('admin_audit'),('rate_limit_buckets')
), tables as (
  select c.oid, c.relrowsecurity
  from expected e
  join pg_namespace n on n.nspname = 'public'
  join pg_class c on c.relnamespace = n.oid and c.relname = e.name and c.relkind = 'r'
)
select 'tables_and_rls' as check_name,
  count(*) = 9 and coalesce(bool_and(
    relrowsecurity
    and not has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    and not has_table_privilege('authenticated',oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    and has_table_privilege('service_role',oid,'SELECT')
  ),false) as ok
from tables;

with expected(signature) as (values
  ('public.create_order(text,text,text,boolean,uuid,text,text,text)'),
  ('public.reserve_payment(uuid,text,integer,boolean)'),
  ('public.bind_payment(uuid,text,text)'),
  ('public.apply_payment_notification(jsonb,boolean)'),
  ('public.expire_order(uuid)'),
  ('public.consume_rate_limit(text,integer,integer)'),
  ('public.save_event(jsonb,uuid,uuid,integer)'),
  ('public.admin_order_search(jsonb,uuid)'),
  ('public.record_admin_action(uuid,text)'),
  ('public.database_now()')
), functions as (select to_regprocedure(signature)::oid as oid from expected)
select 'service_rpcs' as check_name,
  count(oid) = 10 and coalesce(bool_and(
    has_function_privilege('service_role',oid,'EXECUTE')
    and not has_function_privilege('anon',oid,'EXECUTE')
    and not has_function_privilege('authenticated',oid,'EXECUTE')
  ),false) as ok
from functions;

commit;
