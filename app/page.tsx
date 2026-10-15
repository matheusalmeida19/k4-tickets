import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icons";

export default function Home() {
  return (
    <>
      <section className="home-hero container">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-dot" /> K4 INGRESSOS
          </p>
          <h1>
            O próximo rolê
            <br />
            começa <span className="yellow">aqui.</span>
          </h1>
          <p className="hero-lead">Seu ingresso do K4, direto no celular.</p>
          <div className="link-notice">
            <Icon name="ticket" size={24} />
            <p>
              Recebeu um link do evento?
              <br />
              <strong>Abra o link para ver os detalhes e comprar.</strong>
            </p>
          </div>
          <p className="hero-footnote">
            Os eventos são acessados pelos links individuais divulgados pelo K4.
          </p>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-orbit art-orbit-two" />
          <div className="decorative-ticket">
            <div className="ticket-topline">
              <span>K4 LOUNGE</span>
              <Icon name="ticket" size={22} />
            </div>
            <Image
              src="/brand/duck.png"
              alt=""
              width={380}
              height={380}
              priority
              className="hero-duck"
            />
            <div className="ticket-art-bottom">
              <span>
                INGRESSO
                <br />
                <strong>DIGITAL</strong>
              </span>
              <span className="ticket-art-number">01</span>
            </div>
            <div className="ticket-art-stub">
              SEU PRÓXIMO ROLÊ <span>↗</span>
            </div>
          </div>
          <div className="art-tag">100% K4.</div>
        </div>
      </section>
      <section className="home-process">
        <div className="container">
          <div className="section-heading">
            <p className="eyebrow">DO LINK À PISTA</p>
            <h2>Simples de chegar.</h2>
          </div>
          <div className="process-grid">
            {[
              {
                n: "01",
                title: "Abra o evento",
                text: "Confira a data, o valor e as condições de entrada.",
                icon: "calendar" as const,
              },
              {
                n: "02",
                title: "Preencha seus dados",
                text: "Um ingresso individual, sem taxa adicional.",
                icon: "shield" as const,
              },
              {
                n: "03",
                title: "Guarde seu link",
                text: "Acompanhe o pedido e acesse o ingresso após a confirmação.",
                icon: "ticket" as const,
              },
            ].map((step) => (
              <article className="process-card" key={step.n}>
                <div>
                  <span className="step-number">{step.n}</span>
                  <Icon name={step.icon} size={26} />
                </div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
          <div className="home-bottom">
            <p>Já tem um pedido? Abra o link privado salvo na compra.</p>
            <Link href="/termos" className="text-link">
              Condições de entrada <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
