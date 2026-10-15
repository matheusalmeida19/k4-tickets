"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { OrderStatus, OrderView } from "@/lib/domain/types";
import { formatManaus } from "@/lib/domain/rules";
import { money, requestJson } from "./Format";
import { Icon } from "./Icons";

const statusLabels: Record<OrderStatus, string> = {
  pending: "Aguardando confirmação",
  confirmed: "Pagamento confirmado",
  expired: "Prazo da cobrança encerrado",
  cancelled: "Pedido cancelado",
  needs_review: "Pagamento em análise técnica",
};

export function OrderTracker({ id }: { id: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [canCopy, setCanCopy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pollingPaused, setPollingPaused] = useState(false);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");
    try {
      const result = await requestJson<OrderView>(
        `/api/orders/${encodeURIComponent(id)}`,
      );
      setOrder(result);
      return result;
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível atualizar o pedido.",
      );
      return null;
    } finally {
      setRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failedPolls = 0;
    async function poll() {
      try {
        const result = await requestJson<OrderView>(
          `/api/orders/${encodeURIComponent(id)}`,
        );
        if (!active) return;
        setOrder(result);
        setError("");
        failedPolls = 0;
        setPollingPaused(false);
        if (
          result.status === "pending" ||
          (result.status === "confirmed" && !result.ticket)
        )
          timer = setTimeout(poll, 5000);
      } catch (err) {
        if (!active) return;
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível consultar o pedido.",
        );
        failedPolls += 1;
        if (failedPolls < 5) timer = setTimeout(poll, 15000);
        else setPollingPaused(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    async function init() {
      try {
        const credential = new URLSearchParams(
          window.location.hash.slice(1),
        ).get("acesso");
        setCanCopy(!!credential);
        if (credential)
          await requestJson(`/api/orders/${encodeURIComponent(id)}/access`, {
            method: "POST",
            body: JSON.stringify({ credential }),
          });
        if (active) await poll();
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Link privado inválido ou indisponível.",
          );
          setLoading(false);
        }
      }
    }
    void init();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(
        "Não foi possível copiar. Salve o endereço desta página pelo navegador.",
      );
    }
  }

  if (loading)
    return (
      <div className="state-page" role="status">
        <span className="spinner" />
        <h1>Acessando seu pedido…</h1>
        <p>Verificando seu link privado.</p>
      </div>
    );
  if (!order)
    return (
      <div className="state-page">
        <span className="state-icon">
          <Icon name="lock" size={28} />
        </span>
        <p className="eyebrow">ACESSO PRIVADO</p>
        <h1>Abra o link completo do pedido.</h1>
        <p role="alert">
          {error || "Este pedido precisa do link privado gerado na compra."}
        </p>
        <button
          className="button button-secondary"
          onClick={() => window.location.reload()}
        >
          Tentar novamente
        </button>
      </div>
    );

  const hasTicket = !!order.ticket;
  const isTest = order.ticket?.isTest || order.payment?.isTest;
  const finalStatus = [
    "confirmed",
    "expired",
    "cancelled",
    "needs_review",
  ].includes(order.status);
  return (
    <>
      <div className="order-heading no-print">
        <div>
          <p className="eyebrow">
            <Icon name="lock" size={14} /> SEU PEDIDO
          </p>
          <h1>
            {hasTicket ? "Seu próximo rolê está aqui." : "Tudo no seu tempo."}
          </h1>
        </div>
        {canCopy && (
          <button className="button button-secondary" onClick={copyLink}>
            <Icon name={copied ? "check" : "copy"} />
            {copied ? "Link copiado" : "Salvar link do pedido"}
          </button>
        )}
      </div>
      <div className="order-layout">
        <section className="order-main">
          {isTest && (
            <div className="notice notice-test no-print">
              <Icon name="shield" />
              <p>
                <strong>Ambiente de teste — nenhum pagamento real.</strong>
                <br />
                Este fluxo não solicita transferências.
              </p>
            </div>
          )}
          {error && (
            <div className="error-message no-print" role="alert">
              {error}
            </div>
          )}
          {hasTicket && order.ticket ? (
            <article className="digital-ticket" aria-label="Ingresso digital">
              <div className="digital-ticket-brand">
                <span>
                  K4 <strong>INGRESSOS</strong>
                </span>
                <Icon name="ticket" size={24} />
              </div>
              {order.ticket.isTest && (
                <div className="test-stamp">TESTE — SEM VALIDADE</div>
              )}
              <div className="digital-ticket-content">
                <span className="eyebrow">K4 LOUNGE</span>
                <h2>{order.snapshot.eventTitle}</h2>
                <p className="ticket-event-time">
                  {formatManaus(order.snapshot.eventStartsAt)}
                </p>
                <div className="ticket-attendee">
                  <span className="eyebrow">PARTICIPANTE</span>
                  <strong>{order.fullName}</strong>
                </div>
                <div className="ticket-qr-row">
                  <div className="ticket-qr">
                    <Image
                      src={order.ticket.qrDataUrl}
                      alt="QR Code exclusivo deste ingresso"
                      width={180}
                      height={180}
                      unoptimized
                    />
                  </div>
                  <div>
                    <span className="badge badge-success">
                      <Icon name="check" size={13} /> EMITIDO
                    </span>
                    <span className="ticket-id-label">
                      Identificador do ingresso
                    </span>
                    <code className="ticket-id">{order.ticket.id}</code>
                    <p className="small muted">
                      Apresente pelo celular ou imprima.
                    </p>
                  </div>
                </div>
              </div>
              <div className="digital-ticket-rule">
                <Icon name="clock" />
                <div>
                  <strong>
                    Entrada promocional até{" "}
                    {formatManaus(order.snapshot.promoEndsAt)}
                  </strong>
                  <p>{order.snapshot.entryRule}</p>
                </div>
              </div>
              {order.promotionalEntryEnded && (
                <div className="ticket-after-hours">
                  <strong>O período promocional terminou.</strong>
                  <p>
                    Seu ingresso pago permanece disponível. A diferença deve ser
                    paga na bilheteria.
                  </p>
                </div>
              )}
            </article>
          ) : (
            <article className="payment-card">
              <div
                className={`status-symbol ${order.status === "confirmed" ? "status-symbol-confirmed" : ""}`}
              >
                <Icon
                  name={order.status === "confirmed" ? "check" : "clock"}
                  size={32}
                />
              </div>
              <span className="eyebrow">
                {order.payment?.isTest ? "SIMULAÇÃO LOCAL" : "STATUS DO PEDIDO"}
              </span>
              <h2>{statusLabels[order.status]}</h2>
              <p>
                {order.status === "pending"
                  ? "O status é consultado com segurança no servidor. Quando houver uma confirmação válida, o ingresso aparecerá aqui."
                  : order.status === "needs_review"
                    ? "Foi registrada uma divergência. Nenhum novo pagamento é solicitado nesta página."
                    : order.status === "confirmed"
                      ? "Estamos carregando seu ingresso."
                      : order.status === "expired"
                        ? "Nenhum novo pagamento deve ser feito para esta cobrança. Uma confirmação recebida depois será analisada pelo sistema."
                        : "Este pedido foi cancelado. Nenhum pagamento é solicitado."}
              </p>
              {order.payment?.isTest && (
                <div className="simulation-block">
                  <Icon name="lock" />
                  <span>Sem Pix pagável neste ambiente de teste.</span>
                </div>
              )}
              {order.payment?.pixQrCode && !order.payment.isTest && (
                <Image
                  src={order.payment.pixQrCode}
                  alt="QR Code Pix da cobrança"
                  width={220}
                  height={220}
                  unoptimized
                />
              )}
              {order.payment?.pixCopyPaste && !order.payment.isTest && (
                <div className="field">
                  <label htmlFor="pix-code">Pix Copia e Cola</label>
                  <textarea
                    id="pix-code"
                    value={order.payment.pixCopyPaste}
                    readOnly
                    rows={3}
                  />
                </div>
              )}
              {order.payment && (
                <div className="payment-expiry">
                  <span>Validade da cobrança</span>
                  <strong>{formatManaus(order.payment.expiresAt)}</strong>
                </div>
              )}
              {order.payment &&
                ["error", "unknown"].includes(order.payment.status) && (
                  <div className="notice">
                    <p>
                      A situação do pagamento ainda não foi esclarecida. Uma
                      falha de comunicação não confirma nem descarta o
                      recebimento.
                    </p>
                  </div>
                )}
              <button
                className="button button-secondary"
                onClick={() => void refresh()}
                disabled={refreshing}
              >
                {refreshing ? "Consultando…" : "Atualizar status"}
              </button>
              {!finalStatus && !pollingPaused && (
                <p className="live-status">
                  <span className="tiny-dot" /> Atualização automática
                </p>
              )}
              {!finalStatus && pollingPaused && (
                <p className="small muted">
                  A atualização automática foi pausada após falhas de consulta.
                  Use “Atualizar status” para tentar novamente.
                </p>
              )}
            </article>
          )}
          {hasTicket && (
            <button
              className="button button-primary print-button no-print"
              onClick={() => window.print()}
            >
              <Icon name="print" /> Imprimir ingresso
            </button>
          )}
        </section>
        <aside className="order-summary no-print">
          <p className="eyebrow">RESUMO DO PEDIDO</p>
          <h2>{order.snapshot.eventTitle}</h2>
          <dl>
            <div>
              <dt>Data do evento</dt>
              <dd>{formatManaus(order.snapshot.eventStartsAt)}</dd>
            </div>
            <div>
              <dt>Participante</dt>
              <dd>{order.fullName}</dd>
            </div>
            <div>
              <dt>CPF</dt>
              <dd>{order.cpfMasked}</dd>
            </div>
            <div>
              <dt>Quantidade</dt>
              <dd>1 ingresso individual</dd>
            </div>
          </dl>
          <div className="order-total">
            <span>Total · sem taxa</span>
            <strong>{money(order.snapshot.priceCents)}</strong>
          </div>
          <p className="order-reference">
            Pedido <code>{order.id}</code>
          </p>
          <div className="notice">
            <Icon name="lock" />
            <p>
              Guarde seu link. Ele permite acessar este pedido sem criar conta.
              Não compartilhe.
            </p>
          </div>
          <p className="small muted">
            Horários de Manaus (UTC−4). A entrega do ingresso acontece nesta
            plataforma.
          </p>
        </aside>
      </div>
    </>
  );
}
