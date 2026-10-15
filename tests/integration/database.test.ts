import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { Pool, type PoolClient } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required for the real local database integration suite.");
const databaseUrl = new URL(connectionString);
if (!["127.0.0.1", "localhost", "[::1]"].includes(databaseUrl.hostname) || databaseUrl.port !== "54332") {
  throw new Error("Database tests run exclusively against the isolated local K4Ingressos PostgreSQL port 54332.");
}
const pool = new Pool({ connectionString, max: 12 });
const prefix = `dbtest-${randomUUID()}`;
const events: string[] = [];
const rateKeys: string[] = [];
const actorId = randomUUID();
const digest = () => randomBytes(32).toString("hex");

interface OrderRow {
  id: string; event_id: string; amount_cents: number; status: string; is_test: boolean;
  commercial_snapshot: { eventTitle: string; priceCents: number; salesClosesAt: string; promoEndsAt: string };
}
interface AttemptRow {
  id: string; order_id: string; provider: string; provider_payment_id: string | null;
  amount_cents: number; currency: string; expires_at: string; created_at: string; status: string;
}

function fictionalCpf() {
  const digits = Array.from(randomBytes(9), (value) => value % 10);
  for (const size of [9, 10]) {
    const sum = digits.slice(0, size).reduce((total, digit, index) => total + digit * (size + 1 - index), 0);
    const check = (sum * 10) % 11;
    digits.push(check === 10 ? 0 : check);
  }
  return digits.join("");
}

async function asRole<T>(role: "service_role" | "anon" | "authenticated", callback: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query(`set role ${role}`);
    return await callback(client);
  } finally {
    await client.query("reset role");
    client.release();
  }
}

async function rpc<T>(name: string, params: unknown[] = [], casts: string[] = []) {
  assert.match(name, /^[a-z_]+$/);
  const placeholders = params.map((_, index) => `$${index + 1}${casts[index] ? `::${casts[index]}` : ""}`).join(",");
  return asRole("service_role", async (client) => {
    const response = await client.query<{ result: T }>(`select to_jsonb(public.${name}(${placeholders})) as result`, params);
    return response.rows[0].result;
  });
}

async function event(overrides: Record<string, unknown> = {}) {
  const slug = `${prefix}-${events.length}`;
  const response = await pool.query<{ id: string; slug: string; sales_closes_at: Date }>(
    `insert into public.events(slug,title,description,event_starts_at,sales_starts_at,sales_closes_at,promo_ends_at,price_cents,publication,sales_status,reviewed,is_demo)
     values($1,'Evento Fictício de Integração','Somente teste isolado',clock_timestamp()+interval '2 days',
       clock_timestamp()-interval '1 day',clock_timestamp()+interval '1 hour',clock_timestamp()+interval '3 days',3500,'published','open',true,true)
     returning id,slug,sales_closes_at`, [slug],
  );
  const created = response.rows[0];
  events.push(created.id);
  const allowed = new Set(["publication", "sales_status", "sales_starts_at", "sales_closes_at", "price_cents", "title", "is_demo"]);
  for (const [key, value] of Object.entries(overrides)) {
    assert.ok(allowed.has(key));
    await pool.query(`update public.events set ${key}=$1 where id=$2`, [value, created.id]);
  }
  return created;
}

async function order(slug: string, overrides: Record<string, unknown> = {}) {
  const input = { fullName: "Pessoa Ficticia Teste", cpf: fictionalCpf(), acknowledged: true, key: randomUUID(), access: digest(), request: digest(), ...overrides };
  const created = await rpc<OrderRow>("create_order", [slug, input.fullName, input.cpf, input.acknowledged, input.key, input.access, input.request]);
  return { ...created, input };
}

async function charge(slug?: string) {
  const selected = slug ?? (await event()).slug;
  const created = await order(selected);
  const provider = `${prefix.slice(0, 48)}-sim`;
  const attempt = await rpc<AttemptRow>("reserve_payment", [created.id, provider, 900, true]);
  const paymentId = `fake-${randomUUID()}`;
  const bound = await rpc<AttemptRow>("bind_payment", [attempt.id, paymentId, "pending"]);
  return { order: created, attempt: bound };
}

