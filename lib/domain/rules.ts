import { z } from "zod";
import type { EventRecord, SalesAvailability } from "./types";

export const TERMS_VERSION = "draft-2026-10";
export const ENTRY_RULE = "Entrada promocional até 00h de sábado. Depois desse horário, será necessário pagar a diferença na bilheteria. O ingresso pago permanece disponível.";
export const normalizeCpf = (value: string) => value.replace(/[.\-\s]/g, "");
export function isValidCpf(value: string): boolean {
  const cpf = normalizeCpf(value);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const length of [9, 10]) {
    const sum = [...cpf.slice(0, length)].reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    if (Number(cpf[length]) !== (remainder === 10 ? 0 : remainder)) return false;
  }
  return true;
}
export function isValidFullName(value: string): boolean {
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 5 && name.length <= 120 && /^[\p{L}][\p{L}'’\-]+(?: [\p{L}][\p{L}'’\-]+)+$/u.test(name);
}
export function maskCpf(value: string): string {
  const cpf = normalizeCpf(value);
  return `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}`;
}
export function getSalesAvailability(event: Pick<EventRecord, "publication" | "salesStatus" | "salesStartsAt" | "salesClosesAt">, now = new Date()): SalesAvailability {
  if (event.publication !== "published") return "draft";
  if (event.salesStatus === "closed" || now.getTime() >= Date.parse(event.salesClosesAt)) return "closed";
  if (event.salesStatus === "paused") return "paused";
  if (!event.salesStartsAt || now.getTime() < Date.parse(event.salesStartsAt)) return "not_started";
  return "open";
}
export function getFridayDefaults(date: string): { priceCents: number; salesClosesAt: string; promoEndsAt: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const friday = new Date(`${date}T12:00:00-04:00`);
  if (Number.isNaN(friday.getTime()) || friday.getUTCDay() !== 5 || friday.toISOString().slice(0, 10) !== date) return null;
  const closing = new Date(`${date}T20:00:00-04:00`); closing.setUTCDate(closing.getUTCDate() - 2);
  const promo = new Date(`${date}T00:00:00-04:00`); promo.setUTCDate(promo.getUTCDate() + 1);
  return { priceCents: 3500, salesClosesAt: closing.toISOString(), promoEndsAt: promo.toISOString() };
}
export function formatManaus(instant: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Manaus" }).format(new Date(instant));
}
export function promotionalEntryEnded(promoEndsAt: string, now = new Date()): boolean {
  return now.getTime() >= Date.parse(promoEndsAt);
}
export const purchaseSchema = z.object({
  eventSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  fullName: z.string().transform((name) => name.trim().replace(/\s+/g, " ")).refine(isValidFullName, "Informe nome e sobrenome."),
  cpf: z.string().max(20).refine(isValidCpf, "Informe um CPF com dígitos válidos.").transform(normalizeCpf),
  acknowledged: z.literal(true), idempotencyKey: z.uuid(),
}).strict();
const instant = z.iso.datetime({ offset: true });
export const eventSchema = z.object({
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  title: z.string().trim().min(3).max(100), description: z.string().trim().max(1000),
  eventStartsAt: instant, salesStartsAt: instant.nullable(), salesClosesAt: instant, promoEndsAt: instant,
  priceCents: z.number().int().min(1).max(1000000), publication: z.enum(["draft", "published"]),
  salesStatus: z.enum(["open", "paused", "closed"]), reviewed: z.boolean(), isDemo: z.boolean(),
}).strict().superRefine((event, ctx) => {
  if (Date.parse(event.salesClosesAt) >= Date.parse(event.eventStartsAt) || Date.parse(event.promoEndsAt) <= Date.parse(event.eventStartsAt) || (event.salesStartsAt && Date.parse(event.salesStartsAt) >= Date.parse(event.salesClosesAt))) ctx.addIssue({ code: "custom", message: "Confira a ordem dos horários de vendas e do evento." });
  if (event.publication === "published" && (!event.reviewed || !event.salesStartsAt)) ctx.addIssue({ code: "custom", message: "Revise as condições e configure o início das vendas antes de publicar." });
});
export const patchEventSchema = eventSchema.safeExtend({ expectedVersion: z.number().int().positive() });
