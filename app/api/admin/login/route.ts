import { z } from "zod";
import { authClient } from "@/lib/server/auth";
import { database, rpc } from "@/lib/server/database";
import { AppError } from "@/lib/server/errors";
import { errorResponse, json, rateLimit, readJson, sameOrigin } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    sameOrigin(request); await rateLimit(request, "admin-login", 10, 900);
    const input = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) }).strict().parse(await readJson(request));
    const client = await authClient();
    const { data, error } = await client.auth.signInWithPassword(input);
    if (error || !data.user) throw new AppError("LOGIN_FAILED", "Acesso não autorizado. Confira suas credenciais.", 401);
    const membership = await database().from("admin_users").select("user_id").eq("user_id", data.user.id).maybeSingle();
    if (membership.error || !membership.data) { await client.auth.signOut(); throw new AppError("LOGIN_FAILED", "Acesso não autorizado. Confira suas credenciais.", 401); }
    await rpc("record_admin_action", { p_actor_id: data.user.id, p_action: "admin.login" });
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
