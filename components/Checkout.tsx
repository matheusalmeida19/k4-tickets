"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  PublicEvent,
  PurchaseResult,
  SalesAvailability,
} from "@/lib/domain/types";
import { formatManaus, isValidCpf, isValidFullName } from "@/lib/domain/rules";
import { formatCpfInput, money, requestJson } from "./Format";
import { Icon } from "./Icons";

const availabilityText: Record<SalesAvailability, string> = {
  draft: "Evento não publicado",
  not_started: "Vendas não iniciadas",
  open: "Vendas abertas",
  paused: "Vendas pausadas",
  closed: "Vendas encerradas",
};

export function Checkout({
  event,
  showEventSummary = false,
}: {
  event: PublicEvent;
  showEventSummary?: boolean;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    cpf?: string;
    terms?: string;
  }>({});
  const purchaseRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const canBuy =
    event.availability === "open" &&
    ["simulated", "demo"].includes(event.paymentMode) &&
    event.isDemo;

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !canBuy) return;
    const validation = {
      name: isValidFullName(fullName)
        ? undefined
        : "Informe seu nome completo, com nome e sobrenome.",
      cpf: isValidCpf(cpf)
        ? undefined
        : "Informe um CPF com 11 dígitos válidos.",
      terms: acknowledged
        ? undefined
        : "Confirme que leu as condições de entrada.",
    };
    setFieldErrors(validation);
    if (validation.name || validation.cpf || validation.terms) return;
    setBusy(true);
    setError("");
    const fingerprint = `${fullName.trim()}|${cpf.replace(/\D/g, "")}`;
    if (!purchaseRef.current || purchaseRef.current.fingerprint !== fingerprint)
      purchaseRef.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await requestJson<PurchaseResult>("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          eventSlug: event.slug,
          fullName: fullName.trim(),
          cpf,
          acknowledged: true,
          idempotencyKey: purchaseRef.current.key,
        }),
      });
      router.push(
        `/pedido/${encodeURIComponent(result.id)}#acesso=${encodeURIComponent(result.accessToken)}`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível criar seu pedido.",
      );
      setBusy(false);
    }
  }

  return (
    <aside
      className="checkout-panel"
      id="comprar"
      aria-label="Compra do ingresso"
    >
      <div className="checkout-top">
        <span className="eyebrow">INGRESSO INDIVIDUAL</span>
        <Icon name="ticket" size={25} />
      </div>
      {showEventSummary && (
        <div className="checkout-event-summary">
          <h2>{event.title}</h2>
          <p>
            <Icon name="calendar" size={16} />
            <span>{formatManaus(event.eventStartsAt)}</span>
          </p>
        </div>
      )}
      <div className="checkout-price">
        {money(event.priceCents)}
        <span className="badge badge-subtle">Sem taxa</span>
      </div>
      <p className="muted small">1 pessoa · 1 ingresso por pedido</p>
      <div
        className={`availability ${event.availability === "open" ? "availability-open" : ""}`}
      >
        <span className="tiny-dot" />
        {availabilityText[event.availability]}
      </div>
      {["simulated", "demo"].includes(event.paymentMode) && (
        <div className="notice notice-test">
          <Icon name="shield" />
          <p>
            <strong>Ambiente de teste</strong>
            <br />
            Nenhum pagamento real. Use apenas dados fictícios.
          </p>
        </div>
      )}
      {event.paymentMode === "unavailable" && (
        <div className="notice">
          <Icon name="lock" />
          <p>
            <strong>Compra indisponível</strong>
            <br />
            Os pagamentos ainda não estão habilitados.
          </p>
        </div>
      )}
      {canBuy ? (
        <form onSubmit={submit} noValidate className="checkout-form">
          <div className="field">
            <label htmlFor="buyer-name">Nome completo</label>
            <input
              id="buyer-name"
              name="fullName"
              autoComplete="name"
              maxLength={120}
              placeholder="Como está no seu documento"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              aria-invalid={!!fieldErrors.name}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
              disabled={busy}
              required
            />
            {fieldErrors.name && (
              <p className="field-error" id="name-error">
                {fieldErrors.name}
              </p>
            )}
          </div>
          <div className="field">
            <label htmlFor="buyer-cpf">CPF</label>
            <input
              id="buyer-cpf"
              name="cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              value={cpf}
              onChange={(e) => setCpf(formatCpfInput(e.target.value))}
              aria-invalid={!!fieldErrors.cpf}
              aria-describedby={fieldErrors.cpf ? "cpf-error" : "cpf-hint"}
              disabled={busy}
              required
            />
            <p className="field-hint" id="cpf-hint">
              Validação dos dígitos. Não é uma consulta de identidade.
            </p>
            {fieldErrors.cpf && (
              <p className="field-error" id="cpf-error">
                {fieldErrors.cpf}
              </p>
            )}
          </div>
          <label className="check-field">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={busy}
              aria-describedby={fieldErrors.terms ? "terms-error" : undefined}
            />
            <span>
              Li as condições de entrada, os{" "}
              <Link href="/termos" target="_blank" rel="noopener noreferrer">
                termos
              </Link>{" "}
              e a{" "}
              <Link
                href="/privacidade"
                target="_blank"
                rel="noopener noreferrer"
              >
                privacidade
              </Link>
              .
            </span>
          </label>
          {fieldErrors.terms && (
            <p className="field-error" id="terms-error">
              {fieldErrors.terms}
            </p>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          <button
            className="button button-primary button-full"
            type="submit"
            disabled={busy}
          >
            {busy ? (
              <>
                <span className="spinner" /> Criando pedido…
              </>
            ) : (
              <>
                {event.paymentMode === "demo"
                  ? "Gerar ingresso de teste"
                  : "Continuar em ambiente de teste"}{" "}
                <Icon name="arrow" />
              </>
            )}
          </button>
        </form>
      ) : (
        <button className="button button-disabled button-full" disabled>
          {event.availability === "open"
            ? "Compra indisponível"
            : availabilityText[event.availability]}
        </button>
      )}
      <p className="checkout-security">
        <Icon name="lock" size={14} /> Acompanhamento privado do pedido
      </p>
    </aside>
  );
}
