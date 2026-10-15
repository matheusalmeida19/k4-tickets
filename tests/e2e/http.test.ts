import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { SimulatedProvider } from "../../lib/server/payments/providers";
import { confirmInternalNotification } from "../../lib/server/payments/confirmation";

const base = process.env.APP_BASE_URL!;
const pg = new Client({ connectionString: process.env.DATABASE_URL });
const adminAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
const eventId = randomUUID(), slug = `teste-http-${randomUUID()}`;
const userIds: string[] = [];
const adminEventIds: string[] = [];
const adminEmail = `test-${randomUUID()}@example.test`, password = randomBytes(30).toString("base64url");
let adminCookies = "";

async function request(path: string, body?: unknown, cookie?: string, method?: string) {
  return fetch(new URL(path, base), {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: { ...(body === undefined ? {} : { "content-type": "application/json", origin: base }), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual",
  });
}
const cookieHeader = (res: Response) => res.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
const purchase = () => ({ eventSlug: slug, fullName: "Pessoa Exemplo Teste", cpf: "12345678909", acknowledged: true, idempotencyKey: randomUUID() });

before(async () => {
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "HTTP tests require loopback");
  assert.equal(new URL(process.env.DATABASE_URL!).port, "54332", "tests require isolated database");
  await pg.connect();
  await pg.query(`insert into public.events(id,slug,title,description,event_starts_at,sales_starts_at,sales_closes_at,promo_ends_at,price_cents,publication,sales_status,reviewed,is_demo)
    values($1,$2,'Evento fictício de teste HTTP','Não é um evento real',now()+interval '7 days',now()-interval '1 day',now()+interval '2 days',now()+interval '8 days',3500,'published','open',true,true)`, [eventId, slug]);
  const created = await adminAuth.auth.admin.createUser({ email: adminEmail, password, email_confirm: true });
  assert.equal(created.error, null, "fixture administrator must be provisioned");
  userIds.push(created.data.user!.id);
  await pg.query("insert into public.admin_users(user_id) values($1)", [created.data.user!.id]);
});
after(async () => {
  // Only fixtures created by this file are removed. No reset or shared stack cleanup.
  for (const table of ["payment_exceptions", "tickets", "payment_notifications", "payment_attempts"]) {
    await pg.query(`delete from public.${table} where order_id in (select id from public.orders where event_id=$1)`, [eventId]);
  }
  await pg.query("delete from public.orders where event_id=$1", [eventId]);
  await pg.query("delete from public.events where id=$1", [eventId]);
  await pg.query("delete from public.events where id=any($1::uuid[])", [adminEventIds]);
  await pg.query("delete from public.admin_audit where actor_id=any($1::uuid[])", [userIds]);
  for (const id of userIds) await adminAuth.auth.admin.deleteUser(id);
  await pg.end();
});

test("admin login rejects a password shorter than eight characters", async () => {
  const response = await request("/api/admin/login", { email: adminEmail, password: "1234567" });
  assert.equal(response.status, 400);
});

test("real HTTP checkout rejects forged fields and persists one idempotent order", async () => {
  const forged = await request("/api/orders", { ...purchase(), priceCents: 1, status: "confirmed" });
  assert.equal(forged.status, 400);
  const input = purchase();
  const responses = await Promise.all([request("/api/orders", input), request("/api/orders", input)]);
  assert.ok(responses.every((res) => res.ok), "duplicate safe checkout succeeds");
  const first = await responses[0].json(), second = await responses[1].json();
  assert.equal(first.id, second.id);
  assert.ok(typeof first.accessToken === "string" && first.accessToken.length >= 40);
  assert.ok(first.accessToken === second.accessToken);
  const persisted = await pg.query("select amount_cents,status from public.orders where id=$1", [first.id]);
  assert.equal(persisted.rows[0].amount_cents, 3500);
  assert.equal(persisted.rows[0].status, "pending");
  const count = await pg.query("select count(*)::int n from public.orders where idempotency_key=$1", [input.idempotencyKey]);
  assert.equal(count.rows[0].n, 1);
});

