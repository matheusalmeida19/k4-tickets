"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  AdminMetrics,
  AdminOrderView,
  EventInput,
  EventRecord,
  OrderStatus,
} from "@/lib/domain/types";
import { formatManaus, getFridayDefaults } from "@/lib/domain/rules";
import {
  fromManausInput,
  money,
  RequestError,
  requestJson,
  toManausInput,
} from "./Format";
import { Icon } from "./Icons";

type EventForm = {
  title: string;
  slug: string;
  description: string;
  eventStartsAt: string;
  salesStartsAt: string;
  salesClosesAt: string;
  promoEndsAt: string;
  price: string;
  publication: "draft" | "published";
  salesStatus: "open" | "paused" | "closed";
  reviewed: boolean;
  isDemo: boolean;
};
const emptyForm: EventForm = {
  title: "",
  slug: "",
  description: "",
  eventStartsAt: "",
  salesStartsAt: "",
  salesClosesAt: "",
  promoEndsAt: "",
  price: "35.00",
  publication: "draft",
  salesStatus: "paused",
  reviewed: false,
  isDemo: true,
};
const statusLabels: Record<OrderStatus, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  expired: "Expirado",
  cancelled: "Cancelado",
  needs_review: "Exceção",
};
const paymentLabels: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  expired: "Expirado",
  cancelled: "Cancelado",
  error: "Erro",
  unknown: "Não esclarecido",
};
const emptyMetrics: AdminMetrics = {
  confirmedCount: 0,
  confirmedCents: 0,
  pendingCount: 0,
  exceptionCount: 0,
};

function editForm(event: EventRecord): EventForm {
  return {
    title: event.title,
    slug: event.slug,
    description: event.description,
    eventStartsAt: toManausInput(event.eventStartsAt),
    salesStartsAt: event.salesStartsAt
      ? toManausInput(event.salesStartsAt)
      : "",
    salesClosesAt: toManausInput(event.salesClosesAt),
    promoEndsAt: toManausInput(event.promoEndsAt),
    price: (event.priceCents / 100).toFixed(2),
    publication: event.publication,
    salesStatus: event.salesStatus,
    reviewed: false,
    isDemo: event.isDemo,
  };
}

