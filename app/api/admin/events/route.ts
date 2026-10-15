import { eventSchema } from "@/lib/domain/rules";
import { requireAdmin } from "@/lib/server/admin";
import { database, rpc, type Row } from "@/lib/server/database";
import { mapEvent } from "@/lib/server/events";
import { databaseError } from "@/lib/server/errors";
import { errorResponse, json, rateLimit, readJson, sameOrigin } from "@/lib/server/http";
export async function GET() {
  try { await requireAdmin(); const { data, error } = await database().from("events").select("*").order("event_starts_at", { ascending: false }); if (error) databaseError(error.message); return json((data ?? []).map(mapEvent)); }
  catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  try { sameOrigin(request); const admin = await requireAdmin(); await rateLimit(request, `admin-events:${admin.id}`, 60); const event = eventSchema.parse(await readJson(request)); const row = await rpc<Row>("save_event", { p_event: event, p_actor_id: admin.id }); return json(mapEvent(row), 201); }
  catch (error) { return errorResponse(error); }
}
