export type OrderStatus = "pending" | "confirmed" | "expired" | "cancelled" | "needs_review";
export type PaymentStatus = "pending" | "confirmed" | "expired" | "cancelled" | "error" | "unknown";
export type SalesAvailability = "draft" | "not_started" | "open" | "paused" | "closed";
export interface EventRecord {
  id: string; slug: string; title: string; description: string;
  eventStartsAt: string; salesStartsAt: string | null; salesClosesAt: string; promoEndsAt: string;
  priceCents: number; currency: "BRL";
  publication: "draft" | "published"; salesStatus: "open" | "paused" | "closed";
  isDemo: boolean; version: number; createdAt: string; updatedAt: string;
}
export interface PublicEvent extends EventRecord {
  availability: SalesAvailability; paymentMode: "simulated" | "demo" | "unavailable";
  serverNow: string;
}
export interface EventInput {
  expectedVersion?: number;
  slug: string; title: string; description: string;
  eventStartsAt: string; salesStartsAt: string | null; salesClosesAt: string; promoEndsAt: string;
  priceCents: number; publication: "draft" | "published"; salesStatus: "open" | "paused" | "closed";
  reviewed: boolean; isDemo: boolean;
}
export interface PurchaseInput {
  eventSlug: string; fullName: string; cpf: string; acknowledged: true; idempotencyKey: string;
}
export interface PurchaseResult { id: string; accessToken: string }
export interface CommercialSnapshot {
  eventTitle: string; eventStartsAt: string; promoEndsAt: string; salesClosesAt: string;
  priceCents: number; currency: "BRL"; entryRule: string; termsVersion: string;
}
export interface TicketView {
  id: string; code: string; issuedAt: string; status: "issued";
  isTest: boolean; qrDataUrl: string;
}
export interface OrderView {
  id: string; fullName: string; cpfMasked: string; status: OrderStatus; createdAt: string;
  snapshot: CommercialSnapshot;
  payment: { id: string; status: PaymentStatus; expiresAt: string; isTest: boolean; pixQrCode: string | null; pixCopyPaste: string | null } | null;
  ticket: TicketView | null; serverNow: string; promotionalEntryEnded: boolean;
}
export interface AdminOrderView {
  id: string; eventId: string; eventTitle: string; fullName: string; cpfMasked: string;
  status: OrderStatus; amountCents: number; createdAt: string;
  paymentStatus: PaymentStatus | null; paymentId: string | null; ticketId: string | null; isTest: boolean;
}
export interface AdminSearch { eventId?: string; status?: OrderStatus; search?: string; offset?: number }
export interface AdminMetrics { confirmedCount: number; confirmedCents: number; pendingCount: number; exceptionCount: number }
export interface ProviderChargeInput { orderId: string; amountCents: number; currency: "BRL"; expiresAt: string; idempotencyKey: string }
export interface ProviderNotification {
  notificationId: string; provider: string; paymentId: string; orderId: string;
  amountCents: number; currency: string; status: PaymentStatus; paidAt: string | null;
}
export type AuthenticatedNotification = Partial<ProviderNotification> & { provider: string };
export interface ProviderCharge { paymentId: string; status: PaymentStatus; isTest: boolean; pixQrCode: string | null; pixCopyPaste: string | null }
export interface PaymentProvider {
  readonly name: string;
  createCharge(input: ProviderChargeInput): Promise<ProviderCharge>;
  queryPayment(paymentId: string): Promise<ProviderNotification>;
  validateNotification(raw: string, signature: string): AuthenticatedNotification;
}
