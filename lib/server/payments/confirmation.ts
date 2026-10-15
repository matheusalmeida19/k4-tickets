import type { PaymentProvider } from "../../domain/types";
import { rpc } from "../database";
import { getPaymentProvider } from "./providers";
export interface ConfirmationResult { outcome: string; order_status: string; ticket_id: string | null }
/** Internal seam: future bank adapters authenticate their signed messages before this transaction. */
export async function confirmInternalNotification(provider: PaymentProvider, raw: string, signature: string): Promise<ConfirmationResult> {
  const notification = provider.validateNotification(raw, signature);
  return rpc<ConfirmationResult>("apply_payment_notification", { p_notification: notification, p_authenticated: true });
}
export async function confirmProviderNotification(raw: string, signature: string): Promise<ConfirmationResult> {
  return confirmInternalNotification(getPaymentProvider(), raw, signature);
}
