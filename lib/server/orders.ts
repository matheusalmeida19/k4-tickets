import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import QRCode from "qrcode";
import type { CommercialSnapshot, OrderView, PurchaseInput, PurchaseResult } from "../domain/types";
import { maskCpf, promotionalEntryEnded, purchaseSchema, TERMS_VERSION } from "../domain/rules";
import { chargeTtlSeconds, privateSecret } from "./config";
import { database, rpc, type Row } from "./database";
import { AppError, databaseError } from "./errors";
import { getPaymentProvider } from "./payments/providers";
import { getPublicEvent } from "./events";

export const accessHash = (credential: string) => createHash("sha256").update(credential).digest("hex");
function trackingCredential(idempotencyKey: string): string {
  return createHmac("sha256", privateSecret("TRACKING_SECRET")).update(`order-access:v1:${idempotencyKey}`).digest("base64url");
}
export async function createOrder(raw: PurchaseInput): Promise<PurchaseResult> {
  const input = purchaseSchema.parse(raw);
  const provider = getPaymentProvider();
  if (provider.name === "unconfigured") await provider.createCharge({ orderId: "", amountCents: 0, currency: "BRL", expiresAt: "", idempotencyKey: "" });
  const existing = await database().from("orders").select("id").eq("idempotency_key", input.idempotencyKey).maybeSingle();
  if (existing.error) databaseError(existing.error.message);
  if (!existing.data) {
    const event = await getPublicEvent(input.eventSlug);
    if (!event || event.availability !== "open") throw new AppError("EVENT_UNAVAILABLE", "As vendas deste evento estão indisponíveis.", 409);
    if (provider.name === "simulated" && !event.isDemo) throw new AppError("PAYMENT_UNAVAILABLE", "A simulação está disponível apenas para eventos fictícios locais.", 503);
  }
  const credential = trackingCredential(input.idempotencyKey);
  const requestHash = createHash("sha256").update(JSON.stringify({ eventSlug: input.eventSlug, fullName: input.fullName, cpf: input.cpf, acknowledged: input.acknowledged, terms: TERMS_VERSION })).digest("hex");
  const order = await rpc<Row>("create_order", { p_event_slug: input.eventSlug, p_full_name: input.fullName, p_cpf: input.cpf, p_acknowledged: input.acknowledged, p_idempotency_key: input.idempotencyKey, p_access_hash: accessHash(credential), p_request_hash: requestHash, p_terms_version: TERMS_VERSION });
  if (order.status === "pending") {
    let attempt: Row;
    try { attempt = await rpc<Row>("reserve_payment", { p_order_id: order.id, p_provider: provider.name, p_ttl_seconds: chargeTtlSeconds(), p_is_test: provider.name === "simulated" }); }
    catch (error) {
      if (error instanceof AppError && error.code === "EVENT_UNAVAILABLE") return { id: String(order.id), accessToken: credential };
      throw error;
    }
    if (!attempt.provider_payment_id && attempt.status === "pending") {
      try {
        const charge = await provider.createCharge({ orderId: String(order.id), amountCents: Number(attempt.amount_cents), currency: "BRL", expiresAt: String(attempt.expires_at), idempotencyKey: String(attempt.id) });
        const initialStatus = ["pending", "error", "unknown"].includes(charge.status) ? charge.status : "unknown";
        await rpc("bind_payment", { p_attempt_id: attempt.id, p_provider_payment_id: charge.paymentId, p_status: initialStatus });
      } catch {
        // A communication failure is uncertain, never proof that money was not received.
        await rpc("bind_payment", { p_attempt_id: attempt.id, p_provider_payment_id: null, p_status: "unknown" });
      }
    }
  }
  return { id: String(order.id), accessToken: credential };
}
export async function verifyOrderAccess(id: string, credential: string): Promise<Row> {
  if (!/^[a-zA-Z0-9_-]{43}$/.test(credential)) throw new AppError("ORDER_ACCESS_DENIED", "Link de acompanhamento inválido ou indisponível.", 404);
  const { data, error } = await database().from("orders").select("*").eq("id", id).maybeSingle();
  if (error) databaseError(error.message);
  const expected = data?.access_hash;
  if (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(accessHash(credential), "hex"), Buffer.from(expected, "hex"))) throw new AppError("ORDER_ACCESS_DENIED", "Link de acompanhamento inválido ou indisponível.", 404);
  return data as Row;
}
export async function getOrderView(id: string, credential: string, now = new Date()): Promise<OrderView> {
  await verifyOrderAccess(id, credential);
  const order = await rpc<Row>("expire_order", { p_order_id: id });
  const db = database();
  const [paymentResult, ticketResult] = await Promise.all([
    db.from("payment_attempts").select("*").eq("order_id", id).maybeSingle(),
    db.from("tickets").select("*").eq("order_id", id).maybeSingle(),
  ]);
  if (paymentResult.error || ticketResult.error) databaseError(paymentResult.error?.message ?? ticketResult.error?.message ?? "");
  const payment = paymentResult.data, ticket = ticketResult.data;
  const snapshot = order.commercial_snapshot as unknown as CommercialSnapshot;
  return { id, fullName: String(order.buyer_name), cpfMasked: maskCpf(String(order.buyer_cpf)), status: order.status as OrderView["status"], createdAt: String(order.created_at), snapshot,
    payment: payment ? { id: payment.id, status: payment.status, expiresAt: payment.expires_at, isTest: payment.is_test, pixQrCode: null, pixCopyPaste: null } : null,
    ticket: ticket ? { id: ticket.id, code: ticket.code, issuedAt: ticket.issued_at, status: "issued", isTest: ticket.is_test, qrDataUrl: await QRCode.toDataURL(`k4t:${ticket.is_test ? "test" : "live"}:v1:${ticket.code}`, { errorCorrectionLevel: "M", margin: 2, width: 320, color: { dark: "#000000", light: "#ffffff" } }) } : null,
    serverNow: now.toISOString(), promotionalEntryEnded: promotionalEntryEnded(snapshot.promoEndsAt, now) };
}
