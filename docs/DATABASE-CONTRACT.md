# Database contract

All business tables use snake_case. They enable RLS without anon/authenticated policies; only the backend service role reads them. Privileged functions are executable only by `service_role`, use a fixed empty search path, and validate inputs and temporal rules in PostgreSQL. Public callers cannot approve payments or obtain buyer data.

## Tables

- `events`: `id,slug,title,description,event_starts_at,sales_starts_at,sales_closes_at,promo_ends_at,price_cents,currency,publication,sales_status,reviewed,is_demo,version,created_at,updated_at`.
- `admin_users`: `user_id,created_at` (references Supabase Auth). Only a trusted provisioning script inserts.
- `orders`: `id,event_id,buyer_name,buyer_cpf,access_hash,idempotency_key,request_hash,amount_cents,currency,commercial_snapshot,status,is_test,created_at,confirmed_at`. Snapshot JSON uses **CommercialSnapshot camelCase fields**. Immutable buyer/commercial/access fields after insertion. UUID idempotency key unique; CPF deliberately not unique.
- `payment_attempts`: `id,order_id,provider,provider_payment_id,amount_cents,currency,status,expires_at,is_test,created_at,updated_at,paid_at`. One attempt per order; repeated provider creation uses **attempt ID as provider idempotency key**.
- `tickets`: `id,order_id,code,status,is_test,issued_at`; code is a random opaque credential distinct from buyer tracking token. One ticket per order.
- `payment_notifications`: sanitized financial notification JSON, unique provider/notification ID.
- `payment_exceptions`: `id,order_id,payment_attempt_id,notification_id,reason,details,created_at`.
- `admin_audit`: `id,actor_id,action,target_id,details,created_at`.
- `rate_limit_buckets`: fixed-window hashed keys, count and expiry.

## RPCs

- `create_order(p_event_slug text,p_full_name text,p_cpf text,p_acknowledged boolean,p_idempotency_key uuid,p_access_hash text,p_request_hash text,p_terms_version text DEFAULT 'draft-2026-10')` → JSON order row. Same idempotency key/request hash returns existing row; different fingerprint is rejected. Server DB clock enforces published/open/configured sales window. Price/snapshot always comes from the event.
- `reserve_payment(p_order_id uuid,p_provider text,p_ttl_seconds integer,p_is_test boolean)` → JSON attempt row. Repeats return existing attempt; an **unbound** attempt must still pass the live event/closing/expiry checks before a provider request can be retried. A new reservation rechecks the live event and snapshot closing, and expiry is `least(now + TTL,event closing,snapshot closing)`. Any test reservation requires an `is_demo` event; provider `simulated` additionally requires `p_is_test=true`. Order becomes test when simulation is reserved. Simulation must already pass the backend local-only fence.
- `bind_payment(p_attempt_id uuid,p_provider_payment_id text,p_status text DEFAULT 'pending')` → JSON attempt row. Provider ID may be bound exactly once; NULL is allowed only for an error/unknown communication observation. Only pending/error/unknown initial statuses; confirmed cannot originate from the charge creation response. Binding after expiry records the provider reference but marks the attempt expired. Existing terminal status/reference is preserved.
- `apply_payment_notification(p_notification jsonb,p_authenticated boolean)` → `{outcome,order_status,ticket_id}`. JSON matches ProviderNotification camelCase. Backend must validate authentication before calling with true. Atomic row locking, unique notifications and unique order ticket make concurrent/repeated delivery safe. Confirmed requires matching reference/provider/payment ID/value/currency and a paid timestamp before expiry. Late notification of timely payment is accepted; effectively late/divergent/missing information is recorded as an exception. A stale status never downgrades confirmed.
- `expire_order(p_order_id uuid)` → JSON order row. Also expires a retained order without an attempt once its snapshot closing passes. Expiry is not proof that no payment occurred; a later authentic timely confirmation can still issue a ticket.
- `consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer)` → boolean. Key is a server HMAC digest, never raw CPF/IP/credential.
- `database_now()` → timestamptz. Service-only authoritative instant for local simulator fixtures. Preserve the returned ISO precision instead of converting through a JavaScript Date before confirmation.
- `save_event(p_event jsonb,p_actor_id uuid,p_event_id uuid DEFAULT NULL,p_expected_version integer DEFAULT NULL)` → JSON event row. EventInput camelCase JSON; verifies actor is an admin, reviews chronology/publishing requirements, locks updates and audits each action.
- `record_admin_action(p_actor_id uuid,p_action text)` → void. Requires admin membership and accepts only `admin.login`/`admin.logout`. Records no credential/session payload.
- `admin_order_search(p_filters jsonb,p_actor_id uuid)` → `{rows:[snake_case masked order records],metrics:{confirmedCount,confirmedCents,pendingCount,exceptionCount}}`. Supports eventId/status/search/offset. CPF search is exact normalized; output never contains full CPF. Limit 50. Rechecks admin authorization.

RPC errors use stable messages (`EVENT_UNAVAILABLE`, `IDEMPOTENCY_CONFLICT`, `INVALID_BUYER`, `ADMIN_REQUIRED`, `VERSION_CONFLICT`, `INVALID_EVENT`, `INVALID_PAYMENT`). No exception text includes personal data or credentials. Tests use dedicated local PostgreSQL fixture SQL and rollback/cleanup. No production seeds or external migrations.