test("private cookie access, authenticated internal confirmation, unique test ticket", async () => {
  const created = await request("/api/orders", purchase()); assert.ok(created.ok);
  const order = await created.json();
  assert.equal((await request(`/api/orders/${order.id}`)).status, 401);
  assert.equal((await request(`/api/orders/${order.id}/access`, { credential: randomBytes(32).toString("base64url") })).status, 404);
  const access = await request(`/api/orders/${order.id}/access`, { credential: order.accessToken }); assert.ok(access.ok);
  assert.match(access.headers.get("set-cookie") ?? "", /HttpOnly/i);
  assert.match(access.headers.get("set-cookie") ?? "", /SameSite=(Lax|Strict)/i);
  const cookies = cookieHeader(access);
  const pending = await request(`/api/orders/${order.id}`, undefined, cookies);
  assert.match(pending.headers.get("cache-control") ?? "", /no-store/);
  assert.equal((await pending.json()).status, "pending");
  const another = await (await request("/api/orders", purchase())).json();
  assert.equal((await request(`/api/orders/${another.id}`, undefined, cookies)).status, 401);
  const attempt = (await pg.query("select * from public.payment_attempts where order_id=$1", [order.id])).rows[0];
  const provider = new SimulatedProvider();
  const paidAt = (await pg.query("select to_json(clock_timestamp()) #>> '{}' as instant")).rows[0].instant;
  const message = { notificationId: randomUUID(), provider: "simulated", paymentId: attempt.provider_payment_id, orderId: order.id, amountCents: 3500, currency: "BRL", status: "confirmed", paidAt };
  const raw = JSON.stringify(message);
  await assert.rejects(confirmInternalNotification(provider, raw, "forged"));
  await Promise.all(Array.from({ length: 6 }, () => confirmInternalNotification(provider, raw, provider.signNotification(raw))));
  const stale = JSON.stringify({ ...message, notificationId: randomUUID(), status: "pending", paidAt: null });
  await confirmInternalNotification(provider, stale, provider.signNotification(stale));
  const final = await (await request(`/api/orders/${order.id}`, undefined, cookies)).json();
  assert.equal(final.status, "confirmed"); assert.equal(final.ticket.isTest, true);
  assert.match(final.ticket.qrDataUrl, /^data:image\/png;base64,/);
  assert.ok(final.ticket.code !== order.accessToken);
  assert.ok(!JSON.stringify(final.ticket).includes("12345678909"));
  assert.equal((await pg.query("select count(*)::int n from public.tickets where order_id=$1", [order.id])).rows[0].n, 1);
  assert.equal((await request("/api/payments/confirm", message)).status, 404, "no public approval route exists");
});

test("server-authoritative availability blocks stale checkout and charge reservation", async () => {
  for (const state of ["paused", "closed"]) {
    await pg.query("update public.events set sales_status=$1 where id=$2", [state, eventId]);
    assert.equal((await request("/api/orders", purchase())).status, 409);
  }
  await pg.query("update public.events set sales_status='open',publication='draft' where id=$1", [eventId]);
  assert.equal((await request("/api/orders", purchase())).status, 409);
  await pg.query("update public.events set publication='published',sales_starts_at=now()+interval '1 day' where id=$1", [eventId]);
  assert.equal((await request("/api/orders", purchase())).status, 409);
  await pg.query("update public.events set sales_starts_at=now()-interval '2 days',sales_closes_at=now()-interval '1 second' where id=$1", [eventId]);
  assert.equal((await request("/api/orders", purchase())).status, 409);
  await pg.query("update public.events set sales_closes_at=now()+interval '2 days' where id=$1", [eventId]);
});

