import { z } from "zod";
import { verifyOrderAccess } from "@/lib/server/orders";
import { errorResponse, json, orderCookieName, rateLimit, readJson, sameOrigin } from "@/lib/server/http";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    sameOrigin(request); await rateLimit(request, "order-access", 60);
    const id = z.uuid().parse((await context.params).id);
    const { credential } = z.object({ credential: z.string().min(40).max(100) }).strict().parse(await readJson(request));
    await verifyOrderAccess(id, credential);
    const response = json({ ok: true });
    response.cookies.set(orderCookieName(id), credential, { httpOnly: true, sameSite: "strict", secure: process.env.APP_BASE_URL?.startsWith("https://") ?? true, path: `/api/orders/${id}`, maxAge: 60 * 60 * 24 * 30 });
    return response;
  } catch (error) { return errorResponse(error); }
}
