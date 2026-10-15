import Image from "next/image";
import type { PublicEvent } from "@/lib/domain/types";
import { formatManaus } from "@/lib/domain/rules";
import { dayAndMonth } from "./Format";
import { Icon } from "./Icons";

export function EventDetails({
  event,
  embedded = false,
}: {
  event: PublicEvent;
  embedded?: boolean;
}) {
  const Title = embedded ? "h2" : "h1";
  const RuleTitle = embedded ? "h3" : "h2";

  return (
    <section className="event-details" aria-label="Detalhes do evento">
      <p className="eyebrow">
        <span className="tiny-dot" />{" "}
        {embedded ? "SEU PRÓXIMO ROLÊ" : "K4 LOUNGE"}{" "}
        {event.isDemo && (
          <span className="badge badge-test">DEMONSTRAÇÃO FICTÍCIA</span>
        )}
      </p>
      <div className="event-title-row">
        <Title>{event.title}</Title>
        {!embedded && (
          <Image
            src="/brand/k4-logo.png"
            alt="Logo oficial do K4 Lounge"
            width={100}
            height={100}
            className="event-logo"
          />
        )}
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
            <RuleTitle>Vendas até</RuleTitle>
            <p>{formatManaus(event.salesClosesAt)}</p>
            <span>Depois desse horário, novos pedidos são bloqueados.</span>
          </div>
        </article>
        <article>
          <Icon name="ticket" size={24} />
          <div>
            <RuleTitle>Entrada promocional até</RuleTitle>
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
              <RuleTitle>Início das vendas</RuleTitle>
              <p>{formatManaus(event.salesStartsAt)}</p>
            </div>
          </article>
        )}
      </div>
      <p className="event-timezone">Todos os horários são de Manaus (UTC−4).</p>
      <div className="event-bottom-rule">
        <Icon name="shield" />
        <p>
          Guarde o link privado do pedido.
          <br />
          <span>
            A confirmação válida disponibiliza seu ingresso aqui na plataforma.
          </span>
        </p>
      </div>
    </section>
  );
}
