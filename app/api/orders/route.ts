import { createOrder } from "@/lib/server/orders";
import { errorResponse, json, rateLimit, readJson, sameOrigin } from "@/lib/server/http";
import { purchaseSchema } from "@/lib/domain/rules";
export async function POST(request: Request) {
  try { sameOrigin(request); await rateLimit(request, "purchase", 30); const input = purchaseSchema.parse(await readJson(request)); return json(await createOrder(input), 201); }
  catch (error) { return errorResponse(error); }
}
