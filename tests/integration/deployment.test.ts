import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { Client } from "pg";

test("deployment catalog preflight verifies all migrations, RLS and RPC grants on real PostgreSQL", async () => {
  const url = new URL(process.env.DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.port, "54332");
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const sql = await readFile("supabase/checks/deployment.sql", "utf8");
    const results = await client.query(sql);
    const checks = (Array.isArray(results) ? results : [results]).flatMap(
      (result) => result.rows,
    );
    assert.deepEqual(checks, [
      { check_name: "migrations", ok: true },
      { check_name: "tables_and_rls", ok: true },
      { check_name: "service_rpcs", ok: true },
    ]);
  } finally {
    await client.end();
  }
});