async function notification(attempt: AttemptRow, overrides: Record<string, unknown> = {}) {
  const paidAt = await rpc<string>("database_now");
  return { notificationId: randomUUID(), provider: attempt.provider, paymentId: attempt.provider_payment_id, orderId: attempt.order_id,
    amountCents: attempt.amount_cents, currency: "BRL", status: "confirmed", paidAt, ...overrides };
}

async function confirm(attempt: AttemptRow, overrides: Record<string, unknown> = {}) {
  return rpc<{ outcome: string; order_status: string | null; ticket_id: string | null }>("apply_payment_notification", [await notification(attempt, overrides), true], ["jsonb", "boolean"]);
}

test("hosted demo cannot reserve a non-test attempt in PostgreSQL", async () => {
  const fixture = await event();
  const created = await order(fixture.slug);
  await assert.rejects(rpc("reserve_payment", [created.id, "demo", 900, false]), /payment_attempts_demo_must_test/);
  const real = await event({ is_demo: false });
  const realOrder = await order(real.slug);
  await assert.rejects(rpc("reserve_payment", [realOrder.id, "demo", 900, true]), /INVALID_PAYMENT/);
});

before(async () => {
  await pool.query("select 1 from public.events limit 0");
  await pool.query("insert into auth.users(id,aud,role,email,created_at,updated_at) values($1,'authenticated','authenticated',$2,now(),now())", [actorId, `${prefix}@example.test`]);
  await pool.query("insert into public.admin_users(user_id) values($1)", [actorId]);
});

after(async () => {
  try {
    await pool.query("delete from public.payment_exceptions where notification_id in (select id from public.payment_notifications where provider like $1) or order_id in(select id from public.orders where event_id=any($2::uuid[]))", [`${prefix.slice(0, 48)}%`, events]);
    await pool.query("delete from public.payment_notifications where provider like $1 or order_id in(select id from public.orders where event_id=any($2::uuid[]))", [`${prefix.slice(0, 48)}%`, events]);
    await pool.query("delete from public.tickets where order_id in(select id from public.orders where event_id=any($1::uuid[]))", [events]);
    await pool.query("delete from public.payment_attempts where order_id in(select id from public.orders where event_id=any($1::uuid[]))", [events]);
    await pool.query("delete from public.orders where event_id=any($1::uuid[])", [events]);
    await pool.query("delete from public.events where id=any($1::uuid[])", [events]);
    await pool.query("delete from public.admin_audit where actor_id=$1", [actorId]);
    await pool.query("delete from public.admin_users where user_id=$1", [actorId]);
    await pool.query("delete from auth.users where id=$1", [actorId]);
    await pool.query("delete from public.rate_limit_buckets where key=any($1::text[])", [rateKeys]);
  } finally {
    await pool.end();
  }
});

test("RLS and grants deny public buyer/financial access and public RPC execution", async () => {
  const tables = ["admin_users", "events", "orders", "payment_attempts", "tickets", "payment_notifications", "payment_exceptions", "admin_audit", "rate_limit_buckets"];
  for (const table of tables) {
    const metadata = await pool.query("select relrowsecurity from pg_class where oid=$1::regclass", [`public.${table}`]);
    assert.equal(metadata.rows[0].relrowsecurity, true);
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(asRole(role, (client) => client.query(`select * from public.${table} limit 1`)), /permission denied/);
    }
  }
  await assert.rejects(asRole("anon", (client) => client.query("select public.apply_payment_notification('{}',true)")), /permission denied/);
  await assert.rejects(asRole("authenticated", (client) => client.query("select public.consume_rate_limit($1,2,30)", [digest()])), /permission denied/);
  await assert.rejects(asRole("service_role", (client) => client.query("update public.orders set status='confirmed'")), /permission denied/);
});

