import { z } from "zod";
import { patchEventSchema } from "@/lib/domain/rules";
import { requireAdmin } from "@/lib/server/admin";
import { rpc, type Row } from "@/lib/server/database";
import { mapEvent } from "@/lib/server/events";
import { errorResponse, json, rateLimit, readJson, sameOrigin } from "@/lib/server/http";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request); const admin = await requireAdmin(); await rateLimit(request, `admin-events:${admin.id}`, 60);
    const id = z.uuid().parse((await context.params).id);
    const { expectedVersion, ...input } = patchEventSchema.parse(await readJson(request));
    const row = await rpc<Row>("save_event", { p_event: input, p_actor_id: admin.id, p_event_id: id, p_expected_version: expectedVersion });
    return json(mapEvent(row));
  } catch (error) { return errorResponse(error); }
}