export function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<"events" | "orders">("events");
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [editor, setEditor] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);
  const [form, setForm] = useState<EventForm>(emptyForm);
  const [suggested, setSuggested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [orders, setOrders] = useState<AdminOrderView[]>([]);
  const [metrics, setMetrics] = useState<AdminMetrics>(emptyMetrics);
  const [metricsEventId, setMetricsEventId] = useState("");
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [filterEvent, setFilterEvent] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  async function loadEvents() {
    setLoadingEvents(true);
    try {
      setEvents(await requestJson<EventRecord[]>("/api/admin/events"));
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível carregar os eventos.",
      );
    } finally {
      setLoadingEvents(false);
    }
  }
  async function loadOrders(nextOffset = 0) {
    setLoadingOrders(true);
    setError("");
    try {
      const data = await requestJson<{
        orders: AdminOrderView[];
        metrics: AdminMetrics;
        hasMore: boolean;
      }>("/api/admin/orders/search", {
        method: "POST",
        body: JSON.stringify({
          ...(filterEvent ? { eventId: filterEvent } : {}),
          ...(filterStatus ? { status: filterStatus } : {}),
          ...(search.trim() ? { search: search.trim() } : {}),
          offset: nextOffset,
        }),
      });
      setOrders(data.orders);
      setMetrics(data.metrics);
      setMetricsEventId(filterEvent);
      setHasMore(data.hasMore);
      setOffset(nextOffset);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível consultar os pedidos.",
      );
    } finally {
      setLoadingOrders(false);
    }
  }
  useEffect(() => {
    let active = true;
    requestJson<EventRecord[]>("/api/admin/events")
      .then((data) => {
        if (active) setEvents(data);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "Não foi possível carregar os eventos.",
          );
      })
      .finally(() => {
        if (active) setLoadingEvents(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof EventForm>(key: K, value: EventForm[K]) {
    setForm((previous) => ({
      ...previous,
      [key]: value,
      ...(key === "reviewed" ? {} : { reviewed: false }),
    }));
  }
  function eventDateChanged(value: string) {
    const defaults = value ? getFridayDefaults(value.slice(0, 10)) : null;
    setSuggested(!!defaults);
    setForm((previous) => ({
      ...previous,
      eventStartsAt: value,
      reviewed: false,
      ...(defaults
        ? {
            salesClosesAt: toManausInput(defaults.salesClosesAt),
            promoEndsAt: toManausInput(defaults.promoEndsAt),
            price: (defaults.priceCents / 100).toFixed(2),
          }
        : {}),
    }));
  }
  function openEditor(event?: EventRecord) {
    setEditingId(event?.id || null);
    setEditingVersion(event?.version ?? null);
    setVersionConflict(false);
    setForm(event ? editForm(event) : { ...emptyForm });
    setSuggested(false);
    setEditor(true);
    setError("");
    setNotice("");
  }
  async function saveEvent(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (saving || versionConflict) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const priceCents = Math.round(Number(form.price.replace(",", ".")) * 100);
      if (!Number.isFinite(priceCents) || priceCents < 1)
        throw new Error("Informe um preço válido.");
      if (editingId && !editingVersion)
        throw new Error("Recarregue o evento antes de salvar.");
      const payload: EventInput = {
        ...(editingId && editingVersion
          ? { expectedVersion: editingVersion }
          : {}),
        title: form.title.trim(),
        slug: form.slug.trim(),
        description: form.description.trim(),
        eventStartsAt: fromManausInput(form.eventStartsAt),
        salesStartsAt: form.salesStartsAt
          ? fromManausInput(form.salesStartsAt)
          : null,
        salesClosesAt: fromManausInput(form.salesClosesAt),
        promoEndsAt: fromManausInput(form.promoEndsAt),
        priceCents,
        publication: form.publication,
        salesStatus: form.salesStatus,
        reviewed: form.reviewed,
        isDemo: form.isDemo,
      };
      await requestJson(
        editingId
          ? `/api/admin/events/${encodeURIComponent(editingId)}`
          : "/api/admin/events",
        { method: editingId ? "PATCH" : "POST", body: JSON.stringify(payload) },
      );
      setEditor(false);
      setNotice(
        editingId
          ? "Evento atualizado. As condições de pedidos anteriores foram preservadas."
          : "Evento criado.",
      );
      await loadEvents();
    } catch (err) {
      setVersionConflict(
        err instanceof RequestError && err.code === "VERSION_CONFLICT",
      );
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }
  async function reloadEditingEvent() {
    if (!editingId || saving) return;
    setSaving(true);
    try {
      const currentEvents =
        await requestJson<EventRecord[]>("/api/admin/events");
      setEvents(currentEvents);
      const current = currentEvents.find((event) => event.id === editingId);
      if (!current)
        throw new Error(
          "Este evento não está mais disponível. Feche o editor e atualize a página.",
        );
      openEditor(current);
      setNotice(
        "Versão atual carregada. Revise as configurações antes de salvar novamente.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível recarregar o evento.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function copyEvent(event: EventRecord) {
    try {
      await navigator.clipboard.writeText(
        new URL(
          `/ingressos/${encodeURIComponent(event.slug)}`,
          window.location.origin,
        ).href,
      );
      setNotice(`Link de “${event.title}” copiado.`);
    } catch {
      setError(
        "Não foi possível copiar. Abra o evento para copiar o endereço pelo navegador.",
      );
    }
  }
  async function logout() {
    setError("");
    try {
      await requestJson("/api/admin/logout", { method: "POST", body: "{}" });
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    }
  }

  return (
    <section className="container admin-page">
      <div className="admin-heading">
        <div>
          <p className="eyebrow">ÁREA ADMINISTRATIVA</p>
          <h1>Controle do rolê.</h1>
        </div>
        <button
          className="button button-secondary"
          onClick={() => void logout()}
        >
          Sair <Icon name="arrow" />
        </button>
      </div>
      <nav className="admin-tabs" aria-label="Painel">
        <button
          aria-current={tab === "events" ? "page" : undefined}
          onClick={() => {
            setTab("events");
            setError("");
          }}
        >
          Eventos <span>{events.length}</span>
        </button>
        <button
          aria-current={tab === "orders" ? "page" : undefined}
          onClick={() => {
            setTab("orders");
            setEditor(false);
            void loadOrders();
          }}
        >
          Pedidos e pagamentos
        </button>
      </nav>
      {error && (
        <div className="error-message" role="alert">
          {error}
          {versionConflict && editor && (
            <div>
              <p>
                Outra alteração foi salva depois que você abriu este evento.
                Recarregue a versão atual e revise os campos. As mudanças deste
                formulário serão substituídas.
              </p>
              <button
                className="button button-secondary"
                type="button"
                disabled={saving}
                onClick={() => void reloadEditingEvent()}
              >
                {saving ? "Recarregando…" : "Recarregar versão atual"}
              </button>
            </div>
          )}
        </div>
      )}
      {notice && (
        <div className="success-message" role="status">
          {notice}
        </div>
      )}
      {tab === "events" && (
        <>
          <div className="admin-section-top">
            <div>
              <h2>
                {editor
                  ? editingId
                    ? "Editar evento"
                    : "Novo evento"
                  : "Seus eventos"}
              </h2>
              <p>Horários de Manaus (UTC−4). Cada data tem seu próprio link.</p>
            </div>
            {editor ? (
              <button
                className="button button-secondary"
                onClick={() => {
                  setEditor(false);
                  setError("");
                }}
                disabled={saving}
              >
                Fechar <Icon name="close" />
              </button>
            ) : (
              <button
                className="button button-primary"
                onClick={() => openEditor()}
              >
                <Icon name="plus" /> Criar evento
              </button>
            )}
          </div>
          {editor ? (
            <form className="event-editor panel" onSubmit={saveEvent}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="event-title">Título do evento</label>
                  <input
                    id="event-title"
                    required
                    maxLength={100}
                    value={form.title}
                    onChange={(e) => update("title", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label htmlFor="event-slug">Slug exclusivo</label>
                  <input
                    id="event-slug"
                    required
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    maxLength={100}
                    value={form.slug}
                    onChange={(e) =>
                      update("slug", e.target.value.toLowerCase())
                    }
                    disabled={saving}
                    placeholder="nome-do-evento-data"
                  />
                  <p className="field-hint">
                    Letras minúsculas, números e hífens. Um link para esta data.
                  </p>
                </div>
                <div className="field field-wide">
                  <label htmlFor="event-description">Descrição</label>
                  <textarea
                    id="event-description"
                    rows={3}
                    maxLength={1000}
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label htmlFor="event-start">Data e horário do evento</label>
                  <input
                    type="datetime-local"
                    id="event-start"
                    required
                    value={form.eventStartsAt}
                    onChange={(e) => eventDateChanged(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label htmlFor="event-price">Preço individual (R$)</label>
                  <input
                    type="number"
                    id="event-price"
                    step="0.01"
                    min="0.01"
                    required
                    value={form.price}
                    onChange={(e) => update("price", e.target.value)}
                    disabled={saving}
                  />
                  <p className="field-hint">
                    Sem taxa adicional. Um ingresso por pedido.
                  </p>
                </div>
                {suggested && (
                  <div className="notice field-wide">
                    <Icon name="calendar" />
                    <p>
                      Sugestões para sexta-feira preenchidas: quarta anterior às
                      20h, entrada até sábado às 00h e R$ 35. Confira antes de
                      publicar.
                    </p>
                  </div>
                )}
                <div className="field">
                  <label htmlFor="sales-start">Início das vendas</label>
                  <input
                    type="datetime-local"
                    id="sales-start"
                    value={form.salesStartsAt}
                    onChange={(e) => update("salesStartsAt", e.target.value)}
                    disabled={saving}
                    required={form.publication === "published"}
                  />
                  <p className="field-hint">
                    Defina antes de publicar. Nenhum início é preenchido
                    automaticamente.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="sales-close">Encerramento das vendas</label>
                  <input
                    type="datetime-local"
                    id="sales-close"
                    required
                    value={form.salesClosesAt}
                    onChange={(e) => update("salesClosesAt", e.target.value)}
                    disabled={saving}
                  />
                </div>
                <div className="field">
                  <label htmlFor="promo-end">Entrada promocional até</label>
                  <input
                    type="datetime-local"
                    id="promo-end"
                    required
                    value={form.promoEndsAt}
                    onChange={(e) => update("promoEndsAt", e.target.value)}
                    disabled={saving}
                  />
                  <p className="field-hint">
                    Depois, o ingresso permanece e a diferença é paga na
                    bilheteria.
                  </p>
                </div>
                <div className="field">
                  <label htmlFor="event-publication">Publicação</label>
                  <select
                    id="event-publication"
                    value={form.publication}
                    onChange={(e) =>
                      update(
                        "publication",
                        e.target.value as EventForm["publication"],
                      )
                    }
                    disabled={saving}
                  >
                    <option value="draft">Rascunho</option>
                    <option value="published">Publicado</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="event-sales">Estado das vendas</label>
                  <select
                    id="event-sales"
                    value={form.salesStatus}
                    onChange={(e) =>
                      update(
                        "salesStatus",
                        e.target.value as EventForm["salesStatus"],
                      )
                    }
                    disabled={saving}
                  >
                    <option value="paused">Pausadas</option>
                    <option value="open">
                      Abertas dentro do período configurado
                    </option>
                    <option value="closed">Encerradas</option>
                  </select>
                </div>
              </div>
              <div className="editor-checks">
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={form.isDemo}
                    onChange={(e) => update("isDemo", e.target.checked)}
                    disabled={saving}
                  />
                  <span>
                    Evento de demonstração fictício, com dados de teste.
                  </span>
                </label>
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={form.reviewed}
                    onChange={(e) => update("reviewed", e.target.checked)}
                    disabled={saving}
                    required={form.publication === "published"}
                  />
                  <span>
                    Conferi a data, o preço, a janela de vendas e a regra de
                    entrada promocional.
                  </span>
                </label>
              </div>
              <div className="editor-actions">
                <p>O pagamento real continua indisponível nesta etapa.</p>
                <button
                  className="button button-primary"
                  disabled={saving || versionConflict}
                >
                  {saving ? "Salvando…" : "Salvar evento"}
                  <Icon name="check" />
                </button>
              </div>
            </form>
          ) : loadingEvents ? (
            <p role="status" className="loading-line">
              <span className="spinner" /> Carregando eventos…
            </p>
          ) : events.length === 0 ? (
            <div className="empty-state panel">
              <Icon name="calendar" size={34} />
              <h3>Nenhum evento cadastrado.</h3>
              <p>
                Crie um evento com data específica. Ele começa como rascunho e
                com vendas pausadas.
              </p>
            </div>
          ) : (
            <div className="admin-event-grid">
              {events.map((event) => (
                <article className="admin-event-card panel" key={event.id}>
                  <div className="event-card-top">
                    <span
                      className={`badge ${event.publication === "published" ? "badge-success" : "badge-subtle"}`}
                    >
                      {event.publication === "published"
                        ? "Publicado"
                        : "Rascunho"}
                    </span>
                    {event.isDemo && (
                      <span className="badge badge-test">TESTE</span>
                    )}
                  </div>
                  <h3>{event.title}</h3>
                  <p className="small">{formatManaus(event.eventStartsAt)}</p>
                  <div className="admin-event-price">
                    <strong>{money(event.priceCents)}</strong>
                    <span>
                      Vendas{" "}
                      {event.salesStatus === "open"
                        ? "configuradas como abertas"
                        : event.salesStatus === "paused"
                          ? "pausadas"
                          : "encerradas"}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Encerramento</dt>
                      <dd>{formatManaus(event.salesClosesAt)}</dd>
                    </div>
                    <div>
                      <dt>Entrada promocional</dt>
                      <dd>{formatManaus(event.promoEndsAt)}</dd>
                    </div>
                  </dl>
                  <div className="event-card-actions">
                    <button
                      className="button button-secondary"
                      onClick={() => openEditor(event)}
                    >
                      Gerenciar <Icon name="arrow" size={16} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Copiar link de ${event.title}`}
                      onClick={() => void copyEvent(event)}
                    >
                      <Icon name="copy" />
                    </button>
                    <a
                      className="icon-button"
                      href={`/ingressos/${encodeURIComponent(event.slug)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Abrir evento ${event.title}`}
                    >
                      ↗
                    </a>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
      {tab === "orders" && (
        <>
          <form
            className="admin-filters panel"
            onSubmit={(e) => {
              e.preventDefault();
              void loadOrders();
            }}
          >
            <div className="field">
              <label htmlFor="filter-event">Evento</label>
              <select
                id="filter-event"
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
              >
                <option value="">Todos os eventos</option>
                {events.map((event) => (
                  <option value={event.id} key={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="filter-status">Status do pedido</label>
              <select
                id="filter-status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="">Todos os status</option>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="order-search">Nome ou CPF</label>
              <input
                type="search"
                autoComplete="off"
                id="order-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Busca restrita"
                maxLength={120}
              />
            </div>
            <button className="button button-primary" disabled={loadingOrders}>
              {loadingOrders ? "Buscando…" : "Filtrar"}
              <Icon name="arrow" size={17} />
            </button>
          </form>
          <div className="metrics-grid">
            <article>
              <span>Pedidos confirmados</span>
              <strong>{metrics.confirmedCount}</strong>
            </article>
            <article>
              <span>Valor confirmado</span>
              <strong>{money(metrics.confirmedCents)}</strong>
            </article>
            <article>
              <span>Pendentes</span>
              <strong>{metrics.pendingCount}</strong>
            </article>
            <article>
              <span>Exceções</span>
              <strong>{metrics.exceptionCount}</strong>
            </article>
          </div>
          <p className="small muted metrics-note">
            {metricsEventId
              ? "Resumo do evento selecionado."
              : "Resumo de todos os eventos."}{" "}
            A busca por nome, CPF ou status não altera este resumo. Pedidos
            simulados são identificados como teste e não representam receita
            real.
          </p>
          {loadingOrders ? (
            <p role="status" className="loading-line">
              <span className="spinner" /> Consultando pedidos…
            </p>
          ) : orders.length === 0 ? (
            <div className="empty-state panel">
              <Icon name="ticket" size={34} />
              <h3>Nenhum pedido neste filtro.</h3>
              <p>Ajuste a busca ou escolha outro evento.</p>
            </div>
          ) : (
            <div className="orders-table-wrap panel">
              <table className="orders-table">
                <caption className="sr-only">
                  Pedidos, pagamentos e ingressos encontrados
                </caption>
                <thead>
                  <tr>
                    <th>Participante</th>
                    <th>Evento</th>
                    <th>Pedido</th>
                    <th>Pagamento</th>
                    <th>Valor</th>
                    <th>Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.fullName}</strong>
                        <span>{order.cpfMasked}</span>
                      </td>
                      <td>
                        {order.eventTitle}
                        {order.isTest && (
                          <span className="badge badge-test">TESTE</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${order.status === "confirmed" ? "badge-success" : "badge-subtle"}`}
                        >
                          {statusLabels[order.status]}
                        </span>
                      </td>
                      <td>
                        {order.paymentStatus
                          ? paymentLabels[order.paymentStatus]
                          : "Sem cobrança"}
                      </td>
                      <td className="nowrap">{money(order.amountCents)}</td>
                      <td>
                        <details className="order-details">
                          <summary>Ver</summary>
                          <div>
                            <span>
                              Criado em {formatManaus(order.createdAt)}
                            </span>
                            <label>Pedido</label>
                            <code>{order.id}</code>
                            <label>Pagamento</label>
                            <code>{order.paymentId || "Não criado"}</code>
                            <label>Ingresso</label>
                            <code>{order.ticketId || "Não emitido"}</code>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <button
              className="button button-secondary"
              disabled={loadingOrders || offset === 0}
              onClick={() => void loadOrders(Math.max(0, offset - 50))}
            >
              Anterior
            </button>
            <span>Página {Math.floor(offset / 50) + 1}</span>
            <button
              className="button button-secondary"
              disabled={loadingOrders || !hasMore}
              onClick={() => void loadOrders(offset + 50)}
            >
              Próxima
            </button>
          </div>
        </>
      )}
    </section>
  );
}
