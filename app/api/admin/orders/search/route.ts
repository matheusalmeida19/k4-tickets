import { z } from "zod";
import { requireAdmin } from "@/lib/server/admin";
import { rpc, type Row } from "@/lib/server/database";
import { errorResponse, json, rateLimit, readJson, sameOrigin } from "@/lib/server/http";
import type { AdminMetrics, AdminOrderView } from "@/lib/domain/types";
const searchSchema = z.object({ eventId: z.uuid().optional(), status: z.enum(["pending", "confirmed", "expired", "cancelled", "needs_review"]).optional(), search: z.string().trim().max(120).optional(), offset: z.number().int().min(0).max(100000).optional() }).strict();
export async function POST(request: Request) {
  try {
    sameOrigin(request); const admin = await requireAdmin(); await rateLimit(request, `admin-search:${admin.id}`, 60);
    const input = searchSchema.parse(await readJson(request));
    const result = await rpc<{ rows: Row[]; metrics: AdminMetrics }>("admin_order_search", { p_filters: input, p_actor_id: admin.id });
    const orders: AdminOrderView[] = result.rows.map((row) => ({ id: String(row.id), eventId: String(row.event_id), eventTitle: String(row.event_title), fullName: String(row.buyer_name), cpfMasked: String(row.cpf_masked), status: row.status as AdminOrderView["status"], amountCents: Number(row.amount_cents), createdAt: String(row.created_at), paymentStatus: row.payment_status as AdminOrderView["paymentStatus"] ?? null, paymentId: row.payment_id ? String(row.payment_id) : null, ticketId: row.ticket_id ? String(row.ticket_id) : null, isTest: Boolean(row.is_test) }));
    return json({ orders, metrics: result.metrics, hasMore: orders.length === 50 });
  } catch (error) { return errorResponse(error); }
}
