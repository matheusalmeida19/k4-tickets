import assert from "node:assert/strict";
import { test } from "node:test";
import { getPaymentProvider } from "../lib/server/payments/providers";

const configured = {
  NODE_ENV: "production",
  VERCEL: "1",
  VERCEL_ENV: "production",
  PAYMENT_PROVIDER: "demo",
  FEATURED_EVENT_SLUG: "demonstracao-k4",
  DEMO_EVENT_SLUG: "demonstracao-k4",
  DEMO_SECRET: "test-demo-secret-".repeat(4),
};
async function environment(
  overrides: Record<string, string | undefined>,
  run: () => void | Promise<void>,
) {
  const next = { ...configured, ...overrides };
  const previous = Object.fromEntries(
    Object.keys(next).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("explicit published demo produces only stable nonpayable test charges", async () => {
  await environment({}, async () => {
    const provider = getPaymentProvider();
    assert.equal(provider.name, "demo");
    const input = {
      orderId: "c0b92194-d3bc-4bde-a612-9c14b712c901",
      amountCents: 3500,
      currency: "BRL" as const,
      expiresAt: "2026-10-24T00:00:00Z",
      idempotencyKey: "fixture-attempt",
    };
    const charge = await provider.createCharge(input);
    assert.deepEqual(await provider.createCharge(input), charge);
    assert.equal(charge.isTest, true);
    assert.equal(charge.pixQrCode, null);
    assert.equal(charge.pixCopyPaste, null);
    assert.equal(charge.status, "pending");
    assert.match(charge.paymentId, /^demo_/);
    assert.throws(() => provider.validateNotification("{}", "forged"));
  });
});

test("partial demo configuration and local simulator flags cannot open published checkout", async () => {
  for (const override of [
    { DEMO_EVENT_SLUG: undefined },
    { DEMO_EVENT_SLUG: "another-event" },
    { FEATURED_EVENT_SLUG: undefined },
    { DEMO_SECRET: "short" },
    { DEMO_EVENT_SLUG: "../admin", FEATURED_EVENT_SLUG: "../admin" },
    { PAYMENT_PROVIDER: "simulated", SIMULATION_SECRET: "s".repeat(64) },
  ])
    await environment(override, () => {
      assert.equal(getPaymentProvider().name, "unconfigured");
    });
});
