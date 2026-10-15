import assert from "node:assert/strict";
import { test } from "node:test";
import { getFridayDefaults, getSalesAvailability, isValidCpf, isValidFullName, normalizeCpf, patchEventSchema, promotionalEntryEnded, purchaseSchema } from "../lib/domain/rules";
import type { EventRecord } from "../lib/domain/types";

const event: EventRecord = { id: "00000000-0000-4000-8000-000000000000", slug: "teste", title: "Teste", description: "", eventStartsAt: "2026-10-17T01:00:00.000Z", salesStartsAt: "2026-10-01T04:00:00.000Z", salesClosesAt: "2026-10-15T00:00:00.000Z", promoEndsAt: "2026-10-17T04:00:00.000Z", priceCents: 3500, currency: "BRL", publication: "published", salesStatus: "open", isDemo: true, version: 1, createdAt: "2026-10-01T04:00:00.000Z", updatedAt: "2026-10-01T04:00:00.000Z" };

test("validates full names and mathematical CPF without identity claims", () => {
  assert.equal(isValidFullName("Ana Silva"), true);
  for (const invalid of ["Ana", "A B", "Ana 123", "<script> Doe"]) assert.equal(isValidFullName(invalid), false);
  assert.equal(normalizeCpf("529.982.247-25"), "52998224725");
  assert.equal(isValidCpf("529.982.247-25"), true);
  for (const invalid of ["11111111111", "00000000000", "52998224724", "5299822472", "abc52998224725"]) assert.equal(isValidCpf(invalid), false);
});

test("Friday defaults use Wednesday 20h and Saturday midnight in Manaus", () => {
  assert.deepEqual(getFridayDefaults("2026-10-16"), { priceCents: 3500, salesClosesAt: "2026-10-15T00:00:00.000Z", promoEndsAt: "2026-10-17T04:00:00.000Z" });
  assert.equal(getFridayDefaults("2026-10-17"), null);
});

test("server-time closing is exclusive and draft/paused/closed block orders", () => {
  assert.equal(getSalesAvailability(event, new Date("2026-10-14T23:59:59.999Z")), "open");
  assert.equal(getSalesAvailability(event, new Date("2026-10-15T00:00:00.000Z")), "closed");
  assert.equal(getSalesAvailability({ ...event, publication: "draft" }, new Date("2026-10-10T04:00:00Z")), "draft");
  assert.equal(getSalesAvailability({ ...event, salesStatus: "paused" }, new Date("2026-10-10T04:00:00Z")), "paused");
  assert.equal(getSalesAvailability({ ...event, salesStatus: "closed" }, new Date("2026-10-10T04:00:00Z")), "closed");
  assert.equal(getSalesAvailability({ ...event, salesStartsAt: null }, new Date("2026-10-10T04:00:00Z")), "not_started");
});

test("purchase rejects forged price/status and missing acknowledgement", () => {
  const input = { eventSlug: "teste", fullName: "Ana Silva", cpf: "52998224725", acknowledged: true, idempotencyKey: "c0b92194-d3bc-4bde-a612-9c14b712c901" };
  assert.equal(purchaseSchema.safeParse(input).success, true);
  for (const forged of [{ ...input, priceCents: 1 }, { ...input, status: "confirmed" }, { ...input, acknowledged: false }]) assert.equal(purchaseSchema.safeParse(forged).success, false);
});

test("event updates require the editor's original version", () => {
  const input = { slug: event.slug, title: event.title, description: event.description, eventStartsAt: event.eventStartsAt, salesStartsAt: event.salesStartsAt, salesClosesAt: event.salesClosesAt, promoEndsAt: event.promoEndsAt, priceCents: event.priceCents, publication: event.publication, salesStatus: event.salesStatus, isDemo: event.isDemo, reviewed: true };
  assert.equal(patchEventSchema.safeParse(input).success, false);
  assert.equal(patchEventSchema.safeParse({ ...input, expectedVersion: 0 }).success, false);
  assert.equal(patchEventSchema.safeParse({ ...input, expectedVersion: 1 }).success, true);
});

test("Saturday midnight Manaus ends only the promotional benefit, exactly at 00h", () => {
  const cutoff = "2026-10-17T00:00:00-04:00";
  assert.equal(promotionalEntryEnded(cutoff, new Date("2026-10-17T03:59:59.999Z")), false);
  assert.equal(promotionalEntryEnded(cutoff, new Date("2026-10-17T04:00:00.000Z")), true);
  assert.equal(promotionalEntryEnded(cutoff, new Date("2026-10-17T04:00:00.001Z")), true);
});
