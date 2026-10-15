import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocalSimulationAllowed } from "../lib/server/config";
import { SimulatedProvider, UnconfiguredProvider } from "../lib/server/payments/providers";

const local = { NODE_ENV: "test", PAYMENT_PROVIDER: "simulated", APP_BASE_URL: "http://127.0.0.1:3009", NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54331", DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:54332/postgres", SIMULATION_SECRET: "a".repeat(64) };
test("simulation denied in every published and nonlocal configuration", () => {
  assert.equal(isLocalSimulationAllowed(local), true);
  for (const override of [{ NODE_ENV: "production" }, { VERCEL: "1" }, { VERCEL_ENV: "preview" }, { APP_BASE_URL: "https://example.test" }, { NEXT_PUBLIC_SUPABASE_URL: "https://remote.supabase.co" }, { DATABASE_URL: "postgresql://user:password@remote.test/db" }, { PAYMENT_PROVIDER: "unconfigured" }]) assert.equal(isLocalSimulationAllowed({ ...local, ...override }), false);
});
test("unconfigured provider cannot create real charges", async () => {
  await assert.rejects(new UnconfiguredProvider().createCharge(), /indisponível/i);
});
test("simulated charge is not a payable Pix, internal notifications require HMAC", async () => {
  const provider = new SimulatedProvider(local);
  const charge = await provider.createCharge({ orderId: "c0b92194-d3bc-4bde-a612-9c14b712c901", amountCents: 3500, currency: "BRL", expiresAt: "2026-10-15T00:00:00Z", idempotencyKey: "attempt-one" });
  assert.equal(charge.pixQrCode, null); assert.equal(charge.pixCopyPaste, null); assert.equal(charge.isTest, true);
  assert.equal(charge.status, "pending");
  const raw = JSON.stringify({ notificationId: "unit-confirmation", provider: "simulated", orderId: "c0b92194-d3bc-4bde-a612-9c14b712c901", paymentId: charge.paymentId, status: "confirmed", paidAt: "2026-10-14T12:00:00Z", amountCents: 3500, currency: "BRL" });
  assert.throws(() => provider.validateNotification(raw, "forged"), /autenticada/i);
  const signature = provider.signNotification(raw);
  assert.equal(provider.validateNotification(raw, signature).status, "confirmed");
  const incomplete = JSON.stringify({ notificationId: "incomplete", paymentId: charge.paymentId, orderId: "c0b92194-d3bc-4bde-a612-9c14b712c901", status: "confirmed" });
  assert.equal(provider.validateNotification(incomplete, provider.signNotification(incomplete)).amountCents, undefined);
});
