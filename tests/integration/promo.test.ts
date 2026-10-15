import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";
import { createOrder, getOrderView } from "../../lib/server/orders";
import { database, rpc } from "../../lib/server/database";
import { assertLocalEnvironment } from "../../lib/server/config";
import { SimulatedProvider } from "../../lib/server/payments/providers";
import { confirmInternalNotification } from "../../lib/server/payments/confirmation";

test("real paid ticket remains issued before, at and after promotional Saturday midnight", async () => {
  const originalNodeEnv = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "test" });
  assertLocalEnvironment();
  assert.equal(new URL(process.env.DATABASE_URL!).port, "54332");
  const db = new Client({ connectionString: process.env.DATABASE_URL });
  const eventId = randomUUID(), slug = `promo-test-${randomUUID()}`;
  await db.connect();
  try {
    // Dates remain future-safe; the pure rule test also pins 17/10/2026 at exact Manaus midnight.
    const current = new Date(await rpc<string>("database_now", {}));
    const friday = new Date(current.getTime() - 4 * 60 * 60 * 1000);
    friday.setUTCHours(0, 0, 0, 0);
    friday.setUTCDate(friday.getUTCDate() + ((5 - friday.getUTCDay() + 7) % 7) + 7);
    const fridayDate = friday.toISOString().slice(0, 10);
    const saturday = new Date(`${fridayDate}T00:00:00-04:00`); saturday.setUTCDate(saturday.getUTCDate() + 1);
    const cutoff = saturday.toISOString();
    await db.query(`insert into public.events(id,slug,title,description,event_starts_at,sales_starts_at,sales_closes_at,promo_ends_at,price_cents,publication,sales_status,reviewed,is_demo)
      values($1,$2,'Evento Fictício de Teste Promocional','Somente integração local',$3,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',$4,3500,'published','open',true,true)`, [eventId, slug, `${fridayDate}T21:00:00-04:00`, cutoff]);
    const created = await createOrder({ eventSlug: slug, fullName: "Pessoa Ficticia Promocional", cpf: "12345678909", acknowledged: true, idempotencyKey: randomUUID() });
    const { data: attempt, error } = await database().from("payment_attempts").select("*").eq("order_id", created.id).single();
    assert.equal(error, null);
    const provider = new SimulatedProvider();
    const raw = JSON.stringify({ notificationId: randomUUID(), provider: "simulated", paymentId: attempt!.provider_payment_id, orderId: created.id, amountCents: 3500, currency: "BRL", status: "confirmed", paidAt: await rpc<string>("database_now", {}) });
    const confirmed = await confirmInternalNotification(provider, raw, provider.signNotification(raw));
    assert.equal(confirmed.outcome, "confirmed");
    const before = await getOrderView(created.id, created.accessToken, new Date(saturday.getTime() - 1));
    const at = await getOrderView(created.id, created.accessToken, saturday);
    const after = await getOrderView(created.id, created.accessToken, new Date(saturday.getTime() + 1));
    assert.deepEqual([before.promotionalEntryEnded, at.promotionalEntryEnded, after.promotionalEntryEnded], [false, true, true]);
    assert.ok(before.ticket);
    for (const view of [before, at, after]) {
      assert.equal(view.status, "confirmed"); assert.equal(view.ticket?.status, "issued");
      assert.equal(view.ticket?.id, before.ticket.id); assert.equal(view.ticket?.code, before.ticket.code);
      assert.equal(view.ticket?.isTest, true); assert.match(view.snapshot.entryRule, /diferença/i);
    }
    assert.equal((await db.query("select count(*)::int n from public.tickets where order_id=$1", [created.id])).rows[0].n, 1);
  } finally {
    for (const table of ["payment_exceptions", "payment_notifications", "tickets", "payment_attempts"]) await db.query(`delete from public.${table} where order_id in(select id from public.orders where event_id=$1)`, [eventId]);
    await db.query("delete from public.orders where event_id=$1", [eventId]);
    await db.query("delete from public.events where id=$1", [eventId]);
    await db.end();
    if (originalNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Object.assign(process.env, { NODE_ENV: originalNodeEnv });
  }
});
