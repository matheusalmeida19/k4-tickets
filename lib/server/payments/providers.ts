import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedNotification, PaymentProvider, ProviderCharge, ProviderChargeInput, ProviderNotification } from "../../domain/types";
import { isLocalSimulationAllowed, privateSecret, type ServerEnvironment } from "../config";
import { database } from "../database";
import { AppError, databaseError } from "../errors";
const notificationSchema = z.object({ notificationId: z.string().max(160).optional(), provider: z.string().max(40).optional(), paymentId: z.string().max(160).optional(), orderId: z.string().max(64).optional(), amountCents: z.number().int().min(-100000000).max(100000000).optional(), currency: z.string().max(8).optional(), status: z.string().max(20).optional(), paidAt: z.string().max(100).nullable().optional() }).strict();
export class UnconfiguredProvider implements PaymentProvider {
  readonly name = "unconfigured";
  async createCharge(): Promise<ProviderCharge> { throw new AppError("PAYMENT_UNAVAILABLE", "Pagamento indisponível: integração bancária ainda não configurada.", 503); }
  async queryPayment(): Promise<ProviderNotification> { throw new AppError("PAYMENT_UNAVAILABLE", "Consulta de pagamento indisponível.", 503); }
  validateNotification(): ProviderNotification { throw new AppError("PAYMENT_UNAVAILABLE", "Notificação indisponível.", 503); }
}
export class SimulatedProvider implements PaymentProvider {
  readonly name = "simulated";
  constructor(private readonly env: ServerEnvironment = process.env) { this.assertEnabled(); }
  private assertEnabled(): void { if (!isLocalSimulationAllowed(this.env)) throw new AppError("SIMULATION_DISABLED", "Simulação permitida somente em desenvolvimento/teste local.", 503); }
  async createCharge(input: ProviderChargeInput): Promise<ProviderCharge> {
    this.assertEnabled();
    const suffix = createHmac("sha256", privateSecret("SIMULATION_SECRET", this.env)).update(input.idempotencyKey).digest("hex").slice(0, 32);
    return { paymentId: `sim_${input.orderId}_${suffix}`, status: "pending", isTest: true, pixQrCode: null, pixCopyPaste: null };
  }
  async queryPayment(paymentId: string): Promise<ProviderNotification> {
    this.assertEnabled();
    const { data, error } = await database().from("payment_attempts").select("*").eq("provider", this.name).eq("provider_payment_id", paymentId).maybeSingle();
    if (error) databaseError(error.message);
    if (!data) throw new AppError("PAYMENT_NOT_FOUND", "Cobrança de teste não encontrada.", 404);
    return { notificationId: `query-${data.id}-${data.updated_at}`, provider: this.name, paymentId, orderId: data.order_id, amountCents: data.amount_cents, currency: data.currency, status: data.status, paidAt: data.paid_at };
  }
  signNotification(raw: string): string { this.assertEnabled(); return createHmac("sha256", privateSecret("SIMULATION_SECRET", this.env)).update(raw).digest("hex"); }
  validateNotification(raw: string, signature: string): AuthenticatedNotification {
    this.assertEnabled();
    const expected = this.signNotification(raw);
    if (!/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) throw new AppError("UNAUTHENTICATED_NOTIFICATION", "Notificação interna não autenticada.", 403);
    let payload: unknown;
    try { payload = JSON.parse(raw); } catch { throw new AppError("INVALID_NOTIFICATION", "Notificação inválida.", 400); }
    const parsed = notificationSchema.safeParse(payload);
    if (!parsed.success || (parsed.data.provider !== undefined && parsed.data.provider !== this.name)) throw new AppError("INVALID_NOTIFICATION", "Notificação inválida.", 400);
    // Authenticated but incomplete/divergent financial fields reach the transaction's exception queue.
    return { ...parsed.data, provider: this.name } as AuthenticatedNotification;
  }
}
export function getPaymentProvider(): PaymentProvider { return isLocalSimulationAllowed() ? new SimulatedProvider() : new UnconfiguredProvider(); }
