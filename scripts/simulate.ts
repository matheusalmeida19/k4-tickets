import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertLocalEnvironment, isLocalSimulationAllowed } from "../lib/server/config";
import { database, rpc } from "../lib/server/database";
import { SimulatedProvider } from "../lib/server/payments/providers";
import { confirmInternalNotification } from "../lib/server/payments/confirmation";

async function main() {
  if (!process.env.NODE_ENV) Object.assign(process.env, { NODE_ENV: "development" });
  assertLocalEnvironment();
  if (!isLocalSimulationAllowed()) throw new Error("Simulação privada local desativada.");
  const [orderId, status = "confirmed"] = process.argv.slice(2);
  if (!z.uuid().safeParse(orderId).success || !["pending", "confirmed", "expired", "cancelled", "error", "unknown"].includes(status)) throw new Error("Uso: npm run simulate -- <UUID do pedido> [pending|confirmed|expired|cancelled|error|unknown]. Somente testes locais.");
  const { data, error } = await database().from("payment_attempts").select("*").eq("order_id", orderId).eq("provider", "simulated").maybeSingle();
  if (error || !data?.provider_payment_id || !data.is_test) throw new Error("Cobrança simulada local não encontrada.");
  const provider = new SimulatedProvider();
  const raw = JSON.stringify({ notificationId: randomUUID(), provider: "simulated", paymentId: data.provider_payment_id, orderId, amountCents: data.amount_cents, currency: data.currency, status, paidAt: status === "confirmed" ? await rpc<string>("database_now", {}) : null });
  const result = await confirmInternalNotification(provider, raw, provider.signNotification(raw));
  console.log(`Notificação de TESTE processada: ${result.outcome}; pedido ${result.order_status}. Nenhum pagamento real.`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Simulação local indisponível."); process.exitCode = 1; });