test("admin routes verify authenticated server membership and mask CPF", async () => {
  assert.equal((await request("/api/admin/events")).status, 401);
  assert.equal((await request("/api/admin/orders/search", {})).status, 401);
  const nonadminEmail = `test-${randomUUID()}@example.test`;
  const created = await adminAuth.auth.admin.createUser({ email: nonadminEmail, password, email_confirm: true });
  assert.equal(created.error, null); userIds.push(created.data.user!.id);
  const rejected = await request("/api/admin/login", { email: nonadminEmail, password });
  assert.ok([401, 403].includes(rejected.status));
  const logged = await request("/api/admin/login", { email: adminEmail, password });
  assert.equal(logged.status, 200, await logged.text()); adminCookies = cookieHeader(logged);
  const search = await request("/api/admin/orders/search", { eventId, search: "12345678909" }, adminCookies);
  assert.ok(search.ok); const result = await search.json();
  assert.ok(result.orders.length > 0);
  assert.ok(!JSON.stringify(result.orders).includes("12345678909"));
  assert.ok(result.metrics.confirmedCount >= 1);
  const now = Date.now();
  const input = { slug: `admin-test-${randomUUID()}`, title: "Evento Fictício Administrativo", description: "Somente teste local",
    eventStartsAt: new Date(now + 7 * 86400000).toISOString(), salesStartsAt: new Date(now - 86400000).toISOString(),
    salesClosesAt: new Date(now + 2 * 86400000).toISOString(), promoEndsAt: new Date(now + 8 * 86400000).toISOString(),
    priceCents: 3500, publication: "draft", salesStatus: "paused", reviewed: false, isDemo: true };
  const createEvent = await request("/api/admin/events", input, adminCookies);
  assert.equal(createEvent.status, 201); let event = await createEvent.json(); adminEventIds.push(event.id);
  const publish = { ...input, publication: "published", salesStatus: "open", reviewed: true, expectedVersion: event.version };
  const published = await request(`/api/admin/events/${event.id}`, publish, adminCookies, "PATCH");
  assert.equal(published.status, 200); event = await published.json();
  const staleEditor = await request(`/api/admin/events/${event.id}`, publish, adminCookies, "PATCH");
  assert.equal(staleEditor.status, 409, "stale administrator cannot overwrite newer configuration");
  assert.equal((await request(`/api/admin/events/${event.id}`, { ...input, title: "Missing version" }, adminCookies, "PATCH")).status, 400);
  for (const salesStatus of ["paused", "closed"]) {
    const updated = await request(`/api/admin/events/${event.id}`, { ...publish, salesStatus, expectedVersion: event.version }, adminCookies, "PATCH");
    assert.equal(updated.status, 200); event = await updated.json(); assert.equal(event.salesStatus, salesStatus);
  }
  assert.ok((await pg.query("select count(*)::int n from public.admin_audit where actor_id=$1 and target_id=$2", [userIds[0], event.id])).rows[0].n >= 4);
  const out = await request("/api/admin/logout", {}, adminCookies); assert.ok(out.ok);
  assert.equal((await request("/api/admin/events", undefined, adminCookies)).status, 401, "revoked Supabase session rejected");
});

test("cross-origin writes and public Supabase access are denied", async () => {
  const denied = await fetch(new URL("/api/orders", base), { method: "POST", headers: { "content-type": "application/json", origin: "https://untrusted.example.test" }, body: JSON.stringify(purchase()) });
  assert.equal(denied.status, 403);
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
  const data = await anon.from("orders").select("id");
  assert.ok(data.error || data.data?.length === 0);
  const notification = await anon.rpc("apply_payment_notification", { p_notification: {}, p_authenticated: true });
  assert.ok(notification.error, "anon cannot call financial RPC even when claiming authenticated");
  const signUp = await anon.auth.signUp({ email: `public-${randomUUID()}@example.test`, password });
  assert.ok(signUp.error, "public administrator signup disabled");
});
