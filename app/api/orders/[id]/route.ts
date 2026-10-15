import { cookies } from "next/headers";
import { z } from "zod";
import { getOrderView } from "@/lib/server/orders";
import { AppError } from "@/lib/server/errors";
import { errorResponse, json, orderCookieName, rateLimit } from "@/lib/server/http";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await rateLimit(request, "order-poll", 120);
    const id = z.uuid().parse((await context.params).id);
    const credential = (await cookies()).get(orderCookieName(id))?.value;
    if (!credential) throw new AppError("ORDER_ACCESS_DENIED", "Use o link privado de acompanhamento.", 401);
    return json(await getOrderView(id, credential));
  } catch (error) { return errorResponse(error); }
}