test("database validates names, CPF check digits, repeated CPF and acknowledgements", async () => {
  const selected = await event();
  await assert.rejects(order(selected.slug, { fullName: "Nome" }), /INVALID_BUYER/);
  await assert.rejects(order(selected.slug, { fullName: "Teste 123" }), /INVALID_BUYER/);
  await assert.rejects(order(selected.slug, { cpf: "11111111111" }), /INVALID_BUYER/);
  await assert.rejects(order(selected.slug, { cpf: "12345678900" }), /INVALID_BUYER/);
  await assert.rejects(order(selected.slug, { acknowledged: false }), /INVALID_BUYER/);
});

test("database name validation accepts apostrophes and rejects one-character name parts", async () => {
  const selected = await event();
  for (const fullName of ["Ana D’Ávila", "Ana O'Neil", "María-José da Silva", "\t Ana D’Ávila \n"]) {
    const created = await order(selected.slug, { fullName });
    assert.ok(created.id);
  }
  for (const fullName of ["Ana D", "A Silva", "Ana !Silva", "Ana 123", "Ana", "Ana 'Silva"]) {
    await assert.rejects(order(selected.slug, { fullName }), /INVALID_BUYER/);
  }
});

test("server clock blocks drafts, pauses, closures and unopened windows", async () => {
  const cases = [{ publication: "draft" }, { sales_status: "paused" }, { sales_status: "closed" },
    { sales_starts_at: new Date(Date.now() + 60_000) }, { sales_closes_at: new Date(Date.now() - 1_000) }];
  for (const unavailable of cases) {
    const selected = await event(unavailable);
    await assert.rejects(order(selected.slug), /EVENT_UNAVAILABLE/);
  }
});

test("idempotent concurrent creation persists one order; distinct purchases by the same CPF remain allowed", async () => {
  const selected = await event();
  const shared = { key: randomUUID(), cpf: fictionalCpf(), access: digest(), request: digest() };
  const created = await Promise.all(Array.from({ length: 7 }, () => order(selected.slug, shared)));
  assert.equal(new Set(created.map((item) => item.id)).size, 1);
  const count = await pool.query("select count(*)::int as count from public.orders where event_id=$1", [selected.id]);
  assert.equal(count.rows[0].count, 1);
  await assert.rejects(order(selected.slug, { ...shared, request: digest() }), /IDEMPOTENCY_CONFLICT/);
  const another = await order(selected.slug, { cpf: shared.cpf });
  assert.notEqual(another.id, created[0].id);
});

test("commercial snapshots and buyer/access fields are immutable despite future event edits", async () => {
  const selected = await event();
  const created = await order(selected.slug);
  await pool.query("update public.events set price_cents=9900,title='Evento Editado' where id=$1", [selected.id]);
  const persisted = await pool.query("select amount_cents,commercial_snapshot from public.orders where id=$1", [created.id]);
  assert.equal(persisted.rows[0].amount_cents, 3500);
  assert.equal(persisted.rows[0].commercial_snapshot.priceCents, 3500);
  assert.equal(persisted.rows[0].commercial_snapshot.eventTitle, "Evento Fictício de Integração");
  await assert.rejects(pool.query("update public.orders set amount_cents=1 where id=$1", [created.id]), /IMMUTABLE_ORDER/);
  await assert.rejects(pool.query("update public.orders set access_hash=$1 where id=$2", [digest(), created.id]), /IMMUTABLE_ORDER/);
});

test("charge reservation is idempotent and clips expiry to the immutable closing", async () => {
  const selected = await event({ sales_closes_at: new Date(Date.now() + 45_000) });
  const created = await order(selected.slug);
  // Extending the event after purchase must not extend this order's contract.
  await pool.query("update public.events set sales_closes_at=clock_timestamp()+interval '1 hour' where id=$1", [selected.id]);
  const reserved = await Promise.all(Array.from({ length: 5 }, () => rpc<AttemptRow>("reserve_payment", [created.id, "simulated", 900, true])));
  assert.equal(new Set(reserved.map((item) => item.id)).size, 1);
  assert.equal(Date.parse(reserved[0].expires_at), Date.parse(created.commercial_snapshot.salesClosesAt));
  assert.equal(reserved[0].amount_cents, 3500);
  await assert.rejects(rpc("reserve_payment", [created.id, "other-provider", 900, true]), /PAYMENT_CONFLICT/);
});

