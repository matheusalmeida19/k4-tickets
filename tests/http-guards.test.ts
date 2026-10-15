import assert from "node:assert/strict";
import { test } from "node:test";
import { readJson } from "../lib/server/http";

test("JSON body is bounded while streaming, independent of content-length", async () => {
  const small = new Request("http://127.0.0.1:3009/api/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "ok" }) });
  assert.deepEqual(await readJson(small), { value: "ok" });
  const oversized = new Request("http://127.0.0.1:3009/api/orders", { method: "POST", headers: { "content-type": "application/json", "content-length": "2" }, body: JSON.stringify({ value: "a".repeat(9000) }) });
  await assert.rejects(readJson(oversized), (error: unknown) => typeof error === "object" && error !== null && "status" in error && error.status === 413);
});
