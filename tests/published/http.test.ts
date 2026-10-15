import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { after, before, test } from "node:test";
const base = "http://127.0.0.1:3009";
let server: ChildProcess;

before(async () => {
  // Executes the actual production artifact locally; creates no Vercel resources.
  server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", "3009"], {
    env: { ...process.env, NODE_ENV: "production", APP_BASE_URL: base, PAYMENT_PROVIDER: "simulated", VERCEL: "1", VERCEL_ENV: "preview" },
    stdio: "ignore", windowsHide: true,
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Production test server could not start; ensure port3009 is free and build exists.");
    try { if ((await fetch(base)).ok) return; } catch { /* Server startup, bounded below. */ }
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("Production test server did not become ready.");
});
after(async () => {
  if (!server || server.exitCode !== null) return;
  await new Promise<void>((done) => { server.once("exit", () => done()); server.kill(); });
});
test("production/preview artifact refuses simulated checkout despite private flag", async () => {
  const response = await fetch(`${base}/api/orders`, { method: "POST", headers: { origin: base, "content-type": "application/json" },
    body: JSON.stringify({ eventSlug: "fictitious-published-test", fullName: "Pessoa Ficticia Teste", cpf: "12345678909", acknowledged: true, idempotencyKey: randomUUID() }) });
  assert.equal(response.status, 503);
  const body = await response.json(); assert.equal(body.code, "PAYMENT_UNAVAILABLE");
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
});
