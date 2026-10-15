import assert from "node:assert/strict";
import { test } from "node:test";
import { deploymentIssues } from "../lib/server/deployment";

const valid = {
  APP_BASE_URL: "https://k4-example.vercel.app",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fictitious",
  SUPABASE_SECRET_KEY: "sb_secret_fictitious",
  TRACKING_SECRET: "fictitious-tracking-".repeat(3),
  RATE_LIMIT_SECRET: "fictitious-rate-".repeat(3),
  PAYMENT_PROVIDER: "unconfigured",
};

test("published configuration accepts independent hosted origins and no payment provider", () => {
  assert.deepEqual(deploymentIssues(valid), []);
  assert.deepEqual(
    deploymentIssues({
      ...valid,
      FEATURED_EVENT_SLUG: "evento-publicado",
      CHARGE_TTL_SECONDS: "900",
    }),
    [],
  );
});

test("published demo requires an exact event allowlist and a private secret", () => {
  const demo = {
    ...valid,
    PAYMENT_PROVIDER: "demo",
    FEATURED_EVENT_SLUG: "demo-k4",
    DEMO_EVENT_SLUG: "demo-k4",
    DEMO_SECRET: "d".repeat(64),
  };
  assert.deepEqual(deploymentIssues(demo), []);
  for (const override of [
    { DEMO_EVENT_SLUG: "other-event" },
    { DEMO_SECRET: "short" },
    { FEATURED_EVENT_SLUG: "" },
    { NEXT_PUBLIC_DEMO_SECRET: "private-value" },
  ])
    assert.ok(deploymentIssues({ ...demo, ...override }).length > 0);
});

test("published configuration rejects local URLs and malformed origins", () => {
  for (const origin of [
    "http://example.com",
    "https://localhost",
    "https://127.0.0.1",
    "https://10.0.0.1",
    "https://192.168.0.1",
    "https://user:password@example.com",
    "https://example.com/admin",
    "https://example.com?q=secret",
    "not-an-url",
  ]) {
    assert.ok(
      deploymentIssues({ ...valid, APP_BASE_URL: origin }).some(
        (issue) => issue.field === "APP_BASE_URL",
      ),
    );
    assert.ok(
      deploymentIssues({ ...valid, NEXT_PUBLIC_SUPABASE_URL: origin }).some(
        (issue) => issue.field === "NEXT_PUBLIC_SUPABASE_URL",
      ),
    );
  }
});

test("published configuration cannot leak service keys or enable local simulation", () => {
  for (const override of [
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: valid.SUPABASE_SECRET_KEY },
    { NEXT_PUBLIC_TRACKING_SECRET: "private-value" },
    { NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY: "private-value" },
    { PAYMENT_PROVIDER: "simulated" },
    { PAYMENT_PROVIDER: "unknown" },
    { SIMULATION_SECRET: "private-value" },
    { DATABASE_URL: "postgresql://user:password@127.0.0.1/db" },
    { TRACKING_SECRET: "too-short" },
    { RATE_LIMIT_SECRET: valid.TRACKING_SECRET },
  ])
    assert.ok(deploymentIssues({ ...valid, ...override }).length > 0);
});

test("published configuration supports legacy anon and service_role keys without authenticating them", () => {
  const jwt = (role: string) =>
    `e30.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.fictitious`;
  assert.deepEqual(
    deploymentIssues({
      ...valid,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("anon"),
      SUPABASE_SECRET_KEY: jwt("service_role"),
    }),
    [],
  );
  assert.ok(
    deploymentIssues({
      ...valid,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("service_role"),
    }).length > 0,
  );
});

test("published configuration diagnostics never include credential values", () => {
  const marker = "private-value-do-not-print";
  const issues = deploymentIssues({
    ...valid,
    SUPABASE_SECRET_KEY: marker,
    APP_BASE_URL: `https://${marker}@example.com`,
    DATABASE_URL: marker,
    TRACKING_SECRET: marker,
  });
  assert.ok(issues.length >= 4);
  assert.ok(!JSON.stringify(issues).includes(marker));
});

test("published configuration validates charge limits and the featured event slug", () => {
  for (const CHARGE_TTL_SECONDS of ["0", "29", "86401", "NaN", "900.5", ""])
    assert.ok(deploymentIssues({ ...valid, CHARGE_TTL_SECONDS }).length > 0);
  for (const FEATURED_EVENT_SLUG of [
    "../admin",
    "with spaces",
    "A".repeat(101),
  ])
    assert.ok(deploymentIssues({ ...valid, FEATURED_EVENT_SLUG }).length > 0);
});
