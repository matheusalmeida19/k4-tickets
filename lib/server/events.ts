import type { EventRecord, PublicEvent } from "../domain/types";
import { getSalesAvailability } from "../domain/rules";
import { database, type Row } from "./database";
import { databaseError } from "./errors";
import { isLocalSimulationAllowed } from "./config";
export function mapEvent(row: Row): EventRecord {
  return { id: String(row.id), slug: String(row.slug), title: String(row.title), description: String(row.description), eventStartsAt: String(row.event_starts_at), salesStartsAt: row.sales_starts_at ? String(row.sales_starts_at) : null, salesClosesAt: String(row.sales_closes_at), promoEndsAt: String(row.promo_ends_at), priceCents: Number(row.price_cents), currency: "BRL", publication: row.publication as EventRecord["publication"], salesStatus: row.sales_status as EventRecord["salesStatus"], isDemo: Boolean(row.is_demo), version: Number(row.version), createdAt: String(row.created_at), updatedAt: String(row.updated_at) };
}
export async function getPublicEvent(slug: string): Promise<PublicEvent | null> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return null;
  const { data, error } = await database().from("events").select("*").eq("slug", slug).eq("publication", "published").maybeSingle();
  if (error) databaseError(error.message);
  if (!data) return null;
  const event = mapEvent(data), now = new Date();
  return { ...event, availability: getSalesAvailability(event, now), paymentMode: event.isDemo && isLocalSimulationAllowed() ? "simulated" : "unavailable", serverNow: now.toISOString() };
}
