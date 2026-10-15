import { authClient } from "@/lib/server/auth";
import { requireAdmin } from "@/lib/server/admin";
import { rpc } from "@/lib/server/database";
import { errorResponse, json, sameOrigin } from "@/lib/server/http";
export async function POST(request: Request) {
  try { sameOrigin(request); const admin = await requireAdmin(); await rpc("record_admin_action", { p_actor_id: admin.id, p_action: "admin.logout" }); const client = await authClient(); await client.auth.signOut(); return json({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
