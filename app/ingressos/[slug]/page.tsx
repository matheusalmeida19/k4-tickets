import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Image from "next/image";
import { getPublicEvent } from "@/lib/server/events";
import { formatManaus } from "@/lib/domain/rules";
import { Checkout } from "@/components/Checkout";
import { Icon } from "@/components/Icons";
import { dayAndMonth } from "@/components/Format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seu evento" };

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await getPublicEvent(slug);
  if (!event) notFound();
  return (
    <div className="container event-layout">
      <section className="event-details">
        <p className="eyebrow">
          <span className="tiny-dot" /> K4 LOUNGE{" "}
          {event.isDemo && (
            <span className="badge badge-test">DEMONSTRAÇÃO FICTÍCIA</span>
          )}
        </p>
        <div className="event-title-row">
          <h1>{event.title}</h1>
          <Image
            src="/brand/duck.png"
            alt="Mascote do K4"
            width={100}
            height={100}
            className="event-mascot"
          />
        </div>
        <div className="event-date">
          <span className="date-tile">{dayAndMonth(event.eventStartsAt)}</span>
          <div>
            <span className="eyebrow">DATA DO EVENTO</span>
            <strong>{formatManaus(event.eventStartsAt)}</strong>
          </div>
        </div>
        {event.description && (
          <p className="event-description">{event.description}</p>
        )}
        <div className="event-rules">
          <article>
            <Icon name="clock" size={24} />
            <div>
              <h2>Vendas até</h2>
              <p>{formatManaus(event.salesClosesAt)}</p>
              <span>Depois desse horário, novos pedidos são bloqueados.</span>
            </div>
          </article>
          <article>
            <Icon name="ticket" size={24} />
            <div>
              <h2>Entrada promocional até</h2>
              <p>{formatManaus(event.promoEndsAt)}</p>
              <span>
                Após esse horário, o ingresso pago continua disponível. É
                necessário pagar a diferença na bilheteria.
              </span>
            </div>
          </article>
          {event.salesStartsAt && event.availability === "not_started" && (
            <article>
              <Icon name="calendar" size={24} />
              <div>
                <h2>Início das vendas</h2>
                <p>{formatManaus(event.salesStartsAt)}</p>
              </div>
            </article>
          )}
        </div>
        <p className="event-timezone">
          Todos os horários são de Manaus (UTC−4).
        </p>
        <div className="event-bottom-rule">
          <Icon name="shield" />
          <p>
            Guarde o link privado do pedido.
            <br />
            <span>
              A confirmação válida disponibiliza seu ingresso aqui na
              plataforma.
            </span>
          </p>
        </div>
      </section>
      <Checkout event={event} />
    </div>
  );
}