test("charge creation cannot self-confirm or replace an existing provider reference", async () => {
  const created = await charge();
  await assert.rejects(rpc("bind_payment", [created.attempt.id, "forged-confirmation", "confirmed"]), /INVALID_PAYMENT/);
  await assert.rejects(rpc("bind_payment", [created.attempt.id, "another-reference", "pending"]), /PAYMENT_CONFLICT/);
  const count = await pool.query("select count(*)::int as count from public.tickets where order_id=$1", [created.order.id]);
  assert.equal(count.rows[0].count, 0);
});

test("an unbound charge retry rechecks a paused event and elapsed expiry", async () => {
  const selected = await event();
  const created = await order(selected.slug);
  const attempt = await rpc<AttemptRow>("reserve_payment", [created.id, "simulated", 900, true]);
  await pool.query("update public.events set sales_status='paused' where id=$1", [selected.id]);
  await assert.rejects(rpc("reserve_payment", [created.id, "simulated", 900, true]), /EVENT_UNAVAILABLE/);
  await pool.query("update public.events set sales_status='open' where id=$1", [selected.id]);
  await pool.query("update public.payment_attempts set expires_at=clock_timestamp()-interval '1 second' where id=$1", [attempt.id]);
  await assert.rejects(rpc("reserve_payment", [created.id, "simulated", 900, true]), /EVENT_UNAVAILABLE/);
});

test("communication failure can persist an unknown attempt without fabricating a provider reference", async () => {
  const selected = await event();
  const created = await order(selected.slug);
  const attempt = await rpc<AttemptRow>("reserve_payment", [created.id, "simulated", 900, true]);
  const unknown = await rpc<AttemptRow>("bind_payment", [attempt.id, null, "unknown"]);
  assert.equal(unknown.provider_payment_id, null);
  assert.equal(unknown.status, "unknown");
});

test("simulation requires an explicitly isolated demo event and a test ticket marker", async () => {
  const ordinary = await event({ is_demo: false });
  const created = await order(ordinary.slug);
  await assert.rejects(rpc("reserve_payment", [created.id, "simulated", 900, true]), /INVALID_PAYMENT/);
  const demo = await event();
  const demoOrder = await order(demo.slug);
  await assert.rejects(rpc("reserve_payment", [demoOrder.id, "simulated", 900, false]), /INVALID_PAYMENT/);
});

test("confirmation is authenticated and concurrent deliveries issue exactly one test ticket", async () => {
  const created = await charge();
  const observation = await notification(created.attempt);
  await assert.rejects(rpc("apply_payment_notification", [observation, false], ["jsonb", "boolean"]), /NOTIFICATION_UNAUTHENTICATED/);
  const delivered = await Promise.all(Array.from({ length: 8 }, () => rpc<{ outcome: string; ticket_id: string }>("apply_payment_notification", [observation, true], ["jsonb", "boolean"])));
  assert.equal(new Set(delivered.map((item) => item.ticket_id)).size, 1);
  const retainedReasons = await pool.query("select reason from public.payment_exceptions where order_id=$1", [created.order.id]);
  assert.equal(delivered.filter((item) => item.outcome === "confirmed").length, 1, `Outcomes: ${delivered.map((item) => item.outcome).join(",")}; reasons: ${retainedReasons.rows.map((item) => item.reason).join(",")}`);
  const ticket = await pool.query("select id,is_test,code from public.tickets where order_id=$1", [created.order.id]);
  assert.equal(ticket.rowCount, 1);
  assert.equal(ticket.rows[0].is_test, true);
  assert.match(ticket.rows[0].code, /^[a-f0-9]{64}$/);
  const stale = await confirm(created.attempt, { status: "pending", paidAt: null });
  assert.equal(stale.order_status, "confirmed");
  const otherConfirmation = await confirm(created.attempt, { paidAt: observation.paidAt });
  assert.equal(otherConfirmation.ticket_id, ticket.rows[0].id);
});

