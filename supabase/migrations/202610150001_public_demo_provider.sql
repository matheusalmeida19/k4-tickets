-- The hosted presentation provider must never create a real payment attempt.
alter table public.payment_attempts
  add constraint payment_attempts_demo_must_test
  check (provider <> 'demo' or is_test);