test("amount, currency, order and payment reference mismatches are retained as exceptions", async () => {
  for (const divergence of [{ amountCents: 1 }, { currency: "USD" }, { orderId: randomUUID() }, { paymentId: `unknown-${randomUUID()}` }, { paidAt: null }]) {
    const created = await charge();
    const result = await confirm(created.attempt, divergence);
    assert.equal(result.outcome, "exception");
    const tickets = await pool.query("select count(*)::int as count from public.tickets where order_id=$1", [created.order.id]);
    assert.equal(tickets.rows[0].count, 0);
    const exceptions = await pool.query("select count(*)::int as count from public.payment_exceptions where order_id=$1", [created.order.id]);
    assert.equal(exceptions.rows[0].count, 1);
  }
});

test("unknown and incomplete notifications survive without an order reference", async () => {
  const missing = { notificationId: randomUUID(), provider: `${prefix.slice(0, 48)}-sim`, status: "confirmed" };
  const result = await rpc<{ outcome: string }>("apply_payment_notification", [missing, true], ["jsonb", "boolean"]);
  assert.equal(result.outcome, "exception");
  const retained = await pool.query("select x.reason from public.payment_exceptions x join public.payment_notifications n on n.id=x.notification_id where n.provider=$1 and n.notification_id=$2", [missing.provider, missing.notificationId]);
  assert.equal(retained.rows[0].reason, "unknown_payment_reference");
});

test("late notification of timely effective payment upgrades an expired order", async () => {
  const created = await charge();
  await pool.query("update public.payment_attempts set created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 minute' where id=$1", [created.attempt.id]);
  const expired = await rpc<OrderRow>("expire_order", [created.order.id]);
  assert.equal(expired.status, "expired");
  const timely = await confirm(created.attempt, { paidAt: new Date(Date.now() - 5 * 60_000).toISOString() });
  assert.equal(timely.outcome, "confirmed");
  assert.ok(timely.ticket_id);
});

test("effectively late payment is recorded for review without issuing a ticket or inventing a refund", async () => {
  const created = await charge();
  await pool.query("update public.payment_attempts set created_at=clock_timestamp()-interval '1 hour',expires_at=clock_timestamp()-interval '1 minute' where id=$1", [created.attempt.id]);
  const late = await confirm(created.attempt);
  assert.equal(late.outcome, "exception");
  assert.equal(late.order_status, "needs_review");
  assert.equal(late.ticket_id, null);
  const retained = await pool.query("select reason from public.payment_exceptions where order_id=$1", [created.order.id]);
  assert.equal(retained.rows[0].reason, "payment_after_expiry");
});

test("provider communication error and unknown states do not falsely cancel an order", async () => {
  const created = await charge();
  for (const status of ["error", "unknown"]) {
    const result = await confirm(created.attempt, { status, paidAt: null });
    assert.equal(result.order_status, "pending");
    assert.equal(result.ticket_id, null);
  }
  const recovered = await confirm(created.attempt);
  assert.equal(recovered.outcome, "confirmed");
});

test("notification ID collisions cannot replace an authenticated observation", async () => {
  const created = await charge();
  const observation = await notification(created.attempt, { status: "pending", paidAt: null });
  await rpc("apply_payment_notification", [observation, true], ["jsonb", "boolean"]);
  const collision = await rpc<{ outcome: string; ticket_id: string | null }>("apply_payment_notification", [{ ...observation, status: "confirmed", paidAt: await rpc<string>("database_now") }, true], ["jsonb", "boolean"]);
  assert.equal(collision.outcome, "exception");
  assert.equal(collision.ticket_id, null);
});

test("closing race preserves an order but forbids charging and expires it without an attempt", async () => {
  const selected = await event();
  // Use the authoritative clock for both the deadline and wait; the host clock
  // can differ from Docker by more than the old test's 50ms tolerance.
  await pool.query("update public.events set sales_closes_at=clock_timestamp()+interval '1 second' where id=$1", [selected.id]);
  const created = await order(selected.slug);
  await pool.query("select pg_sleep(greatest(0,extract(epoch from (sales_closes_at-clock_timestamp())))+0.02) from public.events where id=$1", [selected.id]);
  await assert.rejects(rpc("reserve_payment", [created.id, "simulated", 900, true]), /EVENT_UNAVAILABLE/);
  const expired = await rpc<OrderRow>("expire_order", [created.id]);
  assert.equal(expired.status, "expired");
  assert.equal(expired.id, created.id);
});

test("admin mutations require membership, audit changes and protect optimistic revisions", async () => {
  const input = { slug: `${prefix}-admin`, title: "Evento Administrativo Fictício", description: "Teste", eventStartsAt: new Date(Date.now() + 172800000).toISOString(),
    salesStartsAt: null, salesClosesAt: new Date(Date.now() + 86400000).toISOString(), promoEndsAt: new Date(Date.now() + 259200000).toISOString(),
    priceCents: 3500, publication: "draft", salesStatus: "paused", reviewed: false, isDemo: true };
  await assert.rejects(rpc("save_event", [input, randomUUID()], ["jsonb", "uuid"]), /ADMIN_REQUIRED/);
  const saved = await rpc<{ id: string; version: number }>("save_event", [input, actorId], ["jsonb", "uuid"]);
  events.push(saved.id);
  await assert.rejects(rpc("save_event", [{ ...input, publication: "published" }, actorId, saved.id, saved.version], ["jsonb", "uuid", "uuid", "integer"]), /INVALID_EVENT/);
  const updated = await rpc<{ id: string; version: number }>("save_event", [{ ...input, title: "Título Revisado" }, actorId, saved.id, saved.version], ["jsonb", "uuid", "uuid", "integer"]);
  assert.equal(updated.version, saved.version + 1);
  await assert.rejects(rpc("save_event", [input, actorId, saved.id, saved.version], ["jsonb", "uuid", "uuid", "integer"]), /VERSION_CONFLICT/);
  const audit = await pool.query("select count(*)::int as count from public.admin_audit where actor_id=$1 and target_id=$2", [actorId, saved.id]);
  assert.equal(audit.rows[0].count, 2);
});

test("admin order search masks CPF and metrics count only confirmed amounts", async () => {
  const selected = await event();
  const paid = await charge(selected.slug);
  await order(selected.slug);
  await confirm(paid.attempt);
  await assert.rejects(rpc("admin_order_search", [{ eventId: selected.id }, randomUUID()], ["jsonb", "uuid"]), /ADMIN_REQUIRED/);
  const report = await rpc<{ rows: Array<Record<string, unknown>>; metrics: { confirmedCount: number; confirmedCents: number; pendingCount: number } }>("admin_order_search", [{ eventId: selected.id }, actorId], ["jsonb", "uuid"]);
  assert.equal(report.rows.length, 2);
  assert.equal(report.metrics.confirmedCount, 1);
  assert.equal(report.metrics.confirmedCents, 3500);
  assert.equal(report.metrics.pendingCount, 1);
  for (const row of report.rows) {
    assert.equal("buyer_cpf" in row, false);
    assert.match(String(row.cpf_masked), /^\*{3}\.\*{3}\.[0-9]{3}-\*{2}$/);
    assert.equal("access_hash" in row, false);
  }
});

test("rate limiting is atomic across simultaneous serverless requests", async () => {
  const key = digest();
  rateKeys.push(key);
  const allowed = await Promise.all(Array.from({ length: 9 }, () => rpc<boolean>("consume_rate_limit", [key, 3, 30])));
  assert.equal(allowed.filter(Boolean).length, 3);
  await pool.query("update public.rate_limit_buckets set expires_at=clock_timestamp()-interval '1 second' where key=$1", [key]);
  assert.equal(await rpc("consume_rate_limit", [key, 3, 30]), true);
});
